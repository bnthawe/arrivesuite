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
