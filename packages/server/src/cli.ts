#!/usr/bin/env tsx

import { Command } from 'commander';
import { startServer } from './server';
import { logger } from './utils/logger';

const program = new Command();

program
  .name('neuro-server')
  .description('CLI tool for AI-powered markdown editing')
  .version('0.0.0');

program
  .command('start')
  .description('Start the markdown editing server')
  .option('-p, --port <number>', 'Port to run the server on', '3000')
  .option('-h, --host <string>', 'Host to bind the server to', 'localhost')
  .option('-d, --dir <string>', 'Working directory for file operations')
  .action(async (options) => {
    try {
      logger.info('Starting markdown editing server...');
      await startServer({
        port: parseInt(options.port),
        host: options.host,
        workingDir: options.dir
      });
    } catch (error: any) {
      logger.error('Failed to start server:', error);
      process.exit(1);
    }
  });

program.parse(process.argv); 