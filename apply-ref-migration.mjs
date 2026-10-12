import postgres from "postgres";
import fs from "fs";
const sql = postgres(process.env.DATABASE_URL);
try {
  // 1. Widen the column (FR-15.35).
  const migration = fs.readFileSync("packages/db/drizzle/0001_ref_char16.sql", "utf8");
  await sql.unsafe(migration);
  console.log("Column widened to char(16)");

  // 2. Backfill legacy ARS-XXXXXXXX refs to ARS-YYYY-NNNNNN, preserving order.
  const rows = await sql`SELECT id FROM bookings WHERE ref NOT LIKE 'ARS-____-______' ORDER BY created_at`;
  const year = new Date().getFullYear();
  const pattern = `ARS-${year}-%`;
  const existing = await sql`SELECT ref FROM bookings WHERE ref LIKE ${pattern} ORDER BY ref DESC LIMIT 1`;
  let next = 1;
  if (existing.length > 0) {
    const m = /-(\d{6})\s*$/.exec(existing[0].ref);
    if (m) next = parseInt(m[1], 10) + 1;
  }
  for (const row of rows) {
    const ref = `ARS-${year}-${String(next).padStart(6, '0')}`;
    await sql`UPDATE bookings SET ref = ${ref} WHERE id = ${row.id}`;
    console.log(`Backfilled ${row.id} -> ${ref}`);
    next += 1;
  }
  console.log("Migration complete");
} catch (e) {
  console.error(e);
  process.exit(1);
} finally {
  await sql.end();
}
