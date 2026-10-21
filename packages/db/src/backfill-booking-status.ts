import postgres from 'postgres';

// Runs after the Drizzle migration transaction commits. PostgreSQL cannot use
// a newly added enum value in the same transaction that adds it, so the
// pending -> pending_payment backfill and default change live here.
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

const sql = postgres(DATABASE_URL, { max: 1 });

try {
  await sql.begin(async (tx) => {
    const migrated = await tx`
      UPDATE bookings
      SET status = 'pending_payment'
      WHERE status = 'pending'
    `;
    await tx`
      ALTER TABLE bookings
      ALTER COLUMN status SET DEFAULT 'pending_payment'
    `;
    console.log(`Booking status backfill: ${migrated.count} rows pending -> pending_payment`);
  });
} finally {
  await sql.end();
}
