import { initTRPC } from '@trpc/server';
import type { QueryProcedure } from '@trpc/server/unstable-core-do-not-import';
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
      .output(
        z.object({
          description: z.string(),
        }),
      )
      .query(({ input }) => {
        expectTypeOf<{ description: string }>(input);
        return input;
      }),
    maybeDescriptionKey: t.procedure
      .input(
        z.object({
          description: z.string().optional(),
        }),
      )
      .output(
        z.object({
          description: z.string().optional(),
        }),
      )
      .query(({ input }) => {
        expectTypeOf<{ description?: string }>(input);
        return input;
      }),
  });

  test("Description key doesn't get matched on unsetMarker", async () => {
    expectTypeOf<
      QueryProcedure<{
        input: {
          description: string;
        };
        output: { description: string };
      }>
    >(appRouter.withDescriptionKey);

    expectTypeOf<
      QueryProcedure<{
        input: {
          description?: string | undefined;
        };
        output: { description?: string | undefined };
      }>
    >(appRouter.maybeDescriptionKey);
  });
});
