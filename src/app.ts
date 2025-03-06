import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import path from 'path';
import { config } from './config/env';
import { agentRouter } from './routes/agent.routes';
import { startGraphQLServer } from './graphql/server';


const app = express();


app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(bodyParser.json({limit: '10mb'}));

app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/', agentRouter);

app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message,
  });
});

const useGraphQL = process.env.USE_GRAPHQL === 'true';

if (useGraphQL) {
  console.log('Starting with GraphQL API');
  startGraphQLServer();
} else {
  console.log('Starting with REST API only');
  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  });
  
  const server = app.listen(config.server.port, () => {
    console.log(`REST Server is running on port ${config.server.port}`);
    console.log(`Test page available at http://localhost:${config.server.port}/`);
  });

  server.on('error', (error: any) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`Port ${config.server.port} is already in use. Try to start the server on another port.`);
      const newPort = config.server.port + 1;
      console.log(`Trying to use port ${newPort}...`);
      
      server.close(() => {
        app.listen(newPort, () => {
          console.log(`REST Server successfully started on port ${newPort}`);
          console.log(`Test page available at http://localhost:${newPort}/`);
        });
      });
    } else {
      console.error('Error starting server:', error);
    }
  });
} 