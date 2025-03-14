// Сервер с Pinecone векторной базой данных
require('dotenv').config();
const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { Pinecone } = require('@pinecone-database/pinecone');

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
      // Уже инициализирован
      if (isInitialized) {
        return;
      }
      
      console.log('Инициализация Pinecone...');
      pineconeClient = new Pinecone({ apiKey: pineconeApiKey });
      
      // Подключаемся к существующему индексу
      pineconeIndexClient = pineconeClient.Index(pineconeIndex);
      
      // Проверяем подключение запросом статистики
      const stats = await pineconeIndexClient.describeIndexStats();
      console.log(`Успешное подключение к индексу ${pineconeIndex}, векторов: ${stats.totalVectorCount}`);
      
      isInitialized = true;
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

  // Поиск похожих документов по запросу
  async similaritySearch(query, k = 3) {
    try {
      const queryEmbedding = await this.getEmbedding(query);
      const results = await pineconeIndexClient.query({
        vector: queryEmbedding,
        topK: k,
        includeMetadata: true
      });
      
      // Проверка наличия результатов
      if (!results.matches || results.matches.length === 0) {
        return {
          documents: [],
          sources: []
        };
      }
      
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
      // Возвращаем пустой результат в случае ошибки
      return {
        documents: [],
        sources: []
      };
    }
  }
}

// Создаем один экземпляр VectorDB
const vectorDB = new VectorDB();

// Логика быстрой инициализации
const fastInitialize = async () => {
  try {
    await vectorDB.initialize();
    return true;
  } catch (error) {
    console.error('Не удалось подключиться к Pinecone:', error);
    return false;
  }
};

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

    // Попытка быстрой инициализации, если необходимо
    if (!isInitialized) {
      const success = await fastInitialize();
      
      if (!success) {
        console.log('Не удалось инициализировать базу данных, использую прямой ответ API');
        
        // Используем Gemini API напрямую
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

    // Попытка быстрой инициализации, если необходимо
    if (!isInitialized) {
      res.write('Подключаюсь к базе данных Pinecone...\n');
      const success = await fastInitialize();
      
      if (!success) {
        res.write('Не удалось подключиться к базе данных, использую прямой ответ API...\n\n');
        
        // Используем Gemini API напрямую
        const genAI = new GoogleGenerativeAI(googleApiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
        
        const prompt = `
        You are a helpful AI assistant. Answer the following question:
        
        ${query}
        
        Provide a comprehensive, informative and helpful response.
        `;
        
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
      
      res.write('Успешно подключился к базе данных Pinecone\n\n');
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

// Быстрая инициализация при запуске в режиме разработки
if (process.env.NODE_ENV !== 'production') {
  fastInitialize().then(success => {
    if (success) {
      console.log('Успешно подключился к Pinecone при запуске');
    } else {
      console.warn('Не удалось подключиться к Pinecone при запуске, будет выполнена инициализация при первом запросе');
    }
  });
}

// Запуск сервера для локальной разработки
const port = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'production') {
  app.listen(port, () => {
    console.log(`Сервер запущен на порту ${port}`);
  });
}

// Экспорт для Vercel
module.exports = app; 