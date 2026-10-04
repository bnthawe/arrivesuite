import postgres from "postgres"; const sql = postgres(process.env.DATABASE_URL); const r = await sql`SELECT count(*) FROM accounts`; console.log(r[0]); await sql.end();
