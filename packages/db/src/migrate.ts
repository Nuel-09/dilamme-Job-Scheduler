import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDb, getDatabaseUrl } from './client.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const { db, client } = createDb(getDatabaseUrl());
  console.log('Running migrations...');
  await migrate(db, { migrationsFolder: join(__dirname, '../drizzle') });
  console.log('Migrations complete.');
  await client.end();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
