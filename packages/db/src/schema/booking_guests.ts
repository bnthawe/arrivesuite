import { pgTable, uuid, varchar, date, boolean, timestamp, index } from 'drizzle-orm/pg-core';
import { bookings } from './bookings';

// §6.4 booking envelope. PII is scoped to the booking; exports must redact
// passport fields (FR-5.16.42). The provider order is created only after the
// payment is captured, so these rows are the source of truth for ticketing.
export const bookingGuests = pgTable(
  'booking_guests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'cascade' }),
    guestType: varchar('guest_type', { length: 3 }).notNull().default('ADT'),
    firstName: varchar('first_name', { length: 100 }).notNull(),
    lastName: varchar('last_name', { length: 100 }).notNull(),
    dateOfBirth: date('date_of_birth'),
    passportNumber: varchar('passport_number', { length: 50 }),
    passportExpiry: date('passport_expiry'),
    nationality: varchar('nationality', { length: 2 }),
    email: varchar('email', { length: 255 }),
    phoneE164: varchar('phone_e164', { length: 30 }),
    isLead: boolean('is_lead').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    bookingIdx: index('booking_guests_booking_id_idx').on(table.bookingId),
  }),
);
