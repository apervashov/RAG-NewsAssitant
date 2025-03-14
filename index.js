// Специальный файл для обработки запросов к корню
const express = require('express');
const path = require('path');

// Создаем приложение Express
const app = express();

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Обработка ошибок при загрузке контроллеров
let agentController, streamAgentController;
try {
  const controllers = require('./dist/controllers/agent.controller');
  agentController = controllers.agentController;
  streamAgentController = controllers.streamAgentController;
  console.log('Controllers loaded successfully');
} catch (error) {
  console.error('Error loading main controllers:', error);
  // Пробуем загрузить резервные контроллеры
  try {
    const fallbackControllers = require('./fallback-controllers');
    agentController = fallbackControllers.agentController;
    streamAgentController = fallbackControllers.streamAgentController;
    console.log('Fallback controllers loaded successfully');
  } catch (fallbackError) {
    console.error('Error loading fallback controllers:', fallbackError);
    // Создаем простые заглушки
    agentController = (req, res) => res.status(500).json({ error: 'All controllers unavailable' });
    streamAgentController = (req, res) => res.status(500).json({ error: 'All streaming controllers unavailable' });
  }
}

// API маршруты с дополнительной обработкой ошибок
app.post('/api/agent', async (req, res) => {
  try {
    console.log('Agent API called with body:', req.body);
    return await agentController(req, res);
  } catch (err) {
    console.error('Error in agent endpoint:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error', message: err.message });
    }
  }
});

app.post('/api/stream', async (req, res) => {
  try {
    console.log('Stream API called with body:', req.body);
    return await streamAgentController(req, res);
  } catch (err) {
    console.error('Error in stream endpoint:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error', message: err.message });
    } else {
      res.end('\nError occurred during streaming');
    }
  }
});

// Основной роут для всех остальных запросов
app.get('*', (req, res) => {
  console.log('Serving index.html for path:', req.path);
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Универсальный обработчик ошибок
app.use((err, req, res, next) => {
  console.error('Express error handler:', err);
  if (!res.headersSent) {
    res.status(500).json({ error: 'Unhandled server error', message: err.message });
  }
});

// Запуск сервера в режиме разработки
if (process.env.NODE_ENV !== 'production') {
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });
}

// Экспорт для Vercel
module.exports = app; 