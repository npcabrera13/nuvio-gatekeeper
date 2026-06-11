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

// ─── Fetch streams from a single dynamic addon ──────────────────────────────
async function fetchAddonStreams(addon, stremioPath) {
  if (!addon || !addon.url) return [];

  // Remove /manifest.json from the end of the user-provided URL to get the base URL
  const baseUrl = addon.url.replace(/\/manifest\.json$/, "");
  const url = `${baseUrl}/${stremioPath}`;
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

    // Tag each stream with the addon source
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

  let customerData = null;

  // ── 2. Validate token against Firestore ───────────────────────────────
  try {
    console.log(`[Proxy] Checking Firestore for token: "${token}"`);
    const customerRef = doc(db, "customers", token);
    const customerSnap = await getDoc(customerRef);

    console.log(`[Proxy] Document exists? ${customerSnap.exists()}`);
    if (customerSnap.exists()) {
      console.log(`[Proxy] Document data:`, JSON.stringify(customerSnap.data()));
    }

    if (!customerSnap.exists() || customerSnap.data().status !== "active") {
      console.log(`[Proxy] Token invalid or inactive: exists=${customerSnap.exists()}, status=${customerSnap.exists() ? customerSnap.data().status : 'none'}`);
      return res.status(200).json(EMPTY_RESPONSE);
    }

    customerData = customerSnap.data();
    if (customerData.expiresAt) {
      const expMillis =
        typeof customerData.expiresAt.toMillis === "function"
          ? customerData.expiresAt.toMillis()
          : new Date(customerData.expiresAt).getTime();

      if (Date.now() > expMillis) {
        console.log(`[Proxy] Token expired: ${new Date(expMillis).toISOString()}`);
        return res.status(200).json(EMPTY_RESPONSE);
      }
    }
  } catch (error) {
    console.error("[Proxy] Firestore lookup failed:", error);
    return res.status(200).json(EMPTY_RESPONSE);
  }

  // ── 3. Parse addon and stremio path from query params ─────────────────
  const addonKey = req.query.addon || null;
  const prefix = req.query.prefix || "";
  const pSuffix = req.query.p
    ? Array.isArray(req.query.p) ? req.query.p.join("/") : req.query.p
    : "";
  const stremioPath = pSuffix ? `${prefix}/${pSuffix}` : prefix;

  console.log(`[Proxy] Token: ${token} | Addon: ${addonKey || "BUNDLE"} | Path: ${stremioPath}`);

  const globalSettingsSnap = await getDoc(doc(db, "settings", "global"));
  const globalData = globalSettingsSnap.exists() ? globalSettingsSnap.data() : {};
  const userAddons = globalData.addons || [];

  // ── 4A. Single Addon Mode (e.g. /:token/torrentio/manifest.json) ─────
  if (addonKey) {
    // Find matching addon by comparing lowercase alphanumeric name
    const targetAddon = userAddons.find(a => 
        a.name.toLowerCase().replace(/[^a-z0-9]/g, '') === addonKey
    );

    if (!targetAddon || !targetAddon.url) {
      return res.status(404).json({ error: `Addon not configured for this token: ${addonKey}` });
    }

    const baseUrl = targetAddon.url.replace(/\/manifest\.json$/, "");
    const targetUrl = `${baseUrl}/${stremioPath}`;
    console.log(`[Single] Proxying to ${targetAddon.name}: ${targetUrl}`);

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
      console.error(`[Single] ${targetAddon.name} fetch failed:`, error.message);
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

  // For stream requests: fan out to ALL configured addons simultaneously
  if (stremioPath.startsWith("stream/")) {
    console.log(`[Bundle] Fetching streams from ${userAddons.length} addon(s)...`);

    if (userAddons.length === 0) {
      return res.status(200).json({ streams: [] });
    }

    // Fire all addon requests at the same time with Promise.allSettled
    const results = await Promise.allSettled(
      userAddons.map((addon) => fetchAddonStreams(addon, stremioPath))
    );

    // Merge all successful stream arrays into one big list
    const mergedStreams = [];
    results.forEach((result, i) => {
      if (result.status === "fulfilled" && Array.isArray(result.value)) {
        console.log(`[Bundle] ${userAddons[i].name}: got ${result.value.length} streams`);
        mergedStreams.push(...result.value);
      } else {
        console.log(`[Bundle] ${userAddons[i].name}: failed or empty`);
      }
    });

    console.log(`[Bundle] Total merged streams: ${mergedStreams.length}`);

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "public, max-age=120, s-maxage=120");
    return res.status(200).json({ streams: mergedStreams });
  }

  // For any other request type (catalog, meta, etc.) — proxy to first addon
  if (userAddons.length > 0) {
    const fallbackAddon = userAddons[0];
    const baseUrl = fallbackAddon.url.replace(/\/manifest\.json$/, "");
    const targetUrl = `${baseUrl}/${stremioPath}`;
    
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
