import postgres from "postgres";
import fs from "fs";
const sql = postgres(process.env.DATABASE_URL);
const migration = fs.readFileSync("packages/db/drizzle/0000_medical_cable.sql");
try {
  await sql.unsafe(migration.toString());
  console.log("Migration applied");
} catch (e) {
  console.error(e);
  process.exit(1);
} finally {
  await sql.end();
}
