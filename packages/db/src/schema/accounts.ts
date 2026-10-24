import { pgTable, uuid, varchar, text, timestamp } from 'drizzle-orm/pg-core';
import { realmEnum } from './enums';

export const accounts = pgTable('accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').unique(),
  passwordHash: text('password_hash'),
  realm: realmEnum('realm').notNull(),
  name: varchar('name', { length: 255 }),
  phone: varchar('phone', { length: 50 }),
  whatsapp: varchar('whatsapp', { length: 50 }),
  phoneE164: varchar('phone_e164', { length: 20 }).unique(),
  authMethod: varchar('auth_method', { length: 20 }).notNull().default('password'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});