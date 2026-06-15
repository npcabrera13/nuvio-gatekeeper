// Nuvio Stream API — Multi-Addon Secure Reverse-Proxy Gatekeeper
// Addons are hardcoded — Firestore is ONLY used to validate customer tokens.

const { getApps, initializeApp } = require("firebase/app");
const { getFirestore, doc, getDoc } = require("firebase/firestore");

// ─── Firebase (Singleton) ────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID
};

let _db = null;
function getDb() {
  if (_db) return _db;
  const existing = getApps();
  const app = existing.length > 0 ? existing[0] : initializeApp(firebaseConfig);
  _db = getFirestore(app);
  return _db;
}

// ─── Customer Cache (30s TTL) ────────────────────────────────────────────────
// Reduces Firestore reads: same token reused within 30s = 0 extra reads
const _customerCache = new Map();
const CUSTOMER_TTL = 30_000;

async function getCustomerData(token) {
  const now = Date.now();
  const hit = _customerCache.get(token);
  if (hit && now - hit.time < CUSTOMER_TTL) return hit.data;
  const snap = await getDoc(doc(getDb(), "customers", token));
  const data = snap.exists() ? snap.data() : null;
  _customerCache.set(token, { data, time: now });
  return data;
}

// ─── Hardcoded Addons ────────────────────────────────────────────────────────
// These are never read from Firestore. To add/change an addon, edit here and redeploy.
// Each addon has: name, url, and which resources it supports.
const ALL_ADDONS = [
  {
    name: "Torrentio",
    url: "https://torrentio.strem.fun/qualityfilter=hdrall,4k,brremux,dolbyvision,dolbyvisionwithhdr/manifest.json",
    resources: ["stream"]
  },
  {
    name: "Open Subtitles",
    url: "https://opensubtitles-v3.strem.io/manifest.json",
    resources: ["subtitles"]
  },
  {
    name: "Cinemata",
    url: "https://v3-cinemeta.strem.io/manifest.json",
    resources: ["meta", "catalog"]
  },
  {
    name: "Anime Kitsu",
    url: "https://anime-kitsu.strem.fun/manifest.json",
    resources: ["meta", "catalog"]
  },
  {
    name: "AioMetadata",
    url: "https://aiometadata.elfhosted.com/stremio/44fe3014-a2d0-42df-b050-8b5f9d152947/manifest.json",
    resources: ["meta"]
  }
];

// Support URL shown to blocked users (edit if needed)
const SUPPORT_URL = "";

// ─── Hardcoded Manifest ──────────────────────────────────────────────────────
// Returned instantly with ZERO Firestore reads
const HARDCODED_MANIFEST = {
  id: "com.nuvio.bundle",
  version: "1.0.0",
  name: "Nuvio Bundle",
  description: "All your premium addons in one unified master bundle — powered by Nuvio.",
  resources: ["stream", "meta", "catalog", "subtitles"],
  types: ["movie", "series", "anime"],
  catalogs: [],
  idPrefixes: ["tt", "kitsu"],
  behaviorHints: { configurable: false }
};

// ─── Constants ───────────────────────────────────────────────────────────────
const TOKEN_REGEX = /^[a-zA-Z0-9_-]{4,128}$/;
const BUNDLE_TIMEOUT_MS = 8000;
const EMPTY_RESPONSE = { streams: [], metas: [], catalogs: [] };

