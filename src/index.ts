import express from 'express';
import path from 'path';
import { agentController, streamAgentController } from './controllers/agent.controller';

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.post('/agent', agentController);
app.post('/agent/stream', streamAgentController);

// Start server if not in Vercel environment
if (process.env.NODE_ENV !== 'production') {
  app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });
}

// Export the Express app for Vercel
export default app; 