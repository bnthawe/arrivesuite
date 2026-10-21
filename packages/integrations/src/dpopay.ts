import type { DpoCreateTokenRequest, DpoCreateTokenResponse, DpoVerifyResult } from '@arrivesuite/types';
import { ProviderError } from './http';

export interface DpoConfig {
  companyToken: string;
  productServiceId: string;
  serviceServiceId: string;
  baseUrl: string;
  sandbox: boolean;
}

export function dpoConfigFromEnv(env: NodeJS.ProcessEnv = process.env): DpoConfig {
  // Accepts both the DPO_PAY_* names (.env.example) and the shorter Vercel
  // names (DPO_COMPANY_TOKEN / DPO_SERVICE_TYPE) used in production.
  const companyToken = env.DPO_PAY_COMPANY_TOKEN ?? env.DPO_COMPANY_TOKEN ?? '';
  const mode = env.DPO_PAY_MODE;
  const bypass = env.NEXT_PUBLIC_BYPASS_DPO_FOR_DEV === 'true';
  return {
    companyToken,
    productServiceId: env.DPO_PAY_PRODUCT_SERVICE_ID ?? env.DPO_SERVICE_TYPE ?? '',
    serviceServiceId: env.DPO_PAY_SERVICE_SERVICE_ID ?? '',
    baseUrl: env.DPO_PAY_BASE_URL ?? 'https://secure.3gdirectpay.com/API/v6/',
    sandbox: bypass || (mode ? mode !== 'live' : !companyToken || companyToken.includes('xxx')),
  };
}

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function tag(xml: string, name: string): string | null {
  const m = new RegExp(`<${name}>([^<]*)</${name}>`).exec(xml);
  return m ? m[1] : null;
}

function todayServiceDate(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

async function postXml(xml: string, cfg: DpoConfig, timeoutMs = 20_000): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(cfg.baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/xml; charset=utf-8', Accept: 'application/xml' },
      body: xml,
      signal: ctrl.signal,
    });
    if (!res.ok) {
      throw new ProviderError({ provider: 'dpopay', code: 'provider', message: `HTTP ${res.status}`, status: res.status, retryable: res.status >= 500 });
    }
    return await res.text();
  } catch (err) {
    if (err instanceof ProviderError) throw err;
    if ((err as Error)?.name === 'AbortError') {
      throw new ProviderError({ provider: 'dpopay', code: 'timeout', message: 'DPO request timed out' });
    }
    throw new ProviderError({ provider: 'dpopay', code: 'transport', message: (err as Error)?.message ?? 'network error' });
  } finally {
    clearTimeout(timer);
  }
}

// Sandbox test cards (docs): 5436 8862 6984 8367, 4012 8888 8888 1881,
// Amex 3456 7890 1234 564 — expiry any future MM/YY, CVV 123.
export async function createDpoToken(
  req: DpoCreateTokenRequest,
  cfg = dpoConfigFromEnv(),
): Promise<DpoCreateTokenResponse> {
  if (cfg.sandbox) {
    const ref = req.companyRef.replace(/[^A-Za-z0-9-]/g, '').slice(0, 40);
    return { transToken: `dpo-sandbox-${ref}`, transRef: `DPOST${Date.now().toString(36).toUpperCase()}` };
  }
  const xml =
    `<?xml version="1.0" encoding="utf-8"?><API3G>` +
    `<CompanyToken>${esc(cfg.companyToken)}</CompanyToken><Request>createToken</Request>` +
    `<Transaction><PaymentAmount>${esc(req.amountMajor)}</PaymentAmount>` +
    `<PaymentCurrency>${esc(req.currency)}</PaymentCurrency>` +
    `<CompanyRef>${esc(req.companyRef)}</CompanyRef><CompanyRefUnique>0</CompanyRefUnique>` +
    `<PTL>5</PTL>` +
    (req.redirectUrl ? `<RedirectURL>${esc(req.redirectUrl)}</RedirectURL><BackURL>${esc(req.redirectUrl)}</BackURL>` : '') +
    (req.email ? `<customerEmail>${esc(req.email)}</customerEmail>` : '') +
    (req.firstName ? `<customerFirstName>${esc(req.firstName)}</customerFirstName>` : '') +
    (req.lastName ? `<customerLastName>${esc(req.lastName)}</customerLastName>` : '') +
    `</Transaction><Services><Service>` +
    `<ServiceType>${esc(cfg.productServiceId)}</ServiceType>` +
    `<ServiceDescription>${esc(req.serviceDescription)}</ServiceDescription>` +
    `<ServiceDate>${esc(todayServiceDate())}</ServiceDate>` +
    `</Service></Services></API3G>`;

  const resXml = await postXml(xml, cfg);
  const result = tag(resXml, 'Result');
  if (result !== '000') {
    throw new ProviderError({
      provider: 'dpopay',
      code: 'provider',
      message: tag(resXml, 'ResultExplanation') ?? `Result ${result ?? 'unknown'}`,
      retryable: false,
    });
  }
  const transToken = tag(resXml, 'TransToken');
  const transRef = tag(resXml, 'TransRef');
  if (!transToken || !transRef) {
    throw new ProviderError({ provider: 'dpopay', code: 'provider', message: 'Missing TransToken/TransRef', retryable: false });
  }
  return { transToken, transRef };
}

