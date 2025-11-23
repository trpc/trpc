/**
 * This is your entry point to setup the root configuration for tRPC on the server.
 * - `initTRPC` should only be used once per app.
 * - We export only the functionality that we use so we can enforce which base procedures should be used
 *
 * Learn how to create protected base procedures and other things below:
 * @see https://trpc.io/docs/v11/router
 * @see https://trpc.io/docs/v11/procedures
 */
import { initTRPC } from '@trpc/server';
import { transformer } from '~/trpc/transformer';

/**
 * Shared context helper invoked by both `localLink` during SSR as
 * well as the /trpc/$trpc API route handler for HTTP requests.
 * @returns The context object
 */
export const createTRPCContextInner = async () => {
  //
  return {};
};

const t = initTRPC.context<typeof createTRPCContextInner>().create({
  transformer,
});

/**
 * Unprotected procedure
 **/
export const publicProcedure = t.procedure;

export const createTRPCRouter = t.router;