// ─── Helpers ─────────────────────────────────────────────────────────────────
function getAddonSlug(addonName) {
  return addonName.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function encodeStremioPath(stremioPath) {
  return stremioPath
    .split('/')
    .map(segment => segment.replace(/ /g, '%20'))
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

// ─── Main Handler ─────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  setCorsHeaders(res);
  if (req.method === "OPTIONS") return res.status(200).end();

  // Support local dev (req._nuvio) and Vercel (req.query)
  const params = req._nuvio || req.query;
  const { token } = params;

  if (!token || !TOKEN_REGEX.test(token)) return res.status(200).json(EMPTY_RESPONSE);

  const prefix = params.prefix || "";
  const pSuffix = params.p ? (Array.isArray(params.p) ? params.p.join("/") : params.p) : "";
  const stremioPath = pSuffix ? `${prefix}/${pSuffix}` : prefix;

  // ── FAST PATH: manifest.json — ZERO Firestore reads ──────────────────────
  if (stremioPath === "manifest.json") {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    return res.status(200).json(HARDCODED_MANIFEST);
  }

  const addonKey = params.addon || null;

  // ── Stream requests: validate customer token (1 Firestore read) ───────────
  // Catalog, meta, subtitles are free — only STREAMS need token validation.
  if (stremioPath.startsWith("stream/") || addonKey) {
    const customerData = await getCustomerData(token);

    let isBlocked = false;
    if (!customerData || customerData.status !== "active") {
      isBlocked = true;
    } else if (customerData.expiresAt) {
      const expMillis = typeof customerData.expiresAt.toMillis === "function"
        ? customerData.expiresAt.toMillis()
        : new Date(customerData.expiresAt).getTime();
      if (Date.now() > expMillis) isBlocked = true;
    }

    if (isBlocked && stremioPath.startsWith("stream/")) {
      return res.status(200).json({
        streams: [{
          name: "Nuvio Gatekeeper",
          title: "🚫 Access Blocked / Expired\nClick here to contact support and renew.",
          externalUrl: SUPPORT_URL || undefined
        }]
      });
    }
  }

  console.log(`[Proxy] ${token} | addon=${addonKey || "bundle"} | path=${stremioPath}`);

  // ── Single Addon Mode (individual addon link) ─────────────────────────────
  if (addonKey) {
    const targetAddon = ALL_ADDONS.find(a => getAddonSlug(a.name) === addonKey);
    if (!targetAddon) return res.status(404).json({ error: "Addon not found" });

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

  // ── Master Bundle Mode ────────────────────────────────────────────────────
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "public, max-age=120, s-maxage=120");

  // Catalogs — route to the specific addon that owns this catalog
  if (stremioPath.startsWith("catalog/")) {
    const parts = stremioPath.split("/");
    if (parts.length >= 3) {
      let catIdRaw = parts[2];
      const hasJson = catIdRaw.endsWith(".json");
      const catId = hasJson ? catIdRaw.slice(0, -5) : catIdRaw;
      const splitIndex = catId.indexOf("___");
      if (splitIndex !== -1) {
        const targetSlug = catId.slice(0, splitIndex);
        const originalId = catId.slice(splitIndex + 3);
        const targetAddon = ALL_ADDONS.find(a => getAddonSlug(a.name) === targetSlug);
        if (targetAddon) {
          parts[2] = originalId + (hasJson ? ".json" : "");
          const upstreamData = await fetchAddonJson(targetAddon, parts.join("/"));
          return res.status(200).json(upstreamData || { metas: [] });
        }
      }
    }
    return res.status(200).json({ metas: [] });
  }

  // Meta — ask only addons that support meta, return first valid result
  if (stremioPath.startsWith("meta/")) {
    const metaAddons = ALL_ADDONS.filter(a => a.resources.includes("meta"));
    const results = await Promise.allSettled(metaAddons.map(a => fetchAddonJson(a, stremioPath)));
    for (const r of results) {
      if (r.status === "fulfilled" && r.value?.meta) return res.status(200).json(r.value);
    }
    return res.status(200).json({ meta: {} });
  }

  // Streams — redirect to Torrentio directly instead of proxying.
  // Torrentio blocks Vercel data center IPs. A 302 redirect makes Stremio
  // fetch using the user's own IP, which Torrentio accepts normally.
  if (stremioPath.startsWith("stream/")) {
    const streamAddons = ALL_ADDONS.filter(a => a.resources.includes("stream"));
    if (streamAddons.length === 0) return res.status(200).json({ streams: [] });

    // Redirect to the first (and only) stream addon — Torrentio
    const baseUrl = streamAddons[0].url.replace(/\/manifest\.json$/, "");
    const targetUrl = `${baseUrl}/${encodeStremioPath(stremioPath)}`;
    res.setHeader("Cache-Control", "no-store");
    return res.redirect(302, targetUrl);
  }

  // Subtitles — ask only Open Subtitles (subtitle-capable addons)
  if (stremioPath.startsWith("subtitles/")) {
    const subAddons = ALL_ADDONS.filter(a => a.resources.includes("subtitles"));
    const results = await Promise.allSettled(subAddons.map(a => fetchAddonJson(a, stremioPath)));
    const mergedSubs = [];
    results.forEach(r => {
      if (r.status === "fulfilled" && r.value && Array.isArray(r.value.subtitles)) {
        mergedSubs.push(...r.value.subtitles);
      }
    });
    return res.status(200).json({ subtitles: mergedSubs });
  }

  return res.status(200).json(EMPTY_RESPONSE);
};
