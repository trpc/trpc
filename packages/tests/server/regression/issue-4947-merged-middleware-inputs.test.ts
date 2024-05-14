import { createTRPCProxyClient } from '@trpc/react-query';
import type { inferRouterInputs } from '@trpc/server';
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

  const router = t.router({
    proc,
  });

  type Inputs = inferRouterInputs<typeof router>;
  expectTypeOf(null as unknown as Inputs['proc']).toEqualTypeOf<{
    valueA: string;
    valueB: string;
    extraProp: string;
  }>();

  const serverSideCaller = router.createCaller({});

  const result = await serverSideCaller.proc({
    valueA: 'a',
    valueB: 'b',
    extraProp: 'extra',
  });

  expect(result).toEqual(
    'valueA: a, valueB: b, extraProp: extra, valueAUppercase: A, valueBUppercase: B',
  );

  const client = createTRPCProxyClient<typeof router>({
    links: [],
  });

  type QueryKey = Parameters<typeof client.proc.query>[0];

  expectTypeOf<{
    valueA: 'a';
    valueB: 'b';
    extraProp: 'extra';
  }>().toMatchTypeOf<QueryKey>();
});
