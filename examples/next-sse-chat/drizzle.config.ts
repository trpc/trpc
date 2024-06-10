import { defineConfig } from 'drizzle-kit';

const DB_URL = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
if (!DB_URL) {
  throw new Error('Missing POSTGRES_URL or DATABASE_URL environment variable');
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/server/db/schema.ts',
  out: './src/server/db/migrations',
  dbCredentials: {
    url: DB_URL,
  },
  tablesFilter: ['sse-chat_*'],
});
