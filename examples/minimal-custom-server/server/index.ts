import { createCustomHandler } from './custom-adapter';
import { createCustomServer } from './custom-server';
import { z } from 'zod';
import { db } from './db';
import { publicProcedure, router, createContext } from './trpc';

const appRouter = router({
  userList: publicProcedure.query(async () => {
    // Retrieve users from a datasource, this is an imaginary database
    const users = await db.user.findMany();
    //    ^?
    return users;
  }),
  userById: publicProcedure.input(z.string()).query(async (opts) => {
    const { input } = opts;
    //      ^?
    // Retrieve the user with the given ID
    const user = await db.user.findById(input);
    return user;
  }),
  userCreate: publicProcedure
    .input(z.object({ name: z.string() }))
    .mutation(async (opts) => {
      const { input } = opts;
      //      ^?
      // Create a new user in the database
      const user = await db.user.create(input);
      //    ^?
      return user;
    }),
});

// Export type router type signature,
// NOT the router itself.
export type AppRouter = typeof appRouter;

const handler = createCustomHandler({
  middleware (req, res, next) {
    res.customMethod('Handler middleware');
    next()
  },
  createContext,
  router: appRouter,
});

createCustomServer((req, res) => {
  // This server now has custom methods
  res.customMethod('Request listner');
  // Do some more custom stuff with your server before calling the custom handler
  // The handler could be middlewear that your server runs
  // In this example, you could just pass handler to createCustomServer directly
  handler(req, res);
}).listen(3000);

