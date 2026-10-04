import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL);
const [row] = await sql`SELECT PostGIS_Version() as version`;
console.log('✅ Connected to Neon');
console.log('PostGIS:', row.version);
await sql.end();