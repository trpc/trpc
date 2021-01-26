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
      foo: 'str',
    },
  });

  expect(res.foo).toBe('bar');
});
describe('input validation', () => {
  // test('basic', async () => {
  //   type Context = {
  //     user?: {
  //       name: string;
  //     };
  //   };
  //   const r = router<Context>().query('test', {
  //     input: z
  //       .object({
  //         who: z.string(),
  //       })
  //       .optional(),
  //     resolve({ ctx, input }) {
  //       return { text: `hello ${input?.who ?? ctx.user?.name ?? 'world'}` };
  //     },
  //   });
  //   {
  //     const res = await r.invokeQuery({})('test', undefined);
  //     expect(res.text).toBe('hello world');
  //   }
  //   {
  //     const res = await r.invokeQuery({})('test', { who: 'katt' });
  //     expect(res.text).toBe('hello katt');
  //   }
  //   {
  //     const res = await r.invokeQuery({
  //       user: {
  //         name: 'katt',
  //       },
  //     })('test', undefined);
  //     expect(res.text).toBe('hello katt');
  //   }
  //   await expect(() => r.invokeQuery({})('test', { who: false as any })).rejects
  //     .toMatchInlineSnapshot(`
  //             [Error: 1 validation issue(s)
  //               Issue #0: invalid_union at
  //               Invalid input
  //             ]
  //           `);
  // });
  // test('fixme: next generation', async () => {
  //   type Context = {};
  //   const r = router<Context>().__fixme_queriesv2({
  //     str: {
  //       input: z.string(),
  //       resolve({ input, ctx }) {
  //         // `input` is untyped :(
  //         console.log({ input, ctx });
  //         return 'hello';
  //       },
  //     },
  //     num: {
  //       input: z.number(),
  //       resolve({ input, ctx }) {
  //         console.log({ input, ctx });
  //         return 1;
  //       },
  //     },
  //   });
  //   const res = await r.invokeQuery({})('str', 'hello');
  //   const res2 = await r.invokeQuery({})('num', 0);
  // });
});
