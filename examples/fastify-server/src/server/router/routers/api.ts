import { z } from 'zod';
import { t } from '../trpc';

export const apiRouter = t.router({
  version: t.procedure.query(() => {
    return { version: '0.42.0' };
  }),
  hello: t.procedure
    .input(z.object({ username: z.string().nullish() }).nullish())
    .query(({ input, ctx }) => {
      return {
        text: `hello ${input?.username ?? ctx.user?.name ?? 'world'}`,
      };
    }),
});
