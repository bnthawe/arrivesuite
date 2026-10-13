import { NextResponse } from 'next/server';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import fs from 'node:fs';
import path from 'node:path';
import { voucherStorageMode } from '@/lib/storage';

const REF_PATTERN = /^[A-Za-z0-9-]{1,32}\.pdf$/;

function localPath(ref: string): string {
  const dir = process.env.VOUCHER_DIR ?? path.join(process.cwd(), 'public', 'cdn', 'tickets');
  return path.join(dir, path.basename(ref));
}

// Serves voucher PDFs at the contract /cdn/tickets/* shape (via rewrite).
// R2 mode streams from the bucket; local mode reads VOUCHER_DIR from disk.
export async function GET(_request: Request, { params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  if (!REF_PATTERN.test(ref)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (voucherStorageMode() === 'r2') {
    const bucket = process.env.S3_BUCKET;
    if (bucket) {
      try {
        const client = new S3Client({
          region: process.env.S3_REGION ?? 'us-east-1',
          endpoint: process.env.S3_ENDPOINT,
          credentials: {
            accessKeyId: process.env.S3_ACCESS_KEY_ID ?? '',
            secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
          },
          forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
        });
        const res = await client.send(
          new GetObjectCommand({ Bucket: bucket, Key: `cdn/tickets/${path.basename(ref)}` }),
        );
        if (res.Body) {
          const bytes = await res.Body.transformToByteArray();
          return new NextResponse(new Blob([bytes as BlobPart], { type: 'application/pdf' }), {
            headers: { 'Content-Disposition': `inline; filename="${path.basename(ref)}"` },
          });
        }
      } catch (err) {
        console.error('[tickets] R2 fetch failed', err);
      }
    }
  }

  const filePath = localPath(ref);
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const data = fs.readFileSync(filePath);
  return new NextResponse(new Blob([new Uint8Array(data)], { type: 'application/pdf' }), {
    headers: { 'Content-Disposition': `inline; filename="${path.basename(ref)}"` },
  });
}
