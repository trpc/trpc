/**
 * This file contains the tRPC http response handler and context creation for Next.js
 */
import { PrismaClient } from '@prisma/client';
import * as trpc from '@trpc/server';
import * as trpcNext from '@trpc/server/adapters/next';
import { postsRouter } from 'routers/posts';

const prisma = new PrismaClient();

/**
 * Creates context for an incoming request
 * @link https://trpc.io/docs/context
 */
export const createContext = async (
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  opts: trpcNext.CreateNextContextOptions,
) => {
  return {
    prisma,
  };
};

// Infers the context returned from `createContext`
export type Context = trpc.inferAsyncReturnType<typeof createContext>;

/**
 * Helper function to create a router with context
 */
export function createRouter() {
  return trpc.router<Context>();
}

/**
 * Create your application's root router
 * If you want to use SSG, you need export this
 * @link https://trpc.io/docs/ssg
 * @link https://trpc.io/docs/router
 */
const appRouter = createRouter()
  /**
   * Optionally do custom error (type safe!) formatting
   * @link https://trpc.io/docs/error-formatting
   */
  // .formatError(({ defaultShape, error }) => { })
  .merge('posts.', postsRouter);

export type AppRouter = typeof appRouter;

export default trpcNext.createNextApiHandler({
  router: appRouter,
  createContext,
  /**
   * Data transformer
   * @link https://trpc.io/docs/data-transformers
   */
  // transformer: superjson,

  /**
   * @link https://trpc.io/docs/error-handling
   */
  onError({ error }) {
    if (error.code === 'INTERNAL_SERVER_ERROR') {
      // send to bug reporting
      console.error('Something went wrong', error);
    }
  },
});
