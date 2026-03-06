import multer from 'multer';
import sharp from 'sharp';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs/promises';

const UPLOADS_DIR = path.resolve('uploads/listings');
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MIN_FILE_SIZE = 50 * 1024; // 50KB
const MIN_WIDTH = 800;
const MIN_HEIGHT = 600;
const MAX_WIDTH = 1920;
const WEBP_QUALITY = 80;

export const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, and WebP are allowed.'));
    }
  },
});

export async function processAndSaveImage(buffer: Buffer): Promise<{ filePath: string; url: string }> {
  if (buffer.length < MIN_FILE_SIZE) {
    throw new Error(`File is too small (minimum ${MIN_FILE_SIZE / 1024}KB).`);
  }

  const metadata = await sharp(buffer).metadata();
  if (!metadata.width || !metadata.height || metadata.width < MIN_WIDTH || metadata.height < MIN_HEIGHT) {
    throw new Error(`Image is too small. Minimum dimensions: ${MIN_WIDTH}x${MIN_HEIGHT} pixels.`);
  }

  await fs.mkdir(UPLOADS_DIR, { recursive: true });

  const filename = `${crypto.randomUUID()}.webp`;
  const filePath = `listings/${filename}`;
  const absolutePath = path.join(UPLOADS_DIR, filename);

  await sharp(buffer)
    .resize({ width: MAX_WIDTH, withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY })
    .toFile(absolutePath);

  return { filePath, url: `/uploads/${filePath}` };
}

export async function deleteLocalFile(filePath: string): Promise<void> {
  const absolutePath = path.resolve('uploads', filePath);
  try {
    await fs.unlink(absolutePath);
  } catch {
    // File may already be deleted
  }
}
