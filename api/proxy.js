// Nuvio Stream API — Multi-Addon Secure Reverse-Proxy Gatekeeper
// Supports individual addon routing AND dynamic master bundle merging per customer

const { initializeApp } = require("firebase/app");
const { getFirestore, doc, getDoc } = require("firebase/firestore");

// ─── Firebase Initialization ────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyC4OXdfVs_mXPinhmpAt2su8WKZhUDXWoQ",
  authDomain: "multiaddon.firebaseapp.com",
  projectId: "multiaddon",
  storageBucket: "multiaddon.firebasestorage.app",
  messagingSenderId: "963978475190",
  appId: "1:963978475190:web:6796687180b021e049d817"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ─── Constants ──────────────────────────────────────────────────────────────
const BUNDLE_TIMEOUT_MS = 8000; // 8-second failsafe per addon

const EMPTY_RESPONSE = {
  streams: [],
  metas: [],
  catalogs: [],
};

function getAddonSlug(addonName) {
  return addonName.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

async function fetchWithTimeout(url, options = {}, timeoutMs = BUNDLE_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timer);
    return response;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

// ─── Dynamic Manifest Fetching ──────────────────────────────────────────────
async function fetchAddonManifest(addon) {
  const baseUrl = addon.url.replace(/\/manifest\.json$/, "");
  const url = `${baseUrl}/manifest.json`;
  try {
    const res = await fetchWithTimeout(url, { method: "GET" }, 5000); // 5 sec for manifests
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.log(`[Manifest] Failed to fetch ${addon.name} manifest: ${e.message}`);
    return null;
  }
}

async function buildDynamicBundleManifest(userAddons) {
  const bundle = {
    id: "com.nuvio.bundle",
    version: "1.0.0",
    name: "Nuvio Bundle",
    description: "All your premium addons in one unified master bundle — powered by Nuvio.",
    catalogs: [],
    resources: [],
    types: [],
    behaviorHints: { configurable: false }
  };

  const results = await Promise.allSettled(userAddons.map(fetchAddonManifest));
  
  const resourceMap = new Map();
  const typeSet = new Set();

  userAddons.forEach((addon, i) => {
    const res = results[i];
    if (res.status === "fulfilled" && res.value) {
      const manifest = res.value;
      const slug = getAddonSlug(addon.name);

      // Merge Catalogs (Prefix IDs)
      if (Array.isArray(manifest.catalogs)) {
        manifest.catalogs.forEach(cat => {
          if (!cat.id) return;
          const prefixedCat = { ...cat, id: `${slug}___${cat.id}` };
          prefixedCat.name = (cat.name || '').trim();
          bundle.catalogs.push(prefixedCat);
        });
      }

      // Merge Types
      if (Array.isArray(manifest.types)) {
        manifest.types.forEach(t => typeSet.add(t));
      }

      // Merge Resources
      if (Array.isArray(manifest.resources)) {
        manifest.resources.forEach(res => {
          let rName, rTypes, rIdPrefixes;
          if (typeof res === "string") {
            rName = res;
            rTypes = manifest.types || [];
            rIdPrefixes = manifest.idPrefixes || [];
          } else {
            rName = res.name;
            rTypes = res.types || [];
            rIdPrefixes = res.idPrefixes || [];
          }

          if (!resourceMap.has(rName)) {
            resourceMap.set(rName, { name: rName, types: new Set(), idPrefixes: new Set(), matchAll: false });
          }
          const existing = resourceMap.get(rName);
          rTypes.forEach(t => existing.types.add(t));
          
          if (!rIdPrefixes || rIdPrefixes.length === 0) {
            existing.matchAll = true; // Supports everything
          } else {
            rIdPrefixes.forEach(p => existing.idPrefixes.add(p));
          }
        });
      }
    }
  });

  bundle.types = Array.from(typeSet);
  bundle.resources = Array.from(resourceMap.values()).map(r => {
    const resObj = { name: r.name, types: Array.from(r.types) };
    if (!r.matchAll && r.idPrefixes.size > 0) {
      resObj.idPrefixes = Array.from(r.idPrefixes);
    }
    return resObj;
  });

  return bundle;
}

// ─── Fan-out Fetchers ───────────────────────────────────────────────────────
async function fetchAddonJson(addon, stremioPath) {
  const baseUrl = addon.url.replace(/\/manifest\.json$/, "");
  const url = `${baseUrl}/${stremioPath}`;
  try {
    const res = await fetchWithTimeout(url, { method: "GET" });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}

// ─── Main Handler ───────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") return res.status(200).end();

  const { token } = req.query;
  if (!token) return res.status(200).json(EMPTY_RESPONSE);

  const prefix = req.query.prefix || "";
  const pSuffix = req.query.p ? (Array.isArray(req.query.p) ? req.query.p.join("/") : req.query.p) : "";
  const stremioPath = pSuffix ? `${prefix}/${pSuffix}` : prefix;

  // 1. Fetch Global Data
  const globalSettingsSnap = await getDoc(doc(db, "settings", "global"));
  const globalData = globalSettingsSnap.exists() ? globalSettingsSnap.data() : {};
  const userAddons = globalData.addons || [];
  const supportUrl = globalData.supportUrl || "";

  const getBlockedResponse = () => {
    if (prefix === "stream") {
      return {
        streams: [{
          name: "Nuvio Gatekeeper",
          title: "🚫 Access Blocked / Expired\nClick here to contact support and renew.",
          externalUrl: supportUrl || undefined
        }]
      };
    }
    return EMPTY_RESPONSE;
  };

  // 2. Validate Token
  try {
    const customerSnap = await getDoc(doc(db, "customers", token));
    if (!customerSnap.exists() || customerSnap.data().status !== "active") {
      return res.status(200).json(getBlockedResponse());
    }
    const cData = customerSnap.data();
    if (cData.expiresAt) {
      const expMillis = typeof cData.expiresAt.toMillis === "function" ? cData.expiresAt.toMillis() : new Date(cData.expiresAt).getTime();
      if (Date.now() > expMillis) return res.status(200).json(getBlockedResponse());
    }
  } catch (e) {
    return res.status(200).json(getBlockedResponse());
  }

  const addonKey = req.query.addon || null;
  console.log(`[Proxy] Token: ${token} | Addon: ${addonKey || "BUNDLE"} | Path: ${stremioPath}`);

  // ── 3A. Single Addon Mode ───────────────────────────────────────────────
  if (addonKey) {
    const targetAddon = userAddons.find(a => getAddonSlug(a.name) === addonKey);
    if (!targetAddon || !targetAddon.url) return res.status(404).json({ error: "Addon not found" });
    
    const baseUrl = targetAddon.url.replace(/\/manifest\.json$/, "");
    const targetUrl = `${baseUrl}/${stremioPath}`;
    try {
      const upstream = await fetchWithTimeout(targetUrl, { method: req.method });
      const ct = upstream.headers.get("content-type");
      if (ct) res.setHeader("Content-Type", ct);
      res.setHeader("Cache-Control", "public, max-age=120, s-maxage=120");
      return res.status(upstream.status).send(await upstream.text());
    } catch (e) {
      return res.status(200).json(EMPTY_RESPONSE);
    }
  }

  // ── 3B. Master Bundle Mode ──────────────────────────────────────────────

  // Manifest
  if (stremioPath === "manifest.json") {
    const bundleManifest = await buildDynamicBundleManifest(userAddons);
    res.setHeader("Content-Type", "application/json");
    // Edge Cache manifest for 5 minutes to prevent spamming upstream addons
    res.setHeader("Cache-Control", "public, max-age=300, s-maxage=300");
    return res.status(200).json(bundleManifest);
  }

  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "public, max-age=120, s-maxage=120");

  // Catalogs
  if (stremioPath.startsWith("catalog/")) {
    const parts = stremioPath.split("/");
    if (parts.length >= 3) {
      let catIdRaw = parts[2];
      let hasJson = catIdRaw.endsWith('.json');
      let catId = hasJson ? catIdRaw.slice(0, -5) : catIdRaw;
      
      const splitIndex = catId.indexOf("___");
      if (splitIndex !== -1) {
        const targetSlug = catId.slice(0, splitIndex);
        const originalId = catId.slice(splitIndex + 3);
        const targetAddon = userAddons.find(a => getAddonSlug(a.name) === targetSlug);
        
        if (targetAddon) {
          parts[2] = originalId + (hasJson ? ".json" : "");
          const originalPath = parts.join("/");
          const upstreamData = await fetchAddonJson(targetAddon, originalPath);
          return res.status(200).json(upstreamData || { metas: [] });
        }
      }
    }
    return res.status(200).json({ metas: [] });
  }

  // Meta (Fan out, return first successful meta)
  if (stremioPath.startsWith("meta/")) {
    const results = await Promise.allSettled(userAddons.map(a => fetchAddonJson(a, stremioPath)));
    for (const r of results) {
      if (r.status === "fulfilled" && r.value && r.value.meta) {
        return res.status(200).json(r.value);
      }
    }
    return res.status(200).json({ meta: {} });
  }

  // Streams (Fan out, merge)
  if (stremioPath.startsWith("stream/")) {
    const results = await Promise.allSettled(userAddons.map(a => fetchAddonJson(a, stremioPath)));
    const mergedStreams = [];
    results.forEach((r, i) => {
      if (r.status === "fulfilled" && r.value && Array.isArray(r.value.streams)) {
        r.value.streams.forEach(s => {
          if (s.name) s.name = `[${userAddons[i].name}] ${s.name}`;
          else s.name = `[${userAddons[i].name}]`;
          mergedStreams.push(s);
        });
      }
    });
    return res.status(200).json({ streams: mergedStreams });
  }

  // Subtitles (Fan out, merge)
  if (stremioPath.startsWith("subtitles/")) {
    const results = await Promise.allSettled(userAddons.map(a => fetchAddonJson(a, stremioPath)));
    const mergedSubs = [];
    results.forEach(r => {
      if (r.status === "fulfilled" && r.value && Array.isArray(r.value.subtitles)) {
        mergedSubs.push(...r.value.subtitles);
      }
    });
    return res.status(200).json({ subtitles: mergedSubs });
  }

  // Fallback for anything else
  if (userAddons.length > 0) {
    const fallbackAddon = userAddons[0];
    const baseUrl = fallbackAddon.url.replace(/\/manifest\.json$/, "");
    const targetUrl = `${baseUrl}/${stremioPath}`;
    try {
      const upstream = await fetchWithTimeout(targetUrl, { method: req.method });
      const ct = upstream.headers.get("content-type");
      if (ct) res.setHeader("Content-Type", ct);
      return res.status(upstream.status).send(await upstream.text());
    } catch (e) {
      return res.status(200).json(EMPTY_RESPONSE);
    }
  }

  return res.status(200).json(EMPTY_RESPONSE);
};
