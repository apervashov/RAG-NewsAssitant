import { Kafka, Consumer, KafkaMessage } from 'kafkajs';
import { config } from '../config/env';
import { randomUUID } from 'crypto';

export class KafkaService {
  private kafka: Kafka;
  private consumer: Consumer;
  private isConnected: boolean = false;

  constructor() {
    this.kafka = new Kafka({
      clientId: `news-agent-${randomUUID()}`,
      brokers: [config.kafka.broker],
      ssl: true,
      sasl: {
        mechanism: 'plain',
        username: config.kafka.username,
        password: config.kafka.password,
      },
    });

    this.consumer = this.kafka.consumer({
      groupId: `${config.kafka.groupIdPrefix}${randomUUID()}`,
    });
  }

  async connect(): Promise<void> {
    try {
      await this.consumer.connect();
      this.isConnected = true;
      console.log('Connected to Kafka');
    } catch (error) {
      console.error('Failed to connect to Kafka:', error);
      throw error;
    }
  }

  async subscribe(messageHandler: (message: string) => Promise<void>): Promise<void> {
    if (!this.isConnected) {
      await this.connect();
    }

    try {
      await this.consumer.subscribe({
        topic: config.kafka.topicName,
        fromBeginning: true,
      });

      await this.consumer.run({
        eachMessage: async ({ message }: { message: KafkaMessage }) => {
          try {
            if (message.value) {
              const messageValue = message.value.toString();
              await messageHandler(messageValue);
            }
          } catch (error) {
            console.error('Error processing Kafka message:', error);
          }
        },
      });

      console.log(`Subscribed to topic: ${config.kafka.topicName}`);
    } catch (error) {
      console.error('Failed to subscribe to Kafka topic:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.consumer.disconnect();
      this.isConnected = false;
      console.log('Disconnected from Kafka');
    } catch (error) {
      console.error('Failed to disconnect from Kafka:', error);
      throw error;
    }
  }
} 