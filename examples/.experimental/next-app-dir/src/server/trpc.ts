import { experimental_createServerActionHandler } from '@trpc/next/app-dir/server';
import { initTRPC } from '@trpc/server';
import { headers } from 'next/headers';
import superjson from 'superjson';
import { ZodError } from 'zod';
import { Context } from './context';

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

export const router = t.router;
export const publicProcedure = t.procedure;

export const createAction = experimental_createServerActionHandler(t, {
  createContext() {
    const newHeaders = new Map(headers());

    // If you're using Node 18 before 18.15.0, omit the "connection" header
    newHeaders.delete('connection');

    return {
      headers: Object.fromEntries(newHeaders),
    };
  },
});
