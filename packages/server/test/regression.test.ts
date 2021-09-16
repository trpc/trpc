/* eslint-disable @typescript-eslint/no-unused-vars */
import * as trpc from '../dist/trpc-server.cjs';
import { expectTypeOf } from 'expect-type';
import { z } from 'zod';

test('inferProcedureFromInput regression', async () => {
  // eslint-disable-next-line @typescript-eslint/ban-types
  type Context = {};
  const appRouter = trpc.router<Context>().merge(
    'admin.',
    trpc
      .router<Context>()
      .mutation('testMutation', {
        input: z.object({
          in: z.string(),
        }),
        resolve: async () => `out` as const,
      })
      .query('hello', {
        input: z.object({
          in: z.string(),
        }),
        resolve() {
          return 'out' as const;
        },
      })
      .middleware(async ({ next, ctx }) =>
        next({
          ctx: {
            ...ctx,
            _test: '1',
          },
        }),
      )
      .query('hello-2', {
        input: z.object({
          in: z.string(),
        }),
        resolve() {
          return 'out' as const;
        },
      }),
  );

  type Mutations = typeof appRouter._def.mutations;
  type Queries = typeof appRouter._def.queries;

  expectTypeOf<
    trpc.inferProcedureInput<Queries['admin.hello']>
  >().toEqualTypeOf<{
    in: string;
  }>();

  expectTypeOf<
    trpc.inferProcedureInput<Queries['admin.hello-2']>
  >().toEqualTypeOf<{
    in: string;
  }>();

  expectTypeOf<
    trpc.inferProcedureInput<Mutations['admin.testMutation']>
  >().toEqualTypeOf<{ in: string }>();

  expectTypeOf<
    trpc.inferProcedureInput<Mutations['admin.testMutation']>
  >().not.toBeUnknown();
});
