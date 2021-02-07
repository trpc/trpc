/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/ban-types */
import '@testing-library/jest-dom';
import { TRPCClientError } from '@trpc/client';
import * as z from 'zod';
import * as trpc from '../src';
import { routerToServerAndClient } from './_testHelpers';
import { expectTypeOf } from 'expect-type';

test('mix query and mutation', async () => {
  type Context = {};
  const r = trpc
    .router<Context>()
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
    await r.invoke({
      target: 'queries',
      path: 'q1',
      input: null,
      ctx: {},
    }),
  ).toMatchInlineSnapshot(`"q1res"`);

  expect(
    await r.invoke({
      target: 'queries',
      path: 'q2',
      input: {
        q2: 'hey',
      },
      ctx: {},
    }),
  ).toMatchInlineSnapshot(`"q2res"`);

  expect(
    await r.invoke({
      target: 'mutations',
      path: 'm1',
      input: null,
      ctx: {},
    }),
  ).toMatchInlineSnapshot(`"m1res"`);
});

test('merge', async () => {
  type Context = {};
  const root = trpc.router<Context>().query('helloo', {
    // input: null,
    resolve() {
      return 'world';
    },
  });
  const posts = trpc
    .router<Context>()
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
    await r.invoke({
      target: 'queries',
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

describe('integration tests', () => {
  test('not found route', async () => {
    const { client, close } = routerToServerAndClient(
      trpc.router().query('hello', {
        input: z
          .object({
            who: z.string(),
          })
          .optional(),
        resolve({ input }) {
          return {
            text: `hello ${input?.who ?? 'world'}`,
          };
        },
      }),
    );
    try {
      await client.query('notFound' as any);
      throw new Error('Did not fail');
    } catch (err) {
      if (!(err instanceof TRPCClientError)) {
        throw new Error('Not TRPCClientError');
      }
      expect(err.message).toMatchInlineSnapshot(
        `"No such route \\"notFound\\""`,
      );
      expect(err.res?.status).toBe(404);
    }
    close();
  });

  test('types', async () => {
    type Input = { who: string };
    const { client, close } = routerToServerAndClient(
      trpc.router().query('hello', {
        input: z.object({
          who: z.string(),
        }),
        resolve({ input }) {
          expectTypeOf(input).not.toBeAny();
          expectTypeOf(input).toMatchTypeOf<{ who: string }>();

          return {
            text: `hello ${input?.who ?? 'world'}`,
            input,
          };
        },
      }),
    );

    const res = await client.query('hello', { who: 'katt' });
    expectTypeOf(res.input).toMatchTypeOf<Input>();
    expectTypeOf(res.input).not.toBeAny();

    expectTypeOf(res).toMatchTypeOf<{ input: Input; text: string }>();

    close();
  });
  test('invalid args', async () => {
    const { client, close } = routerToServerAndClient(
      trpc.router().query('hello', {
        input: z
          .object({
            who: z.string(),
          })
          .optional(),
        resolve({ input }) {
          expectTypeOf(input).toMatchTypeOf<{ who: string } | undefined>();
          return {
            text: `hello ${input?.who ?? 'world'}`,
          };
        },
      }),
    );
    try {
      await client.query('hello', { who: 123 as any });
      throw new Error('Did not fail');
    } catch (err) {
      if (!(err instanceof TRPCClientError)) {
        throw new Error('Not TRPCClientError');
      }
      expect(err.res?.status).toBe(400);
    }
    close();
  });
});
