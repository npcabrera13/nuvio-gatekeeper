const { initializeApp } = require("firebase/app");
const { getFirestore, doc, setDoc, getDoc } = require("firebase/firestore");

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

function getAddonSlug(addonName) {
  return addonName.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

async function fetchAddonManifest(addon) {
  const baseUrl = addon.url.replace(/\/manifest\.json$/, "");
  const url = `${baseUrl}/manifest.json`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, { method: "GET", signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.error(`[Sync] Failed to fetch ${addon.name} manifest: ${e.message}`);
    return null;
  }
}

module.exports = async function handler(req, res) {
  setCorsHeaders(res);
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    // 1. Fetch Global Data to get current addons
    const globalSettingsSnap = await getDoc(doc(db, "settings", "global"));
    const globalData = globalSettingsSnap.exists() ? globalSettingsSnap.data() : {};
    const userAddons = globalData.addons || [];

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
    const addonCapabilities = {};

    userAddons.forEach((addon, i) => {
      const result = results[i];
      const slug = getAddonSlug(addon.name);
      addonCapabilities[slug] = { resources: [] };

      if (result.status === "fulfilled" && result.value) {
        const manifest = result.value;

        // Populate capabilities for routing
        if (Array.isArray(manifest.resources)) {
           manifest.resources.forEach(r => {
               const rName = typeof r === "string" ? r : r.name;
               if (rName) addonCapabilities[slug].resources.push(rName);
           });
        } else {
           // If an addon doesn't explicitly declare resources, assume it might support all standard ones.
           addonCapabilities[slug].resources = ["stream", "meta", "catalog", "subtitles"];
        }

        // Merge Catalogs
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
              existing.matchAll = true;
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

    // Save to Firestore
    await setDoc(doc(db, "settings", "global"), {
      ...globalData,
      bundleManifest: bundle,
      addonCapabilities: addonCapabilities
    });

    return res.status(200).json({ success: true, bundle, addonCapabilities });
  } catch (error) {
    console.error("Sync error:", error);
    return res.status(500).json({ error: error.message });
  }
};
