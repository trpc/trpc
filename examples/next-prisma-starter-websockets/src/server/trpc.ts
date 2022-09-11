import type { Context } from './context';
import superjson from 'superjson';
import { initTRPC } from '@trpc/server';

export const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape }) {
    return shape;
  },
});
