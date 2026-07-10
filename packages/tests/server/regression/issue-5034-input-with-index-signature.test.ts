import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';
import { initTRPC } from '@trpc/server';
import type { Overwrite } from '@trpc/server/unstable-core-do-not-import';
import * as z from 'zod';

export function hardcodedExample() {
  return async (data?: unknown) => {
    return data as { [x: string]: unknown; name: string };
  };
}

const t = initTRPC.create();
const symbol = Symbol();
const appRouter = t.router({
  inputWithIndexSignature: t.procedure
    .input(hardcodedExample())
    .query(({ input }) => input),
  inputWithIndexSignatureAndMiddleware: t.procedure
    .input(hardcodedExample())
    .use((opts) => opts.next())
    .query(({ input }) => input),
  normalInput: t.procedure
    .input(z.object({ name: z.string() }))
    .query(({ input }) => {
      return input;
    }),
  middlewareWithSymbolKey: t.procedure
    .use((opts) =>
      opts.next({
        ctx: {
          foo: 'bar',
          [symbol]: true,
        } as const,
      }),
    )
    .query((opts) => {
      expectTypeOf(opts.ctx).toMatchTypeOf<{
        foo: 'bar';
        [symbol]: true;
      }>();
      return opts.ctx;
    }),
});
type AppRouter = typeof appRouter;

describe('inferRouterInputs/inferRouterOutputs', () => {
  type AppRouterInputs = inferRouterInputs<AppRouter>;
  type AppRouterOutputs = inferRouterOutputs<AppRouter>;

  test('input type with a known key and an index signature', async () => {
    type Input = AppRouterInputs['inputWithIndexSignature'];
    type Output = AppRouterOutputs['inputWithIndexSignature'];
    expectTypeOf<Input>().toEqualTypeOf<{
      [x: string]: unknown;
      name: string;
    }>();
    expectTypeOf<Output>().toEqualTypeOf<{
      [x: string]: unknown;
      [x: number]: unknown;
      name: string;
    }>();
  });

  test('input type with a known key and an index signature and middleware', async () => {
    type Input = AppRouterInputs['inputWithIndexSignatureAndMiddleware'];
    type Output = AppRouterOutputs['inputWithIndexSignatureAndMiddleware'];
    expectTypeOf<Input>().toEqualTypeOf<{
      [x: string]: unknown;
      name: string;
    }>();
    expectTypeOf<Output>().toEqualTypeOf<{
      [x: string]: unknown;
      [x: number]: unknown;
      name: string;
    }>();
  });

  test('normal input as sanity check', async () => {
    type Input = AppRouterInputs['normalInput'];
    type Output = AppRouterOutputs['normalInput'];
    expectTypeOf<Input>().toEqualTypeOf<{ name: string }>();
    expectTypeOf<Output>().toEqualTypeOf<{ name: string }>();
  });

  test('middleware with symbol key', async () => {
    type Input = AppRouterInputs['middlewareWithSymbolKey'];
    type Output = AppRouterOutputs['middlewareWithSymbolKey'];

    expectTypeOf<Output>().toEqualTypeOf<{
      foo: 'bar';
      // symbol is stripped as part of SerializeObject
    }>();
  });

  test('Overwrite util', () => {
    type A = {
      a: string;
    };
    type B = {
      b: string;
      [symbol]: true;
    };
    type C = {
      a: number;
      c: string;
    };

    type AB = Overwrite<A, B>;
    type ABC = Overwrite<AB, C>;

    expectTypeOf<AB>().toEqualTypeOf<{
      a: string;
      b: string;
      [symbol]: true;
    }>();

    expectTypeOf<ABC>().toEqualTypeOf<{
      a: number;
      b: string;
      c: string;
      [symbol]: true;
    }>();
  });
});
