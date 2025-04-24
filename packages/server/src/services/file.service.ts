import fs from 'fs/promises';
import { logger } from '../utils/logger';

export class FileService {
  async saveFile(filePath: string, content: string): Promise<void> {
    try {
      logger.debug(`Saving file to path: ${filePath}`);
      await fs.writeFile(filePath, content, 'utf-8');
      logger.debug(`File saved successfully to: ${filePath}`);
    } catch (error: any) {
      logger.error(`Error saving file: ${error.message}`, { error, filePath });
      throw error;
    }
  }

  async readFile(filePath: string): Promise<string> {
    try {
      logger.debug(`Reading file from path: ${filePath}`);
      const content = await fs.readFile(filePath, 'utf-8');
      logger.debug(`File read successfully from: ${filePath}`);
      return content;
    } catch (error: any) {
      logger.error(`Error reading file: ${error.message}`, { error, filePath });
      throw error;
    }
  }
} 