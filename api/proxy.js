// Nuvio Stream API — Multi-Addon Secure Reverse-Proxy Gatekeeper
// Addons are hardcoded — Firestore is ONLY used to validate customer tokens.

const { getApps, initializeApp } = require("firebase/app");
const { getFirestore, doc, getDoc } = require("firebase/firestore");

// ─── Firebase (Singleton) ────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyC4OXdfVs_mXPinhmpAt2su8WKZhUDXWoQ",
  authDomain: "multiaddon.firebaseapp.com",
  projectId: "multiaddon",
  storageBucket: "multiaddon.firebasestorage.app",
  messagingSenderId: "963978475190",
  appId: "1:963978475190:web:6796687180b021e049d817"
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
const CUSTOMER_TTL = 60_000; // 1 minute

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
  catalogs: [
    { type: 'movie', id: 'cinemata___top', name: 'Popular' },
    { type: 'series', id: 'cinemata___top', name: 'Popular' },
    { type: 'anime', id: 'animekitsu___top', name: 'Popular' }
  ],
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
  const targetUrl = `${baseUrl}/${encodeStremioPath(stremioPath)}`;
  
  // DO NOT USE corsproxy.io - it returns 403 for Torrentio!
  // Fetch directly with browser headers to bypass basic bot checks.

  try {
    const res = await fetch(targetUrl, {
      method: "GET",
      headers: {
        // THIS IS THE MAGIC: Makes Vercel look like a real Chrome browser
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9"
      }
    });
    
    if (!res.ok) {
      console.error(`[Fetch] ${addon.name} failed with status: ${res.status}`);
      return null;
    }
    
    return await res.json();
  } catch (e) {
    console.error(`[Fetch] ${addon.name} error:`, e.message);
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

  let isBlocked = false;
  // ── Validate customer token (1 Firestore read) ───────────
  if (stremioPath.startsWith("stream/") || addonKey) {
    const customerData = await getCustomerData(token);

    if (!customerData || customerData.status !== "active") {
      isBlocked = true;
    } else if (customerData.expiresAt) {
      const expMillis = typeof customerData.expiresAt.toMillis === "function"
        ? customerData.expiresAt.toMillis()
        : new Date(customerData.expiresAt).getTime();
      if (Date.now() > expMillis) isBlocked = true;
    }
  }

  console.log(`[Proxy] ${token} | addon=${addonKey || "bundle"} | path=${stremioPath}`);

  // ── Single Addon Mode (individual addon link) ─────────────────────────────
  if (addonKey) {
    if (isBlocked && stremioPath.startsWith("stream/")) {
      return res.status(200).json({ streams: [] });
    }
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

  // ==========================================
  // 📺 CATALOGS (Fixes the Cinemata 404 Error)
  // ==========================================
  if (stremioPath.startsWith("catalog/")) {
    const parts = stremioPath.split("/"); 
    const type = parts[1]; // movie, series, anime
    const fileName = parts[2]; // e.g., cinemata___top.json
    
    let targetUrl = "";

    // Translate your custom prefix to Cinemeta's real ID
    if (fileName && fileName.startsWith("cinemata___")) {
      const realId = fileName.replace("cinemata___", "").replace(".json", "");
      targetUrl = `https://v3-cinemeta.strem.io/catalog/${type}/${realId}.json`;
    } 
    else if (fileName && fileName.startsWith("animekitsu___")) {
      const realId = fileName.replace("animekitsu___", "").replace(".json", "");
      targetUrl = `https://anime-kitsu.strem.fun/catalog/${type}/${realId}.json`;
    }

    if (targetUrl) {
      try {
        const catRes = await fetch(targetUrl, {
          headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
        });
        if (catRes.ok) return res.json(await catRes.json());
      } catch (e) { console.error("[Catalog] Error:", e.message); }
    }
    return res.status(200).json({ metas: [] }); 
  }

  // ==========================================
  // 🖼️ METADATA (Fixes Posters & Descriptions)
  // ==========================================
  if (stremioPath.startsWith("meta/")) {
    let targetUrl = "";

    // Route IMDB IDs (tt123) to Cinemeta
    if (stremioPath.includes("/tt")) {
      targetUrl = `https://v3-cinemeta.strem.io/${stremioPath}`;
    } 
    // Route Kitsu IDs to Anime Kitsu
    else if (stremioPath.includes("/kitsu")) {
      targetUrl = `https://anime-kitsu.strem.fun/${stremioPath}`;
    }

    if (targetUrl) {
      try {
        const metaRes = await fetch(targetUrl, {
          headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
        });
        if (metaRes.ok) return res.json(await metaRes.json());
      } catch (e) { console.error("[Meta] Error:", e.message); }
    }
    return res.status(200).json({ meta: null });
  }

  // ==========================================
  // 🎬 STREAMS (Blocks Torrents + Torrentio Fix)
  // ==========================================
  if (stremioPath.startsWith("stream/")) {
    
    // 🛑 BLOCK BLOCKED/EXPIRED USERS INSTANTLY
    if (isBlocked) {
      console.log(`[Gatekeeper] Blocked streams for token: ${token}`);
      // Returns empty. Nuvio will just show "No streams available"
      return res.status(200).json({ streams: [] }); 
    }

    // Fetch from Torrentio (with Chrome User-Agent to bypass Vercel IP blocks)
    const torrentioBaseUrl = "https://torrentio.strem.fun/qualityfilter=hdrall,4k,brremux,dolbyvision,dolbyvisionwithhdr";
    const targetStreamUrl = `${torrentioBaseUrl}/${stremioPath}`;
    
    try {
      const streamRes = await fetch(targetStreamUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "application/json"
        }
      });
      
      if (streamRes.ok) {
        const data = await streamRes.json();
        return res.status(200).json(data);
      }
    } catch (e) {
      console.error("[Stream] Torrentio fetch error:", e.message);
    }
    
    // Fallback if Torrentio fails
    return res.status(200).json({ streams: [] });
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
