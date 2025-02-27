import type { CreateNextContextOptions } from '@trpc/server/adapters/next';
import { prisma } from './prisma';

/**
 * Defines your inner context shape.
 * Add fields here that the inner context brings.
 */
export interface CreateInnerContextOptions
  extends Partial<CreateNextContextOptions> {}

/**
 * Inner context. Will always be available in your procedures, in contrast to the outer context.
 *
 * Also useful for:
 * - testing, so you don't have to mock Next.js' `req`/`res`
 * - tRPC's `createSSGHelpers` where we don't have `req`/`res`
 *
 * @see https://trpc.io/docs/v11/context#inner-and-outer-context
 */
export async function createInnerTRPCContext(opts?: CreateInnerContextOptions) {
  return {
    prisma,
    task: prisma.task,
    ...opts,
  };
}

/**
 * Outer context. Used in the routers and will e.g. bring `req` & `res` to the context as "not `undefined`".
 *
 * @see https://trpc.io/docs/v11/context#inner-and-outer-context
 */
export const createTRPCContext = async (opts?: CreateNextContextOptions) => {
  const innerContext = await createInnerTRPCContext({
    req: opts?.req,
  });

  return {
    ...innerContext,
    req: opts?.req,
  };
};
