import { experimental_standaloneMiddleware, initTRPC } from '@trpc/server';
import * as z from 'zod';

test('Fix #4947: standalone middlewares -- inputs are merged properly when using multiple standalone middlewares', () => {
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

  const combinedInputThatSatisfiesBothMiddlewares = schemaA.merge(schemaB);

  t.procedure
    .input(combinedInputThatSatisfiesBothMiddlewares)
    .use(valueAUppercaserMiddleware)
    .use(valueBUppercaserMiddleware)
    .query(
      ({
        input: { valueA, valueB },
        ctx: { valueAUppercase, valueBUppercase },
      }) =>
        `valueA: ${valueA}, valueB: ${valueB}, valueAUppercase: ${valueAUppercase}, valueBUppercase: ${valueBUppercase}`,
    );
});
