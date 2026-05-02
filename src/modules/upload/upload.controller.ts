import { Request, Response } from 'express';
import { s3Service } from '../../services/s3.service';

export const uploadController = {
  async uploadFile(req: Request, res: Response) {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file provided' });
      }

      const { folder } = req.body;
      if (!['marketplace', 'social-feed', 'events', 'profiles'].includes(folder)) {
        return res.status(400).json({ error: 'Invalid folder' });
      }

      const imageUrl = await s3Service.uploadFile(
        req.file.buffer,
        req.file.originalname,
        folder,
        req.file.mimetype
      );

      res.json({ imageUrl });
    } catch (error) {
      console.error('Upload error:', error);
      res.status(500).json({ error: 'Upload failed' });
    }
  }
};
