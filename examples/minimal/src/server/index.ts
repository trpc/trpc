/**
 * This a minimal tRPC server
 */
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import { observable } from '@trpc/server/observable';
import { z } from 'zod';
import { db } from './db.js';
import { publicProcedure, router } from './trpc.js';

const appRouter = router({
  user: {
    list: publicProcedure.query(async () => {
      // Retrieve users from a datasource, this is an imaginary database
      const users = await db.user.findMany();
      //    ^?
      return users;
    }),
    byId: publicProcedure.input(z.string()).query(async (opts) => {
      const { input } = opts;
      //      ^?
      // Retrieve the user with the given ID
      const user = await db.user.findById(input);
      return user;
    }),
    create: publicProcedure
      .input(z.object({ name: z.string() }))
      .mutation(async (opts) => {
        const { input } = opts;
        //      ^?
        // Create a new user in the database
        const user = await db.user.create(input);
        //    ^?
        return user;
      }),
  },
  examples: {
    iterable: publicProcedure.query(async function* () {
      for (let i = 0; i < 3; i++) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        yield i;
      }
    }),
  },
});

// Export type router type signature, this is used by the client.
export type AppRouter = typeof appRouter;

const server = createHTTPServer({
  router: appRouter,
});

server.listen(3000);
