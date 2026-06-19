const proxy = require('./proxy.js');

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Content-Type", "application/json");
  
  if (req.method === "OPTIONS") return res.status(200).end();
  
  // Return name and resources for security/privacy (hide the encrypted/raw URLs)
  const safeAddons = proxy.ALL_ADDONS.map(a => ({
    name: a.name,
    resources: a.resources
  }));
  
  return res.status(200).json({ addons: safeAddons });
};
