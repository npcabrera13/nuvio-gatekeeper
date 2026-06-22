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
// Customer cache — 5 min TTL (blocked customers keep stream access for up to 5 min)
const CUSTOMER_TTL = 5 * 60_000; // 1 minute

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
  },
  {
    name: "AioMetadata",
    url: "https://aiometadata.elfhosted.com/stremio/44fe3014-a2d0-42df-b050-8b5f9d152947/manifest.json",
    resources: ["catalog", "meta"]
  },
  {
    name: "PinoyTV",
    // PinoyTV — catalog/meta/stream are served by the LOCAL M3U PARSER (see
    // loadM3UChannels / parseM3U below), which bypasses stiptv entirely.
    // The stiptv URL above is kept only for backwards-compat manifest requests
    // and is no longer the source of truth for the channel list.
    url: "https://stiptv.ddns.me/eyJ1c2VYdHJlYW0iOmZhbHNlLCJtM3VVcmwiOiJodHRwczovL3Jhdy5naXRodWJ1c2VyY29udGVudC5jb20vbnBjYWJyZXJhMTMvbnV2aW8tZ2F0ZWtlZXBlci9tdWx0aWFkZG9uL21hc3Rlci1waC12Mi5tM3UiLCJlbmFibGVFcGciOmZhbHNlLCJpbnN0YW5jZUlkIjoiZGVmM2Y3OTAtMzViNi00NWFkLWJkMDItYWM3YjQ5MTU0YmM0In0=/manifest.json",
    resources: ["catalog", "meta", "stream"]
  },
  {
    name: "VIPChannels",
    url: "https://stiptv.ddns.me/eyJ1c2VYdHJlYW0iOmZhbHNlLCJtM3VVcmwiOiJodHRwczovL3Jhdy5naXRodWJ1c2VyY29udGVudC5jb20vbnBjYWJyZXJhMTMvbnV2aW8tZ2F0ZWtlZXBlci9tdWx0aWFkZG9uL3ZpcC1jaGVycnktcGljay5tM3UiLCJlbmFibGVFcGciOmZhbHNlLCJpbnN0YW5jZUlkIjoiMzMzZjYxNjktY2FiYy00NjEyLWJkNzgtZjZiZTMyYjg1NTRiIn0=/manifest.json",
    resources: ["catalog", "meta", "stream"]
  }
];

// Support URL shown to blocked users (edit if needed)
const SUPPORT_URL = "";

