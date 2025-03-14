const { join } = require('path');
const fs = require('fs');
const path = require('path');

// Статические файлы
const mimeTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

module.exports = (req, res) => {
  // Получаем путь запрашиваемого файла
  let filePath = req.url;
  
  // Удаляем начальный слеш
  if (filePath.startsWith('/')) {
    filePath = filePath.substr(1);
  }
  
  // Если запрошен корневой путь, отдаем index.html
  if (filePath === '' || filePath === '/') {
    filePath = 'index.html';
  }
  
  // Полный путь к файлу
  const fullPath = join(__dirname, '../public', filePath);
  
  try {
    // Проверяем существование файла
    if (!fs.existsSync(fullPath)) {
      res.statusCode = 404;
      res.end('File not found');
      return;
    }
    
    // Определяем тип содержимого
    const extname = path.extname(fullPath).toLowerCase();
    const contentType = mimeTypes[extname] || 'application/octet-stream';
    
    // Читаем файл
    const content = fs.readFileSync(fullPath);
    
    // Отправляем ответ
    res.setHeader('Content-Type', contentType);
    res.end(content);
  } catch (error) {
    console.error('Error serving static file:', error);
    res.statusCode = 500;
    res.end('Internal Server Error');
  }
}; 