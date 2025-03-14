// Специальный файл для обработки запросов к корню
const express = require('express');
const path = require('path');
const { agentController, streamAgentController } = require('./dist/controllers/agent.controller');

const app = express();

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API routes
app.post('/api/agent', agentController);
app.post('/api/stream', streamAgentController);

// Serve index.html for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server for local development
if (process.env.NODE_ENV !== 'production') {
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });
}

// Export for Vercel
module.exports = app; 