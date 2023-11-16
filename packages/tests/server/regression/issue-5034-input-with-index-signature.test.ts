import { inferRouterInputs, inferRouterOutputs, initTRPC } from '@trpc/server';
import * as z from 'zod';

export function hardcodedExample() {
  return async (data?: unknown) => {
    return data as { [x: string]: unknown; name: string };
  };
}

const t = initTRPC.create();
const symbol = Symbol('symbol');
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
    .input(z.object({ name: z.string() }))
    .use((opts) =>
      opts.next({
        ctx: {
          [symbol]: true,
        },
      }),
    )
    .query(({ input }) => {
      return input;
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
    expectTypeOf<Input>().toEqualTypeOf<{ name: string }>();
    expectTypeOf<Output>().toEqualTypeOf<{
      name: string;
      [symbol]: true;
    }>();
  });
});
