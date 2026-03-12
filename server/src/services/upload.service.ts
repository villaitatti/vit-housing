import multer from 'multer';
import sharp from 'sharp';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs/promises';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const WEBP_QUALITY = 80;

interface ImageProcessingOptions {
  outputDir: string;
  outputSubdir: string;
  minFileSize: number;
  minWidth: number;
  minHeight: number;
  width: number;
  height?: number;
  fit?: keyof sharp.FitEnum;
}

const LISTING_IMAGE_OPTIONS: ImageProcessingOptions = {
  outputDir: path.resolve('uploads/listings'),
  outputSubdir: 'listings',
  minFileSize: 50 * 1024,
  minWidth: 800,
  minHeight: 600,
  width: 1920,
};

const PROFILE_IMAGE_OPTIONS: ImageProcessingOptions = {
  outputDir: path.resolve('uploads/profiles'),
  outputSubdir: 'profiles',
  minFileSize: 10 * 1024,
  minWidth: 128,
  minHeight: 128,
  width: 512,
  height: 512,
  fit: 'cover',
};

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

async function processAndSaveImageVariant(
  buffer: Buffer,
  options: ImageProcessingOptions,
): Promise<{ filePath: string; url: string }> {
  if (buffer.length < options.minFileSize) {
    throw new Error(`File is too small (minimum ${options.minFileSize / 1024}KB).`);
  }

  const metadata = await sharp(buffer).metadata();
  if (
    !metadata.width ||
    !metadata.height ||
    metadata.width < options.minWidth ||
    metadata.height < options.minHeight
  ) {
    throw new Error(`Image is too small. Minimum dimensions: ${options.minWidth}x${options.minHeight} pixels.`);
  }

  await fs.mkdir(options.outputDir, { recursive: true });

  const filename = `${crypto.randomUUID()}.webp`;
  const filePath = `${options.outputSubdir}/${filename}`;
  const absolutePath = path.join(options.outputDir, filename);

  const pipeline = sharp(buffer).rotate().resize({
    width: options.width,
    height: options.height,
    fit: options.fit,
    withoutEnlargement: true,
  });

  await pipeline
    .webp({ quality: WEBP_QUALITY })
    .toFile(absolutePath);

  return { filePath, url: `/uploads/${filePath}` };
}

export async function processAndSaveImage(buffer: Buffer): Promise<{ filePath: string; url: string }> {
  return processAndSaveImageVariant(buffer, LISTING_IMAGE_OPTIONS);
}

export async function processAndSaveProfilePhoto(buffer: Buffer): Promise<{ filePath: string; url: string }> {
  return processAndSaveImageVariant(buffer, PROFILE_IMAGE_OPTIONS);
}

export async function deleteLocalFile(filePath: string): Promise<void> {
  const uploadsDir = path.resolve('uploads');
  const absolutePath = path.resolve(uploadsDir, filePath);

  // Ensure the resolved path is within the uploads directory
  if (!absolutePath.startsWith(uploadsDir + path.sep)) {
    throw new Error('Invalid file path: outside uploads directory');
  }

  try {
    await fs.unlink(absolutePath);
  } catch {
    // File may already be deleted
  }
}
