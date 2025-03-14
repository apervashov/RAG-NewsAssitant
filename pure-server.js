// Чистый JavaScript сервер для Vercel
require('dotenv').config();
const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const { GoogleGenerativeAI } = require('@google/generative-ai');

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

// Простая реализация API
const apiKey = process.env.GOOGLE_API_KEY || '';

if (!apiKey) {
  console.error('GOOGLE_API_KEY is not set in environment variables');
}

// Обработчик обычного запроса API
app.post('/api/agent', async (req, res) => {
  try {
    console.log('Received request to /api/agent:', req.body);
    const { query } = req.body;

    if (!query) {
      return res.status(400).json({
        error: 'Missing query',
        message: 'The query parameter is required for the request'
      });
    }

    if (!apiKey) {
      return res.status(500).json({
        error: 'API key is not configured',
        message: 'Set GOOGLE_API_KEY in environment variables'
      });
    }

    // Используем Gemini API напрямую
    const genAI = new GoogleGenerativeAI(apiKey);
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
  } catch (error) {
    console.error('Error in /api/agent:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Обработчик потокового API
app.post('/api/stream', async (req, res) => {
  try {
    console.log('Received request to /api/stream:', req.body);
    const { query } = req.body;

    if (!query) {
      return res.status(400).json({
        error: 'Missing query',
        message: 'The query parameter is required for the request'
      });
    }

    // Настраиваем заголовки для потоковой передачи
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Accel-Buffering', 'no');

    // Начальное сообщение
    res.write('Starting request processing...\n\n');

    if (!apiKey) {
      res.write('Error: API key is not configured. Set GOOGLE_API_KEY in environment variables.\n');
      res.end();
      return;
    }

    try {
      // Используем Gemini API напрямую
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      
      const prompt = `
      You are a helpful AI assistant. Answer the following question:
      
      ${query}
      
      Provide a comprehensive, informative and helpful response.
      `;
      
      res.write('Sending request to Gemini API...\n\n');
      
      // Потоковая генерация
      const streamingResponse = await model.generateContentStream(prompt);
      
      res.write('Received response from Gemini API:\n\n');
      
      // Обрабатываем потоковые данные
      for await (const chunk of streamingResponse.stream) {
        const chunkText = chunk.text();
        res.write(chunkText);
      }
      
      // Завершаем ответ
      res.write('\n\nGeneration completed.');
      res.end();
      
    } catch (apiError) {
      console.error('Error working with API:', apiError);
      res.write(`Error working with API: ${apiError.message}\n`);
      res.end();
    }
    
  } catch (error) {
    console.error('Error in /api/stream:', error);
    if (!res.headersSent) {
      return res.status(500).json({
        error: 'Internal server error',
        message: error.message
      });
    } else {
      res.write(`\nAn error occurred: ${error.message}`);
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

// Запуск сервера для локальной разработки
const port = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'production') {
  app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });
}

// Экспорт для Vercel
module.exports = app; 