// Reexport the built version of the Express app
const app = require('../dist/index').default;

module.exports = (req, res) => {
  // Emulating Express behavior in Vercel serverless environment
  app(req, res);
}; 