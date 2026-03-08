/**
 * This a minimal tRPC server
 */
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

const server = createHTTPServer({
  router: appRouter,
});

server.listen(3000);
