// Сервер с Pinecone векторной базой данных
require('dotenv').config();
const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { Pinecone } = require('@pinecone-database/pinecone');
const csv = require('csv-parser');
const axios = require('axios');
const cheerio = require('cheerio');
const crypto = require('crypto');

// Создаем приложение Express
const app = express();

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(bodyParser.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Инициализация Google Generative AI
const googleApiKey = process.env.GOOGLE_API_KEY || '';
if (!googleApiKey) {
  console.error('ОШИБКА: GOOGLE_API_KEY не установлен');
}

// Инициализация Pinecone
const pineconeApiKey = process.env.PINECONE_API_KEY || '';
const pineconeIndex = process.env.PINECONE_INDEX || 'someindex1';
if (!pineconeApiKey) {
  console.error('ОШИБКА: PINECONE_API_KEY не установлен');
}

let pineconeClient = null;
let pineconeIndexClient = null;
let isInitialized = false;

// Класс VectorDB обслуживает работу с векторной базой данных
class VectorDB {
  constructor() {
    this.genAI = new GoogleGenerativeAI(googleApiKey);
    this.textEmbeddingModel = this.genAI.getGenerativeModel({ model: "embedding-001" });
  }

  // Инициализация подключения к Pinecone
  async initialize() {
    try {
      console.log('Инициализация Pinecone...');
      pineconeClient = new Pinecone({ apiKey: pineconeApiKey });
      
      // Получение списка индексов
      const indexList = await pineconeClient.listIndexes();
      console.log('Доступные индексы Pinecone:', indexList);
      
      // Проверка существования индекса
      let indexExists = false;
      for (const index of indexList) {
        if (index.name === pineconeIndex) {
          indexExists = true;
          break;
        }
      }
      
      // Создание индекса, если его не существует
      if (!indexExists) {
        console.log(`Индекс ${pineconeIndex} не найден, создаю новый...`);
        await pineconeClient.createIndex({
          name: pineconeIndex,
          dimension: 768, // Размерность эмбеддингов
          metric: 'cosine'
        });
        console.log(`Индекс ${pineconeIndex} создан успешно`);
      }
      
      pineconeIndexClient = pineconeClient.Index(pineconeIndex);
      isInitialized = true;
      console.log('Pinecone инициализирован успешно');
    } catch (error) {
      console.error('Ошибка при инициализации Pinecone:', error);
      throw error;
    }
  }

  // Получение эмбеддинга для текста
  async getEmbedding(text) {
    try {
      const result = await this.textEmbeddingModel.embedContent(text);
      return result.embedding.values;
    } catch (error) {
      console.error('Ошибка при создании эмбеддинга:', error);
      throw error;
    }
  }

  // Создание записи в Pinecone
  async upsertDocument(id, vector, metadata) {
    try {
      await pineconeIndexClient.upsert([{
        id: id,
        values: vector,
        metadata: metadata
      }]);
      console.log(`Документ ${id} сохранен в Pinecone`);
    } catch (error) {
      console.error('Ошибка при сохранении документа в Pinecone:', error);
      throw error;
    }
  }

  // Поиск похожих документов по запросу
  async similaritySearch(query, k = 3) {
    try {
      const queryEmbedding = await this.getEmbedding(query);
      const results = await pineconeIndexClient.query({
        vector: queryEmbedding,
        topK: k,
        includeMetadata: true
      });
      
      return {
        documents: results.matches.map(match => match.metadata.content || ''),
        sources: results.matches.map(match => ({
          title: match.metadata.title || 'Unknown',
          url: match.metadata.url || '#',
          date: match.metadata.date || new Date().toISOString().split('T')[0]
        }))
      };
    } catch (error) {
      console.error('Ошибка при поиске похожих документов:', error);
      throw error;
    }
  }
}

// Класс для получения содержимого статей
class ContentExtractor {
  // Получение HTML страницы
  async fetchHtml(url) {
    try {
      console.log(`Загрузка страницы: ${url}`);
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });
      return response.data;
    } catch (error) {
      console.error(`Ошибка при загрузке страницы ${url}:`, error.message);
      return null;
    }
  }

  // Извлечение контента из HTML
  extractContent(html, url) {
    if (!html) return null;
    
    try {
      const $ = cheerio.load(html);
      
      // Удаление ненужных элементов
      $('script, style, nav, footer, header, iframe, .ads, .comments, .sidebar').remove();
      
      // Получение заголовка
      let title = $('title').text().trim() || $('h1').first().text().trim() || '';
      
      // Получение основного контента
      let content = '';
      
      // Приоритетные селекторы для разных сайтов
      const selectors = [
        'article', 
        '.article', 
        '.content', 
        '.post-content', 
        '.entry-content', 
        'main',
        '#content',
        '.main-content'
      ];
      
      // Пробуем разные селекторы
      let found = false;
      for (const selector of selectors) {
        if ($(selector).length) {
          content = $(selector).text().replace(/\s+/g, ' ').trim();
          found = true;
          break;
        }
      }
      
      // Если ничего не нашли, берем все параграфы
      if (!found || content.length < 100) {
        content = $('p').text().replace(/\s+/g, ' ').trim();
      }
      
      // Если все еще мало контента, берем все тело
      if (content.length < 100) {
        content = $('body').text().replace(/\s+/g, ' ').trim();
      }
      
      if (!title) title = url.split('/').pop() || 'Unknown Title';
      
      return {
        title,
        content,
        url,
        date: new Date().toISOString().split('T')[0]
      };
    } catch (error) {
      console.error(`Ошибка при извлечении контента из ${url}:`, error);
      return null;
    }
  }

  // Извлечение статьи из URL
  async extractArticle(url) {
    const html = await this.fetchHtml(url);
    if (!html) return null;
    
    return this.extractContent(html, url);
  }
}

