/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/ban-types */
import { router } from '../src';
import * as z from 'zod';

test('hello world', async () => {
  type Context = {
    name: string;
  };
  const r = router<Context>().query('test', {
    // input: null,
    resolve({ ctx }) {
      return {
        hello: 'test' + ctx.name,
      };
    },
  });

  const res = await r.invokeQuery({
    path: 'test',
    ctx: {
      name: 'fest',
    },
    input: undefined,
  });

  expect(res.hello).toBe('test' + 'fest');
});

test('basic zod', async () => {
  type Context = {
    name: string;
  };
  const r = router<Context>().query('test', {
    input: z.object({
      foo: z.string(),
    }),
    resolve({ input }) {
      return {
        foo: input.foo,
      };
    },
  });

  const res = await r.invokeQuery({
    path: 'test',
    ctx: {
      name: 'fest',
    },
    input: {
      foo: 'bar',
    },
  });

  expect(res.foo).toBe('bar');
});
