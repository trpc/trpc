import { inferRouterOutputs, initTRPC } from '@trpc/server/src';
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
  });

  test('Record<string, any> gets inferred on the client as { [x: string]: any }', async () => {
    type Output = inferRouterOutputs<typeof appRouter>['recordStringAny'];
    expectTypeOf<Output>().toEqualTypeOf<{ [x: string]: any }>();
  });

  test('Record<string, unknown> gets inferred on the client as { [x: string]: unknown }', async () => {
    type Output = inferRouterOutputs<typeof appRouter>['recordStringUnknown'];
    expectTypeOf<Output>().toEqualTypeOf<{ [x: string]: unknown }>();
  });

  test('Symbol keys get erased on the client', async () => {
    type Output = inferRouterOutputs<typeof appRouter>['symbolKey'];
    expectTypeOf<Output>().toEqualTypeOf<{
      str: string;
    }>();
  });
});
