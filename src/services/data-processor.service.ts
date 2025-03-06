import { KafkaService } from './kafka.service';
import { CsvService } from './csv.service';
import { ContentExtractorService } from './content-extractor.service';
import { VectorDBService } from './vector-db.service';
import { Article } from '../models/article';

export class DataProcessorService {
  private kafkaService: KafkaService;
  private csvService: CsvService;
  private contentExtractor: ContentExtractorService;
  private vectorDB: VectorDBService;
  private isProcessing: boolean = false;
  private processedUrls: Set<string> = new Set();

  constructor() {
    this.kafkaService = new KafkaService();
    this.csvService = new CsvService();
    this.contentExtractor = new ContentExtractorService();
    this.vectorDB = new VectorDBService();
  }

  async initialize(): Promise<void> {
    try {
      await this.vectorDB.initialize();
      console.log('Data processor initialized successfully');
    } catch (error) {
      console.error('Error initializing data processor:', error);
      throw error;
    }
  }

  async startKafkaConsumer(): Promise<void> {
    try {
      await this.kafkaService.subscribe(async (message: string) => {
        try {
          
          const url = message.trim();
          if (url && url.startsWith('http') && !this.processedUrls.has(url)) {
            await this.processUrl(url);
          }
        } catch (error) {
          console.error('Error processing Kafka message:', error);
        }
      });
    } catch (error) {
      console.error('Error starting Kafka consumer:', error);
      throw error;
    }
  }

  async processCsvFile(filePath: string): Promise<void> {
    if (this.isProcessing) {
      console.log('Already processing data. Please wait...');
      return;
    }

    this.isProcessing = true;

    try {
      const urls = await this.csvService.readArticleUrls(filePath);
      console.log(`Found ${urls.length} URLs in CSV file`);

      for (const url of urls) {
        if (!this.processedUrls.has(url)) {
          await this.processUrl(url);
        }
      }

      console.log('CSV processing completed');
    } catch (error) {
      console.error('Error processing CSV file:', error);
      throw error;
    } finally {
      this.isProcessing = false;
    }
  }

  private async processUrl(url: string): Promise<void> {
    try {
      console.log(`Processing URL: ${url}`);
      
      
      const article: Article = await this.contentExtractor.extractContent(url);
      
      
      await this.vectorDB.addArticle(article);
      
      
      this.processedUrls.add(url);
      
      console.log(`Successfully processed URL: ${url}`);
    } catch (error) {
      console.error(`Error processing URL ${url}:`, error);
    }
  }

  async getVectorDB(): Promise<VectorDBService> {
    return this.vectorDB;
  }
} 