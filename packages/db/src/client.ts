import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

// Fail fast: postgres(undefined) would silently fall back to default
// connection settings and could hit the wrong database.
// NOTE: CI/Vercel builds need *some* DATABASE_URL present at build time
// (queries never run during build); see .github/workflows/ci.yml.
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set');
}

// postgres.js honors ?sslmode= from the URL itself — no custom logic.
// Local: no param (plain TCP). Neon/prod: ?sslmode=require at minimum,
// ?sslmode=verify-full preferred (system CAs verify the chain).
export const client = postgres(connectionString);

export const db = drizzle(client);
