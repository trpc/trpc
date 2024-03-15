import { experimental_createDataLayer } from '@trpc/next/app-dir/server';
import { initTRPC } from '@trpc/server';
import { trpcError } from '@trpc/server/unstable-core-do-not-import';
import { auth } from '~/auth';

const t = initTRPC.create({});

export const router = t.router;
export const publicProcedure = t.procedure.experimental_inferErrors();

export const protectedProcedure = publicProcedure.use(async (opts) => {
  const session = await auth();

  if (!session?.user) {
    return trpcError({
      code: 'UNAUTHORIZED',
    });
  }

  return opts.next({
    ctx: { session },
  });
});

export const dataLayer = experimental_createDataLayer(t, {});
