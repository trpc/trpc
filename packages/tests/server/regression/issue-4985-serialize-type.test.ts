import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';
import { initTRPC } from '@trpc/server';
import * as z from 'zod';

describe('Serialization of Record types', () => {
  const t = initTRPC.create();
  const appRouter = t.router({
    recordStringAny: t.procedure.output(z.record(z.any())).query(() => {
      return {
        foo: 'bar',
      };
    }),
    recordStringUnknown: t.procedure.output(z.record(z.unknown())).query(() => {
      return {
        foo: 'bar',
      };
    }),
    symbolKey: t.procedure.query(() => {
      return {
        [Symbol('test')]: 'symbol',
        str: 'string',
      };
    }),
    // output serialization behaves differently if the output is inferred vs. given with .output()
    inputWithRecord: t.procedure
      .input(z.record(z.string()))
      .query(({ input }) => input),
    inputWithComplexRecord: t.procedure
      .input(
        z.record(
          z.object({
            name: z.string(),
            age: z.number(),
            symbol: z.symbol(),
          }),
        ),
      )
      .query(({ input }) => input),
  });

  test('Record<string, any> gets inferred on the client as { [x: string]: any }', async () => {
    type Output = inferRouterOutputs<typeof appRouter>['recordStringAny'];
    expectTypeOf<Output>().toEqualTypeOf<Record<string, any>>();
  });

  test('Record<string, unknown> gets inferred on the client as { [x: string]: unknown }', async () => {
    type Output = inferRouterOutputs<typeof appRouter>['recordStringUnknown'];
    expectTypeOf<Output>().toEqualTypeOf<Record<string, unknown>>();
  });

  test('Symbol keys get erased on the client', async () => {
    type Output = inferRouterOutputs<typeof appRouter>['symbolKey'];
    expectTypeOf<Output>().toEqualTypeOf<{
      str: string;
    }>();
  });

  test('input type with a record, returned as inferred output', async () => {
    type Input = inferRouterInputs<typeof appRouter>['inputWithRecord'];
    type Output = inferRouterOutputs<typeof appRouter>['inputWithRecord'];
    expectTypeOf<Input>().toEqualTypeOf<Record<string, string>>();
    expectTypeOf<Output>().toEqualTypeOf<Record<string, string>>();
  });

  test('input type with a complex record, returned as inferred output', async () => {
    type Input = inferRouterInputs<typeof appRouter>['inputWithComplexRecord'];
    type Output = inferRouterOutputs<
      typeof appRouter
    >['inputWithComplexRecord'];
    expectTypeOf<Input>().toEqualTypeOf<
      Record<string, { name: string; age: number; symbol: symbol }>
    >();
    expectTypeOf<Output>().toEqualTypeOf<
      Record<string, { name: string; age: number }>
    >();
  });
});
