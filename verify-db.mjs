import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL);

const tables = await sql`
  SELECT table_name
  FROM information_schema.tables
  WHERE table_schema = 'public'
  ORDER BY table_name
`;
console.log('Tables:');
console.log(tables.map(t => '  ' + t.table_name).join('\n'));

const accounts = await sql`
  SELECT email, realm, LEFT(password_hash, 10) AS hash_prefix
  FROM accounts
  ORDER BY email
`;
console.log('\nAccounts:');
console.log(accounts);

await sql.end();