export function voucherPathFor(ref: string): string {
  const base = process.env.VOUCHER_CDN_BASE ?? '/cdn/tickets';
  return `${base}/${ref}.pdf`;
}
