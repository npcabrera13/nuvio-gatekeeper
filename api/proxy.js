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
    name: "Cinemeta",
    url: "https://v3-cinemeta.strem.io/manifest.json",
    resources: ["catalog", "meta"]
  },
  {
    name: "Tomatometadata",
    url: "https://7a82163c306e-rottentomatoes.baby-beamup.club/manifest.json", 
    resources: ["catalog", "meta"]
  },
  {
    name: "AnimeKitsu",
    url: "https://anime-kitsu.strem.fun/manifest.json",
    resources: ["catalog", "meta"]
  },
  {
    name: "Torrentio",
    url: "https://torrentio.strem.fun/qualityfilter=hdrall,4k,brremux,dolbyvision,dolbyvisionwithhdr/manifest.json",
    resources: ["stream"]
  },
  {
    name: "Open Subtitles",
    url: "https://opensubtitles-v3.strem.io/manifest.json",
    resources: ["subtitles"]
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
    // Cinemeta (Supports genres like Action, and years like 2024)
    { type: "movie", id: "cinemeta___top", name: "Popular Movies" },
    { type: "series", id: "cinemeta___top", name: "Popular Series" },
    { type: "movie", id: "cinemeta___year", name: "New Movies" },
    { type: "movie", id: "cinemeta___imdbRating", name: "Featured Movies" },
    { type: "series", id: "cinemeta___imdbRating", name: "Featured Series" },
    
    // Rotten Tomatoes (Certified Fresh)
    { type: "movie", id: "tomatometadata___rtfresh_movie", name: "RT Certified Fresh" },
    
    // Anime Kitsu (Using real Kitsu catalog IDs)
    { type: "anime", id: "animekitsu___kitsu-anime-trending", name: "Trending Anime" },
    { type: "anime", id: "animekitsu___kitsu-anime-popular", name: "Popular Anime" },
    { type: "anime", id: "animekitsu___kitsu-anime-airing", name: "Top Airing Anime" }
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
  // 📺 UNIVERSAL CATALOG ROUTER
  // ==========================================
  if (stremioPath.startsWith("catalog/")) {
    // 1. Parse the path: catalog/movie/cinemeta___imdbRating/genre=Action.json
    const cleanPath = stremioPath.replace(/^catalog\//, "").replace(/\.json$/, "");
    const segments = cleanPath.split("/");
    
    const type = segments[0]; // movie, series, anime
    const fullIdSegment = segments[1]; // cinemeta___imdbRating
    const extrasSegments = segments.slice(2); // ["genre=Action", "skip=100"]

    if (fullIdSegment && fullIdSegment.includes("___")) {
      const [addonPrefix, ...realIdParts] = fullIdSegment.split("___");
      const realId = realIdParts.join("___");
      
      // Find addon (case-insensitive, ignores spaces)
      const targetAddon = ALL_ADDONS.find(a => 
        a.name.toLowerCase().replace(/\s+/g, "") === addonPrefix.toLowerCase()
      );

      if (targetAddon && targetAddon.resources.includes("catalog")) {
        const baseUrl = targetAddon.url.replace(/\/manifest\.json$/, "");
        
        // Reconstruct URL with all extras preserved!
        const extrasString = extrasSegments.length > 0 ? `/${extrasSegments.join("/")}` : "";
        const targetUrl = `${baseUrl}/catalog/${type}/${realId}${extrasString}.json`;
        
        try {
          const catRes = await fetch(targetUrl, {
            headers: { 
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              "Accept": "application/json"
            }
          });
          
          if (catRes.ok) {
            res.setHeader("Cache-Control", "public, max-age=3600"); // Cache for 1 hour
            return res.json(await catRes.json());
          } else {
            console.error(`[Catalog] Upstream ${targetAddon.name} failed: ${catRes.status} for ${targetUrl}`);
          }
        } catch (e) { 
          console.error(`[Catalog] Fetch error for ${targetAddon.name}:`, e.message); 
        }
      } else {
         console.error(`[Catalog] Addon not found or no catalog resource for prefix: ${addonPrefix}`);
      }
    }
    return res.status(200).json({ metas: [] }); // Fallback empty
  }

  // ==========================================
  // 🖼️ UNIVERSAL META ROUTER
  // ==========================================
  if (stremioPath.startsWith("meta/")) {
    // meta/movie/tt123456.json OR meta/anime/kitsu:1234.json
    const cleanPath = stremioPath.replace(/\.json$/, "");
    const segments = cleanPath.split("/");
    const type = segments[1];
    const id = segments[2];
    
    let targetAddon = null;
    
    if (id && id.startsWith("tt")) {
      targetAddon = ALL_ADDONS.find(a => a.name.toLowerCase().includes("cinemeta"));
    } else if (id && id.startsWith("kitsu:")) {
      targetAddon = ALL_ADDONS.find(a => a.name.toLowerCase().includes("kitsu"));
    }

    if (targetAddon && targetAddon.resources.includes("meta")) {
      const baseUrl = targetAddon.url.replace(/\/manifest\.json$/, "");
      const targetUrl = `${baseUrl}/meta/${type}/${id}.json`;
      
      try {
        const metaRes = await fetch(targetUrl, {
          headers: { 
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Accept": "application/json"
          }
        });
        if (metaRes.ok) {
           res.setHeader("Cache-Control", "public, max-age=86400"); // Cache meta for 24h
           return res.json(await metaRes.json());
        }
      } catch (e) {
        console.error(`[Meta] Fetch error for ${targetAddon.name}:`, e.message);
      }
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
      // 🛑 Tells Nuvio "Do not save this empty response in your memory"
      res.setHeader("Cache-Control", "no-store, max-age=0"); 
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
        // Cache successful streams for 1 hour to speed up app
        res.setHeader("Cache-Control", "public, max-age=3600");
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
