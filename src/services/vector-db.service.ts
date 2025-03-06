import { HNSWLib } from '@langchain/community/vectorstores/hnswlib';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { Document } from '@langchain/core/documents';
import { config } from '../config/env';
import { Article, ArticleSource } from '../models/article';
import fs from 'fs';
import path from 'path';
import { logApiKey } from '../utils/logger';

export class VectorDBService {
  private vectorStore: HNSWLib | null = null;
  private embeddings: GoogleGenerativeAIEmbeddings;
  private readonly dbDirectory: string;
  private isInitialized: boolean = false;

  constructor() {
    
    logApiKey("Using Google API Key from config", config.gemini.apiKey);
    logApiKey("Environment GOOGLE_API_KEY", process.env.GOOGLE_API_KEY);
    
    this.embeddings = new GoogleGenerativeAIEmbeddings({
      apiKey: config.gemini.apiKey,
      modelName: 'embedding-001',
    });
    this.dbDirectory = path.join(process.cwd(), 'vector_db');
  }

  async initialize(): Promise<void> {
    try {
      if (fs.existsSync(this.dbDirectory)) {
        console.log('Loading existing vector database...');
        try {
          this.vectorStore = await HNSWLib.load(this.dbDirectory, this.embeddings);
          console.log('Vector database loaded successfully');
          this.isInitialized = true;
        } catch (error) {
          console.error('Error loading vector database:', error);
          console.log('Creating new vector database due to loading error...');
          
          const initialDocument = new Document({
            pageContent: 'Initial document for vector db initialization',
            metadata: {
              title: 'Initialization Document',
              url: 'https:
              date: new Date().toISOString().split('T')[0],
            },
          });
          
          this.vectorStore = await HNSWLib.fromDocuments([initialDocument], this.embeddings);
          this.isInitialized = true;
          await this.saveVectorStore();
        }
      } else {
        console.log('Creating new vector database...');
        
        const initialDocument = new Document({
          pageContent: 'Initial document for vector db initialization',
          metadata: {
            title: 'Initialization Document',
            url: 'https:
            date: new Date().toISOString().split('T')[0],
          },
        });
        
        this.vectorStore = await HNSWLib.fromDocuments([initialDocument], this.embeddings);
        this.isInitialized = true;
        await this.saveVectorStore();
        console.log('New vector database created successfully');
      }
    } catch (error) {
      console.error('Error initializing vector database:', error);
      throw error;
    }
  }

  async addArticle(article: Article): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      const document = new Document({
        pageContent: `${article.title}\n\n${article.content}`,
        metadata: {
          title: article.title,
          url: article.url,
          date: article.date,
        },
      });

      await this.vectorStore!.addDocuments([document]);
      await this.saveVectorStore();
      console.log(`Article added to vector database: ${article.title}`);
    } catch (error) {
      console.error('Error adding article to vector database:', error);
      throw error;
    }
  }

  async similaritySearch(query: string, k: number = 3): Promise<{ documents: Document[], sources: ArticleSource[] }> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      const documents = await this.vectorStore!.similaritySearch(query, k);
      
      const sources: ArticleSource[] = documents.map((doc) => ({
        title: doc.metadata.title,
        url: doc.metadata.url,
        date: doc.metadata.date,
      }));

      return { documents, sources };
    } catch (error) {
      console.error('Error performing similarity search:', error);
      throw error;
    }
  }

  private async saveVectorStore(): Promise<void> {
    try {
      if (!this.vectorStore) {
        throw new Error('Vector store is not initialized');
      }
      
      if (!fs.existsSync(this.dbDirectory)) {
        fs.mkdirSync(this.dbDirectory, { recursive: true });
      }
      
      await this.vectorStore.save(this.dbDirectory);
      console.log('Vector database saved successfully');
    } catch (error) {
      console.error('Error saving vector database:', error);
      throw error;
    }
  }
} 