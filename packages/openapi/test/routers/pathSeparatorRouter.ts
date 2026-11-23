import { initTRPC } from '@trpc/server';
import { z } from 'zod';

const t = initTRPC.create({ pathSeparator: '~' });

export const AppRouter = t.router({
  post: t.router({
    byId: t.procedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => input),
  }),
});
