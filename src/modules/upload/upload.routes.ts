import { Router } from 'express';
import multer from 'multer';
import { uploadController } from './upload.controller';
import { authMiddleware } from '../../middleware/auth.middleware';

const router = Router();
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

router.post('/', authMiddleware, upload.single('file'), uploadController.uploadFile);

export { router as uploadRoutes };
