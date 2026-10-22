import { handleDpoReturn } from '@/lib/dpo-return';

// Browser checkout return path. Keeping the flag in the path avoids relying on
// how DPO appends TransToken/CompanyRef to a URL that already has a query.
export async function GET(request: Request) {
  return handleDpoReturn(request, { forceRedirect: true });
}
