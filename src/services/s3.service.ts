import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import crypto from 'crypto';

class S3Service {
  private s3Client: S3Client;

  constructor() {
    this.s3Client = new S3Client({
      region: process.env.AWS_REGION!,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });
  }

  async uploadFile(
    file: Buffer,
    fileName: string,
    folder: 'marketplace' | 'social-feed' | 'events' | 'profiles' | 'messages',
    mimeType: string
  ): Promise<string> {
    const key = `${folder}/${Date.now()}-${fileName}`;
    
    const command = new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET!,
      Key: key,
      Body: file,
      ContentType: mimeType,
    });

    await this.s3Client.send(command);
    
    return `https://${process.env.AWS_S3_BUCKET}.s3.amazonaws.com/${key}`;
  }

  // Upload dedicated for report encryption
  async uploadEvidence(
    file: Buffer,
    fileName: string,
    reportId: string,
    mimeType: string
  ): Promise<{ url: string; checksum: string }> {
    const checksum = crypto.createHash('sha256').update(file).digest('hex');
    const ext = fileName.split('.').pop() || 'bin';
    const key = `security-reports/${reportId}/${crypto.randomUUID()}.${ext}`;

    const command = new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET!,
      Key: key,
      Body: file,
      ContentType: mimeType,
      ServerSideEncryption: 'AES256',
    });

    await this.s3Client.send(command);

    const url = `https://${process.env.AWS_S3_BUCKET}.s3.amazonaws.com/${key}`;
    return { url, checksum };
  }
}

export const s3Service = new S3Service();