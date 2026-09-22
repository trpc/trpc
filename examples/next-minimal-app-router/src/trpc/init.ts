import { initTRPC } from '@trpc/server';

/**
 * This context is created for every request and can be used to access
 * request-scoped data such as headers or authentication info.
 */
export const createTRPCContext = async (opts: { headers: Headers }) => {
  // const user = await auth(opts.headers);
  return {
    userId: 'user_123',
  };
};

// Avoid exporting the entire t-object
// since it's not very descriptive.
const t = initTRPC
  .context<Awaited<ReturnType<typeof createTRPCContext>>>()
  .create();

export const createTRPCRouter = t.router;
export const baseProcedure = t.procedure;
