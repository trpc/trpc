import 'server-only';
import { initTRPC, TRPCError } from '@trpc/server';
import { experimental_nextAppDirCaller } from '@trpc/server/adapters/next-app-dir';
import { headers } from 'next/headers';
import { cache } from 'react';
import { auth } from './auth';

export { experimental_redirect as redirect } from '@trpc/server/adapters/next-app-dir';

const t = initTRPC.create();

const createContext = cache(async () => {
  const session = await auth();
  return { user: session?.user };
});

const nextProc = t.procedure
  .use(async (opts) => {
    const ctx = await createContext();

    if (t._config.isDev) {
      // artificial delay in dev
      const waitMs = Math.floor(Math.random() * 400) + 100;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }

    return opts.next({ ctx });
  })
  .experimental_caller(experimental_nextAppDirCaller({}));

/**
 * Public proc
 */
export const publicAction = nextProc;

/**
 * Protected proc
 */
export const protectedAction = nextProc.use(async (opts) => {
  if (!opts.ctx.user) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
    });
  }

  return opts.next({
    ctx: {
      user: opts.ctx.user,
    },
  });
});
