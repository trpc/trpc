import type {
  SignedInAuthObject,
  SignedOutAuthObject,
} from '@clerk/nextjs/dist/api';
import { getAuth } from '@clerk/nextjs/server';
import { TRPCError, initTRPC } from '@trpc/server';
import { FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch';
import { type CreateNextContextOptions } from '@trpc/server/adapters/next';
import { NextRequest } from 'next/server';
import superjson from 'superjson';
import { z } from 'zod';
import { prisma } from '../prisma';

type CreateContextOptions = {
  auth: SignedInAuthObject | SignedOutAuthObject;
};

/**
 * This helper generates the "internals" for a tRPC context. If you need to use it, you can export
 * it from here.
 *
 * Examples of things you may need it for:
 * - testing, so we don't have to mock Next.js' req/res
 * - tRPC's `createSSGHelpers`, where we don't have req/res
 *
 * @see https://create.t3.gg/en/usage/trpc#-servertrpccontextts
 */
const createInnerTRPCContext = (opts: CreateContextOptions) => {
  return {
    auth: opts.auth,
    prisma,
  };
};

/**
 * This is the actual context you will use in your router. It will be used to process every request
 * that goes through your tRPC endpoint.
 *
 * @see https://trpc.io/docs/context
 */
export const createTRPCContext = async (opts: { req: NextRequest }) => {
  return createInnerTRPCContext({
    auth: getAuth(opts.req),
  });
};

const t = initTRPC.context<typeof createTRPCContext>().create({
  transformer: superjson,
});

export const router = t.router;

export const demoProcedure = t.procedure
  .input(z.object({ delay: z.number().optional() }).optional())
  .use(async ({ input, next }) => {
    if (input?.delay)
      await new Promise((resolve) => setTimeout(resolve, input.delay));

    return next();
  });

const isAuthed = t.middleware(({ next, ctx }) => {
  if (!ctx.auth.userId) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }

  return next({
    ctx: {
      auth: ctx.auth,
    },
  });
});

export const protectedProcedure = demoProcedure.use(isAuthed);
