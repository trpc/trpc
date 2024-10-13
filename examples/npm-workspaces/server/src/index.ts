/**
 * This a minimal tRPC server
 */
 
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import appRouter from './app-router.ts';

export type { AppRouter } from "./app-router.ts";

const server = createHTTPServer({ router: appRouter });

server.listen(3000);
