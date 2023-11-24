import http from 'http';
import { Context, router } from './__router';
import { createTRPCClient, httpBatchLink, TRPCClientError } from '@trpc/client';
import * as trpcExpress from '@trpc/server/src/adapters/express';
import express from 'express';
import fetch from 'node-fetch';

async function startServer() {
  const createContext = (
    _opts: trpcExpress.CreateExpressContextOptions,
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
      info: _opts.info,
    };
  };

  // express implementation
  const app = express();

  app.use(
    '/trpc',
    trpcExpress.createExpressMiddleware({
      router,
      maxBodySize: 10, // 10 bytes,
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
    links: [
      httpBatchLink({
        url: `http://localhost:${port}/trpc`,
        AbortController,
        fetch: fetch as any,
      }),
    ],
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

let t: Awaited<ReturnType<typeof startServer>>;
beforeAll(async () => {
  t = await startServer();
});
afterAll(async () => {
  await t.close();
});

test('simple query', async () => {
  expect(
    await t.client.hello.query({
      who: 'test',
    }),
  ).toMatchInlineSnapshot(`
    Object {
      "text": "hello test",
    }
  `);
  const res = await t.client.hello.query();
  expect(res).toMatchInlineSnapshot(`
    Object {
      "text": "hello world",
    }
  `);
});

test('request info from context should include both calls', async () => {
  const res = await Promise.all([
    t.client.hello.query({
      who: 'test',
    }),
    t.client.request.info.query(),
  ]);

  expect(res).toMatchInlineSnapshot(`
    Array [
      Object {
        "text": "hello test",
      },
      Object {
        "calls": Array [
          Object {
            "input": Object {
              "who": "test",
            },
            "path": "hello",
            "type": "query",
          },
          Object {
            "path": "request.info",
            "type": "query",
          },
        ],
        "isBatchCall": true,
      },
    ]
  `);
});

test('error query', async () => {
  try {
    await t.client.exampleError.query();
  } catch (e) {
    expect(e).toStrictEqual(new TRPCClientError('Unexpected error'));
  }
});

test('payload too large', async () => {
  try {
    await t.client.exampleMutation.mutate({ payload: 'a'.repeat(100) });
    expect(true).toBe(false); // should not be reached
  } catch (e) {
    expect(e).toStrictEqual(new TRPCClientError('PAYLOAD_TOO_LARGE'));
  }
});
