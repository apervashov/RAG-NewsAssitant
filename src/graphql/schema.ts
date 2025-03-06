import { createSchema } from 'graphql-yoga';
import { AgentController } from '../controllers/agent.controller';

const agentController = new AgentController();


agentController.initialize()
  .then(() => console.log('Agent controller initialized for GraphQL'))
  .catch((error) => console.error('Error initializing agent controller for GraphQL:', error));

export const schema = createSchema({
  typeDefs: `
    type ArticleSource {
      title: String!
      url: String!
      date: String
    }

    type AgentResponse {
      answer: String!
      sources: [ArticleSource!]!
    }

    type StructuredResponse {
      answer: String!
      sources: [ArticleSource!]!
      confidence: Float
      topics: [String!]
      sentimentScore: Float
      keywords: [String!]
    }

    type ProcessCsvResponse {
      success: Boolean!
      message: String!
      processedCount: Int
    }

    type KafkaResponse {
      success: Boolean!
      message: String!
    }

    type Query {
      health: String!
    }

    type Mutation {
      processQuery(query: String!): AgentResponse!
      processQueryStructured(query: String!): StructuredResponse!
      processCsvFile(filePath: String!): ProcessCsvResponse!
      startKafkaConsumer: KafkaResponse!
    }

    type Subscription {
      streamResponse(query: String!): String!
    }
  `,
  resolvers: {
    Query: {
      health: () => 'GraphQL API is operational',
    },
    Mutation: {
      processQuery: async (_, { query }) => {
        try {
          const response = await agentController.generateResponse(query);
          return response;
        } catch (error) {
          console.error('Error in GraphQL processQuery resolver:', error);
          return {
            answer: 'Произошла ошибка при обработке запроса.',
            sources: []
          };
        }
      },
      processQueryStructured: async (_, { query }) => {
        try {
          const response = await agentController.generateStructuredResponse(query);
          return response;
        } catch (error) {
          console.error('Error in GraphQL processQueryStructured resolver:', error);
          return {
            answer: 'Произошла ошибка при обработке структурированного запроса.',
            sources: [],
            confidence: 0,
            topics: [],
            sentimentScore: 0,
            keywords: []
          };
        }
      },
      processCsvFile: async (_, { filePath }) => {
        try {
          const result = await agentController.processCsvFileInternal(filePath);
          return {
            success: true,
            message: 'CSV файл успешно обработан',
            processedCount: result.count
          };
        } catch (error: any) {
          console.error('Error processing CSV file:', error);
          return {
            success: false,
            message: `Ошибка при обработке CSV файла: ${error.message || 'Неизвестная ошибка'}`,
            processedCount: 0
          };
        }
      },
      startKafkaConsumer: async () => {
        try {
          await agentController.startKafkaConsumerInternal();
          return {
            success: true,
            message: 'Kafka консьюмер успешно запущен'
          };
        } catch (error: any) {
          console.error('Error starting Kafka consumer:', error);
          return {
            success: false,
            message: `Ошибка при запуске Kafka консьюмера: ${error.message || 'Неизвестная ошибка'}`
          };
        }
      }
    },
    Subscription: {
      streamResponse: {
        subscribe: async function* (_, { query }) {
          try {
            const chunkSize = 10;
            const response = await agentController.generateResponse(query);
            const answer = response.answer;
            
            
            for (let i = 0; i < answer.length; i += chunkSize) {
              const chunk = answer.substring(i, i + chunkSize);
              yield chunk;
              
              await new Promise(resolve => setTimeout(resolve, 50));
            }
          } catch (error) {
            console.error('Error in subscription stream:', error);
            yield 'Ошибка при потоковой генерации ответа.';
          }
        }
      }
    }
  }
}); 