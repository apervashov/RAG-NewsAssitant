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
  console.error('ERROR: GOOGLE_API_KEY not set');
}

// Инициализация Pinecone
const pineconeApiKey = process.env.PINECONE_API_KEY || '';
const pineconeIndex = process.env.PINECONE_INDEX || 'someindex1';
if (!pineconeApiKey) {
  console.error('ERROR: PINECONE_API_KEY not set');
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
      
      console.log('Initializing Pinecone...');
      pineconeClient = new Pinecone({ apiKey: pineconeApiKey });
      
      // Подключаемся к существующему индексу
      pineconeIndexClient = pineconeClient.Index(pineconeIndex);
      
      // Проверяем подключение запросом статистики
      const stats = await pineconeIndexClient.describeIndexStats();
      console.log(`Connected to index ${pineconeIndex}, vectors: ${stats.totalVectorCount}`);
      
      isInitialized = true;
    } catch (error) {
      console.error('Pinecone initialization error:', error);
      throw error;
    }
  }

  // Получение эмбеддинга для текста
  async getEmbedding(text) {
    try {
      const result = await this.textEmbeddingModel.embedContent(text);
      return result.embedding.values;
    } catch (error) {
      console.error('Embedding creation error:', error);
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
      console.error('Similarity search error:', error);
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
    console.error('Failed to connect to Pinecone:', error);
    return false;
  }
};

// API для обработки запросов
app.post('/api/agent', async (req, res) => {
  try {
    console.log('Received request to /api/agent:', req.body);
    const { query } = req.body;

    if (!query) {
      return res.status(400).json({
        error: 'Missing query',
        message: 'Query parameter is required'
      });
    }

    // Попытка быстрой инициализации, если необходимо
    if (!isInitialized) {
      const success = await fastInitialize();
      
      if (!success) {
        console.log('Failed to initialize database, using direct API response');
        
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
      console.log('Relevant documents not found, using direct API request');
      
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
    console.error('API error:', error);
    return res.status(500).json({
      error: 'Internal server error',
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
        error: 'Missing query',
        message: 'Query parameter is required'
      });
    }

    // Настраиваем заголовки для потоковой передачи
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Accel-Buffering', 'no');

    // Начальное сообщение
    res.write('Processing request...\n\n');

    // Попытка быстрой инициализации, если необходимо
    if (!isInitialized) {
      res.write('Connecting to Pinecone database...\n');
      const success = await fastInitialize();
      
      if (!success) {
        res.write('Direct API response mode\n\n');
        
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
        
        res.write('Answer:\n\n');
        
        // Обрабатываем потоковые данные
        for await (const chunk of streamingResponse.stream) {
          const chunkText = chunk.text();
          res.write(chunkText);
        }
        
        // Завершаем ответ
        res.write('\n\nGeneration completed.');
        res.end();
        return;
      }
      
      res.write('Connected to Pinecone database\n\n');
    }

    try {
      // Поиск документов
      res.write('Searching for relevant documents...\n');
      const { documents, sources } = await vectorDB.similaritySearch(query, 3);
      
      if (documents.length === 0) {
        res.write('No relevant documents found, using direct API...\n\n');
        
        // Используем Gemini API напрямую
        const genAI = new GoogleGenerativeAI(googleApiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
        
        const prompt = `
        You are a helpful AI assistant. Answer the following question:
        
        ${query}
        
        Provide a comprehensive, informative and helpful response.
        `;
        
        res.write('Sending request to Gemini API...\n\n');
        
        // Потоковая генерация без контекста
        const streamingResponse = await model.generateContentStream(prompt);
        
        res.write('Answer:\n\n');
        
        // Обрабатываем потоковые данные
        for await (const chunk of streamingResponse.stream) {
          const chunkText = chunk.text();
          res.write(chunkText);
        }
        
        // Завершаем ответ
        res.write('\n\nGeneration completed.');
        res.end();
        return;
      }
      
      // Нашли документы
      res.write(`Found ${documents.length} relevant documents\n\n`);
      res.write('Sources:\n');
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
      
      res.write('Sending request to Gemini API with context...\n\n');
      
      // Потоковая генерация с контекстом
      const streamingResponse = await model.generateContentStream(contextPrompt);
      
      res.write('Answer based on context:\n\n');
      
      // Обрабатываем потоковые данные
      for await (const chunk of streamingResponse.stream) {
        const chunkText = chunk.text();
        res.write(chunkText);
      }
      
      // Завершаем ответ
      res.write('\n\nGeneration completed.');
      res.end();
      
    } catch (apiError) {
      console.error('API error:', apiError);
      res.write(`API error: ${apiError.message}\n`);
      res.end();
    }
    
  } catch (error) {
    console.error('Stream error:', error);
    if (!res.headersSent) {
      return res.status(500).json({
        error: 'Internal server error',
        message: error.message
      });
    } else {
      res.write(`\nError occurred: ${error.message}`);
      res.end();
    }
  }
});

// Обслуживаем HTML-страницу для всех остальных маршрутов
app.get('*', (req, res) => {
  console.log('Serving index.html for path:', req.path);
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Обработчик ошибок
app.use((err, req, res, next) => {
  console.error('Express error handler:', err);
  if (!res.headersSent) {
    res.status(500).json({
      error: 'Unhandled server error',
      message: err.message
    });
  }
});

// Быстрая инициализация при запуске в режиме разработки
if (process.env.NODE_ENV !== 'production') {
  fastInitialize().then(success => {
    if (success) {
      console.log('Successfully  connected to Pinecone at startup');
    } else {
      console.warn('Failed to connect to Pinecone at startup, initialization will be performed on the first request');
    }
  });
}

// Запуск сервера для локальной разработки
const port = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'production') {
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
}

// Экспорт для Vercel
module.exports = app; 