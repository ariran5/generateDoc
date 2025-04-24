import { Router, Request, Response, NextFunction } from 'express';
import { body } from 'express-validator';
import { validate } from '../middleware/validation';
import { AIService } from '../services/ai.service';
import { GitService } from '../services/git.service';
import { logger } from '../utils/logger';

const router = Router();
const aiService = new AIService();
const gitService = new GitService();

// Validation middleware
const editValidation = [
  body('prompt').notEmpty().trim(),
  body('filePath').notEmpty(),
  validate
];

const commitValidation = [
  body('filePath').notEmpty(),
  body('content').notEmpty(),
  body('message').notEmpty(),
  validate
];

// Routes
router.post('/', editValidation, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { prompt, filePath } = req.body;
    
    logger.info(`Processing AI edit request for file: ${filePath}`);
    const content = await aiService.processEdit(prompt, filePath);
    
    res.json({ content });
  } catch (error) {
    next(error);
  }
});

router.post('/commit', commitValidation, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { filePath, content, message } = req.body;
    
    logger.info(`Committing changes to file: ${filePath}`);
    await gitService.commitChanges(filePath, content, message, req);
    
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

router.post('/pull', async (req: Request, res: Response, next: NextFunction) => {
  try {
    logger.info('Pulling latest changes');
    await gitService.pullChanges(req);
    
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

export default router; 