// ─── Hardcoded Manifest ──────────────────────────────────────────────────────
// Returned instantly with ZERO Firestore reads
const HARDCODED_MANIFEST = {
  id: "com.nuvio.bundle.v2",
  version: "1.3.4",
  name: "Nuvio Bundle",
  description: "All your premium addons in one unified master bundle — powered by Nuvio.",
  resources: ["stream", "meta", "catalog", "subtitles"],
  types: ["movie", "series", "anime", "tv"],
  catalogs: [
    // Cinemeta
    { type: "movie", id: "cinemeta___top", name: "Popular Movies",
      extra: [{ name: "genre", options: ["Action","Adventure","Animation","Biography","Comedy","Crime","Documentary","Drama","Family","Fantasy","History","Horror","Mystery","Romance","Sci-Fi","Sport","Thriller","War","Western"] }, { name: "skip" }, { name: "search" }],
      genres: ["Action","Adventure","Animation","Biography","Comedy","Crime","Documentary","Drama","Family","Fantasy","History","Horror","Mystery","Romance","Sci-Fi","Sport","Thriller","War","Western"] },
    { type: "series", id: "cinemeta___top", name: "Popular Series",
      extra: [{ name: "genre", options: ["Action","Adventure","Animation","Biography","Comedy","Crime","Documentary","Drama","Family","Fantasy","History","Horror","Mystery","Romance","Sci-Fi","Sport","Thriller","War","Western"] }, { name: "skip" }, { name: "search" }],
      genres: ["Action","Adventure","Animation","Biography","Comedy","Crime","Documentary","Drama","Family","Fantasy","History","Horror","Mystery","Romance","Sci-Fi","Sport","Thriller","War","Western"] },
    { type: "movie", id: "cinemeta___imdbRating", name: "Featured Movies",
      extra: [{ name: "genre", options: ["Action","Adventure","Animation","Biography","Comedy","Crime","Documentary","Drama","Family","Fantasy","History","Horror","Mystery","Romance","Sci-Fi","Sport","Thriller","War","Western"] }, { name: "skip" }, { name: "search" }],
      genres: ["Action","Adventure","Animation","Biography","Comedy","Crime","Documentary","Drama","Family","Fantasy","History","Horror","Mystery","Romance","Sci-Fi","Sport","Thriller","War","Western"] },
    { type: "series", id: "cinemeta___imdbRating", name: "Featured Series",
      extra: [{ name: "genre", options: ["Action","Adventure","Animation","Biography","Comedy","Crime","Documentary","Drama","Family","Fantasy","History","Horror","Mystery","Romance","Sci-Fi","Sport","Thriller","War","Western"] }, { name: "skip" }, { name: "search" }],
      genres: ["Action","Adventure","Animation","Biography","Comedy","Crime","Documentary","Drama","Family","Fantasy","History","Horror","Mystery","Romance","Sci-Fi","Sport","Thriller","War","Western"] },

    // Rotten Tomatoes (Certified Fresh)
    { type: "movie", id: "tomatometadata___rtfresh_movie", name: "RT Certified Fresh",
      extra: [{ name: "genre", options: ["Action","Adventure","Animation","Anime","Biography","Comedy","Crime","Documentary","Drama","Fantasy","History","Horror","Kids & Family","Mystery & Thriller","Romance","Sci-Fi","War","Western"] }],
      genres: ["Action","Adventure","Animation","Anime","Biography","Comedy","Crime","Documentary","Drama","Fantasy","History","Horror","Kids & Family","Mystery & Thriller","Romance","Sci-Fi","War","Western"] },
    { type: "series", id: "tomatometadata___rtfresh_series", name: "RT Fresh TV Shows",
      extra: [{ name: "genre", options: ["Action","Adventure","Animation","Anime","Biography","Comedy","Crime","Documentary","Drama","Fantasy","History","Horror","Kids & Family","Mystery & Thriller","Romance","Sci-Fi","War","Western"] }],
      genres: ["Action","Adventure","Animation","Anime","Biography","Comedy","Crime","Documentary","Drama","Fantasy","History","Horror","Kids & Family","Mystery & Thriller","Romance","Sci-Fi","War","Western"] },

    // Anime Kitsu (all 4 real Kitsu catalog IDs)
    { type: "anime", id: "animekitsu___kitsu-anime-trending", name: "Trending Anime",
      extra: [{ name: "genre", options: ["Action","Adventure","Comedy","Drama","Sci-Fi","Fantasy","Romance","Horror","Thriller","Supernatural","Mystery","Sports","Slice of Life","Mecha","School"] }, { name: "skip" }],
      genres: ["Action","Adventure","Comedy","Drama","Sci-Fi","Fantasy","Romance","Horror","Thriller","Supernatural","Mystery","Sports","Slice of Life","Mecha","School"] },
    { type: "anime", id: "animekitsu___kitsu-anime-popular", name: "Popular Anime",
      extra: [{ name: "genre", options: ["Action","Adventure","Comedy","Drama","Sci-Fi","Fantasy","Romance","Horror","Thriller","Supernatural","Mystery","Sports","Slice of Life","Mecha","School"] }, { name: "skip" }],
      genres: ["Action","Adventure","Comedy","Drama","Sci-Fi","Fantasy","Romance","Horror","Thriller","Supernatural","Mystery","Sports","Slice of Life","Mecha","School"] },
    { type: "anime", id: "animekitsu___kitsu-anime-airing", name: "Top Airing Anime",
      extra: [{ name: "genre", options: ["Action","Adventure","Comedy","Drama","Sci-Fi","Fantasy","Romance","Horror","Thriller","Supernatural","Mystery","Sports","Slice of Life","Mecha","School"] }, { name: "skip" }],
      genres: ["Action","Adventure","Comedy","Drama","Sci-Fi","Fantasy","Romance","Horror","Thriller","Supernatural","Mystery","Sports","Slice of Life","Mecha","School"] },
    { type: "anime", id: "aiometadata___mdblist.105461", name: "Popular Anime Series",
      extra: [{ name: "genre", options: ["Action","Adventure","Comedy","Drama","Sci-Fi","Fantasy","Romance","Horror","Thriller","Supernatural","Mystery","Sports","Slice of Life","Mecha","School"] }, { name: "skip" }],
      genres: ["Action","Adventure","Comedy","Drama","Sci-Fi","Fantasy","Romance","Horror","Thriller","Supernatural","Mystery","Sports","Slice of Life","Mecha","School"] },

    // AIOMetadata / MDBList — Streaming Services
    { type: "movie", id: "aiometadata___mdblist.88328", name: "Netflix" },
    { type: "series", id: "aiometadata___mdblist.88329", name: "Netflix Series" },
    { type: "movie", id: "aiometadata___mdblist.86752", name: "Latest Netflix" },
    { type: "series", id: "aiometadata___mdblist.86751", name: "Latest Netflix Series" },
    { type: "movie", id: "aiometadata___mdblist.88332", name: "Prime" },
    { type: "series", id: "aiometadata___mdblist.88333", name: "Prime Series" },
    { type: "movie", id: "aiometadata___mdblist.88322", name: "Disney+" },
    { type: "series", id: "aiometadata___mdblist.88323", name: "Disney+ Series" },
    { type: "movie", id: "aiometadata___mdblist.88324", name: "HBO Max" },
    { type: "series", id: "aiometadata___mdblist.88325", name: "HBO Max Series" },
    { type: "movie", id: "aiometadata___mdblist.88317", name: "Apple TV+" },
    { type: "series", id: "aiometadata___mdblist.88319", name: "Apple TV+ Series" },
    { type: "movie", id: "aiometadata___mdblist.88326", name: "Hulu" },
    { type: "series", id: "aiometadata___mdblist.88327", name: "Hulu Series" },
    { type: "movie", id: "aiometadata___mdblist.88330", name: "Paramount+" },
    { type: "series", id: "aiometadata___mdblist.88331", name: "Paramount+ Series" },
    { type: "movie", id: "aiometadata___mdblist.98862", name: "Crunchyroll" },
    { type: "series", id: "aiometadata___mdblist.99202", name: "Crunchyroll Series" },
    
    // AIOMetadata / MDBList — Genres  
    { type: "movie", id: "aiometadata___mdblist.91211", name: "Popular Action" },
    { type: "movie", id: "aiometadata___mdblist.91223", name: "Popular Comedy" },
    { type: "movie", id: "aiometadata___mdblist.91296", name: "Popular Drama" },
    { type: "movie", id: "aiometadata___mdblist.91215", name: "Popular Horror" },
    { type: "movie", id: "aiometadata___mdblist.91220", name: "Popular Sci-Fi" },
    { type: "movie", id: "aiometadata___mdblist.91893", name: "Popular Thriller" },
    { type: "movie", id: "aiometadata___mdblist.128051", name: "Popular Documentary" },
    { type: "movie", id: "aiometadata___mdblist.116037", name: "Popular Animation" },
    { type: "movie", id: "aiometadata___mdblist.42822", name: "Popular Movies" },
    { type: "series", id: "aiometadata___mdblist.42836", name: "Popular Series" },
    { type: "movie", id: "aiometadata___mdblist.87667", name: "Trending" },
    { type: "series", id: "aiometadata___mdblist.88434", name: "Trending Series" },
    
    // PinoyTV (Live TV Channels)
    { type: "tv", id: "pinoytv___channels", name: "🇵🇭 Philippine Live TV" },
    
    // Global TV Guides
    
    // VIP Cherry Pick Channels
    { type: "tv", id: "vipchannels___channels", name: "⭐ VIP Cherry Pick TV" }
  ],
  idPrefixes: ["tt", "kitsu", "iptv_"],
  behaviorHints: { configurable: false }
};

