import type http from 'http';
import type { Context } from './__router';
import { router } from './__router';
import { waitError } from '@trpc/server/__tests__/waitError';
import { createTRPCClient, httpBatchLink, TRPCClientError } from '@trpc/client';
import type { AnyRouter } from '@trpc/server';
import * as trpcExpress from '@trpc/server/adapters/express';
import type { NodeHTTPHandlerOptions } from '@trpc/server/adapters/node-http';
import express from 'express';
import fetch from 'node-fetch';

type CreateExpressContextOptions<TRouter extends AnyRouter> =
  NodeHTTPHandlerOptions<TRouter, express.Request, express.Response>;

async function startServer(
  opts?: Partial<CreateExpressContextOptions<typeof router>>,
) {
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
    '/',
    trpcExpress.createExpressMiddleware({
      router,
      createContext,
      ...opts,
    }),
  );
  // not found middleware
  app.use((_req, res, _next) => {
    res.status(404).send({ error: 'Not found' });
  });
  // error middleware
  // eslint-disable-next-line max-params
  const errHandler: express.ErrorRequestHandler = (err, _req, res, _next) => {
    res.status(500).send({ error: err.message });
  };
  app.use(errHandler);

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

  const url = `http://localhost:${port}`;
  const client = createTRPCClient<typeof router>({
    links: [
      httpBatchLink({
        url,
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
    router,
    client,
    url,
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

  // Replace port number in snapshot with <<redacted>>
  if (res[1].url) {
    res[1].url = res[1].url.replace(/:\d+\//, ':<<redacted>>/');
  }

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
        "url": "http://localhost:<<redacted>>/hello,request.info?batch=1&input=%7B%220%22%3A%7B%22who%22%3A%22test%22%7D%7D",
      },
    ]
  `);
});

test('error query', async () => {
  try {
    await t.client.exampleError.query();
  } catch (e) {
    expect(e).toBeInstanceOf(TRPCClientError);
    expect((e as Error).message).toBe('Unexpected error');
  }
});

test('payload too large', async () => {
  const t = await startServer({
    maxBodySize: 100,
  });

  const err = await waitError(
    () => t.client.exampleMutation.mutate({ payload: 'a'.repeat(101) }),
    TRPCClientError<typeof router>,
  );

  expect(err.data?.code).toBe('PAYLOAD_TOO_LARGE');

  // the trpc envelope takes some space so we can't have exactly 100 bytes of payload
  await t.client.exampleMutation.mutate({ payload: 'a'.repeat(75) });

  t.close();
});

test('bad url does not crash server', async () => {
  const t = await startServer({
    router,
  });

  const res = await fetch(`${t.url}`, {
    method: 'GET',
    headers: {
      // use faux host header
      Host: 'hotmail-com.olc.protection.outlook.com%3A25',
    },
  });
  expect(res.ok).toBe(false);

  const json: any = await res.json();

  if (json.error.data.stack) {
    json.error.data.stack = '[redacted]';
  }
  expect(json).toMatchInlineSnapshot(`
    Object {
      "error": Object {
        "code": -32600,
        "data": Object {
          "code": "BAD_REQUEST",
          "httpStatus": 400,
          "stack": "[redacted]",
        },
        "message": "Invalid URL",
      },
    }
  `);

  expect(res.status).toBe(400);

  expect(await t.client.hello.query()).toMatchInlineSnapshot(`
    Object {
      "text": "hello world",
    }
  `);
});
