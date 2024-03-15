import { experimental_createDataLayer } from '@trpc/next/app-dir/server';
import { initTRPC } from '@trpc/server';
import { trpcError } from '@trpc/server/unstable-core-do-not-import';
import { auth } from '~/auth';
import { ZodError } from 'zod';

const t = initTRPC.create({});

export const router = t.router;
export const publicProcedure = t.procedure.experimental_inferErrors();
// .use(async (opts) => {
//   const res = await opts.next();
//   if (!res.ok) {
//     console.error('❌', res.error, res.error.cause);
//   }
//   return res;
// });

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

export const dataLayer = experimental_createDataLayer(t, {
  getValidationError(opts) {
    const cause = opts.error.cause;
    if (!(cause instanceof ZodError)) {
      throw new Error('Unexpected error');
    }
    return {
      fieldErrors: cause.flatten().fieldErrors,
    };
  },
});
