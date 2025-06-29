/**
 * This is the API-handler of your app that contains all your API routes.
 * On a bigger app, you will probably want to split this file up into multiple files.
 */
import { initTRPC } from '@trpc/server';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import cors from 'cors';
import { z } from 'zod';
import { db } from './db';

const t = initTRPC.create();

const publicProcedure = t.procedure;
const router = t.router;

const appRouter = router({
  user: {
    list: publicProcedure.query(async () => {
      // Retrieve users from a datasource, this is an imaginary database
      const users = await db.user.findMany();
      return users;
    }),
    create: publicProcedure
      .input(z.object({ name: z.string() }))
      .errors({
        NAME_ALREADY_TAKEN: {
          code: 'CONFLICT',
          data: z.object({
            id: z.string(),
          }),
        },
      })
      .mutation(async ({ input, errors }) => {
        // Check if the name is already taken and throw an error if it is
        const userWithSameName = await db.user.findByName(input.name);
        if (userWithSameName) {
          throw new errors.NAME_ALREADY_TAKEN({
            data: {
              id: userWithSameName.id,
            },
          });
        }

        // Create a new user in the database
        const user = await db.user.create(input);
        return user;
      }),
    update: publicProcedure
      .input(z.object({ id: z.string(), name: z.string() }))
      .errors({
        NAME_ALREADY_TAKEN: {
          code: 'CONFLICT',
          data: z.object({
            id: z.string(),
          }),
        },
        USER_NOT_FOUND: {
          code: 'NOT_FOUND',
        },
      })
      .mutation(async ({ input, errors }) => {
        // Check if the name is already taken and throw an error if it is
        const userWithSameName = await db.user.findByName(input.name);
        if (userWithSameName && userWithSameName.id !== input.id) {
          throw new errors.NAME_ALREADY_TAKEN({
            data: {
              id: userWithSameName.id,
            },
          });
        }

        // Update the user in the database
        try {
          const user = await db.user.update(input);
          return user;
        } catch (error) {
          throw new errors.USER_NOT_FOUND();
        }
      }),
  },
});

// export only the type definition of the API
// None of the actual implementation is exposed to the client
export type AppRouter = typeof appRouter;

// create server
createHTTPServer({
  middleware: cors(),
  router: appRouter,
  createContext() {
    console.log('context 3');
    return {};
  },
}).listen(2022);
