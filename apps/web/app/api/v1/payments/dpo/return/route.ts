import { handleDpoReturn } from '@/lib/dpo-return';

export async function GET(request: Request) {
  return handleDpoReturn(request);
}
