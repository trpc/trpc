import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from './schema';

const turso = createClient({ url: process.env.DATABASE_URL! });
export const db = drizzle(turso, { schema });
