import type { QueryProcedure } from '@trpc/core';
import { initTRPC } from '@trpc/server';
import * as z from 'zod';

describe('Serialization of Record types', () => {
  const t = initTRPC.create();
  const appRouter = t.router({
    withDescriptionKey: t.procedure
      .input(
        z.object({
          description: z.string(),
        }),
      )
      .query(({ input }) => {
        expectTypeOf<{ description: string }>(input);
        return { input };
      }),
    maybeDescriptionKey: t.procedure
      .input(
        z.object({
          description: z.string().optional(),
        }),
      )
      .query(({ input }) => {
        expectTypeOf<{ description?: string }>(input);
        return { input };
      }),
  });

  test("Description key doesn't get matched on unsetMarker", async () => {
    expectTypeOf<
      QueryProcedure<{
        input: {
          description: string;
        };
        output: { input: { description: string } };
      }>
    >(appRouter.withDescriptionKey);

    expectTypeOf<
      QueryProcedure<{
        input: {
          description: string;
        };
        output: { input: { description: string } };
      }>
    >(appRouter.maybeDescriptionKey);
  });
});
