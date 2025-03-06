import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { config } from '../config/env';
import { Document } from '@langchain/core/documents';
import { ArticleSource } from '../models/article';
import { ContentExtractorService } from './content-extractor.service';

interface AgentResponse {
  answer: string;
  sources: ArticleSource[];
}

export class LLMService {
  private gemini: GoogleGenerativeAI;
  private model!: GenerativeModel;
  private contentExtractor: ContentExtractorService;
  private modelName: string = 'gemini-1.5-flash';

  constructor() {
    const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || config.gemini.apiKey || '';
    
    if (!apiKey) {
      console.error("No API Key found for Gemini! Please set GEMINI_API_KEY or GOOGLE_API_KEY in .env");
    }
    
    this.gemini = new GoogleGenerativeAI(apiKey);
    try {
      this.model = this.gemini.getGenerativeModel({ model: this.modelName });
      console.log(`Successfully initialized Gemini model: ${this.modelName}`);
    } catch (error) {
      console.warn(`Error initializing model ${this.modelName}, trying fallback...`);
      console.error('Failed to initialize Gemini API:', error);
    }
    
    this.contentExtractor = new ContentExtractorService();
  }

  async generateResponse(query: string, documents: Document[], sources: ArticleSource[]): Promise<AgentResponse> {
    try {
      
      const urlRegex = /(https?:\/\/[^\s]+)/g;
      const urls = query.match(urlRegex);

      let context = '';
      let usedSources = [...sources];

      
      if (urls && urls.length > 0) {
        try {
          const article = await this.contentExtractor.extractContent(urls[0]);
          context = `Информация из URL: ${urls[0]}\n\nЗаголовок: ${article.title}\n\nКонтент: ${article.content}\n\n`;
          
          
          usedSources = [
            {
              title: article.title,
              url: article.url,
              date: article.date,
            },
            ...sources,
          ];
        } catch (error) {
          console.error('Error extracting content from URL in query:', error);
          context = 'Не удалось извлечь информацию из URL в запросе. ';
        }
      }

      
      if (documents.length > 0) {
        context += 'Контекст из базы знаний:\n\n';
        documents.forEach((doc, index) => {
          context += `Документ ${index + 1}:\nЗаголовок: ${doc.metadata.title}\nURL: ${doc.metadata.url}\nДата: ${doc.metadata.date}\n\n${doc.pageContent}\n\n`;
        });
      }

      const prompt = `
      Ты - новостной аналитический агент, который отвечает на вопросы пользователей, основываясь СТРОГО на предоставленном контексте.
      
      Запрос пользователя: ${query}
      
      ${context ? `Вот информация, которую ты ДОЛЖЕН использовать для ответа:\n\n${context}` : 'В базе знаний не найдено релевантной информации по этому запросу.'}
      
      ${context ? `Ответь на запрос пользователя, основываясь ТОЛЬКО на информации из предоставленного контекста.
      Если в контексте недостаточно информации для полного ответа, укажи это явно.
      Не используй свои общие знания, кроме случаев, когда это необходимо для понимания контекста.` 
      : `Пожалуйста, сообщи пользователю, что информации по запросу не найдено в базе знаний,
      и дай краткий общий ответ на вопрос, отметив, что это общая информация, а не из базы знаний.`}
      
      Верни ответ в формате JSON со следующими полями:
      - answer: твой ответ на запрос пользователя
      - sources: массив источников, которые ты использовал (пустой массив, если не использовал никаких источников)
      `;

      try {
        const result = await this.model.generateContent(prompt);
        const response = result.response;
        const content = response.text();
        
        
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        const jsonContent = jsonMatch ? jsonMatch[0] : null;
        
        if (!jsonContent) {
          throw new Error('Empty response from LLM');
        }

        try {
          const parsedResponse = JSON.parse(jsonContent);
          return {
            answer: parsedResponse.answer,
            sources: usedSources.slice(0, 5), 
          };
        } catch (error) {
          console.error('Error parsing LLM response:', error);
          return {
            answer: 'Извините, произошла ошибка при обработке ответа.',
            sources: [],
          };
        }
      } catch (error) {
        console.error('Error calling Gemini API:', error);
        
        
        if (this.modelName === 'gemini-1.5-pro') {
          console.log('Trying fallback to gemini-1.0-pro for this request');
          this.modelName = 'gemini-1.0-pro';
          this.model = this.gemini.getGenerativeModel({ model: this.modelName });
          
          
          return this.generateResponse(query, documents, sources);
        }
        
        return {
          answer: 'Извините, произошла ошибка при обращении к языковой модели. Пожалуйста, попробуйте позже.',
          sources: [],
        };
      }
    } catch (error) {
      console.error('Error generating response with LLM:', error);
      return {
        answer: 'Извините, произошла ошибка при генерации ответа.',
        sources: [],
      };
    }
  }
} 