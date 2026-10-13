import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Applies pending files from ./drizzle per meta/_journal.json.
// Run: pnpm --filter @arrivesuite/db db:migrate
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

const root = path.dirname(fileURLToPath(import.meta.url));
const sql = postgres(DATABASE_URL, { max: 1 });

try {
  const db = drizzle(sql);
  await migrate(db, { migrationsFolder: path.join(root, '../drizzle') });
  console.log('Migrations applied');
} catch (e) {
  console.error(e);
  process.exit(1);
} finally {
  await sql.end();
}
