require('dotenv').config();


export const config = {
  kafka: {
    broker: process.env.KAFKA_BROKER || '',
    username: process.env.KAFKA_USERNAME || '',
    password: process.env.KAFKA_PASSWORD || '',
    topicName: process.env.KAFKA_TOPIC_NAME || 'news',
    groupIdPrefix: process.env.KAFKA_GROUP_ID_PREFIX || 'test-task-',
  },
  gemini: {
    apiKey: process.env.GOOGLE_API_KEY || '',
  },
  server: {
    port: parseInt(process.env.PORT || '3000', 10),
  },
}; 