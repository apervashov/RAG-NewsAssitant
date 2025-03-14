const { streamAgentController } = require('../dist/controllers/agent.controller');

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Process the request
  try {
    return await streamAgentController(req, res);
  } catch (error) {
    console.error('Error in stream controller:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal Server Error', message: error.message });
    } else {
      res.end('\nError in stream processing');
    }
  }
}; 