// ============================================================
// HIDDEN CATALOGS — server-side hide list for the home screen.
// Catalog definitions stay in HARDCODED_MANIFEST (never deleted);
// entries here simply remove them from the served manifest and
// short-circuit any /catalog/ requests that target them.
//
// Key format: "<catalogId>|<type>"  (case-sensitive, exact match)
//
// To UN-HIDE a catalog: delete its line below and redeploy.
// To HIDE a new one:    add a line "<id>|<type>" and redeploy.
//
// The 9 catalogs NOT in this set are the only ones visible on
// the Stremio home screen: Popular Movies, Latest Netflix,
// Latest Netflix Series, Prime, Disney+, HBO Max, Apple TV+,
// Crunchyroll, Top Airing Anime.
// ============================================================
const HIDDEN_CATALOGS = new Set([
  // Cinemeta
  "cinemeta___top|series",                   // Popular Series (Cinemeta)
  "cinemeta___imdbRating|movie",             // Featured Movies
  "cinemeta___imdbRating|series",            // Featured Series

  // Rotten Tomatoes
  "tomatometadata___rtfresh_movie|movie",    // RT Certified Fresh
  "tomatometadata___rtfresh_series|series",  // RT Fresh TV Shows

  // AnimeKitsu
  "animekitsu___kitsu-anime-trending|anime", // Trending Anime
  "animekitsu___kitsu-anime-popular|anime",  // Popular Anime

  // AIOMetadata — Series versions of streaming services
  "aiometadata___mdblist.105461|series",     // Popular Anime Series
  "aiometadata___mdblist.88329|series",      // Netflix Series
  "aiometadata___mdblist.88333|series",      // Prime Series
  "aiometadata___mdblist.88323|series",      // Disney+ Series
  "aiometadata___mdblist.88325|series",      // HBO Max Series
  "aiometadata___mdblist.88319|series",      // Apple TV+ Series
  "aiometadata___mdblist.88327|series",      // Hulu Series
  "aiometadata___mdblist.88331|series",      // Paramount+ Series
  "aiometadata___mdblist.99202|series",      // Crunchyroll Series
  "aiometadata___mdblist.42836|series",      // Popular Series (AIO)
  "aiometadata___mdblist.88434|series",      // Trending Series

  // AIOMetadata — Movie streaming services (other than the 9 to keep)
  "aiometadata___mdblist.88328|movie",       // Netflix (movie)
  "aiometadata___mdblist.88326|movie",       // Hulu
  "aiometadata___mdblist.88330|movie",       // Paramount+

  // AIOMetadata — "Popular X" genre catalogs
  "aiometadata___mdblist.91211|movie",       // Popular Action
  "aiometadata___mdblist.91223|movie",       // Popular Comedy
  "aiometadata___mdblist.91296|movie",       // Popular Drama
  "aiometadata___mdblist.91215|movie",       // Popular Horror
  "aiometadata___mdblist.91220|movie",       // Popular Sci-Fi
  "aiometadata___mdblist.91893|movie",       // Popular Thriller
  "aiometadata___mdblist.128051|movie",      // Popular Documentary
  "aiometadata___mdblist.116037|movie",      // Popular Animation
  "aiometadata___mdblist.42822|movie",       // Popular Movies (AIO)
  "aiometadata___mdblist.87667|movie",       // Trending

  // Live TV (accessible via Collections tab — hide from home screen)
  "pinoytv___channels|tv",                   // 🇵🇭 Philippine Live TV
  "vipchannels___channels|tv",               // ⭐ VIP Cherry Pick TV
]);

