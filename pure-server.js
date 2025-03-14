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
  console.error('GOOGLE_API_KEY не установлен в переменных окружения');
}

// Обработчик обычного запроса API
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

    if (!apiKey) {
      return res.status(500).json({
        error: 'API ключ не настроен',
        message: 'Настройте GOOGLE_API_KEY в переменных окружения'
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

    if (!apiKey) {
      res.write('Ошибка: API ключ не настроен. Настройте GOOGLE_API_KEY в переменных окружения.\n');
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
      
      res.write('Отправляю запрос к Gemini API...\n\n');
      
      // Потоковая генерация
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

// Запуск сервера для локальной разработки
const port = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'production') {
  app.listen(port, () => {
    console.log(`Сервер запущен на порту ${port}`);
  });
}

// Экспорт для Vercel
module.exports = app; 