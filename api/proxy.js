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
const BUNDLE_TIMEOUT_MS = 8000; // Keep at 8s to ensure Torrentio streams return

const EMPTY_RESPONSE = {
  streams: [],
  metas: [],
  catalogs: [],
};

function getAddonSlug(addonName) {
  return addonName.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function encodeStremioPath(stremioPath) {
  return stremioPath
    .split('/')
    .map(segment => {
      const parts = segment.split('&');
      const mergedParts = [];
      for (const part of parts) {
        if (!part.includes('=') && mergedParts.length > 0) {
          mergedParts[mergedParts.length - 1] += '&' + part;
        } else {
          mergedParts.push(part);
        }
      }
      return mergedParts.map(part => {
        const eqIndex = part.indexOf('=');
        if (eqIndex !== -1) {
          const key = part.slice(0, eqIndex);
          const val = part.slice(eqIndex + 1);
          return `${encodeURIComponent(key)}=${encodeURIComponent(val)}`;
        }
        return encodeURIComponent(part);
      }).join('&');
    })
    .join('/');
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

// ─── Fan-out Fetchers ───────────────────────────────────────────────────────
async function fetchAddonJson(addon, stremioPath) {
  const baseUrl = addon.url.replace(/\/manifest\.json$/, "");
  const url = `${baseUrl}/${encodeStremioPath(stremioPath)}`;
  try {
    const res = await fetchWithTimeout(url, { method: "GET" });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}

function getAddonsForResource(userAddons, capabilities, resourceType) {
  if (!capabilities) return userAddons; // fallback if map is missing
  return userAddons.filter(a => {
      const slug = getAddonSlug(a.name);
      if (!capabilities[slug] || !capabilities[slug].resources) return true; // assume yes if unknown
      return capabilities[slug].resources.includes(resourceType);
  });
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
  const bundleManifest = globalData.bundleManifest || { id: "com.nuvio.bundle", version: "1.0.0", name: "Nuvio Bundle", catalogs: [], resources: [], types: [] };
  const addonCapabilities = globalData.addonCapabilities || null;

  const getBlockedResponse = () => {
    return {
      streams: [{
        name: "Nuvio Gatekeeper",
        title: "🚫 Access Blocked / Expired\nClick here to contact support and renew.",
        externalUrl: supportUrl || undefined
      }]
    };
  };

  // 2. Validate Token & Selective Blocking
  let isBlocked = false;
  try {
    const customerSnap = await getDoc(doc(db, "customers", token));
    if (!customerSnap.exists() || customerSnap.data().status !== "active") {
      isBlocked = true;
    } else {
      const cData = customerSnap.data();
      if (cData.expiresAt) {
        const expMillis = typeof cData.expiresAt.toMillis === "function" ? cData.expiresAt.toMillis() : new Date(cData.expiresAt).getTime();
        if (Date.now() > expMillis) isBlocked = true;
      }
    }
  } catch (e) {
    isBlocked = true;
  }

  // Selective Blocking: If blocked, ONLY intercept stream requests.
  if (isBlocked && stremioPath.startsWith("stream/")) {
      return res.status(200).json(getBlockedResponse());
  }

  const addonKey = req.query.addon || null;
  console.log(`[Proxy] Token: ${token} | Blocked: ${isBlocked} | Addon: ${addonKey || "BUNDLE"} | Path: ${stremioPath}`);

  // ── 3A. Single Addon Mode ───────────────────────────────────────────────
  if (addonKey) {
    const targetAddon = userAddons.find(a => getAddonSlug(a.name) === addonKey);
    if (!targetAddon || !targetAddon.url) return res.status(404).json({ error: "Addon not found" });
    
    const baseUrl = targetAddon.url.replace(/\/manifest\.json$/, "");
    const targetUrl = `${baseUrl}/${encodeStremioPath(stremioPath)}`;
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

  // Manifest (Instantly return cached manifest)
  if (stremioPath === "manifest.json") {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
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

  // Meta (Intelligent Routing)
  if (stremioPath.startsWith("meta/")) {
    const targetAddons = getAddonsForResource(userAddons, addonCapabilities, "meta");
    const results = await Promise.allSettled(targetAddons.map(a => fetchAddonJson(a, stremioPath)));
    for (const r of results) {
      if (r.status === "fulfilled" && r.value && r.value.meta) {
        return res.status(200).json(r.value);
      }
    }
    return res.status(200).json({ meta: {} });
  }

  // Streams (Intelligent Routing)
  if (stremioPath.startsWith("stream/")) {
    const targetAddons = getAddonsForResource(userAddons, addonCapabilities, "stream");
    const results = await Promise.allSettled(targetAddons.map(a => fetchAddonJson(a, stremioPath)));
    const mergedStreams = [];
    results.forEach((r, i) => {
      if (r.status === "fulfilled" && r.value && Array.isArray(r.value.streams)) {
        r.value.streams.forEach(s => {
          if (s.name) s.name = `[${targetAddons[i].name}] ${s.name}`;
          else s.name = `[${targetAddons[i].name}]`;
          mergedStreams.push(s);
        });
      }
    });
    return res.status(200).json({ streams: mergedStreams });
  }

  // Subtitles (Intelligent Routing)
  if (stremioPath.startsWith("subtitles/")) {
    const targetAddons = getAddonsForResource(userAddons, addonCapabilities, "subtitles");
    const results = await Promise.allSettled(targetAddons.map(a => fetchAddonJson(a, stremioPath)));
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
    const targetUrl = `${baseUrl}/${encodeStremioPath(stremioPath)}`;
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
