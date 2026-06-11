// Nuvio Stream API — Multi-Addon Secure Reverse-Proxy Gatekeeper
// Supports individual addon routing AND master bundle merging

const { initializeApp } = require("firebase/app");
const { getFirestore, doc, getDoc } = require("firebase/firestore");

// ─── Firebase Initialization ────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyDY4xB7sSFdEIOzwVo9rLLIqfs6E6qJf2c",
  authDomain: "nuvio-f00b0.firebaseapp.com",
  projectId: "nuvio-f00b0",
  storageBucket: "nuvio-f00b0.firebasestorage.app",
  messagingSenderId: "911411655425",
  appId: "1:911411655425:web:9f2b749425ebae57346100"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ─── Addon Registry ─────────────────────────────────────────────────────────
// Add new addons here. Each entry needs a name (for logs) and a baseUrl.
// The baseUrl is everything BEFORE the Stremio path (e.g. /manifest.json).
const ADDON_REGISTRY = {
  torrentio: {
    name: "Torrentio",
    baseUrl: "https://torrentio.strem.fun/qualityfilter=hdrall,4k,brremux,dolbyvision,dolbyvisionwithhdr",
  },
  // ── Add more addons below ─────────────────────────────────────────────
  // comet: {
  //   name: "Comet",
  //   baseUrl: "https://comet.example.com",
  // },
  // knightcrawler: {
  //   name: "KnightCrawler",
  //   baseUrl: "https://knightcrawler.example.com",
  // },
};

// List of addon keys that participate in the Master Bundle
const BUNDLE_ADDONS = ["torrentio"];

// ─── Constants ──────────────────────────────────────────────────────────────
const BUNDLE_TIMEOUT_MS = 8000; // 8-second failsafe per addon

const EMPTY_RESPONSE = {
  streams: [],
  metas: [],
  catalogs: [],
};

// The manifest returned when using the Master Bundle link
const BUNDLE_MANIFEST = {
  id: "com.nuvio.bundle",
  version: "1.0.0",
  name: "Nuvio Bundle",
  description: "All your premium streams in one place — powered by Nuvio.",
  catalogs: [],
  resources: [
    { name: "stream", types: ["movie", "series", "anime"], idPrefixes: ["tt", "kitsu"] },
  ],
  types: ["movie", "series", "anime", "other"],
  behaviorHints: { configurable: false },
};

// ─── CORS Helper ────────────────────────────────────────────────────────────
function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

// ─── Fetch with Timeout ─────────────────────────────────────────────────────
// Wraps fetch() with a hard timeout so a slow addon can't stall the response.
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

// ─── Fetch streams from a single addon ──────────────────────────────────────
async function fetchAddonStreams(addonKey, stremioPath) {
  const addon = ADDON_REGISTRY[addonKey];
  if (!addon) return [];

  const url = `${addon.baseUrl}/${stremioPath}`;
  console.log(`[Bundle] Fetching from ${addon.name}: ${url}`);

  try {
    const upstream = await fetchWithTimeout(url, {
      method: "GET",
      headers: { "User-Agent": "NuvioStreamAPI/1.0", Accept: "application/json" },
    });

    if (!upstream.ok) {
      console.log(`[Bundle] ${addon.name} returned ${upstream.status}, skipping.`);
      return [];
    }

    const json = await upstream.json();

    // Tag each stream with the addon source so users can see where it came from
    if (json.streams && Array.isArray(json.streams)) {
      json.streams.forEach((s) => {
        if (s.name) s.name = s.name.replace(/^/, `[${addon.name}] `);
      });
      return json.streams;
    }
    return [];
  } catch (err) {
    if (err.name === "AbortError") {
      console.log(`[Bundle] ${addon.name} timed out after ${BUNDLE_TIMEOUT_MS}ms, skipping.`);
    } else {
      console.error(`[Bundle] ${addon.name} fetch failed:`, err.message);
    }
    return [];
  }
}

