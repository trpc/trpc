import type { Config } from 'drizzle-kit';

const isTurso = process.env.DATABASE_URL?.startsWith('libsql:');

export default {
  schema: './src/db/schema.ts',
  driver: isTurso ? 'turso' : undefined,
  dialect: 'sqlite',
  dbCredentials: { url: process.env.DATABASE_URL! },
} satisfies Config;
