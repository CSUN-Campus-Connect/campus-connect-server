import { s3Service } from "../../services/s3.service";

export const uploadMessageAttachment = async (
  file: Buffer,
  fileName: string,
  mimeType: string,
  conversationId: string
): Promise<{ fileUrl: string; fileName: string; fileSize: number; type: string }> => {
  const fileUrl = await s3Service.uploadFile(file, fileName, "messages", mimeType);

  return {
    fileUrl,
    fileName,
    fileSize: file.length,
    type: mimeType.startsWith("image/") ? "image"
        : mimeType.startsWith("audio/") ? "audio"
        : "file",
  };
};