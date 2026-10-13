import postgres from "postgres";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// One-off: widen bookings.ref to char(16) (FR-15.35) and backfill legacy
// ARS-XXXXXXXX refs to ARS-YYYY-NNNNNN. Host/CI-only: the worker image
// doesn't ship packages/db/drizzle, so this cannot run in that container.
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set — refusing to run against default connection settings");
  process.exit(1);
}

// Resolve from the script's own location, not the working directory.
const root = path.dirname(fileURLToPath(import.meta.url));
const migration = fs.readFileSync(path.join(root, "packages/db/drizzle/0001_ref_char16.sql"), "utf8");

const sql = postgres(DATABASE_URL);
try {
  const year = new Date().getFullYear();
  await sql.begin(async (tx) => {
    // DDL + backfill in one transaction: all-or-nothing, and the ALTER's
    // exclusive lock is held through the backfill so live app writes
    // cannot interleave ref allocation.
    await tx.unsafe(migration);
    console.log("Column widened to char(16)");

    // Single-statement backfill: deterministic (created_at, id) ordering,
    // continuing the yearly sequence past the current max. The regex
    // (not LIKE) tolerates char(16) blank padding on already-new refs.
    const updated = await tx`
      WITH ranked AS (
        SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn
        FROM bookings
        WHERE ref !~ '^ARS-[0-9]{4}-[0-9]{6}\\s*$'
      ),
      base AS (
        SELECT COALESCE(MAX((regexp_match(ref, '-([0-9]{6})\\s*$'))[1]::int), 0) AS m
        FROM bookings
        WHERE ref LIKE ${`ARS-${year}-%`}
      )
      UPDATE bookings b
      SET ref = ${`ARS-${year}-`} || lpad((base.m + ranked.rn)::text, 6, '0')
      FROM ranked, base
      WHERE b.id = ranked.id
      RETURNING b.id, b.ref`;
    for (const row of updated) {
      console.log(`Backfilled ${row.id} -> ${row.ref.trim()}`);
    }
    console.log(`Migration complete (${updated.length} backfilled)`);
  });
} catch (e) {
  console.error(e);
  process.exit(1);
} finally {
  await sql.end();
}