// ─── Main Handler ───────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // ── 1. Extract token ──────────────────────────────────────────────────
  const { token } = req.query;

  if (!token) {
    return res.status(200).json(EMPTY_RESPONSE);
  }

  // ── 2. Validate token against Firestore ───────────────────────────────
  try {
    const customerRef = doc(db, "customers", token);
    const customerSnap = await getDoc(customerRef);

    if (!customerSnap.exists() || customerSnap.data().status !== "active") {
      return res.status(200).json(EMPTY_RESPONSE);
    }

    const data = customerSnap.data();
    if (data.expiresAt) {
      const expMillis =
        typeof data.expiresAt.toMillis === "function"
          ? data.expiresAt.toMillis()
          : new Date(data.expiresAt).getTime();

      if (Date.now() > expMillis) {
        return res.status(200).json(EMPTY_RESPONSE);
      }
    }
  } catch (error) {
    console.error("Firestore lookup failed:", error.message);
    return res.status(200).json(EMPTY_RESPONSE);
  }

  // ── 3. Parse addon and stremio path from query params ─────────────────
  // The vercel.json rewrites pass: ?token=...&addon=...&prefix=...&p=...
  // If no addon param → Master Bundle mode
  const addonKey = req.query.addon || null;
  const prefix = req.query.prefix || "";
  const pSuffix = req.query.p
    ? Array.isArray(req.query.p) ? req.query.p.join("/") : req.query.p
    : "";
  const stremioPath = pSuffix ? `${prefix}/${pSuffix}` : prefix;

  console.log(`[Proxy] Token: ${token} | Addon: ${addonKey || "BUNDLE"} | Path: ${stremioPath}`);

  // ── 4A. Single Addon Mode (e.g. /:token/torrentio/manifest.json) ─────
  if (addonKey) {
    const addon = ADDON_REGISTRY[addonKey];
    if (!addon) {
      return res.status(404).json({ error: `Unknown addon: ${addonKey}` });
    }

    const targetUrl = `${addon.baseUrl}/${stremioPath}`;
    console.log(`[Single] Proxying to ${addon.name}: ${targetUrl}`);

    try {
      const upstream = await fetchWithTimeout(targetUrl, {
        method: req.method,
        headers: { "User-Agent": "NuvioStreamAPI/1.0", Accept: "application/json" },
      });

      const contentType = upstream.headers.get("content-type");
      const body = await upstream.text();

      if (contentType) res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "public, max-age=120, s-maxage=120");
      return res.status(upstream.status).send(body);
    } catch (error) {
      console.error(`[Single] ${addon.name} fetch failed:`, error.message);
      return res.status(200).json(EMPTY_RESPONSE);
    }
  }

  // ── 4B. Master Bundle Mode (e.g. /:token/manifest.json) ──────────────

  // If requesting the manifest, return our custom bundle manifest
  if (stremioPath === "manifest.json") {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "public, max-age=300, s-maxage=300");
    return res.status(200).json(BUNDLE_MANIFEST);
  }

  // For stream requests: fan out to ALL bundle addons simultaneously
  if (stremioPath.startsWith("stream/")) {
    console.log(`[Bundle] Fetching streams from ${BUNDLE_ADDONS.length} addon(s)...`);

    // Fire all addon requests at the same time with Promise.allSettled
    const results = await Promise.allSettled(
      BUNDLE_ADDONS.map((key) => fetchAddonStreams(key, stremioPath))
    );

    // Merge all successful stream arrays into one big list
    const mergedStreams = [];
    results.forEach((result, i) => {
      if (result.status === "fulfilled" && Array.isArray(result.value)) {
        console.log(`[Bundle] ${BUNDLE_ADDONS[i]}: got ${result.value.length} streams`);
        mergedStreams.push(...result.value);
      } else {
        console.log(`[Bundle] ${BUNDLE_ADDONS[i]}: failed or empty`);
      }
    });

    console.log(`[Bundle] Total merged streams: ${mergedStreams.length}`);

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "public, max-age=120, s-maxage=120");
    return res.status(200).json({ streams: mergedStreams });
  }

  // For any other request type (catalog, meta, etc.) — proxy to first addon
  const fallbackAddon = ADDON_REGISTRY[BUNDLE_ADDONS[0]];
  if (fallbackAddon) {
    const targetUrl = `${fallbackAddon.baseUrl}/${stremioPath}`;
    try {
      const upstream = await fetchWithTimeout(targetUrl, {
        method: req.method,
        headers: { "User-Agent": "NuvioStreamAPI/1.0", Accept: "application/json" },
      });
      const contentType = upstream.headers.get("content-type");
      const body = await upstream.text();
      if (contentType) res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "public, max-age=120, s-maxage=120");
      return res.status(upstream.status).send(body);
    } catch (error) {
      console.error("Fallback fetch failed:", error.message);
      return res.status(200).json(EMPTY_RESPONSE);
    }
  }

  return res.status(200).json(EMPTY_RESPONSE);
};
