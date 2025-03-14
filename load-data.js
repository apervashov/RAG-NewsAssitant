// Скрипт для загрузки данных из CSV в Pinecone
require('dotenv').config();
const fs = require('fs');
const csv = require('csv-parser');
const axios = require('axios');
const cheerio = require('cheerio');
const crypto = require('crypto');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { Pinecone } = require('@pinecone-database/pinecone');

// Инициализация Google Generative AI
const googleApiKey = process.env.GOOGLE_API_KEY || '';
if (!googleApiKey) {
  console.error('ОШИБКА: GOOGLE_API_KEY не установлен');
  process.exit(1);
}

// Инициализация Pinecone
const pineconeApiKey = process.env.PINECONE_API_KEY || '';
const pineconeIndex = process.env.PINECONE_INDEX || 'someindex1';
if (!pineconeApiKey) {
  console.error('ОШИБКА: PINECONE_API_KEY не установлен');
  process.exit(1);
}

let pineconeClient = null;
let pineconeIndexClient = null;

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

  // Проверка наличия документа в Pinecone
  async checkDocument(id) {
    try {
      const result = await pineconeIndexClient.fetch([id]);
      return result.vectors && result.vectors[id] ? true : false;
    } catch (error) {
      console.error(`Ошибка при проверке документа ${id}:`, error);
      return false;
    }
  }

  // Подсчет количества документов в индексе
  async countDocuments() {
    try {
      const stats = await pineconeIndexClient.describeIndexStats();
      return stats.totalVectorCount;
    } catch (error) {
      console.error('Ошибка при подсчете документов:', error);
      return 0;
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
        },
        timeout: 10000 // 10 секунд таймаут
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

// Основная функция загрузки
async function loadDataToPinecone() {
  // Создаем экземпляры классов
  const vectorDB = new VectorDB();
  const contentExtractor = new ContentExtractor();
  const csvProcessor = new CsvProcessor();

  try {
    // Инициализация векторной базы данных
    await vectorDB.initialize();
    
    // Проверка существующих данных
    const documentCount = await vectorDB.countDocuments();
    console.log(`В базе данных уже есть ${documentCount} документов`);
    
    // Проверка существования CSV-файла
    if (!fs.existsSync(csvFilePath)) {
      console.error(`Файл ${csvFilePath} не найден`);
      return;
    }
    
    // Загрузка данных из CSV
    const articles = await csvProcessor.loadFromCsv(csvFilePath);
    console.log(`Загружено ${articles.length} статей из CSV-файла`);
    
    // Счетчики для статистики
    let processed = 0;
    let skipped = 0;
    let failed = 0;
    let added = 0;
    
    // Обработка каждой статьи
    for (const article of articles) {
      processed++;
      
      if (!article.URL) {
        console.warn(`Статья #${processed} не содержит URL, пропускаю`);
        skipped++;
        continue;
      }
      
      // Создание уникального идентификатора
      const id = crypto.createHash('md5').update(article.URL).digest('hex');
      
      // Проверка наличия документа в базе
      const exists = await vectorDB.checkDocument(id);
      if (exists) {
        console.log(`Документ ${id} для URL ${article.URL} уже существует, пропускаю`);
        skipped++;
        continue;
      }
      
      // Получение содержимого статьи
      console.log(`Обработка статьи ${processed}/${articles.length}: ${article.URL}`);
      const extractedArticle = await contentExtractor.extractArticle(article.URL);
      if (!extractedArticle) {
        console.warn(`Не удалось извлечь содержимое из ${article.URL}`);
        failed++;
        continue;
      }
      
      console.log(`Создание эмбеддинга для статьи: ${extractedArticle.title}`);
      
      // Получение эмбеддинга для содержимого
      try {
        const embedding = await vectorDB.getEmbedding(extractedArticle.content);
        
        // Сохранение в Pinecone
        await vectorDB.upsertDocument(id, embedding, {
          title: extractedArticle.title,
          content: extractedArticle.content,
          url: article.URL,
          date: extractedArticle.date,
          source: article.Source || 'Unknown'
        });
        
        added++;
        console.log(`Документ ${id} успешно добавлен в Pinecone (${added} из ${articles.length})`);
      } catch (embeddingError) {
        console.error(`Ошибка при создании эмбеддинга для ${article.URL}:`, embeddingError);
        failed++;
      }
      
      // Небольшая пауза чтобы не превысить лимиты API
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log('\nЗагрузка данных завершена:');
    console.log(`- Всего обработано: ${processed} записей`);
    console.log(`- Успешно добавлено: ${added} документов`);
    console.log(`- Пропущено: ${skipped} записей`);
    console.log(`- Не удалось обработать: ${failed} записей`);
    
    // Проверка итогового количества документов
    const finalCount = await vectorDB.countDocuments();
    console.log(`\nИтоговое количество документов в базе: ${finalCount}`);
    
  } catch (error) {
    console.error('Ошибка при загрузке данных:', error);
  }
}

// Запуск загрузки данных
console.log('Начинаю загрузку данных из CSV в Pinecone...');
loadDataToPinecone()
  .then(() => {
    console.log('Загрузка данных завершена успешно');
    process.exit(0);
  })
  .catch(error => {
    console.error('Критическая ошибка при загрузке данных:', error);
    process.exit(1);
  }); 