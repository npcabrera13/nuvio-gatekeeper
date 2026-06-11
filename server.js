const express = require('express');
const path = require('path');
const app = express();
const handler = require('./api/proxy.js');

// Stremio resource types (used to detect proxy requests)
const STREMIO_RESOURCES = ['manifest.json', 'stream', 'catalog', 'meta'];

// ── Proxy middleware FIRST (before static files) ────────────────────────────
app.use(async (req, res, next) => {
    if (req.path === '/favicon.ico') return next();
    if (req.path === '/' || req.path === '/configure') return next();

    // Skip obvious static assets
    if (req.path.match(/\.(html|css|js|png|ico|svg|woff2?)$/)) return next();

    const segments = req.path.replace(/^\//, '').split('/');
    if (segments.length === 0 || segments[0] === '') return next();

    // Determine if this is a proxy request by checking if any segment
    // matches a stremio resource
    let token = null;
    let addon = null;
    let stremioSegments = segments;

    // Check: is the first segment NOT a stremio resource? Then it's a token.
    if (!STREMIO_RESOURCES.includes(segments[0])) {
        token = segments[0];
        stremioSegments = segments.slice(1);

        // Check: is the next segment also NOT a stremio resource? Then it's an addon.
        if (stremioSegments.length >= 1 && !STREMIO_RESOURCES.includes(stremioSegments[0])) {
            addon = stremioSegments[0];
            stremioSegments = stremioSegments.slice(1);
        }
    }

    // If we still don't have any stremio segments, this isn't a proxy request
    if (stremioSegments.length === 0 || !STREMIO_RESOURCES.includes(stremioSegments[0])) {
        return next();
    }

    // Build the prefix and p params to mimic vercel.json rewrites
    const prefix = stremioSegments[0]; // e.g. "manifest.json" or "stream"
    const p = stremioSegments.slice(1).join('/'); // e.g. "movie/tt1234.json"

    req.query.token = token || req.query.token;
    req.query.addon = addon;
    req.query.prefix = prefix;
    if (p) req.query.p = p;

    console.log(`[Server] Routing → token=${token} addon=${addon} prefix=${prefix} p=${p}`);

    await handler(req, res);
});

// Serve static files (Admin UI) from root — AFTER proxy middleware
app.use(express.static(__dirname));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`\n✅ Local Dev Server & Admin UI running on http://localhost:${PORT}`);
    console.log(`\nTest URLs:`);
    console.log(`  Bundle:    http://localhost:${PORT}/YOUR_TOKEN/manifest.json`);
    console.log(`  Torrentio: http://localhost:${PORT}/YOUR_TOKEN/torrentio/manifest.json`);
    console.log(`  Stream:    http://localhost:${PORT}/YOUR_TOKEN/stream/movie/tt0111161.json\n`);
});
