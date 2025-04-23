import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { errorHandler } from './middleware/error';
import aiEditRoutes from './routes/ai-edit';
import { logger } from './utils/logger';
import fileRoutes from './routes/file.routes';
import path from 'path';

interface ServerOptions {
  port: number;
  host: string;
  workingDir?: string;
}

export async function startServer(options: ServerOptions): Promise<void> {
  dotenv.config();

  // Set working directory if provided
  if (options.workingDir) {
    const fullPath = path.resolve(process.cwd(), options.workingDir);
    process.chdir(fullPath);
    logger.info(`Working directory set to: ${fullPath}`);
  }

  const app = express();
  const port = process.env.PORT || 3000;

  // Middleware
  app.use(cors({
    origin: '*', // Разрешаем запросы с любого домена
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], // Разрешенные методы
    allowedHeaders: ['Content-Type'], // Разрешенные заголовки
    credentials: true // Разрешаем передачу credentials (cookies, authorization headers и т.д.)
  }));
  app.use(express.json());

  // Routes
  app.use('/api/ai-edit', aiEditRoutes);
  app.use('/api/files', fileRoutes);

  // Error handling
  app.use(errorHandler);

  app.listen(port, () => {
    logger.info(`Server running on port ${port}`);
  }); 
  
  // Start server
  return new Promise((resolve, reject) => {
    const server = app.listen(options.port, options.host, () => {
      logger.info(`Server running at http://${options.host}:${options.port}`);
      resolve();
    });
    
    server.on('error', (error) => {
      logger.error('Server error:', error);
      reject(error);
    });
  });
} 