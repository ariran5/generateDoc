import { Router } from 'express';
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
  body('currentContent').notEmpty(),
  validate
];

const commitValidation = [
  body('filePath').notEmpty(),
  body('content').notEmpty(),
  body('message').notEmpty(),
  validate
];

// Routes
router.post('/', editValidation, async (req, res, next) => {
  try {
    const { prompt, filePath, currentContent } = req.body;
    
    logger.info(`Processing AI edit request for file: ${filePath}`);
    const content = await aiService.processEdit(prompt, currentContent);
    
    res.json({ content });
  } catch (error) {
    next(error);
  }
});

router.post('/commit', commitValidation, async (req, res, next) => {
  try {
    const { filePath, content, message } = req.body;
    
    logger.info(`Committing changes to file: ${filePath}`);
    await gitService.commitChanges(filePath, content, message);
    
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

router.post('/pull', async (req, res, next) => {
  try {
    logger.info('Pulling latest changes');
    await gitService.pullChanges();
    
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

export default router; 