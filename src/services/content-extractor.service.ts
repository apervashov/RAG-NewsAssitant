import axios from 'axios';
import * as cheerio from 'cheerio';
import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { config } from '../config/env';
import { Article } from '../models/article';

export class ContentExtractorService {
  private gemini: GoogleGenerativeAI;
  private model: GenerativeModel;
  private modelName: string = 'gemini-1.5-pro';

  constructor() {
    this.gemini = new GoogleGenerativeAI(config.gemini.apiKey);
    try {
      this.model = this.gemini.getGenerativeModel({ model: this.modelName });
    } catch (error) {
      console.warn(`Error initializing model ${this.modelName}, trying fallback to gemini-1.0-pro`);
      this.modelName = 'gemini-1.0-pro';
      this.model = this.gemini.getGenerativeModel({ model: this.modelName });
    }
    console.log(`Using Gemini model for content extraction: ${this.modelName}`);
  }

  async extractContent(url: string): Promise<Article> {
    try {
      
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        },
      });

      const html = response.data;
      const $ = cheerio.load(html);

      
      const title = $('title').text().trim() || $('h1').first().text().trim();

      
      let content = '';
      
      
      const articleSelectors = [
        'article', 
        '.article', 
        '.post-content', 
        '.entry-content', 
        '.content', 
        'main'
      ];
      
      for (const selector of articleSelectors) {
        const articleElement = $(selector);
        if (articleElement.length > 0) {
          content = articleElement.text().trim();
          break;
        }
      }
      
      
      if (!content) {
        content = $('body').text().trim();
      }

      
      return await this.cleanWithLLM(title, content, url);
    } catch (error) {
      console.error(`Error extracting content from ${url}:`, error);
      throw new Error(`Failed to extract content from ${url}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async cleanWithLLM(title: string, content: string, url: string): Promise<Article> {
    try {
      
      const truncatedContent = content.slice(0, 15000);

      const prompt = `
      Ты - помощник, который очищает и структурирует контент новостных статей.
      
      Вот контент статьи, который нужно очистить и структурировать:
      
      URL: ${url}
      Заголовок: ${title}
      
      Контент:
      ${truncatedContent}
      
      Пожалуйста, очисти этот контент от рекламы, навигационных элементов, и другого нерелевантного текста.
      Сохрани только основной текст статьи.
      
      Верни результат в формате JSON со следующими полями:
      - title: очищенный заголовок статьи
      - content: очищенный основной текст статьи
      - url: URL статьи (без изменений)
      - date: дата публикации статьи в формате YYYY-MM-DD (если можешь определить из контента, иначе используй текущую дату)
      `;

      try {
        const result = await this.model.generateContent(prompt);
        const response = result.response;
        const cleanedContent = response.text();
        
        
        const jsonMatch = cleanedContent.match(/\{[\s\S]*\}/);
        const jsonContent = jsonMatch ? jsonMatch[0] : null;
        
        if (!jsonContent) {
          throw new Error('Empty response from LLM');
        }

        try {
          return JSON.parse(jsonContent) as Article;
        } catch (error) {
          console.error('Error parsing LLM response:', error);
          throw new Error('Failed to parse LLM response');
        }
      } catch (error) {
        console.error('Error calling Gemini API:', error);
        
        
        if (this.modelName === 'gemini-1.5-pro') {
          console.log('Trying fallback to gemini-1.0-pro for this request');
          this.modelName = 'gemini-1.0-pro';
          this.model = this.gemini.getGenerativeModel({ model: this.modelName });
          
          
          return this.cleanWithLLM(title, content, url);
        }
        
        throw error;
      }
    } catch (error) {
      console.error('Error cleaning content with LLM:', error);
      
      
      const currentDate = new Date().toISOString().split('T')[0];
      return {
        title: title || 'Unknown Title',
        content: content.slice(0, 1000) + '... [Content truncated due to processing error]',
        url,
        date: currentDate,
      };
    }
  }
} 