import { initTRPC } from '@trpc/server';
import { z } from 'zod';

const t = initTRPC.create({
  errorFormatter(opts) {
    const { shape } = opts;
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          opts.error.code === 'BAD_REQUEST'
            ? ((
                opts.error.cause as {
                  issues?: Array<{
                    message: string;
                    path: Array<string | number>;
                  }>;
                }
              )?.issues ?? null)
            : null,
      },
    };
  },
});

export const ErrorFormatterRouter = t.router({
  hello: t.procedure
    .input(z.object({ name: z.string() }))
    .query(({ input }) => `Hello ${input.name}`),
});

export type ErrorFormatterRouter = typeof ErrorFormatterRouter;
