import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { Document } from '@langchain/core/documents';
import { config } from '../config/env';
import { Article, ArticleSource } from '../models/article';
import { PineconeStore } from '@langchain/pinecone';
import { Pinecone } from '@pinecone-database/pinecone';
import { logApiKey } from '../utils/logger';

export class VectorDBService {
  private vectorStore: PineconeStore | null = null;
  private embeddings: GoogleGenerativeAIEmbeddings;
  private pinecone: Pinecone;
  private isInitialized: boolean = false;
  private readonly indexName: string;

  constructor() {
    logApiKey("Using Google API Key from config", config.gemini.apiKey);
    
    this.embeddings = new GoogleGenerativeAIEmbeddings({
      apiKey: config.gemini.apiKey,
      modelName: 'embedding-001',
    });
    
    // Инициализация Pinecone
    this.pinecone = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY!,
    });
    
    this.indexName = process.env.PINECONE_INDEX || 'gemini-vectorstore';
  }

  async initialize(): Promise<void> {
    try {
      console.log('Initializing Pinecone vector store...');
      const pineconeIndex = this.pinecone.Index(this.indexName);
      
      // Создаем хранилище на основе существующего индекса
      this.vectorStore = await PineconeStore.fromExistingIndex(
        this.embeddings,
        { pineconeIndex }
      );
      
      this.isInitialized = true;
      console.log('Pinecone vector store initialized successfully');
    } catch (error) {
      console.error('Error initializing Pinecone vector store:', error);
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
      console.log(`Article added to Pinecone: ${article.title}`);
    } catch (error) {
      console.error('Error adding article to Pinecone:', error);
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

  // Метод теперь используется только для совместимости
  private async saveVectorStore(): Promise<void> {
    // В Pinecone данные сохраняются автоматически
    console.log('Data saved to Pinecone');
  }
} 