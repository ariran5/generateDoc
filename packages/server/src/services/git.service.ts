import simpleGit, { SimpleGit } from 'simple-git';
import { logger } from '../utils/logger';
import { CustomError } from '../utils/errors';
import * as fs from 'fs/promises';
import path from 'path';

export class GitService {
  private git: SimpleGit;

  constructor() {
    this.git = simpleGit();
  }

  async commitChanges(filePath: string, content: string, message: string): Promise<void> {
    try {
      // Ensure the file path is safe
      const safePath = path.normalize(filePath).replace(/^(\.\.[\/\\])+/, '');
      
      // Write the file
      await fs.writeFile(safePath, content, 'utf8');
      
      // Git operations
      await this.git.add(safePath);
      await this.git.commit(message);
      
      logger.info(`Changes committed: ${message}`);
    } catch (error) {
      logger.error('Git commit error:', error);
      throw new CustomError('GIT_ERROR', 'Failed to commit changes');
    }
  }

  async pullChanges(): Promise<void> {
    try {
      await this.git.pull();
      logger.info('Successfully pulled latest changes');
    } catch (error) {
      logger.error('Git pull error:', error);
      throw new CustomError('GIT_ERROR', 'Failed to pull changes');
    }
  }
} 