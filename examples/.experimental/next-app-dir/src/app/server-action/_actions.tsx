'use server';

import { experimental_createServerActionHandler } from '@trpc/next/app-dir/server';
import { initTRPC } from '@trpc/server';
import { headers } from 'next/headers';
import superjson from 'superjson';
import { ZodError, z } from 'zod';
import { Context } from '~/server/context';

const t = initTRPC.context<Context>().create({
  transformer: superjson,
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

export const createAction = experimental_createServerActionHandler(t, {
  createContext() {
    return {
      headers: Object.fromEntries(headers()),
    };
  },
});

/**
 * Either inline procedures using trpc's flexible
 * builder api, with input parsers and middleware
 * Wrap the procedure in a `createAction` call to
 * make it server-action friendly
 */
export const testAction = createAction(
  t.procedure
    .input(
      z.object({
        text: z.string().min(1),
      }),
    )
    .mutation(async (opts) => {
      console.log('testMutation called', opts);
      return {
        text: 'Hello world',
        date: new Date(),
      };
    }),
);
