// Серверный файл для запуска в Vercel
require('dotenv').config();
const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const cors = require('cors');

// Загружаем ts-node для выполнения TypeScript напрямую
require('ts-node').register({
  transpileOnly: true,
  compilerOptions: {
    module: 'commonjs',
    target: 'es2022',
  }
});

// Создаем приложение Express
const app = express();

// Настраиваем middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(bodyParser.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Загружаем основной контроллер
let agentController, streamAgentController;
try {
  console.log('Loading controllers from TypeScript source...');
  const { AgentController } = require('./src/controllers/agent.controller');
  const controller = new AgentController();
  
  // Инициализируем контроллер
  controller.initialize()
    .then(() => console.log('Agent controller initialized successfully'))
    .catch(error => console.error('Failed to initialize agent controller:', error));
  
  // Создаем обработчики для API-маршрутов
  agentController = (req, res) => controller.processQuery(req, res);
  streamAgentController = (req, res) => controller.streamQueryResponse(req, res);
  
  console.log('Controllers loaded successfully');
} catch (error) {
  console.error('Error loading TypeScript controllers:', error);
  
  // Загружаем резервные контроллеры
  try {
    const fallbackControllers = require('./fallback-controllers');
    agentController = fallbackControllers.agentController;
    streamAgentController = fallbackControllers.streamAgentController;
    console.log('Fallback controllers loaded successfully');
  } catch (fallbackError) {
    console.error('Error loading fallback controllers:', fallbackError);
    agentController = (req, res) => res.status(500).json({ error: 'All controllers unavailable' });
    streamAgentController = (req, res) => res.status(500).json({ error: 'All streaming controllers unavailable' });
  }
}

// API-маршруты
app.post('/api/agent', async (req, res) => {
  try {
    console.log('API request to /api/agent:', req.body);
    return await agentController(req, res);
  } catch (error) {
    console.error('Error in /api/agent:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error', message: error.message });
    }
  }
});

app.post('/api/stream', async (req, res) => {
  try {
    console.log('API request to /api/stream:', req.body);
    return await streamAgentController(req, res);
  } catch (error) {
    console.error('Error in /api/stream:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error', message: error.message });
    } else {
      res.end('\nError occurred during streaming');
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
    res.status(500).json({ error: 'Unhandled server error', message: err.message });
  }
});

// Определяем порт и запускаем сервер
const port = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'production') {
  app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });
}

// Экспортируем для Vercel
module.exports = app; 