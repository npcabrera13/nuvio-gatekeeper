// Nuvio Stream API — Secure Reverse-Proxy Gatekeeper
// Catch-all serverless function for Vercel

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

// ─── Target Torrentio Base URL ──────────────────────────────────────────────
const TORRENTIO_BASE =
  "https://torrentio.strem.fun/qualityfilter=hdrall,4k,brremux,dolbyvision,dolbyvisionwithhdr";

// ─── Empty Stremio-Protocol Response ────────────────────────────────────────
// Returns a valid Stremio JSON structure with empty arrays so cached Nuvio
// clients render a clean empty list instead of an error screen.
const EMPTY_RESPONSE = {
  streams: [],
  metas: [],
  catalogs: [],
};

// ─── CORS Helper ────────────────────────────────────────────────────────────
function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

// ─── Main Handler ───────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  // Always set CORS headers on every response
  setCorsHeaders(res);

  // Handle preflight requests immediately
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // ── 1. Extract the token from the query string ────────────────────────
  const { token } = req.query;

  if (!token) {
    // No token provided → return empty Stremio response
    return res.status(200).json(EMPTY_RESPONSE);
  }

  // ── 2. Validate token against Firestore ───────────────────────────────
  try {
    const customerRef = doc(db, "customers", token);
    const customerSnap = await getDoc(customerRef);

    if (!customerSnap.exists() || customerSnap.data().status !== "active") {
      // Token not found or status is not "active" → empty response
      return res.status(200).json(EMPTY_RESPONSE);
    }

    // Check expiration
    const data = customerSnap.data();
    if (data.expiresAt) {
      // expiresAt is a Firestore Timestamp (or Date if sent from admin.js incorrectly, but we used Date in setDoc which Firebase converts to Timestamp or string)
      // Actually, admin.js used setDoc with a native JS Date object. Firebase SDK converts it to Timestamp.
      // However, we are using the Server SDK (firebase/firestore lite or modular) which also converts.
      // Wait, in api/[...path].js we use getDoc. If it's a Timestamp, it has .toMillis(). 
      const expMillis = typeof data.expiresAt.toMillis === 'function' 
        ? data.expiresAt.toMillis() 
        : new Date(data.expiresAt).getTime();
        
      if (Date.now() > expMillis) {
        // Token has expired → empty response
        return res.status(200).json(EMPTY_RESPONSE);
      }
    }
  } catch (error) {
    // Firestore error → fail gracefully with empty response
    console.error("Firestore lookup failed:", error.message);
    return res.status(200).json(EMPTY_RESPONSE);
  }

  // ── 3. Build the upstream Torrentio URL ───────────────────────────────
  // req.query.path is an array of path segments captured by [...path].js
  // e.g. ["stream", "movie", "tt1234567.json"]
  let upstreamPath = "";
  if (req.query.path) {
    upstreamPath = Array.isArray(req.query.path)
      ? req.query.path.join("/")
      : req.query.path;
  } else {
    // Fallback: parse the path from the request URL (needed for Vercel rewrites)
    const url = require("url");
    const parsedPath = url.parse(req.url).pathname || "";
    upstreamPath = parsedPath
      .replace(/^\/api/, "")       // Remove leading /api if present
      .replace(/^\/+|\/+$/g, ""); // Remove leading/trailing slashes
  }

  const targetUrl = `${TORRENTIO_BASE}/${upstreamPath}`;
  console.log(`[Proxy Request] Path: ${upstreamPath} | Token: ${token} | Target: ${targetUrl}`);

  // ── 4. Fetch from Torrentio and proxy the response ────────────────────
  try {
    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers: {
        "User-Agent": "NuvioStreamAPI/1.0",
        Accept: "application/json",
      },
    });

    console.log(`[Proxy Response] Target: ${targetUrl} | Status: ${upstream.status}`);

    const contentType = upstream.headers.get("content-type");
    const body = await upstream.text();

    // Forward the content-type from Torrentio
    if (contentType) {
      res.setHeader("Content-Type", contentType);
    }

    // Cache the proxied response for 2 minutes to reduce upstream load
    res.setHeader("Cache-Control", "public, max-age=120, s-maxage=120");

    return res.status(upstream.status).send(body);
  } catch (error) {
    // Upstream fetch failed → return empty Stremio response
    console.error("Upstream fetch failed:", error.message);
    return res.status(200).json(EMPTY_RESPONSE);
  }
};
