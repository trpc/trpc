/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/ban-types */
import { router } from '../src';
import * as z from 'zod';

describe('query()', () => {
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
});

test('mix', async () => {
  type Context = {};
  const r = router<Context>()
    .query('q1', {
      // input: null,
      resolve() {
        return 'q1res';
      },
    })
    .query('q2', {
      resolve() {
        return 'q2res';
      },
    })
    .mutation('m1', {
      resolve() {
        return 'm1res';
      },
    });

  expect(
    await r.invokeUntyped({
      target: 'queries',
      path: 'q1',
      input: undefined,
      ctx: {},
    }),
  ).toMatchInlineSnapshot(`"q1res"`);

  expect(
    await r.invokeUntyped({
      target: 'queries',
      path: 'q2',
      input: undefined,
      ctx: {},
    }),
  ).toMatchInlineSnapshot(`"q2res"`);

  expect(
    await r.invokeUntyped({
      target: 'mutations',
      path: 'm1',
      input: undefined,
      ctx: {},
    }),
  ).toMatchInlineSnapshot(`"m1res"`);
});
