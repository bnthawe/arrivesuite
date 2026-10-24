import { NextResponse } from 'next/server';
import { requireSupplier } from '@/lib/supplier';
import { traceIdFromRequest } from '@/lib/bookings-core';
import { withIdempotency } from '@/lib/idempotency';
import { mediaStorageMode, uploadMedia } from '@/lib/storage';
import { randomUUID } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export async function POST(request: Request) {
  return withIdempotency(request, { scope: 'supplier.media.upload', audit: false }, async () => {
    const gate = await requireSupplier(request);
    if ('response' in gate) return gate.response;

    const formData = await request.formData();
    const file = formData.get('file');
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: `Unsupported file type: ${file.type}. Allowed: ${[...ALLOWED_TYPES].join(', ')}` },
        { status: 400 },
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB` },
        { status: 400 },
      );
    }

    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
    const key = `media/${gate.supplier.id}/${randomUUID()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    let url: string;
    if (mediaStorageMode() === 'r2') {
      try {
        url = await uploadMedia(key, buffer, file.type);
      } catch (err) {
        console.error('[media] R2 upload failed, falling back to local', err);
        url = await saveLocal(key, buffer);
      }
    } else {
      url = await saveLocal(key, buffer);
    }

    const traceId = traceIdFromRequest(request);
    return NextResponse.json({ url, key, size: file.size, type: file.type, traceId });
  });
}

async function saveLocal(key: string, buffer: Buffer): Promise<string> {
  const dir = path.join(process.cwd(), 'public', 'cdn', 'media', path.dirname(key).replace('media/', ''));
  await mkdir(dir, { recursive: true });
  const filePath = path.join(process.cwd(), 'public', 'cdn', key);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, buffer);
  return `/cdn/media/${key}`;
}