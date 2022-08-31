import { trpc } from '@trpc/server';
import superjson from 'superjson';
import { Context } from './context';

export const t = trpc.context<Context>().options({
  transformer: superjson,
  errorFormatter({ shape }) {
    return shape;
  },
});
