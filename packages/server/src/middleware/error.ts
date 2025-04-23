import { Request, Response, NextFunction } from 'express';
import { CustomError } from '../utils/errors';
import { logger } from '../utils/logger';

export const errorHandler = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  logger.error('Error:', error);

  if (error instanceof CustomError) {
    return res.status(400).json({
      type: error.type,
      message: error.message
    });
  }

  res.status(500).json({
    type: 'INTERNAL_ERROR',
    message: 'An internal server error occurred'
  });
}; 