/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/ban-types */
import '@testing-library/jest-dom';
import { createTRPCClient, TRPCClientError } from '@trpc/client';
import AbortController from 'abort-controller';
import bodyParser from 'body-parser';
import express from 'express';
import http from 'http';
import fetch from 'node-fetch';
import * as z from 'zod';
import * as trpc from '../src';

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

describe('errors', () => {
  type Context = {
    user: {
      name: string;
    } | null;
  };
  async function startServer() {
    const createContext = (
      _opts: trpc.CreateExpressContextOptions,
    ): Context => {
      const getUser = () => {
        if (_opts.req.headers.authorization === 'meow') {
          return {
            name: 'KATT',
          };
        }
        return null;
      };

      return {
        user: getUser(),
      };
    };

    const router = trpc.router<Context>().query('hello', {
      input: z
        .object({
          who: z.string(),
        })
        .optional(),
      resolve({ input, ctx }) {
        return {
          text: `hello ${input?.who ?? ctx.user?.name ?? 'world'}`,
        };
      },
    });

    // express implementation
    const app = express();
    app.use(bodyParser.json());

    app.use(
      '/trpc',
      trpc.createExpressMiddleware({
        router,
        createContext,
      }),
    );
    const { server, port } = await new Promise<{
      server: http.Server;
      port: number;
    }>((resolve) => {
      const server = app.listen(0, () => {
        resolve({
          server,
          port: (server.address() as any).port,
        });
      });
    });

    const client = createTRPCClient<typeof router>({
      url: `http://localhost:${port}/trpc`,

      fetchOpts: {
        AbortController: AbortController as any,
        fetch: fetch as any,
      },
    });
    return {
      close: () =>
        new Promise<void>((resolve, reject) =>
          server.close((err) => {
            err ? reject(err) : resolve();
          }),
        ),
      port,
      router,
      client,
    };
  }

  let t: trpc.inferAsyncReturnType<typeof startServer>;
  beforeAll(async () => {
    t = await startServer();
  });
  afterAll(async () => {
    await t.close();
  });

  test('not found route', async () => {
    try {
      await t.client.query('notFound' as any);
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
  });
  test('invalid args', async () => {
    try {
      await t.client.query('hello', { who: 123 as any });
      throw new Error('Did not fail');
    } catch (err) {
      if (!(err instanceof TRPCClientError)) {
        throw new Error('Not TRPCClientError');
      }
      expect(err.res?.status).toBe(400);
    }
  });
});
