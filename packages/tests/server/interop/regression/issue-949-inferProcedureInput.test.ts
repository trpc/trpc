/* eslint-disable @typescript-eslint/ban-types */
// IMPORTANT:
// needs to be imported from compiled output otherwise we get a false-positive
import * as trpc from '@trpc/server';
import { expectTypeOf } from 'expect-type';
import { z } from 'zod';

// https://github.com/trpc/trpc/issues/949
// https://github.com/trpc/trpc/pull/955
test('inferProcedureFromInput regression', async () => {
  type Context = {};
  const appRouter = trpc
    .router<Context>()
    .merge(
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
        .query('noInput', {
          resolve: async () => 'out' as const,
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
    )
    .interop();

  type Mutations = typeof appRouter._def.mutations;
  type Queries = typeof appRouter._def.queries;

  expectTypeOf<
    trpc.inferProcedureInput<Queries['admin.hello']>
  >().toEqualTypeOf<{
    in: string;
  }>();

  expectTypeOf<
    trpc.inferProcedureInput<Queries['admin.noInput']>
  >().toEqualTypeOf<undefined | void>();

  expectTypeOf<
    trpc.inferProcedureOutput<Queries['admin.noInput']>
  >().toEqualTypeOf<'out'>();

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
