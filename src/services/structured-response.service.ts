import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { config } from '../config/env';
import { Document } from '@langchain/core/documents';
import { ArticleSource } from '../models/article';
import { Langfuse } from 'langfuse';

export interface StructuredResponse {
  answer: string;
  sources: ArticleSource[];
  confidence: number;
  topics: string[];
  sentimentScore: number;
  keywords: string[];
}

export class StructuredResponseService {
  private gemini: GoogleGenerativeAI;
  private model!: GenerativeModel;
  private modelName: string = 'gemini-1.5-pro';
  private langfuse: Langfuse;

  constructor() {
    const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || config.gemini.apiKey || '';
    
    if (!apiKey) {
      console.error("No API Key found for Gemini! Please set GEMINI_API_KEY or GOOGLE_API_KEY in .env");
    }
    
    this.gemini = new GoogleGenerativeAI(apiKey);
    try {
      this.model = this.gemini.getGenerativeModel({ model: this.modelName });
      console.log(`Successfully initialized Gemini model for structured responses: ${this.modelName}`);
    } catch (error) {
      console.warn(`Error initializing model ${this.modelName} for structured responses`);
      console.error('Failed to initialize Gemini API:', error);
    }
    
    
    this.langfuse = new Langfuse({
      publicKey: process.env.LANGFUSE_PUBLIC_KEY || '',
      secretKey: process.env.LANGFUSE_SECRET_KEY || ''
    });
  }

  async generateStructuredResponse(query: string, documents: Document[], sources: ArticleSource[]): Promise<StructuredResponse> {
    
    const trace = this.langfuse.trace({
      name: 'structured_response',
      metadata: {
        queryLength: query.length,
        documentsCount: documents.length
      }
    });
    
    try {
      
      const span = trace.span({
        name: 'generate_structured_content',
        metadata: { model: this.modelName }
      });

      
      let context = '';
      if (documents.length > 0) {
        context += 'Контекст из базы знаний:\n\n';
        documents.forEach((doc, index) => {
          context += `Документ ${index + 1}:\nЗаголовок: ${doc.metadata.title}\nURL: ${doc.metadata.url}\nДата: ${doc.metadata.date}\n\n${doc.pageContent}\n\n`;
        });
      }

      const prompt = `
      You are a news analytics agent that answers questions based on the provided context.
      
      User's query: ${query}
      
      ${context}
      
      Please analyze the user's query using the provided context.
      Return the answer in JSON format with the following fields:
      - answer: your detailed answer to the user's question
      - sources: array of sources you used (leave empty if no sources were used)
      - confidence: confidence score from 0.0 to 1.0
      - topics: array of main topics related to the query (up to 5)
      - sentimentScore: sentiment score from -1.0 (negative) to 1.0 (positive)
      - keywords: keywords related to the query and answer (up to 10)
      
      Your answer should be accurate, informative and structured.
      `;

      
      this.langfuse.generation({
        name: 'llm_request',
        input: prompt,
        model: this.modelName
      });

      try {
        const startTime = Date.now();
        const result = await this.model.generateContent(prompt);
        const endTime = Date.now();
        const response = result.response;
        const content = response.text();
        
        
        this.langfuse.generation({
          name: 'llm_response',
          input: prompt,
          output: content,
          model: this.modelName,
          metadata: {
            latencyMs: endTime - startTime
          }
        });
        
        
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        const jsonContent = jsonMatch ? jsonMatch[0] : null;
        
        if (!jsonContent) {
          throw new Error('Empty response from LLM');
        }

        try {
          const parsedResponse = JSON.parse(jsonContent);
          
          
          const structuredResponse: StructuredResponse = {
            answer: parsedResponse.answer || 'Нет ответа',
            sources: sources.slice(0, 5), 
            confidence: parsedResponse.confidence || 0.0,
            topics: parsedResponse.topics || [],
            sentimentScore: parsedResponse.sentimentScore || 0.0,
            keywords: parsedResponse.keywords || []
          };

          
          span.end();
          trace.update({
            metadata: {
              confidence: structuredResponse.confidence,
              topicsCount: structuredResponse.topics.length,
              keywordsCount: structuredResponse.keywords.length
            }
          });

          return structuredResponse;
        } catch (error) {
          console.error('Error parsing LLM response:', error);
          span.end();
          
          return {
            answer: 'Sorry, an error occurred while processing the structured response.',
            sources: [],
            confidence: 0.0,
            topics: [],
            sentimentScore: 0.0,
            keywords: []
          };
        }
      } catch (error) {
        console.error('Error calling Gemini API:', error);
        span.end();
        
        
        if (this.modelName === 'gemini-1.5-pro') {
          console.log('Trying fallback to gemini-1.0-pro for this structured request');
          this.modelName = 'gemini-1.0-pro';
          this.model = this.gemini.getGenerativeModel({ model: this.modelName });
          
          
          return this.generateStructuredResponse(query, documents, sources);
        }
        
        return {
          answer: 'Sorry, an error occurred while accessing the language model. Please try again later.',
          sources: [],
          confidence: 0.0,
          topics: [],
          sentimentScore: 0.0,
          keywords: []
        };
      }
    } catch (error) {
      console.error('Error generating structured response with LLM:', error);
      
      return {
        answer: 'Sorry, an error occurred while generating the structured response.',
        sources: [],
        confidence: 0.0,
        topics: [],
        sentimentScore: 0.0,
        keywords: []
      };
    }
  }
} 