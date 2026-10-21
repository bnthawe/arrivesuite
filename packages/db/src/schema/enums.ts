import { pgEnum } from 'drizzle-orm/pg-core';

export const realmEnum = pgEnum('realm', ['admin', 'supplier', 'agent', 'customer']);

export const channelEnum = pgEnum('channel', ['web', 'whatsapp', 'api', 'backoffice']);

export const bookingStatusEnum = pgEnum('booking_status', [
  'pending',
  'confirmed',
  'on_hold',
  'cancelled',
  'refunded',
  'expired',
  'failed',
  'no_show',
  'draft',
  'pending_payment',
  'ticketing',
  'ticketed',
  'exchanging',
  'fulfilled',
]);

export const bookingItemStatusEnum = pgEnum('booking_item_status', [
  'reserved',
  'confirmed',
  'cancelled',
  'refunded',
  'expired',
]);

export const tokenPurposeEnum = pgEnum('token_purpose', [
  'email_verification',
  'password_reset',
  'mfa',
  'whatsapp_otp',
]);