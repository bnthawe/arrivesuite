import { pgTable, uuid, varchar, text, timestamp } from 'drizzle-orm/pg-core';
import { suppliers } from './suppliers';

export const contracts = pgTable('contracts', {
  id: uuid('id').primaryKey().defaultRandom(),
  supplierId: uuid('supplier_id')
    .notNull()
    .references(() => suppliers.id, { onDelete: 'restrict' }),
  title: varchar('title', { length: 255 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('draft'),
  documentKey: varchar('document_key', { length: 500 }),
  signerName: varchar('signer_name', { length: 255 }),
  signerEmail: text('signer_email'),
  signedAt: timestamp('signed_at', { withTimezone: true }),
  signatureData: text('signature_data'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
