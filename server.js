const express = require('express');
const path = require('path');
const app = express();
const handler = require('./api/[...path].js');

// Serve static files (Admin UI) from root
app.use(express.static(__dirname));

// Intercept Stremio paths
const stremioPaths = ['/manifest.json', '/catalog', '/stream', '/meta'];

app.use(async (req, res, next) => {
    // Exclude favicon
    if (req.path === '/favicon.ico') return res.status(404).end();

    const isStremio = stremioPaths.some(p => req.path.startsWith(p));
    if (isStremio) {
        // Extract the path segments minus the leading slash
        const pathString = req.path.replace(/^\//, '');
        req.query.path = pathString ? pathString.split('/') : [];
        
        await handler(req, res);
    } else {
        next();
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`\n✅ Local Dev Server & Admin UI running on http://localhost:${PORT}`);
    console.log(`Proxy Test URL: http://localhost:${PORT}/manifest.json?token=YOUR_TEST_TOKEN\n`);
});
