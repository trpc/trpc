import { TRPCError, initTRPC } from '@trpc/server';
import { z } from 'zod';

export type Context = {
  user: {
    name: string;
  } | null;
};

const t = initTRPC.context<Context>().create();

export const router = t.router({
  hello: t.procedure
    .input(
      z
        .object({
          who: z.string().nullish(),
        })
        .nullish(),
    )
    .query(({ input, ctx }) => ({
      text: `hello ${input?.who ?? ctx.user?.name ?? 'world'}`,
    })),
  exampleError: t.procedure.query(() => {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Unexpected error',
    });
  }),
});
