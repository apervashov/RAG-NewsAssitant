// Резервные контроллеры для случаев, когда основные не могут быть загружены

// Простой обработчик для /api/agent
exports.agentController = (req, res) => {
  console.log('Using fallback agent controller');
  
  try {
    const { query } = req.body;
    
    if (!query) {
      return res.status(400).json({
        error: 'Missing query parameter',
        message: 'Please provide a query in your request'
      });
    }
    
    return res.status(200).json({
      answer: `Your query was: "${query}". This is a fallback response because the main API is currently unavailable.`,
      sources: [
        { 
          title: "Fallback Source", 
          url: "https://example.com/fallback", 
          date: new Date().toISOString().split('T')[0]
        }
      ]
    });
  } catch (error) {
    console.error('Error in fallback agent controller:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
};

// Простой обработчик для /api/stream
exports.streamAgentController = (req, res) => {
  console.log('Using fallback stream controller');
  
  try {
    const { query } = req.body;
    
    if (!query) {
      return res.status(400).json({
        error: 'Missing query parameter',
        message: 'Please provide a query in your request'
      });
    }
    
    // Настраиваем заголовки для потоковой передачи
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Cache-Control', 'no-cache');
    
    // Отправляем простой потоковый ответ
    res.write('This is a fallback streaming response.\n\n');
    
    setTimeout(() => {
      res.write(`Your query was: "${query}"\n\n`);
    }, 300);
    
    setTimeout(() => {
      res.write('The main API is currently unavailable or experiencing issues.\n\n');
    }, 600);
    
    setTimeout(() => {
      res.write('Please try again later when the service is fully operational.\n\n');
    }, 900);
    
    setTimeout(() => {
      res.write('End of fallback response.');
      res.end();
    }, 1200);
    
  } catch (error) {
    console.error('Error in fallback stream controller:', error);
    if (!res.headersSent) {
      return res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    } else {
      res.write(`\n\nError occurred: ${error.message}`);
      res.end();
    }
  }
}; 