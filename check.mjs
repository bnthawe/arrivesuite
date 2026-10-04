import postgres from "postgres"; const sql = postgres(process.env.DATABASE_URL); const r = await sql`SELECT 1 as ok`; console.log(r); await sql.end();
