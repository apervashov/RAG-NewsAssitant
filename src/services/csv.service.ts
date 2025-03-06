import fs from 'fs';
import path from 'path';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';

export class CsvService {
  async readArticleUrls(filePath: string): Promise<string[]> {
    const urls: string[] = [];
    const fullPath = path.resolve(process.cwd(), filePath);

    if (!fs.existsSync(fullPath)) {
      throw new Error(`CSV file not found: ${fullPath}`);
    }

    const fileStream = createReadStream(fullPath);
    const rl = createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    let isFirstLine = true;
    let urlColumnIndex = -1;

    for await (const line of rl) {
      if (isFirstLine) {
        
        const headers = line.split(',');
        urlColumnIndex = headers.findIndex(
          (header) => header.toLowerCase() === 'url'
        );
        
        if (urlColumnIndex === -1) {
          throw new Error('URL column not found in CSV file');
        }
        
        isFirstLine = false;
        continue;
      }

      const columns = line.split(',');
      if (columns.length > urlColumnIndex) {
        const url = columns[urlColumnIndex].trim();
        if (url && url.startsWith('http')) {
          urls.push(url);
        }
      }
    }

    return urls;
  }
} 