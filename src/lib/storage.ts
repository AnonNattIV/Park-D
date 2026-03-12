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

function encodeObjectKey(objectKey: string): string {
  return objectKey
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function decodeObjectKey(encodedKey: string): string {
  return encodedKey
    .split('/')
    .map((segment) => decodeURIComponent(segment))
    .join('/');
}

function buildObjectProxyUrl(prefix: string, objectKey: string): string {
  return `${prefix}/${encodeObjectKey(objectKey)}`;
}

function extractObjectKeyByPrefix(
  imageUrl: string | null | undefined,
  prefix: string
): string | null {
  if (!imageUrl || !imageUrl.startsWith(prefix)) {
    return null;
  }

  const encodedKey = imageUrl.slice(prefix.length);
  if (!encodedKey) {
    return null;
  }

  return decodeObjectKey(encodedKey);
}

async function uploadObjectByKey(file: File, objectKey: string): Promise<void> {
  const { bucketName, client } = getStorageConfig();
  const contentType = file.type || 'application/octet-stream';
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
}

async function deleteObjectByKey(objectKey: string | null): Promise<void> {
  if (!objectKey) {
    return;
  }

  const { bucketName, client } = getStorageConfig();
  await client.send(
    new DeleteObjectCommand({
      Bucket: bucketName,
      Key: objectKey,
    })
  );
}

async function getObjectByKey(objectKey: string): Promise<{
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

export function buildProfileImageUrl(objectKey: string): string {
  return buildObjectProxyUrl('/api/profile-image', objectKey);
}

export function extractProfileImageKey(imageUrl: string | null | undefined): string | null {
  return extractObjectKeyByPrefix(imageUrl, '/api/profile-image/');
}

export async function uploadProfileImage(file: File, userId: number): Promise<string> {
  const contentType = file.type || 'application/octet-stream';
  const extension = getFileExtension(file.name, contentType);
  const objectKey = `profiles/${userId}/${Date.now()}-${sanitizeFilename(
    file.name || `upload.${extension}`
  )}`;
  await uploadObjectByKey(file, objectKey);

  return buildProfileImageUrl(objectKey);
}

export async function deleteProfileImageByUrl(
  imageUrl: string | null | undefined
): Promise<void> {
  const objectKey = extractProfileImageKey(imageUrl);
  await deleteObjectByKey(objectKey);
}

export async function getProfileImageByKey(objectKey: string): Promise<{
  body: Uint8Array;
  contentType: string;
}> {
  return getObjectByKey(objectKey);
}

export function buildParkingLotImageUrl(objectKey: string): string {
  return buildObjectProxyUrl('/api/parking-lot-image', objectKey);
}

export function extractParkingLotImageKey(imageUrl: string | null | undefined): string | null {
  return extractObjectKeyByPrefix(imageUrl, '/api/parking-lot-image/');
}

export async function uploadParkingLotImage(
  file: File,
  ownerUserId: number,
  lotId: number,
  index: number
): Promise<string> {
  const contentType = file.type || 'application/octet-stream';
  const extension = getFileExtension(file.name, contentType);
  const objectKey = `parking-lots/${ownerUserId}/${lotId}/${Date.now()}-${index}-${sanitizeFilename(
    file.name || `image.${extension}`
  )}`;

  await uploadObjectByKey(file, objectKey);
  return buildParkingLotImageUrl(objectKey);
}

export async function deleteParkingLotImageByUrl(
  imageUrl: string | null | undefined
): Promise<void> {
  const objectKey = extractParkingLotImageKey(imageUrl);
  await deleteObjectByKey(objectKey);
}

export async function getParkingLotImageByKey(objectKey: string): Promise<{
  body: Uint8Array;
  contentType: string;
}> {
  return getObjectByKey(objectKey);
}

export function buildParkingLotEvidenceUrl(objectKey: string): string {
  return buildObjectProxyUrl('/api/parking-lot-evidence', objectKey);
}

export function extractParkingLotEvidenceKey(
  fileUrl: string | null | undefined
): string | null {
  return extractObjectKeyByPrefix(fileUrl, '/api/parking-lot-evidence/');
}

export async function uploadParkingLotEvidence(
  file: File,
  ownerUserId: number,
  lotId: number
): Promise<string> {
  const contentType = file.type || 'application/octet-stream';
  const extension = getFileExtension(file.name, contentType);
  const objectKey = `parking-lot-evidence/${ownerUserId}/${lotId}/${Date.now()}-${sanitizeFilename(
    file.name || `evidence.${extension}`
  )}`;

  await uploadObjectByKey(file, objectKey);
  return buildParkingLotEvidenceUrl(objectKey);
}

export async function deleteParkingLotEvidenceByUrl(
  fileUrl: string | null | undefined
): Promise<void> {
  const objectKey = extractParkingLotEvidenceKey(fileUrl);
  await deleteObjectByKey(objectKey);
}

export async function getParkingLotEvidenceByKey(objectKey: string): Promise<{
  body: Uint8Array;
  contentType: string;
}> {
  return getObjectByKey(objectKey);
}

export function buildOwnerRequestEvidenceUrl(objectKey: string): string {
  return buildObjectProxyUrl('/api/owner-request-evidence', objectKey);
}

export function extractOwnerRequestEvidenceKey(
  fileUrl: string | null | undefined
): string | null {
  return extractObjectKeyByPrefix(fileUrl, '/api/owner-request-evidence/');
}

export async function uploadOwnerRequestEvidence(
  file: File,
  userId: number
): Promise<string> {
  const contentType = file.type || 'application/octet-stream';
  const extension = getFileExtension(file.name, contentType);
  const objectKey = `owner-request-evidence/${userId}/${Date.now()}-${sanitizeFilename(
    file.name || `evidence.${extension}`
  )}`;

  await uploadObjectByKey(file, objectKey);
  return buildOwnerRequestEvidenceUrl(objectKey);
}

export async function deleteOwnerRequestEvidenceByUrl(
  fileUrl: string | null | undefined
): Promise<void> {
  const objectKey = extractOwnerRequestEvidenceKey(fileUrl);
  await deleteObjectByKey(objectKey);
}

export async function getOwnerRequestEvidenceByKey(objectKey: string): Promise<{
  body: Uint8Array;
  contentType: string;
}> {
  return getObjectByKey(objectKey);
}

export function buildPaymentProofUrl(objectKey: string): string {
  return buildObjectProxyUrl('/api/payment-proof', objectKey);
}

export function extractPaymentProofKey(imageUrl: string | null | undefined): string | null {
  return extractObjectKeyByPrefix(imageUrl, '/api/payment-proof/');
}

export async function uploadPaymentProof(
  file: File,
  userId: number,
  bookingId: number
): Promise<string> {
  const contentType = file.type || 'application/octet-stream';
  const extension = getFileExtension(file.name, contentType);
  const objectKey = `payments/${userId}/${bookingId}/${Date.now()}-${sanitizeFilename(
    file.name || `proof.${extension}`
  )}`;

  await uploadObjectByKey(file, objectKey);
  return buildPaymentProofUrl(objectKey);
}

export async function deletePaymentProofByUrl(
  imageUrl: string | null | undefined
): Promise<void> {
  const objectKey = extractPaymentProofKey(imageUrl);
  await deleteObjectByKey(objectKey);
}

export async function getPaymentProofByKey(objectKey: string): Promise<{
  body: Uint8Array;
  contentType: string;
}> {
  return getObjectByKey(objectKey);
}

export function buildCheckinProofUrl(objectKey: string): string {
  return buildObjectProxyUrl('/api/checkin-proof', objectKey);
}

export function extractCheckinProofKey(imageUrl: string | null | undefined): string | null {
  return extractObjectKeyByPrefix(imageUrl, '/api/checkin-proof/');
}

export async function uploadCheckinProof(
  file: File,
  userId: number,
  bookingId: number
): Promise<string> {
  const contentType = file.type || 'application/octet-stream';
  const extension = getFileExtension(file.name, contentType);
  const objectKey = `checkins/${userId}/${bookingId}/${Date.now()}-${sanitizeFilename(
    file.name || `checkin.${extension}`
  )}`;

  await uploadObjectByKey(file, objectKey);
  return buildCheckinProofUrl(objectKey);
}

export async function deleteCheckinProofByUrl(
  imageUrl: string | null | undefined
): Promise<void> {
  const objectKey = extractCheckinProofKey(imageUrl);
  await deleteObjectByKey(objectKey);
}

export async function getCheckinProofByKey(objectKey: string): Promise<{
  body: Uint8Array;
  contentType: string;
}> {
  return getObjectByKey(objectKey);
}
