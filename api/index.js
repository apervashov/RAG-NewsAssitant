// Обрабатываем только API-запросы
const { join } = require('path');
const fs = require('fs');

module.exports = (req, res) => {
  // Для запросов к API используем основное приложение
  if (req.url.startsWith('/api/')) {
    const app = require('../dist/index').default;
    return app(req, res);
  }
  
  // Для всех остальных запросов отдаем статический HTML
  const indexPath = join(__dirname, '../public/index.html');
  
  try {
    const htmlContent = fs.readFileSync(indexPath, 'utf8');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.end(htmlContent);
  } catch (error) {
    console.error('Error serving index.html:', error);
    return res.status(500).end('Internal Server Error');
  }
}; 