import type { Config } from 'drizzle-kit';

export default {
  schema: './src/db/schema.ts',
  driver: 'better-sqlite',
  dbCredentials: {
    url: './db.sqlite',
  },
  verbose: true,
  strict: true,
} satisfies Config;
