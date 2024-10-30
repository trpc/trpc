import { experimental_createServerActionHandler } from '@trpc/next/app-dir/server';
import { initTRPC, TRPCError } from '@trpc/server';
import { auth } from '~/auth';
import { transformer } from '~/trpc/shared';
import { headers } from 'next/headers';
import { ZodError } from 'zod';
import type { Context } from './context';

const t = initTRPC.context<Context>().create({
  transformer,
  errorFormatter(opts) {
    const { shape, error } = opts;
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.code === 'BAD_REQUEST' && error.cause instanceof ZodError
            ? error.cause.flatten()
            : null,
      },
    };
  },
});

/**
 * Create a server-side caller
 * @see https://trpc.io/docs/server/server-side-calls
 */
export const createCallerFactory = t.createCallerFactory;

export const router = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = publicProcedure.use((opts) => {
  const { session } = opts.ctx;

  if (!session?.user) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
    });
  }

  return opts.next({ ctx: { session } });
});

export const createAction = experimental_createServerActionHandler(t, {
  async createContext() {
    const session = await auth();

    return {
      session,
      headers: {
        // Pass the cookie header to the API
        cookies: (await headers()).get('cookie') ?? '',
      },
    };
  },
});
