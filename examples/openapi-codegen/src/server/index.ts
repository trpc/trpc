/**
 * This a minimal tRPC server
 */
import { fileURLToPath } from 'node:url';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import { z } from 'zod';
import { db } from './db.js';
import { publicProcedure, router } from './trpc.js';

export const appRouter = router({
  user: {
    list: publicProcedure.query(async () => {
      const users = await db.user.findMany();
      return users;
    }),
    byId: publicProcedure.input(z.string()).query(async (opts) => {
      const { input } = opts;
      const user = await db.user.findById(input);
      return user;
    }),
    create: publicProcedure
      .input(z.object({ name: z.string() }))
      .mutation(async (opts) => {
        const { input } = opts;
        const user = await db.user.create(input);
        return user;
      }),
  },
});

// Export type router type signature, this is used by the client.
export type AppRouter = typeof appRouter;

export function startServer(port = 3000) {
  const server = createHTTPServer({
    router: appRouter,
  });

  server.listen(port).addListener('listening', () => {
    console.log(`Listening on port ${port}`);
  });

  return server;
}

const scriptPath = (process.argv[1] ?? '').replaceAll('\\', '/');
const modulePath = fileURLToPath(import.meta.url).replaceAll('\\', '/');
const entrypoint =
  scriptPath === modulePath ||
  scriptPath.endsWith('/src/server') ||
  scriptPath.endsWith('/src/server.ts') ||
  scriptPath.endsWith('/src/server/index.ts') ||
  scriptPath.endsWith('/dist/server') ||
  scriptPath.endsWith('/dist/server.js') ||
  scriptPath.endsWith('/dist/server/index.js');

if (entrypoint) {
  startServer();
}
