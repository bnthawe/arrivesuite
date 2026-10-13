import QRCode from 'qrcode';

// QR payload is the public booking verification URL (GET-able, no auth).
export function verifyUrlFor(ref: string): string {
  const base = (process.env.APP_URL ?? process.env.BETTER_AUTH_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  return `${base}/api/v1/bookings/${ref}`;
}

export async function qrDataUrl(payload: string): Promise<string> {
  return QRCode.toDataURL(payload, { width: 220, margin: 1 });
}

export function qrPngBuffer(dataUrl: string): Buffer {
  return Buffer.from(dataUrl.split(',')[1], 'base64');
}
