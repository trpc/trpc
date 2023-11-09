import { inferRouterInputs, inferRouterOutputs, initTRPC } from '@trpc/server';
import { z } from 'zod';

const t = initTRPC.create();
const appRouter = t.router({
  str: t.procedure.input(z.string()).query(({ input }) => input),
  strWithMiddleware: t.procedure
    // ^?
    .input(z.string())
    .use((opts) => opts.next())
    .query(({ input }) => input),

  objWithMiddleware: t.procedure
    .input(
      z.object({
        foo: z.string(),
      }),
    )
    .use((opts) => opts.next())
    .query(({ input }) => input),
});
type AppRouter = typeof appRouter;

describe('inferRouterInputs', () => {
  type AppRouterInputs = inferRouterInputs<AppRouter>;
  type AppRouterOutputs = inferRouterOutputs<AppRouter>;

  test('string', async () => {
    {
      type Input = AppRouterInputs['str'];
      type Output = AppRouterOutputs['str'];
      expectTypeOf<Input>().toBeString();
      expectTypeOf<Output>().toBeString();
    }
    {
      type Input = AppRouterInputs['strWithMiddleware'];
      //   ^?
      type Output = AppRouterOutputs['strWithMiddleware'];
      expectTypeOf<Input>().toBeString();
      expectTypeOf<Output>().toBeString();
    }
  });

  test('obj', async () => {
    {
      type Input = AppRouterInputs['objWithMiddleware'];
      type Output = AppRouterOutputs['objWithMiddleware'];
      expectTypeOf<Input>().toEqualTypeOf<{ foo: string }>();
      expectTypeOf<Output>().toEqualTypeOf<{ foo: string }>();
    }
  });
});
