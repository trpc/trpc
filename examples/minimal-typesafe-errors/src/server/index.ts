/**
 * This a minimal tRPC server
 */
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import { z } from 'zod';
import { db } from './db.js';
import { publicProcedure, router } from './trpc.js';

const appRouter = router({
  user: {
    list: publicProcedure.query(async () => {
      // Retrieve users from a datasource, this is an imaginary database
      const users = await db.user.findMany();
      return users;
    }),
    byId: publicProcedure.input(z.string()).query(async ({ input }) => {
      // Retrieve the user with the given ID
      const user = await db.user.findById(input);
      return user;
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
  examples: {
    iterable: publicProcedure
      .errors({
        NUMBER_TOO_HIGH: {
          code: 'INTERNAL_SERVER_ERROR',
          data: z.object({
            number: z.number(),
          }),
        },
      })
      .query(async function* ({ errors }) {
        for (let i = 0; i < 3; i++) {
          await new Promise((resolve) => setTimeout(resolve, 500));
          const number = Math.random();
          if (number > 0.8) {
            throw new errors.NUMBER_TOO_HIGH({ data: { number } });
          }
          yield number;
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
