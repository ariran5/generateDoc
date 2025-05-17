import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '../utils/logger';
import { CustomError } from '../utils/errors';

const execAsync = promisify(exec);

export class AIService {
  async processEdit(prompt: string, filePath: string, openrouterOptions: {model: string}): Promise<{stdout: string, stderr: string}> {
    try {
      const workDir = process.cwd();
      // Build the command with proper escaping
      const command = `npx neuro-docs -o src -m ${openrouterOptions.model} -c '${filePath}' -p '${prompt}'`;
      
      logger.debug(`Executing command in directory ${workDir}: ${command}`);
      const { stdout, stderr } = await execAsync(command, { cwd: workDir, env: process.env });

      if (stderr) {
        logger.error('Neuro-docs error:', stderr);
      }

      return {stdout, stderr};
    } catch (error: any) {
      logger.error('AI processing error:', error);
      error.message = 'AI_ERROR ' + error.message;

      throw error
    }
  }
} 