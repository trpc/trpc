import { TRPCError, initTRPC } from '@trpc/server';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getServerSession } from '~/server/auth';
import { transformer } from '~/trpc/shared';
import { prisma } from '../prisma';

type CreateContextOptions = {
  session: Awaited<ReturnType<typeof getServerSession>>;
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
    session: opts.session,
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
  const session = await getServerSession();

  return createInnerTRPCContext({
    session,
  });
};

const t = initTRPC.context<typeof createTRPCContext>().create({
  transformer,
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
  if (
    !ctx.session?.user?.email ||
    !ctx.session?.user?.name ||
    !ctx.session?.user?.image
  ) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }

  return next({
    ctx: {
      session: {
        user: {
          email: ctx.session.user.email,
          name: ctx.session.user.name,
          image: ctx.session.user.image,
        },
      },
    },
  });
});

export const protectedProcedure = demoProcedure.use(isAuthed);
