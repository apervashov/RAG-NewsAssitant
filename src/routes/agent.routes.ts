import { Router } from 'express';
import { AgentController } from '../controllers/agent.controller';

export const agentRouter = Router();
const agentController = new AgentController();


agentController.initialize()
  .then(() => console.log('Agent controller initialized'))
  .catch((error) => console.error('Error initializing agent controller:', error));


agentRouter.get('/test', (req, res) => {
  res.json({
    status: 'ok',
    message: 'API is operational',
    timestamp: new Date().toISOString()
  });
});


agentRouter.post('/agent', (req, res) => agentController.processQuery(req, res));


agentRouter.post('/agent/stream', (req, res) => agentController.streamQueryResponse(req, res));


agentRouter.post('/process-csv', (req, res) => agentController.processCsvFile(req, res));


agentRouter.post('/start-kafka', (req, res) => agentController.startKafkaConsumer(req, res)); 