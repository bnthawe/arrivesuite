import { providerFetch } from './http';

export interface WhatsAppConfig {
  phoneNumberId: string;
  accessToken: string;
  template: string;
  sandbox: boolean;
}

export function whatsAppConfigFromEnv(env: NodeJS.ProcessEnv = process.env): WhatsAppConfig {
  const phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID ?? '';
  const accessToken = env.WHATSAPP_ACCESS_TOKEN ?? '';
  return {
    phoneNumberId,
    accessToken,
    template: env.WHATSAPP_TEMPLATE ?? 'ars_booking_confirmed',
    sandbox: !phoneNumberId || !accessToken || accessToken.length < 10,
  };
}

// E.164 digits only; Cloud API rejects spaces and dashes.
export function normalizePhone(phone: string): string {
  return phone.replace(/[^+\d]/g, '');
}

export interface TemplateMessage {
  to: string;
  template: string;
  language?: string;
  bodyParams: string[];
}

export interface TemplateMessageResult {
  messageId: string;
}

// ADR-0019: Meta Cloud API direct, no BSP at launch.
export async function sendTemplateMessage(
  msg: TemplateMessage,
  cfg = whatsAppConfigFromEnv(),
): Promise<TemplateMessageResult> {
  if (cfg.sandbox) {
    console.log(`[whatsapp:sandbox] to=${msg.to} template=${msg.template} params=${JSON.stringify(msg.bodyParams)}`);
    return { messageId: `wamid.sandbox.${Date.now()}` };
  }
  const res = await providerFetch<{ messages: { id: string }[] }>(
    `/${cfg.phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.accessToken}` },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: msg.to,
        type: 'template',
        template: {
          name: msg.template,
          language: { code: msg.language ?? 'en' },
          components: [{ type: 'body', parameters: msg.bodyParams.map((text) => ({ type: 'text', text })) }],
        },
      }),
    },
    { baseUrl: 'https://graph.facebook.com/v21.0', apiKey: cfg.accessToken, provider: 'whatsapp' },
  );
  return { messageId: res.messages[0]?.id ?? '' };
}

export async function sendTextMessage(
  to: string,
  text: string,
  cfg = whatsAppConfigFromEnv(),
): Promise<TemplateMessageResult> {
  if (cfg.sandbox) {
    console.log(`[whatsapp:sandbox] to=${to} text=${text}`);
    return { messageId: `wamid.sandbox.${Date.now()}` };
  }
  const res = await providerFetch<{ messages: { id: string }[] }>(
    `/${cfg.phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.accessToken}` },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: text },
      }),
    },
    { baseUrl: 'https://graph.facebook.com/v21.0', apiKey: cfg.accessToken, provider: 'whatsapp' },
  );
  return { messageId: res.messages?.[0]?.id ?? '' };
}
