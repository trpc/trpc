import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
const queryClient = postgres(process.env.POSTGRES_URL!);
export const db = drizzle(queryClient, { schema });
