import { createYoga } from 'graphql-yoga';
import { schema } from './schema';
import { createServer } from 'http';
import express from 'express';
import { config } from '../config/env';

// Создаем экземпляр Express
const app = express();

// Создаем Yoga сервер
export const createYogaServer = () => {
  const yoga = createYoga({
    schema,
    graphiql: {
      defaultQuery:`
        query Health {
          health
        }
      `,
    },
  });

  app.use('/graphql', yoga);

  const server = createServer(app);

  return { server, app };
};

export const startGraphQLServer = () => {
  const { server } = createYogaServer();
  

  server.listen(config.server.port, () => {
    console.log(`GraphQL Server is running at http://localhost:${config.server.port}/graphql`);
  });
  
  return server;
}; 