// Обработчик CSV данных
class CsvProcessor {
  // Загрузка данных из CSV файла
  async loadFromCsv(filePath) {
    return new Promise((resolve, reject) => {
      const results = [];
      
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', () => {
          console.log(`Загружено ${results.length} записей из ${filePath}`);
          resolve(results);
        })
        .on('error', (error) => {
          console.error(`Ошибка при чтении CSV файла ${filePath}:`, error);
          reject(error);
        });
    });
  }
}

// Имя CSV файла
const csvFilePath = 'articles_dataset.csv';

// Создаем экземпляры классов
const vectorDB = new VectorDB();
const contentExtractor = new ContentExtractor();
const csvProcessor = new CsvProcessor();

// Инициализация и загрузка данных
async function initializeApp() {
  try {
    // Инициализация векторной базы данных
    await vectorDB.initialize();
    
    // Проверка существования CSV-файла
    if (!fs.existsSync(csvFilePath)) {
      console.error(`Файл ${csvFilePath} не найден`);
      return;
    }
    
    // Загрузка данных из CSV
    const articles = await csvProcessor.loadFromCsv(csvFilePath);
    console.log(`Загружено ${articles.length} статей из CSV-файла`);
    
    // Обработка каждой статьи
    for (const article of articles) {
      if (!article.URL) continue;
      
      // Получение содержимого статьи
      const extractedArticle = await contentExtractor.extractArticle(article.URL);
      if (!extractedArticle) {
        console.warn(`Не удалось извлечь содержимое из ${article.URL}`);
        continue;
      }
      
      console.log(`Обработка статьи: ${extractedArticle.title}`);
      
      // Создание уникального идентификатора
      const id = crypto.createHash('md5').update(article.URL).digest('hex');
      
      // Получение эмбеддинга для содержимого
      const embedding = await vectorDB.getEmbedding(extractedArticle.content);
      
      // Сохранение в Pinecone
      await vectorDB.upsertDocument(id, embedding, {
        title: extractedArticle.title,
        content: extractedArticle.content,
        url: article.URL,
        date: extractedArticle.date,
        source: article.Source || 'Unknown'
      });
    }
    
    console.log('Загрузка данных завершена успешно');
  } catch (error) {
    console.error('Ошибка при инициализации приложения:', error);
  }
}

