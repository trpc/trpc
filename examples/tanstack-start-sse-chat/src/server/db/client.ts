import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const DB_URL = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
if (!DB_URL) {
  throw new Error('Missing POSTGRES_URL or DATABASE_URL environment variable');
}

/**
 * A connection that isn't behind a transaction pooler, needed for `LISTEN`.
 * Falls back to `DATABASE_URL` when that is already a direct connection.
 */
export const DIRECT_DB_URL = process.env.DIRECT_URL ?? DB_URL;

const queryClient = postgres(DB_URL, {
  // Transaction poolers (e.g. Supabase, PgBouncer) support neither prepared
  // statements nor pipelined queries. With pipelining off, `sql.begin()` can't
  // be used, so don't add transactions without moving off the pooler.
  prepare: false,
  // @ts-expect-error -- supported at runtime but missing from the types
  max_pipeline: 0,
});
export const db = drizzle(queryClient, { schema });
