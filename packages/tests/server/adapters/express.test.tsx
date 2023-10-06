import http from 'http';
import { waitError } from '../___testHelpers';
import { Context, router } from './__router';
import {
  createTRPCProxyClient,
  httpBatchLink,
  TRPCClientError,
} from '@trpc/client/src';
import * as trpc from '@trpc/server/src';
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
    };
  };

  // express implementation
  const app = express();

  app.use(
    '/trpc',
    trpcExpress.createExpressMiddleware({
      router,
      createContext,
      maxBodySize: 100, // 100 bytes
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

  const client = createTRPCProxyClient<typeof router>({
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

let t: trpc.inferAsyncReturnType<typeof startServer>;
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

test('error query', async () => {
  try {
    await t.client.exampleError.query();
  } catch (e) {
    expect(e).toStrictEqual(new TRPCClientError('Unexpected error'));
  }
});

// regression: https://github.com/trpc/trpc/issues/4886
test('regression #4886 payload too large', async () => {
  const err = await waitError(
    t.client.mut.mutate('0'.repeat(101)),
    TRPCClientError<typeof t.router>,
  );
  expect(err).toMatchInlineSnapshot('[TRPCClientError: PAYLOAD_TOO_LARGE]');

  expect(err.data?.code).toBe('PAYLOAD_TOO_LARGE');
});
