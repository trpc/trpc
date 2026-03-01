import { initTRPC } from '@trpc/server';
import superjson from 'superjson';
import { z } from 'zod';
import { fruits } from '../models/fruit.js';

const t = initTRPC.create({
  transformer: superjson,
});

export const appRouter = t.router({
  getFruits: t.procedure.query(() => {
    return fruits;
  }),
  getFruitById: t.procedure.input(z.number()).query((opts) => {
    const fruit = fruits.find((f) => f.id === opts.input);
    if (!fruit) throw new Error('Not found');
    return fruit;
  }),
});

export type AppRouter = typeof appRouter;
