import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '../utils/logger';
import { CustomError } from '../utils/errors';

const execAsync = promisify(exec);

export class AIService {
  async processEdit(prompt: string, currentContent: string): Promise<string> {
    try {
      const command = `npx neuro-docs -o src -m google/gemini-2.5-pro-exp-03-25:free -c "${prompt}"`;
      const { stdout, stderr } = await execAsync(command);

      if (stderr) {
        logger.error('Neuro-docs error:', stderr);
        throw new CustomError('AI_ERROR', 'Failed to process AI request');
      }

      return stdout;
    } catch (error) {
      logger.error('AI processing error:', error);
      throw new CustomError('AI_ERROR', 'Failed to process AI request');
    }
  }
} 