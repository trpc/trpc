import { TRPCError, initTRPC } from '@trpc/server';
import { User } from 'next-auth';
import { getServerSession } from 'next-auth/next';
import { z } from 'zod';
import { authOptions } from '~/app/api/auth/[...nextauth]/opts';
import { transformer } from '~/trpc/shared';
import { db } from '../db';

type CreateContextOptions = {
  user: User | null;
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
export const createInnerTRPCContext = (opts: CreateContextOptions) => {
  return {
    user: opts.user,
    db,
  };
};

/**
 * This is the actual context you will use in your router. It will be used to process every request
 * that goes through your tRPC endpoint.
 *
 * @see https://trpc.io/docs/context
 */
export const createTRPCContext = async (opts: { req: Request }) => {
  // const sesh = await getServerSession(authOptions);
  // const token = await getToken({ req: opts.req });

  // FIXME: We need the headers - but server actions just breaks with them...
  // hardcode a user for now
  const user = {
    name: 'Julius Marminge',
    email: 'julius0216@outlook.com',
    image: 'https://avatars.githubusercontent.com/u/51714798?v=4',
    id: '51714798',
  };

  return createInnerTRPCContext({
    user,
  });
};

const t = initTRPC.context<typeof createTRPCContext>().create({
  transformer,
});

export const router = t.router;

export const publicProcedure = t.procedure;

export const demoProcedure = t.procedure
  .input(z.object({ delay: z.number().optional() }).optional())
  .use(async ({ input, next }) => {
    if (input?.delay)
      await new Promise((resolve) => setTimeout(resolve, input.delay));

    return next();
  });

const isAuthed = t.middleware(({ next, ctx }) => {
  if (!ctx.user?.id) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }

  return next({
    ctx: {
      user: {
        id: ctx.user.id,
        email: ctx.user.email,
        name: ctx.user.name,
        image: ctx.user.image,
      },
    },
  });
});

export const protectedProcedure = demoProcedure.use(isAuthed);
