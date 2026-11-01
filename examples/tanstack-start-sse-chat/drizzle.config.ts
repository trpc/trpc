import { defineConfig } from 'drizzle-kit';

const DB_URL = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
if (!DB_URL) {
  throw new Error('Missing POSTGRES_URL or DATABASE_URL environment variable');
}

// Migrations can't run through a transaction pooler
const MIGRATIONS_URL = process.env.DIRECT_URL ?? DB_URL;

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/server/db/schema.ts',
  out: './src/server/db/migrations',
  dbCredentials: {
    url: MIGRATIONS_URL,
  },
  migrations: {
    // Keep the migrations table next to the app's tables when the url sets a `search_path`
    schema:
      new URL(MIGRATIONS_URL).searchParams.get('search_path') ?? 'drizzle',
  },
  tablesFilter: ['sse-chat_*'],
});
