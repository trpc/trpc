import * as trpc from '@trpc/server/src/index';
import { z } from 'zod';

export type Context = {
  user: {
    name: string;
  } | null;
};

export const router = trpc
  .router<Context>()
  .query('hello', {
    input: z
      .object({
        who: z.string().nullish(),
      })
      .nullish(),
    resolve({ input, ctx }) {
      return {
        text: `hello ${input?.who ?? ctx.user?.name ?? 'world'}`,
      };
    },
  })
  .interop();
