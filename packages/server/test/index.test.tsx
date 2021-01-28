/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/ban-types */
import * as z from 'zod';
import { router } from '../src';

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
      input: null,
    });

    expect(res.hello).toBe('testfest');
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
      input: z.object({ q2: z.string() }),
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
      input: null,
      ctx: {},
    }),
  ).toMatchInlineSnapshot(`"q1res"`);

  expect(
    await r.invokeUntyped({
      target: 'queries',
      path: 'q2',
      input: {
        q2: 'hey',
      },
      ctx: {},
    }),
  ).toMatchInlineSnapshot(`"q2res"`);

  expect(
    await r.invokeUntyped({
      target: 'mutations',
      path: 'm1',
      input: null,
      ctx: {},
    }),
  ).toMatchInlineSnapshot(`"m1res"`);
});

test('merge', async () => {
  type Context = {};
  const root = router<Context>().query('helloo', {
    // input: null,
    resolve() {
      return 'world';
    },
  });
  const posts = router<Context>()
    .query('list', {
      resolve: () => [{ text: 'initial' }],
    })
    .mutation('create', {
      input: z.string(),
      resolve({ input }) {
        return { text: input };
      },
    });

  const r = root.merge('posts.', posts);
  expect(
    await r.invokeQuery({
      path: 'posts.list',
      input: null,
      ctx: {},
    }),
  ).toMatchInlineSnapshot(`
    Array [
      Object {
        "text": "initial",
      },
    ]
  `);
});
