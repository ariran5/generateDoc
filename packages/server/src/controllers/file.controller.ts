import { Request, Response } from 'express';
import { FileService } from '../services/file.service';
import { logger } from '../utils/logger';
import path from 'path';

export class FileController {
  private fileService: FileService;

  constructor() {
    this.fileService = new FileService();
  }

  async saveFile(req: Request, res: Response): Promise<void> {
    try {
      const { filePath, content } = req.body;
      const workDir = req.app.locals.workingDir;
      
      if (!filePath || !content) {
        logger.warn('Missing file path or content in save request');
        res.status(400).json({ error: 'File path and content are required' });
        return;
      }

      const absolutePath = path.resolve(workDir, filePath);
      logger.info(`Saving file: ${absolutePath}`);
      await this.fileService.saveFile(absolutePath, content);
      logger.info(`File saved successfully: ${absolutePath}`);
      res.status(200).json({ message: 'File saved successfully' });
    } catch (error: any) {
      logger.error(`Failed to save file: ${error.message}`, { error });
      res.status(500).json({ error: 'Failed to save file', details: error.message });
    }
  }

  async getFile(req: Request, res: Response): Promise<void> {
    try {
      const { filePath } = req.query;
      const workDir = req.app.locals.workingDir;
      
      if (!filePath || typeof filePath !== 'string') {
        logger.warn('Missing or invalid file path in get request');
        res.status(400).json({ error: 'File path is required' });
        return;
      }

      const absolutePath = path.resolve(workDir, filePath);
      logger.info(`Reading file: ${absolutePath}`);
      const content = await this.fileService.readFile(absolutePath);
      logger.info(`File read successfully: ${absolutePath}`);
      res.status(200).json({ content });
    } catch (error: any) {
      logger.error(`Failed to read file: ${error.message}`, { error });
      res.status(500).json({ error: 'Failed to read file', details: error.message });
    }
  }
} 