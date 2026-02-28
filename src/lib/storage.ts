import 'server-only';

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

type StorageConfig = {
  bucketName: string;
  client: S3Client;
};

let storageConfig: StorageConfig | null = null;

function getStorageConfig(): StorageConfig {
  if (storageConfig) {
    return storageConfig;
  }

  storageConfig = {
    bucketName: getRequiredEnv('AWS_S3_BUCKET_NAME'),
    client: new S3Client({
      region: process.env.AWS_DEFAULT_REGION || 'auto',
      endpoint: getRequiredEnv('AWS_ENDPOINT_URL'),
      credentials: {
        accessKeyId: getRequiredEnv('AWS_ACCESS_KEY_ID'),
        secretAccessKey: getRequiredEnv('AWS_SECRET_ACCESS_KEY'),
      },
    }),
  };

  return storageConfig;
}

function sanitizeFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, '-');
}

function getFileExtension(filename: string, contentType: string): string {
  const parts = filename.split('.');
  const fromName = parts.length > 1 ? parts.pop()?.toLowerCase() : '';

  if (fromName) {
    return fromName;
  }

  if (contentType === 'image/png') {
    return 'png';
  }

  if (contentType === 'image/webp') {
    return 'webp';
  }

  if (contentType === 'image/gif') {
    return 'gif';
  }

  return 'jpg';
}

export function buildProfileImageUrl(objectKey: string): string {
  const encodedKey = objectKey
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');

  return `/api/profile-image/${encodedKey}`;
}

export function extractProfileImageKey(imageUrl: string | null | undefined): string | null {
  if (!imageUrl) {
    return null;
  }

  const prefix = '/api/profile-image/';
  if (!imageUrl.startsWith(prefix)) {
    return null;
  }

  const encodedKey = imageUrl.slice(prefix.length);
  if (!encodedKey) {
    return null;
  }

  return encodedKey
    .split('/')
    .map((segment) => decodeURIComponent(segment))
    .join('/');
}

export async function uploadProfileImage(file: File, userId: number): Promise<string> {
  const { bucketName, client } = getStorageConfig();
  const contentType = file.type || 'application/octet-stream';
  const extension = getFileExtension(file.name, contentType);
  const objectKey = `profiles/${userId}/${Date.now()}-${sanitizeFilename(
    file.name || `upload.${extension}`
  )}`;
  const body = Buffer.from(await file.arrayBuffer());

  await client.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: objectKey,
      Body: body,
      ContentType: contentType,
      ContentLength: body.length,
    })
  );

  return buildProfileImageUrl(objectKey);
}

export async function deleteProfileImageByUrl(
  imageUrl: string | null | undefined
): Promise<void> {
  const { bucketName, client } = getStorageConfig();
  const objectKey = extractProfileImageKey(imageUrl);
  if (!objectKey) {
    return;
  }

  await client.send(
    new DeleteObjectCommand({
      Bucket: bucketName,
      Key: objectKey,
    })
  );
}

export async function getProfileImageByKey(objectKey: string): Promise<{
  body: Uint8Array;
  contentType: string;
}> {
  const { bucketName, client } = getStorageConfig();
  const response = await client.send(
    new GetObjectCommand({
      Bucket: bucketName,
      Key: objectKey,
    })
  );

  if (!response.Body) {
    throw new Error('Object body is empty');
  }

  return {
    body: await response.Body.transformToByteArray(),
    contentType: response.ContentType || 'application/octet-stream',
  };
}
