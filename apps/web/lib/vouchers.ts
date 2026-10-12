import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';

export function voucherPathFor(ref: string): string {
  const base = process.env.VOUCHER_CDN_BASE ?? '/cdn/tickets';
  return `${base}/${ref}.pdf`;
}

function ticketsDir(): string {
  // Served statically via public/ in dev and single-container deploys.
  // Production CDN (R2/S3) upload is the go-live follow-up.
  const dir = path.join(process.cwd(), 'public', 'cdn', 'tickets');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export interface VoucherItem {
  label: string;
  itemRef: string;
  quantity: number;
  totalCents: number;
  status: string;
}

export interface VoucherData {
  ref: string;
  status: string;
  currency: string;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  traceId: string | null;
  guestName: string | null;
  providerRefs: { kind: string; providerRef: string; status: string }[];
  items: VoucherItem[];
}

function fmtCents(cents: number, currency: string): string {
  return `${currency} ${(cents / 100).toFixed(2)}`;
}

// Best-effort: callers fall back to the path when generation fails.
export async function generateVoucherPdf(data: VoucherData): Promise<string> {
  const filePath = path.join(ticketsDir(), `${data.ref}.pdf`);
  await new Promise<void>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 56 });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    doc.fontSize(11).fillColor('#666').text('ARRIVESUITE • BOTSWANA');
    doc.moveDown(0.25);
    doc.fontSize(26).fillColor('#111').text(data.ref);
    doc.fontSize(12).fillColor('#333').text(`Status: ${data.status}`);
    if (data.guestName) doc.text(`Guest: ${data.guestName}`);
    doc.moveDown(0.5);

    doc.fontSize(14).text('Items');
    for (const item of data.items) {
      doc.fontSize(11).text(
        `${item.label} × ${item.quantity} — ${fmtCents(item.totalCents, data.currency)} (${item.status})`,
      );
      doc.fontSize(9).fillColor('#666').text(`ref: ${item.itemRef}`);
      doc.fillColor('#111');
    }
    doc.moveDown(0.5);

    doc.fontSize(11).text(`Subtotal: ${fmtCents(data.subtotalCents, data.currency)}`);
    doc.text(`Tax: ${fmtCents(data.taxCents, data.currency)}`);
    doc.fontSize(14).text(`Total: ${fmtCents(data.totalCents, data.currency)}`);
    doc.moveDown(0.5);

    if (data.providerRefs.length > 0) {
      doc.fontSize(14).text('Provider confirmations');
      for (const p of data.providerRefs) {
        doc.fontSize(11).text(`${p.kind}: ${p.providerRef} (${p.status})`);
      }
      doc.moveDown(0.5);
    }

    doc.fontSize(9).fillColor('#666');
    if (data.traceId) doc.text(`trace: ${data.traceId}`);
    doc.text(`Issued ${new Date().toISOString()}`);

    doc.end();
    stream.on('finish', () => resolve());
    stream.on('error', reject);
  });
  return voucherPathFor(data.ref);
}