// Returns true if a catalog (by id + type) is in the hide list.
function isCatalogHidden(id, type) {
  if (!id || !type) return false;
  return HIDDEN_CATALOGS.has(`${id}|${type}`);
}

// ─── Constants ───────────────────────────────────────────────────────────────
const TOKEN_REGEX = /^[a-zA-Z0-9_-]{4,128}$/;
const BUNDLE_TIMEOUT_MS = 8000;
const EMPTY_RESPONSE = { streams: [], metas: [], catalogs: [] };

// ─── Local M3U Parser ───────────────────────────────────────────────────────
const M3U_URLS = {
  pinoytv: "https://raw.githubusercontent.com/npcabrera13/nuvio-gatekeeper/multiaddon/master-ph-v2.m3u",
  vipchannels: "https://raw.githubusercontent.com/npcabrera13/nuvio-gatekeeper/multiaddon/vip-cherry-pick.m3u"
};

const _m3uCache = new Map();
const M3U_TTL = 5 * 60 * 1000; // 5 minutes

async function loadM3UChannels(playlistKey) {
  const now = Date.now();
  const cached = _m3uCache.get(playlistKey);
  if (cached && now - cached.time < M3U_TTL) return cached.channels;

  const url = M3U_URLS[playlistKey];
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0", "Accept": "text/plain" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const channels = parseM3U(text);
    _m3uCache.set(playlistKey, { channels, time: now });
    return channels;
  } catch (e) {
    console.error(`[M3U] Failed to load ${playlistKey}:`, e.message);
    return cached ? cached.channels : [];
  }
}

