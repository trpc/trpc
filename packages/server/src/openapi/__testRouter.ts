/**
 * Test router used by the OpenAPI generator tests.
 *
 * This file is intentionally placed inside the @trpc/server package so that
 * the TypeScript compiler can resolve all imports correctly when the
 * `trpc-openapi` CLI is called from this directory.
 */
import { initTRPC } from '../index';
import { z } from 'zod';

const t = initTRPC.create();

export const AppRouter = t.router({
  greeting: t.procedure
    .input(z.object({ name: z.string() }))
    .output(z.object({ message: z.string() }))
    .query(({ input }) => ({ message: `Hello ${input.name}` })),

  noInput: t.procedure.query(() => 'hello'),

  echo: t.procedure
    .input(z.string())
    .mutation(({ input }) => input),

  user: t.router({
    list: t.procedure.query(() => [{ id: 1, name: 'Alice' }]),
    create: t.procedure
      .input(z.object({ name: z.string(), age: z.number().optional() }))
      .mutation(({ input }) => ({ id: 2, ...input })),
  }),
});