export interface DpoRefundRequest {
  transToken: string;
  amountMajor: string;
  details: string;
  refundRef?: string;
}

export async function refundDpoToken(
  req: DpoRefundRequest,
  cfg = dpoConfigFromEnv(),
): Promise<void> {
  if (cfg.sandbox) return;
  const xml =
    `<?xml version="1.0" encoding="utf-8"?><API3G>` +
    `<Request>refundToken</Request>` +
    `<CompanyToken>${esc(cfg.companyToken)}</CompanyToken>` +
    `<TransactionToken>${esc(req.transToken)}</TransactionToken>` +
    `<refundAmount>${esc(req.amountMajor)}</refundAmount>` +
    `<refundDetails>${esc(req.details)}</refundDetails>` +
    (req.refundRef ? `<refundRef>${esc(req.refundRef)}</refundRef>` : '') +
    `</API3G>`;
  const resXml = await postXml(xml, cfg);
  const result = tag(resXml, 'Result');
  if (result !== '000') {
    throw new ProviderError({
      provider: 'dpopay',
      code: 'provider',
      message: tag(resXml, 'ResultExplanation') ?? `Result ${result ?? 'unknown'}`,
      retryable: false,
    });
  }
}

export function dpoHostedPageUrl(transToken: string): string {
  // Sandbox doc authoritative URL is payv3.php; the v6 reference shows
  // payv2.php — same host, token param identical either way.
  return `https://secure.3gdirectpay.com/payv3.php?ID=${encodeURIComponent(transToken)}`;
}

export async function verifyDpoToken(
  transToken: string,
  cfg = dpoConfigFromEnv(),
): Promise<DpoVerifyResult> {
  if (cfg.sandbox) {
    return {
      paid: transToken.startsWith('dpo-sandbox-'),
      resultCode: '000',
      resultExplanation: 'Transaction Paid',
    };
  }
  const xml =
    `<?xml version="1.0" encoding="utf-8"?><API3G>` +
    `<CompanyToken>${esc(cfg.companyToken)}</CompanyToken><Request>verifyToken</Request>` +
    `<TransactionToken>${esc(transToken)}</TransactionToken></API3G>`;
  const resXml = await postXml(xml, cfg);
  const resultCode = tag(resXml, 'Result') ?? tag(resXml, 'Code') ?? '';
  const resultExplanation = tag(resXml, 'ResultExplanation') ?? tag(resXml, 'Explanation') ?? '';
  // DPO uses 900 for "not paid yet" and 000 for a completed payment, but do
  // not treat a bare 000 as paid if the explanation says otherwise.
  const paid =
    resultCode === '000' &&
    /paid/i.test(resultExplanation) &&
    !/not\s+paid/i.test(resultExplanation);
  return {
    paid,
    resultCode,
    resultExplanation,
    amountMajor: tag(resXml, 'TransactionAmount') ?? undefined,
    currency: tag(resXml, 'TransactionCurrency') ?? undefined,
    approval: tag(resXml, 'TransactionApproval') ?? undefined,
  };
}
