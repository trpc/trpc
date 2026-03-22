/**
 * This is a minimal tRPC server focused on declared errors.
 */
import { createTRPCDeclaredError } from '@trpc/server';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import { publicProcedure, router } from './trpc.js';

const UserNotFoundError = createTRPCDeclaredError('UNAUTHORIZED')
  .data<{
    reason: 'USER_NOT_FOUND';
  }>()
  .create({
    constants: {
      reason: 'USER_NOT_FOUND' as const,
    },
  });

const appRouter = router({
  examples: {
    registered: publicProcedure
      // Registering the class means this declared shape is type-safe and preserved for clients.
      .errors([UserNotFoundError])
      .query(() => {
        throw new UserNotFoundError();
      }),
    unregistered: publicProcedure.query(() => {
      // Throwing the same class without registration downgrades it to
      // INTERNAL_SERVER_ERROR and sends it through the formatter.
      throw new UserNotFoundError();
    }),
  },
});

// Export type router type signature, this is used by the client.
export type AppRouter = typeof appRouter;

const server = createHTTPServer({
  router: appRouter,
});

server.listen(3000);
