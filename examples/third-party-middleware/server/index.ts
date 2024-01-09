import { createHTTPServer } from '@trpc/server/adapters/standalone';
import { db } from './db';
import { authProcedure, publicProcedure, router } from './trpc';

const appRouter = router({
  healthcheck: publicProcedure.query((opts) => {
    // No user on context
    opts.ctx;
    //   ^?

    return 'OK';
  }),
  userList: authProcedure.query(async (opts) => {
    // user on context
    console.log('Authed as', opts.ctx.user.name);
    //                                 ^?
    return await db.user.findMany();
  }),
});

// Export type router type signature,
// NOT the router itself.
export type AppRouter = typeof appRouter;

const server = createHTTPServer({
  router: appRouter,
  async createContext(opts) {
    return {
      authToken: opts.req.headers.authorization,
    };
  },
});

server.listen(3000);
