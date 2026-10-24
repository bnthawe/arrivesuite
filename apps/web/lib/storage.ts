import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import fs from 'node:fs';

export type VoucherStorageMode = 'local' | 'r2';

export function voucherStorageMode(): VoucherStorageMode {
  return process.env.VOUCHER_STORAGE === 'r2' ? 'r2' : 'local';
}

function s3Client(): S3Client {
  return new S3Client({
    region: process.env.S3_REGION ?? 'us-east-1',
    endpoint: process.env.S3_ENDPOINT,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID ?? '',
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
    },
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
  });
}

// Uploads a finished voucher PDF to the R2/S3 bucket. Returns the public
// path. Throws on misconfiguration so callers can fall back to local.
export async function uploadVoucherPdf(ref: string, filePath: string): Promise<string> {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) throw new Error('S3_BUCKET is not configured');
  const key = `cdn/tickets/${ref}.pdf`;
  await s3Client().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: fs.createReadStream(filePath),
      ContentType: 'application/pdf',
    }),
  );
  const base = (process.env.VOUCHER_CDN_BASE ?? '/cdn/tickets').replace(/\/$/, '');
  return `${base}/${ref}.pdf`;
}

export type MediaStorageMode = 'local' | 'r2';

export function mediaStorageMode(): MediaStorageMode {
  return process.env.MEDIA_STORAGE === 'r2' || process.env.VOUCHER_STORAGE === 'r2' ? 'r2' : 'local';
}

// Uploads a media file (image) to R2/S3. Returns the public URL.
// Falls back to local storage path when R2 is not configured.
export async function uploadMedia(key: string, body: Buffer, contentType: string): Promise<string> {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) throw new Error('S3_BUCKET is not configured');
  await s3Client().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
  const base = (process.env.MEDIA_CDN_BASE ?? process.env.VOUCHER_CDN_BASE ?? '/cdn/media').replace(/\/$/, '');
  return `${base}/${key}`;
}
