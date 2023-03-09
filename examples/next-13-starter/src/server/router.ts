import { initTRPC } from '@trpc/server';
import superjson from 'superjson';
import { z } from 'zod';
import { products, reviews } from './data';

const t = initTRPC.create({
  transformer: superjson,
});
const demoProcedure = t.procedure
  .input(z.object({ delay: z.number().optional() }).optional())
  .use(async ({ input, next }) => {
    if (input?.delay)
      await new Promise((resolve) => setTimeout(resolve, input.delay));

    return next();
  });

export const appRouter = t.router({
  greeting: t.procedure
    .input(
      z.object({
        text: z.string(),
      }),
    )
    .query(async ({ input }) => {
      return `hello ${input.text}`;
    }),

  products: t.router({
    list: demoProcedure
      .input(z.object({ filter: z.string().optional() }).optional())
      .query(async ({ input }) => {
        if (input?.filter) return products.filter((p) => p.id !== input.filter);
        return products;
      }),

    byId: demoProcedure
      .input(z.object({ id: z.string() }))
      .query(async ({ input }) => {
        return products.find((p) => p.id === input.id);
      }),
  }),

  reviews: t.router({
    list: demoProcedure.query(async () => {
      return reviews;
    }),
  }),
});

export type AppRouter = typeof appRouter;
