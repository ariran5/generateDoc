import fs from 'fs/promises';
import path from 'path';
import { logger } from '../utils/logger';

export class FileService {
  async saveFile(filePath: string, content: string): Promise<void> {
    try {
      const fullPath = path.resolve(process.cwd(), filePath);
      logger.debug(`Saving file to path: ${fullPath}`);
      await fs.writeFile(fullPath, content, 'utf-8');
      logger.debug(`File saved successfully to: ${fullPath}`);
    } catch (error: any) {
      logger.error(`Error saving file: ${error.message}`, { error, filePath });
      throw error;
    }
  }

  async readFile(filePath: string): Promise<string> {
    try {
      const fullPath = path.resolve(process.cwd(), filePath);
      logger.debug(`Reading file from path: ${fullPath}`);
      const content = await fs.readFile(fullPath, 'utf-8');
      logger.debug(`File read successfully from: ${fullPath}`);
      return content;
    } catch (error: any) {
      logger.error(`Error reading file: ${error.message}`, { error, filePath });
      throw error;
    }
  }
} 