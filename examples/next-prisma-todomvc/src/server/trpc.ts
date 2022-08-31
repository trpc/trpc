import { trpc } from '@trpc/server';
import superjson from 'superjson';
import { Context } from './context';

export const t = trpc.context<Context>().create({
  transformer: superjson,
});
