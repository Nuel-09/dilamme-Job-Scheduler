import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';
import * as schema from './schema.js';

let client: ReturnType<typeof postgres> | null = null;
let db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDatabaseUrl(): string {
  return process.env.DATABASE_URL ?? 'postgresql://scheduler:scheduler@localhost:5432/job_scheduler';
}

export function createDb(connectionString = getDatabaseUrl()) {
  const pgClient = postgres(connectionString, { max: 10 });
  const database = drizzle(pgClient, { schema });
  return { db: database, client: pgClient };
}

export function getDb() {
  if (!db || !client) {
    const created = createDb();
    client = created.client;
    db = created.db;
  }
  return db;
}

export async function checkDbConnection(): Promise<boolean> {
  try {
    const database = getDb();
    await database.execute(sql`SELECT 1`);
    return true;
  } catch {
    return false;
  }
}

export async function closeDb() {
  if (client) {
    await client.end();
    client = null;
    db = null;
  }
}

export { schema };
