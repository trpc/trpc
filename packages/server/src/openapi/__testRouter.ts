/**
 * Test router used by the OpenAPI generator tests.
 *
 * This file is intentionally placed inside the @trpc/server package so that
 * the TypeScript compiler can resolve all imports correctly when the
 * `trpc-openapi` CLI is called from this directory.
 */
import { z } from 'zod';
import { initTRPC } from '../index';

const t = initTRPC.create();

export const AppRouter = t.router({
  greeting: t.procedure
    .input(z.object({ name: z.string() }))
    .output(z.object({ message: z.string() }))
    .query(({ input }) => ({ message: `Hello ${input.name}` })),

  noInput: t.procedure.query(() => 'hello'),

  echo: t.procedure.input(z.string()).mutation(({ input }) => input),

  user: t.router({
    list: t.procedure.query(() => [{ id: 1, name: 'Alice' }]),
    create: t.procedure
      .input(z.object({ name: z.string(), age: z.number().optional() }))
      .mutation(({ input }) => ({ id: 2, ...input })),
  }),

  simpleCases: {
    nullish: t.procedure
      .input(
        z
          .object({
            name: z.string().nullish(),
          })
          .nullish(),
      )
      .output(
        z
          .object({
            name: z.string().nullish(),
          })
          .nullish(),
      )
      .query((opts) => opts.input),
  },
});

export type AppRouter = typeof AppRouter;
