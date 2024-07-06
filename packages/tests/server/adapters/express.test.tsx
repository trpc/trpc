import type http from 'http';
import { waitError } from '../___testHelpers';
import type { Context } from './__router';
import { router } from './__router';
import { createTRPCClient, httpBatchLink, TRPCClientError } from '@trpc/client';
import * as trpcExpress from '@trpc/server/adapters/express';
import express from 'express';
import fetch from 'node-fetch';

async function startServer(maxBodySize?: number) {
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
      maxBodySize: maxBodySize ?? Infinity,
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

test('batched requests in body work correctly', async () => {
  const res = await Promise.all([
    t.client.helloMutation.mutate('world'),
    t.client.helloMutation.mutate('KATT'),
  ]);
  expect(res).toEqual(['hello world', 'hello KATT']);
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
        "accept": null,
        "calls": Array [
          Object {
            "path": "hello",
          },
          Object {
            "path": "request.info",
          },
        ],
        "connectionParams": null,
        "isBatchCall": true,
        "signal": Object {},
        "type": "query",
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
  const t = await startServer(100);

  const err = await waitError(
    () => t.client.exampleMutation.mutate({ payload: 'a'.repeat(101) }),
    TRPCClientError<typeof router>,
  );

  expect(err.data?.code).toBe('PAYLOAD_TOO_LARGE');

  // the trpc envelope takes some space so we can't have exactly 100 bytes of payload
  await t.client.exampleMutation.mutate({ payload: 'a'.repeat(75) });

  t.close();
});
