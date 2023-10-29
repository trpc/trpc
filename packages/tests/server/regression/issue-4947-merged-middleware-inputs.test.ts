import { experimental_standaloneMiddleware, initTRPC } from '@trpc/server';
import * as z from 'zod';

test('Fix #4947: standalone middlewares -- inputs are merged properly when using multiple standalone middlewares', async () => {
  const t = initTRPC.create();
  const schemaA = z.object({ valueA: z.string() });
  const schemaB = z.object({ valueB: z.string() });

  const valueAUppercaserMiddleware = experimental_standaloneMiddleware<{
    input: z.infer<typeof schemaA>;
  }>().create((opts) => {
    return opts.next({
      ctx: { valueAUppercase: opts.input.valueA.toUpperCase() },
    });
  });

  const valueBUppercaserMiddleware = experimental_standaloneMiddleware<{
    input: z.infer<typeof schemaB>;
  }>().create((opts) => {
    return opts.next({
      ctx: { valueBUppercase: opts.input.valueB.toUpperCase() },
    });
  });

  const combinedInputThatSatisfiesBothMiddlewares = z.object({
    valueA: z.string(),
    valueB: z.string(),
    extraProp: z.string(),
  });

  const proc = t.procedure
    .input(combinedInputThatSatisfiesBothMiddlewares)
    .use(valueAUppercaserMiddleware)
    .use(valueBUppercaserMiddleware)
    .query(
      ({
        input: { valueA, valueB, extraProp },
        ctx: { valueAUppercase, valueBUppercase },
      }) =>
        `valueA: ${valueA}, valueB: ${valueB}, extraProp: ${extraProp}, valueAUppercase: ${valueAUppercase}, valueBUppercase: ${valueBUppercase}`,
    );

  expectTypeOf(proc._def._input_in).toEqualTypeOf<{
    valueA: string;
    valueB: string;
    extraProp: string;
  }>();

  expectTypeOf(proc._def._input_out).toEqualTypeOf<{
    valueA: string;
    valueB: string;
    extraProp: string;
  }>();

  const router = t.router({
    proc,
  });

  const caller = router.createCaller({});

  const result = await caller.proc({
    valueA: 'a',
    valueB: 'b',
    extraProp: 'extra',
  });

  expect(result).toEqual(
    'valueA: a, valueB: b, extraProp: extra, valueAUppercase: A, valueBUppercase: B',
  );
});
