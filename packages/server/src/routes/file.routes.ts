import { Router } from 'express';
import { FileController } from '../controllers/file.controller';

const router = Router();
const fileController = new FileController();

// Save file content
router.post('/save', (req, res) => fileController.saveFile(req, res));

// Get file content
router.get('/', (req, res) => fileController.getFile(req, res));

export default router; 