function parseM3U(text) {
  const lines = text.split(/\r?\n/);
  const channels = [];
  let currentMeta = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("#EXTINF:")) {
      const logoMatch = trimmed.match(/tvg-logo="([^"]*)"/i);
      const groupMatch = trimmed.match(/group-title="([^"]*)"/i);
      const fanartMatch = trimmed.match(/fanart="([^"]*)"/i);
      const commaIdx = trimmed.lastIndexOf(",");
      const name = commaIdx !== -1 ? trimmed.slice(commaIdx + 1).trim() : "Unknown";
      currentMeta = { name, logo: logoMatch ? logoMatch[1] : "", fanart: fanartMatch ? fanartMatch[1] : "", group: groupMatch ? groupMatch[1] : "" };
    } else if (trimmed && !trimmed.startsWith("#") && currentMeta) {
      const slug = currentMeta.name.toLowerCase().replace(/[^a-z0-9]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
      channels.push({ id: `iptv_${slug}`, name: currentMeta.name, logo: currentMeta.logo, fanart: currentMeta.fanart, group: currentMeta.group, url: trimmed });
      currentMeta = null;
    }
  }
  return channels;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
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
async function handler(req, res) {
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
    const visibleCatalogs = HARDCODED_MANIFEST.catalogs.filter(
      c => !isCatalogHidden(c.id, c.type)
    );
    const filteredManifest = { ...HARDCODED_MANIFEST, catalogs: visibleCatalogs };
    return res.status(200).json(filteredManifest);
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

    // Hide-list short-circuit: if this catalog is in HIDDEN_CATALOGS,
    // return an empty metas array. Handles stale clients that cached
    // the old manifest before the hide took effect.
    if (isCatalogHidden(fullIdSegment, type)) {
      return res.status(200).json({ metas: [] });
    }

    if (fullIdSegment && fullIdSegment.includes("___")) {
      let [addonPrefix, ...realIdParts] = fullIdSegment.split("___");
      let realId = realIdParts.join("___");
      const addonLower = addonPrefix.toLowerCase();

      // ── LOCAL M3U SHORT-CIRCUIT: pinoytv & vipchannels ─────────────────
      if ((addonLower === "pinoytv" || addonLower === "vipchannels") && realId === "channels") {
        const playlistKey = addonLower === "pinoytv" ? "pinoytv" : "vipchannels";
        const channels = await loadM3UChannels(playlistKey);
        const metas = channels.map(ch => ({
          id: ch.id, type: "tv", name: ch.name,
          poster: ch.logo, background: ch.fanart || ch.logo, logo: ch.logo,
          genres: [ch.group].filter(Boolean), description: ch.group || ""
        }));
        res.setHeader("Cache-Control", "public, max-age=300");
        return res.status(200).json({ metas });
      }
      // ───────────────────────────────────────────────────────────────

      // --- BACKWARDS COMPATIBILITY MAPPING ---
      // Fix typos and route mdblist.* catalogs to AIOMetadata (their real source)
      if (addonLower === "cinemata") addonPrefix = "cinemeta";
      if (realId.startsWith("mdblist.")) addonPrefix = "aiometadata";
      // ---------------------------------------
      
      // Find addon (case-insensitive, ignores spaces)
      const targetAddon = ALL_ADDONS.find(a => 
        a.name.toLowerCase().replace(/\s+/g, "") === addonPrefix.toLowerCase().replace(/\s+/g, "")
      );

      if (targetAddon && targetAddon.resources.includes("catalog")) {
        const baseUrl = targetAddon.url.replace(/\/manifest\.json$/, "");
        
        // Reconstruct URL with all extras preserved!
        const extrasString = extrasSegments.length > 0 ? `/${extrasSegments.join("/")}` : "";
        const rawPath = `/catalog/${type}/${realId}${extrasString}.json`;
        const targetUrl = `${baseUrl}${encodeStremioPath(rawPath)}`;
        
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
    
    // If request is for live TV / IPTV metadata
    if (id && id.startsWith("iptv_")) {
      // ── LOCAL META SHORT-CIRCUIT: pinoytv & vipchannels ────────────────
      for (const playlistKey of ["pinoytv", "vipchannels"]) {
        const channels = await loadM3UChannels(playlistKey);
        const ch = channels.find(c => c.id === id);
        if (ch) {
          res.setHeader("Cache-Control", "public, max-age=86400");
          return res.status(200).json({
            meta: {
              id: ch.id, type: "tv", name: ch.name,
              poster: ch.logo, background: ch.fanart || ch.logo, logo: ch.logo,
              genres: [ch.group].filter(Boolean), description: ch.group || ""
            }
          });
        }
      }
      // ──────────────────────────────────────────────────────────────

      // Fallback: stiptv for PinoyTV / VIPChannels (orphaned iptv_* IDs)
      const iptvAddons = ALL_ADDONS.filter(a => a.resources.includes("meta") && a.url.includes("stiptv.ddns.me"));
      const fetchPromises = iptvAddons.map(async (addon) => {
        const baseUrl = addon.url.replace(/\/manifest\.json$/, "");
        const targetUrl = `${baseUrl}/meta/${type}/${id}.json`;
        try {
          const metaRes = await fetch(targetUrl, {
            headers: { 
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
              "Accept": "application/json"
            }
          });
          if (metaRes.ok) {
            const data = await metaRes.json();
            if (data && data.meta) {
              return data;
            }
          }
        } catch (e) {
          console.error(`[Meta] ${addon.name} fetch error:`, e.message);
        }
        return null;
      });

      try {
        const results = await Promise.all(fetchPromises);
        const validResult = results.find(r => r && r.meta);
        if (validResult) {
          res.setHeader("Cache-Control", "public, max-age=86400");
          return res.status(200).json(validResult);
        }
      } catch (e) {
        console.error("[Meta] IPTV parallel fetch error:", e.message);
      }
      return res.status(200).json({ meta: null });
    }

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

    // If request is for live TV / IPTV streams
    if (stremioPath.startsWith("stream/tv/")) {
      const streamId = stremioPath.replace(/^stream\/tv\//, "").replace(/\.json$/, "");

      // ── LOCAL STREAM SHORT-CIRCUIT: pinoytv & vipchannels ──────────────
      for (const playlistKey of ["pinoytv", "vipchannels"]) {
        const channels = await loadM3UChannels(playlistKey);
        const ch = channels.find(c => c.id === streamId);
        if (ch) {
          return res.status(200).json({
            streams: [{ url: ch.url, name: ch.name, description: ch.group || "Live TV", behaviorHints: { notWebReady: true } }]
          });
        }
      }
      // ──────────────────────────────────────────────────────────────

      // Fallback: stiptv for PinoyTV / VIPChannels (orphaned iptv_* IDs)
      const iptvAddons = ALL_ADDONS.filter(a => a.resources.includes("stream") && a.url.includes("stiptv.ddns.me"));
      const fetchPromises = iptvAddons.map(async (addon) => {
        const baseUrl = addon.url.replace(/\/manifest\.json$/, "");
        const targetStreamUrl = `${baseUrl}/${encodeStremioPath(stremioPath)}`;
        try {
          const streamRes = await fetch(targetStreamUrl, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              "Accept": "application/json"
            }
          });
          if (streamRes.ok) {
            const data = await streamRes.json();
            if (data && data.streams && data.streams.length > 0) {
              return data;
            }
          }
        } catch (e) {
          console.error(`[Stream] ${addon.name} fetch error:`, e.message);
        }
        return null;
      });

      try {
        const results = await Promise.all(fetchPromises);
        const validResult = results.find(r => r && r.streams && r.streams.length > 0);
        if (validResult) {
          return res.status(200).json(validResult);
        }
      } catch (e) {
        console.error("[Stream] IPTV parallel fetch error:", e.message);
      }
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
}

handler.ALL_ADDONS = ALL_ADDONS;
module.exports = handler;
