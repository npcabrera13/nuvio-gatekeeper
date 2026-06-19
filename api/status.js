const proxy = require('./proxy.js');

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Content-Type", "application/json");
  
  if (req.method === "OPTIONS") return res.status(200).end();
  
  // Return name, url, and resources
  const safeAddons = proxy.ALL_ADDONS.map(a => ({
    name: a.name,
    url: a.url,
    resources: a.resources
  }));
  
  return res.status(200).json({ addons: safeAddons });
};