// API для обработки запросов
app.post('/api/agent', async (req, res) => {
  try {
    console.log('Получен запрос к /api/agent:', req.body);
    const { query } = req.body;

    if (!query) {
      return res.status(400).json({
        error: 'Отсутствует query',
        message: 'Параметр query обязателен для запроса'
      });
    }

    if (!isInitialized) {
      return res.status(500).json({
        error: 'База данных не инициализирована',
        message: 'Пожалуйста, дождитесь завершения инициализации'
      });
    }

    // Поиск похожих документов
    const { documents, sources } = await vectorDB.similaritySearch(query, 3);
    
    if (documents.length === 0) {
      console.log('Релевантные документы не найдены, использую прямой запрос к API');
      
      // Используем Gemini API напрямую если нет документов
      const genAI = new GoogleGenerativeAI(googleApiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      
      const prompt = `
      You are a helpful AI assistant. Answer the following question:
      
      ${query}
      
      Provide a comprehensive, informative and helpful response.
      `;
      
      const result = await model.generateContent(prompt);
      const response = result.response;
      const text = response.text();
      
      return res.status(200).json({
        answer: text,
        sources: [
          {
            title: "Direct AI Response",
            url: "https://ai.google.dev/",
            date: new Date().toISOString().split('T')[0]
          }
        ]
      });
    }
    
    // Формируем контекстный запрос к Gemini с найденными документами
    const genAI = new GoogleGenerativeAI(googleApiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    
    const contextPrompt = `
    You are a helpful AI assistant. Answer the following question based on the provided context:
    
    Question: ${query}
    
    Context:
    ${documents.join('\n\n')}
    
    Provide a comprehensive, informative and helpful response based only on the information in the context.
    If the context doesn't contain enough information to answer the question completely, say so.
    `;
    
    const result = await model.generateContent(contextPrompt);
    const response = result.response;
    const text = response.text();
    
    return res.status(200).json({
      answer: text,
      sources: sources
    });
  } catch (error) {
    console.error('Ошибка в /api/agent:', error);
    return res.status(500).json({
      error: 'Внутренняя ошибка сервера',
      message: error.message
    });
  }
});

// Обработчик потокового API
app.post('/api/stream', async (req, res) => {
  try {
    console.log('Получен запрос к /api/stream:', req.body);
    const { query } = req.body;

    if (!query) {
      return res.status(400).json({
        error: 'Отсутствует query',
        message: 'Параметр query обязателен для запроса'
      });
    }

    // Настраиваем заголовки для потоковой передачи
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Accel-Buffering', 'no');

    // Начальное сообщение
    res.write('Начинаю обработку запроса...\n\n');

    if (!isInitialized) {
      res.write('Ошибка: База данных не инициализирована. Пожалуйста, дождитесь завершения инициализации.\n');
      res.end();
      return;
    }

    try {
      // Поиск документов
      res.write('Ищу релевантные документы...\n');
      const { documents, sources } = await vectorDB.similaritySearch(query, 3);
      
      if (documents.length === 0) {
        res.write('Релевантные документы не найдены, использую прямой запрос к API...\n\n');
        
        // Используем Gemini API напрямую
        const genAI = new GoogleGenerativeAI(googleApiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
        
        const prompt = `
        You are a helpful AI assistant. Answer the following question:
        
        ${query}
        
        Provide a comprehensive, informative and helpful response.
        `;
        
        res.write('Отправляю запрос к Gemini API...\n\n');
        
        // Потоковая генерация без контекста
        const streamingResponse = await model.generateContentStream(prompt);
        
        res.write('Получен ответ от Gemini API:\n\n');
        
        // Обрабатываем потоковые данные
        for await (const chunk of streamingResponse.stream) {
          const chunkText = chunk.text();
          res.write(chunkText);
        }
        
        // Завершаем ответ
        res.write('\n\nГенерация завершена.');
        res.end();
        return;
      }
      
      // Нашли документы
      res.write(`Найдено ${documents.length} релевантных документов\n\n`);
      res.write('Источники:\n');
      sources.forEach((source, index) => {
        res.write(`${index+1}. ${source.title} (${source.url})\n`);
      });
      res.write('\n');
      
      // Формируем контекстный запрос к Gemini
      const genAI = new GoogleGenerativeAI(googleApiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      
      const contextPrompt = `
      You are a helpful AI assistant. Answer the following question based on the provided context:
      
      Question: ${query}
      
      Context:
      ${documents.join('\n\n')}
      
      Provide a comprehensive, informative and helpful response based only on the information in the context.
      If the context doesn't contain enough information to answer the question completely, say so.
      `;
      
      res.write('Отправляю запрос к Gemini API с контекстом...\n\n');
      
      // Потоковая генерация с контекстом
      const streamingResponse = await model.generateContentStream(contextPrompt);
      
      res.write('Ответ на основе контекста:\n\n');
      
      // Обрабатываем потоковые данные
      for await (const chunk of streamingResponse.stream) {
        const chunkText = chunk.text();
        res.write(chunkText);
      }
      
      // Завершаем ответ
      res.write('\n\nГенерация завершена.');
      res.end();
      
    } catch (apiError) {
      console.error('Ошибка при работе с API:', apiError);
      res.write(`Ошибка при работе с API: ${apiError.message}\n`);
      res.end();
    }
    
  } catch (error) {
    console.error('Ошибка в /api/stream:', error);
    if (!res.headersSent) {
      return res.status(500).json({
        error: 'Внутренняя ошибка сервера',
        message: error.message
      });
    } else {
      res.write(`\nПроизошла ошибка: ${error.message}`);
      res.end();
    }
  }
});

// Обслуживаем HTML-страницу для всех остальных маршрутов
app.get('*', (req, res) => {
  console.log('Отдаю index.html для пути:', req.path);
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Обработчик ошибок
app.use((err, req, res, next) => {
  console.error('Обработчик ошибок Express:', err);
  if (!res.headersSent) {
    res.status(500).json({
      error: 'Необработанная ошибка сервера',
      message: err.message
    });
  }
});

// Инициализация приложения
initializeApp().catch(error => {
  console.error('Ошибка при инициализации:', error);
});

// Запуск сервера для локальной разработки
const port = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'production') {
  app.listen(port, () => {
    console.log(`Сервер запущен на порту ${port}`);
  });
}

// Экспорт для Vercel
module.exports = app; 