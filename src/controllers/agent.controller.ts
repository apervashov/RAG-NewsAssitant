import { Request, Response } from 'express';
import { DataProcessorService } from '../services/data-processor.service';
import { LLMService } from '../services/llm.service';
import { StructuredResponseService, StructuredResponse } from '../services/structured-response.service'; 
import { StreamingService } from '../services/streaming.service';
import { Langfuse } from 'langfuse';
import { config } from '../config/env';

interface AgentResponse {
  answer: string;
  sources: Array<{
    title: string;
    url: string;
    date?: string;
  }>;
}

export class AgentController {
  private dataProcessor: DataProcessorService;
  private llmService: LLMService;
  private structuredResponseService: StructuredResponseService;
  private streamingService: StreamingService;
  private langfuse: Langfuse;

  constructor() {
    this.dataProcessor = new DataProcessorService();
    this.llmService = new LLMService();
    this.structuredResponseService = new StructuredResponseService();
    this.streamingService = new StreamingService();
    
    
    this.langfuse = new Langfuse({
      publicKey: process.env.LANGFUSE_PUBLIC_KEY || '',
      secretKey: process.env.LANGFUSE_SECRET_KEY || ''
    });
  }

  async initialize(): Promise<void> {
    await this.dataProcessor.initialize();
  }

  
  async processQuery(req: Request, res: Response): Promise<void> {
    const trace = this.langfuse.trace({
      name: 'process_query',
      metadata: { source: 'rest_api' }
    });
    
    try {
      const { query } = req.body;

      if (!query || typeof query !== 'string') {
        res.status(400).json({
          error: 'Invalid request. Query parameter is required and must be a string.',
        });
        return;
      }

      
      const vectorDB = await this.dataProcessor.getVectorDB();
      
      
      const { documents, sources } = await vectorDB.similaritySearch(query, 3);
      
      
      trace.update({
        metadata: { 
          queryLength: query.length,
          documentsFound: documents.length
        }
      });
      
      
      const response = await this.llmService.generateResponse(query, documents, sources);
      
      trace.update({
        metadata: { 
          answerLength: response.answer.length,
          sourcesCount: response.sources.length
        }
      });
      
      res.status(200).json(response);
    } catch (error) {
      console.error('Error processing query:', error);
      trace.update({
        metadata: { 
          error: error instanceof Error ? error.message : 'Unknown error',
        }
      });
      
      res.status(500).json({
        error: 'An error occurred while processing your query.',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  
  async streamQueryResponse(req: Request, res: Response): Promise<void> {
    console.log('Stream query request received');
    
    try {
      const { query } = req.body;

      if (!query || typeof query !== 'string') {
        res.status(400).json({
          error: 'Invalid request. Query parameter is required and must be a string.',
        });
        return;
      }

      console.log(`Processing stream request for query: ${query.substring(0, 30)}...`);

      
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Transfer-Encoding', 'chunked');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('X-Accel-Buffering', 'no'); 
      
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'POST');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      
      
      res.write('Started processing the request...\n\n');
      
      
      await new Promise(resolve => setTimeout(resolve, 500));
      
      
      let documentsContent = '';
      let documentsList = [];
      
      try {
        console.log('Getting vector DB');
        
        const vectorDB = await this.dataProcessor.getVectorDB();
        
        console.log('Searching for similar documents');
        
        const { documents, sources } = await vectorDB.similaritySearch(query, 3);
        
        console.log(`Found ${documents.length} relevant documents`);
        res.write(`Found ${documents.length} relevant documents\n\n`);
        
        
        documentsList = documents;
        
        
        if (documents.length > 0) {
          res.write("Titles of found documents:\n");
          for (let i = 0; i < documents.length; i++) {
            const doc = documents[i];
            res.write(`${i+1}. ${doc.metadata.title || 'Without title'}\n`);
            
            
            documentsContent += `--- Документ ${i+1} ---\n`;
            if (doc.metadata.title) documentsContent += `Заголовок: ${doc.metadata.title}\n`;
            if (doc.metadata.url) documentsContent += `URL: ${doc.metadata.url}\n`;
            if (doc.metadata.date) documentsContent += `Дата: ${doc.metadata.date}\n`;
            documentsContent += `\n${doc.pageContent}\n\n`;
          }
          res.write('\n');
        }
      } catch (dbError) {
        console.error('Error working with vector DB:', dbError);
        res.write(`Error working with vector DB: ${dbError instanceof Error ? dbError.message : 'unknown error'}\n\n`);
      }
      
      
      try {
        
        const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || config.gemini.apiKey || '';
        if (!apiKey) {
          res.write('API key not found. Check the .env file settings.\n');
        } else {
          res.write(`Generating answer based on found information...\n\n`);
          
          
          const gemini = new (await import('@google/generative-ai')).GoogleGenerativeAI(apiKey);
          const model = gemini.getGenerativeModel({ model: 'gemini-1.5-flash' });
          
          
          let prompt = '';
          
          if (documentsContent) {
            prompt = `
            You are a news analyst agent that answers user questions based on the provided context from the knowledge base.
            
            User's question: ${query}
            
            Here is the information from the knowledge base that you MUST use to answer the question:
            
            ${documentsContent}
            
            Answer the user's question based ONLY on the information from the provided context from the knowledge base.
            If there is not enough information in the context to provide a complete answer, indicate it explicitly.
            Do not use your general knowledge, except in cases where it is necessary to understand the context.
            Your answer should be informative and well-structured.
            `;
          } else {
            
            prompt = `
            You are a news analyst agent that answers user questions.
            
            User's question: ${query}
            
            No relevant information was found in the knowledge base for this query.
            Please inform the user that no information was found for the query and provide a brief general answer,
            and give a brief general answer to the question, noting that this is general information, not from the knowledge base.
            `;
          }
          
          res.write('Generating answer based on data from the knowledge base...\n\n');
          
          
          const result = await model.generateContent(prompt);
          const text = result.response.text();
          
          res.write('ANSWER:\n\n');
          res.write(text);
          res.write('\n\n--- End of answer ---\n');
        }
      } catch (genError) {
        console.error('Error generating content:', genError);
        res.write(`Error generating content: ${genError instanceof Error ? genError.message : 'unknown error'}\n\n`);
      }
      
      
      res.write('\n\nQuery processing completed');
      res.end();
    } catch (error) {
      console.error('Error in stream processing:', error);
      
      try {
        res.write('An error occurred while processing the stream request.');
        res.end();
      } catch (e) {
        console.error('Error sending error response:', e);
      }
    }
  }

  
  async processCsvFile(req: Request, res: Response): Promise<void> {
    try {
      const filePath = req.body.filePath || 'articles_dataset.csv';
      
      
      this.dataProcessor.processCsvFile(filePath)
        .then(() => console.log('CSV processing completed'))
        .catch((error) => console.error('Error processing CSV file:', error));
      
      res.status(202).json({
        message: 'CSV processing started in the background',
      });
    } catch (error) {
      console.error('Error starting CSV processing:', error);
      res.status(500).json({
        error: 'An error occurred while starting CSV processing.',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  
  async startKafkaConsumer(req: Request, res: Response): Promise<void> {
    try {
      
      this.dataProcessor.startKafkaConsumer()
        .then(() => console.log('Kafka consumer started'))
        .catch((error) => console.error('Error starting Kafka consumer:', error));
      
      res.status(202).json({
        message: 'Kafka consumer started in the background',
      });
    } catch (error) {
      console.error('Error starting Kafka consumer:', error);
      res.status(500).json({
        error: 'An error occurred while starting Kafka consumer.',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  
  
  async generateResponse(query: string): Promise<AgentResponse> {
    const trace = this.langfuse.trace({
      name: 'generate_response',
      metadata: { source: 'graphql' }
    });
    
    try {
      
      const vectorDB = await this.dataProcessor.getVectorDB();
      
      
      const { documents, sources } = await vectorDB.similaritySearch(query, 3);
      
      
      const response = await this.llmService.generateResponse(query, documents, sources);
      
      return response;
    } catch (error) {
      console.error('Error generating response:', error);
      trace.update({
        metadata: { 
          error: error instanceof Error ? error.message : 'Unknown error',
        }
      });
      
      return {
        answer: 'Произошла ошибка при генерации ответа.',
        sources: []
      };
    }
  }
  
  async generateStructuredResponse(query: string): Promise<StructuredResponse> {
    const trace = this.langfuse.trace({
      name: 'generate_structured_response',
      metadata: { source: 'graphql' }
    });
    
    try {
      
      const vectorDB = await this.dataProcessor.getVectorDB();
      
      
      const { documents, sources } = await vectorDB.similaritySearch(query, 3);
      
      
      const response = await this.structuredResponseService.generateStructuredResponse(query, documents, sources);
      
      return response;
    } catch (error) {
      console.error('Error generating structured response:', error);
      trace.update({
        metadata: { 
          error: error instanceof Error ? error.message : 'Unknown error',
        }
      });
      
      return {
        answer: 'Произошла ошибка при генерации структурированного ответа.',
        sources: [],
        confidence: 0.0,
        topics: [],
        sentimentScore: 0.0,
        keywords: []
      };
    }
  }
  
  async processCsvFileInternal(filePath: string) {
    try {
      await this.dataProcessor.processCsvFile(filePath);
      return { success: true, count: 1 }; 
    } catch (error) {
      console.error('Error processing CSV file:', error);
      throw error;
    }
  }
  
  async startKafkaConsumerInternal() {
    try {
      await this.dataProcessor.startKafkaConsumer();
    } catch (error) {
      console.error('Error starting Kafka consumer:', error);
      throw error;
    }
  }
}

// Создаем экземпляр контроллера
const agentControllerInstance = new AgentController();

// Инициализируем контроллер
agentControllerInstance.initialize()
  .then(() => console.log('Agent controller initialized'))
  .catch((error) => console.error('Error initializing agent controller:', error));

// Экспортируем функции-обработчики для маршрутов Express
export const agentController = (req: Request, res: Response) => {
  return agentControllerInstance.processQuery(req, res);
};

export const streamAgentController = (req: Request, res: Response) => {
  return agentControllerInstance.streamQueryResponse(req, res);
};