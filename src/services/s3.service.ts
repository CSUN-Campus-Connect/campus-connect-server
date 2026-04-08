import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

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
    folder: 'marketplace' | 'social-feed' | 'events' | 'profiles'
  ): Promise<string> {
    const key = `${folder}/${Date.now()}-${fileName}`;
    
    const command = new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET!,
      Key: key,
      Body: file,
      ContentType: file.toString().includes('PNG') ? 'image/png' : 'image/jpeg',
    });

    await this.s3Client.send(command);
    
    return `https://${process.env.AWS_S3_BUCKET}.s3.amazonaws.com/${key}`;
  }
}

export const s3Service = new S3Service();
