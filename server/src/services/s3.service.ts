import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getEffectiveConfigValue } from './config.service.js';

let s3Client: S3Client | null = null;

async function getS3Config() {
  const region = await getEffectiveConfigValue('s3', 'region') || process.env.AWS_REGION || 'eu-west-1';
  const accessKeyId = await getEffectiveConfigValue('s3', 'access_key_id') || process.env.AWS_ACCESS_KEY_ID || '';
  const secretAccessKey = await getEffectiveConfigValue('s3', 'secret_access_key') || process.env.AWS_SECRET_ACCESS_KEY || '';
  const bucketName = await getEffectiveConfigValue('s3', 'bucket_name') || process.env.AWS_S3_BUCKET_NAME || '';
  return { region, accessKeyId, secretAccessKey, bucketName };
}

async function getClient(): Promise<{ client: S3Client; bucketName: string; region: string }> {
  const config = await getS3Config();
  if (!s3Client) {
    s3Client = new S3Client({
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }
  return { client: s3Client, bucketName: config.bucketName, region: config.region };
}

export function refreshS3Client(): void {
  s3Client = null;
}

export async function generatePresignedUploadUrl(
  key: string,
  contentType: string,
): Promise<{ uploadUrl: string; s3Key: string; s3Url: string }> {
  const { client, bucketName, region } = await getClient();

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(client, command, { expiresIn: 300 }); // 5 minutes
  const s3Url = `https://${bucketName}.s3.${region}.amazonaws.com/${key}`;

  return { uploadUrl, s3Key: key, s3Url };
}

export async function deleteS3Object(key: string): Promise<void> {
  const { client, bucketName } = await getClient();

  const command = new DeleteObjectCommand({
    Bucket: bucketName,
    Key: key,
  });
  await client.send(command);
}
