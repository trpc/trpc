import net, { type AddressInfo } from 'net';
import { networkInterfaces } from 'os';
import { createTRPCClient, httpBatchLink, TRPCClientError } from '@trpc/client';
import { TRPCError } from '@trpc/server';
import type {
  CreateHTTPContextOptions,
  CreateHTTPHandlerOptions,
} from '@trpc/server/adapters/standalone';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import { makeAsyncResource } from '@trpc/server/unstable-core-do-not-import';
import fetch from 'node-fetch';
import { z } from 'zod';
import { initTRPC } from './../../../server/src/unstable-core-do-not-import/initTRPC';

const t = initTRPC.create();
const router = t.router({
  hello: t.procedure
    .input(
      z.object({
        who: z.string().nullish(),
      }),
    )
    .query(({ input }) => ({
      text: `hello ${input?.who}`,
    })),
  helloMutation: t.procedure
    .input(z.string())
    .mutation(({ input }) => `hello ${input}`),
  mut: t.procedure.mutation(() => 'mutation'),

  exampleError: t.procedure.query(() => {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Unexpected error',
    });
  }),
});

function findPossibleLocalAddress() {
  const bestMatch = Object.values(networkInterfaces())
    .flat()
    .find((netInterface) => {
      const info = netInterface!;
      return info.family === 'IPv4' && !info.internal;
    });
  return bestMatch?.address;
}

function createClient(port: number, address: string) {
  return createTRPCClient<typeof router>({
    links: [
      httpBatchLink({
        url: `http://${address}:${port}`,
        fetch: fetch as any,
      }),
    ],
  });
}

async function startServer(
  opts: CreateHTTPHandlerOptions<any> & { host?: string },
) {
  const server = createHTTPServer(opts);

  // NOTE: Using custom hostname requires awaiting for `listening` event.
  // Prior to this event, it's not possible to retrieve resolved `port` and `address` values.
  const info = await new Promise<AddressInfo>((resolve, reject) => {
    server.addListener('error', (err) => {
      reject(err);
    });
    server.addListener('listening', () => {
      resolve({
        ...(server.address() as AddressInfo),
      });
    });
    server.listen(0, opts.host ?? '127.0.0.1');
  });

  return makeAsyncResource(
    { port: info.port, address: info.address },
    () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  );
}

test('simple query', async () => {
  await using $ = await startServer({
    router,
  });
  const { port, address } = $;
  const client = createClient(port, address);

  const result = await client.hello.query({ who: 'test' });
  expect(result).toMatchInlineSnapshot(`
    Object {
      "text": "hello test",
    }
  `);
});

test('batched requests in body work correctly', async () => {
  await using $ = await startServer({
    router,
  });
  const { port, address } = $;
  const client = createClient(port, address);

  const res = await Promise.all([
    client.helloMutation.mutate('world'),
    client.helloMutation.mutate('KATT'),
  ]);
  expect(res).toEqual(['hello world', 'hello KATT']);
});

test('error query', async () => {
  await using $ = await startServer({
    router,
  });
  const { port, address } = $;
  const client = createClient(port, address);

  try {
    await client.exampleError.query();
  } catch (e) {
    expect(e).toBeInstanceOf(TRPCClientError);
    expect((e as Error).message).toBe('Unexpected error');
  }
});

test('middleware intercepts request', async () => {
  await using $ = await startServer({
    middleware: (_req, res, _next) => {
      res.statusCode = 419;
      res.end();
      return;
    },
    router,
  });
  const { port, address } = $;

  const result = await fetch(`http://${address}:${port}`, {
    headers: {
      'content-type': 'application/json',
    },
  });
  expect(result.status).toBe(419);
});

test('middleware passes the request', async () => {
  await using $ = await startServer({
    middleware: (_req, _res, next) => {
      return next();
    },
    router,
  });
  const { port, address } = $;
  const client = createClient(port, address);

  const result = await client.hello.query({ who: 'test' });
  expect(result).toMatchInlineSnapshot(`
    Object {
      "text": "hello test",
    }
  `);
});

test('custom host', async () => {
  await using $ = await startServer({
    host: findPossibleLocalAddress(),
    router,
  });
  const { port, address } = $;
  const client = createClient(port, address);

  expect(address).not.toEqual('127.0.0.1');

  const result = await client.hello.query({ who: 'test' });
  expect(result).toMatchInlineSnapshot(`
    Object {
      "text": "hello test",
    }
  `);
});

// https://github.com/trpc/trpc/issues/5522
test('force content-type on mutations', async () => {
  await using $ = await startServer({
    router,
  });
  const { port, address } = $;

  const mutUrl = `http://${address}:${port}/mut`;
  {
    // good
    const result = await fetch(mutUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
    });

    expect(result.ok).toBe(true);
    expect(await result.json()).toMatchInlineSnapshot(`
      Object {
        "result": Object {
          "data": "mutation",
        },
      }
    `);
  }
  {
    // bad
    const result = await fetch(mutUrl, {
      method: 'POST',
    });

    expect(result.ok).toBe(false);

    const json: any = await result.json();
    if (json.error.data.stack) {
      json.error.data.stack = '[redacted]';
    }
    expect(json).toMatchInlineSnapshot(`
      Object {
        "error": Object {
          "code": -32015,
          "data": Object {
            "code": "UNSUPPORTED_MEDIA_TYPE",
            "httpStatus": 415,
            "stack": "[redacted]",
          },
          "message": "Missing content-type header",
        },
      }
    `);
  }
});

test('basePath without a trailing slash', async () => {
  await using $ = await startServer({
    router,
    basePath: '/trpc',
  });
  const { port, address } = $;
  const input = encodeURIComponent(JSON.stringify({ who: 'test' }));

  for (const path of ['/trpc/hello', '/trpc/hello/']) {
    const res = await fetch(`http://${address}:${port}${path}?input=${input}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      result: { data: { text: 'hello test' } },
    });
  }
});

test('bad url does not crash server', async () => {
  await using $ = await startServer({
    router,
  });
  const { port, address } = $;

  const res = await fetch(`http://${address}:${port}`, {
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

  const client = createClient(port, address);

  expect(await client.hello.query({ who: 'test' })).toMatchInlineSnapshot(`
    Object {
      "text": "hello test",
    }
  `);
});

test('recipe: max batch size on the server', async () => {
  const MAX_BATCH_SIZE = 10;

  const t = initTRPC.create();

  const appRouter = t.router({
    hello: t.procedure
      .input(
        z.object({
          who: z.string(),
        }),
      )
      .query(({ input }) => `hello ${input.who}`),
  });

  const server = createHTTPServer({
    router: appRouter,
    maxBatchSize: MAX_BATCH_SIZE,
  });

  server.listen(0);

  const port = (server.address() as AddressInfo).port;

  const client = createTRPCClient<typeof appRouter>({
    links: [
      httpBatchLink({
        url: `http://localhost:${port}`,
      }),
    ],
  });

  // 1 is fine
  const result = await client.hello.query({ who: 'test' });
  expect(result).toBe('hello test');

  // 10 is fine
  const promises1 = Array.from({ length: MAX_BATCH_SIZE }, () =>
    client.hello.query({ who: 'test' }),
  );
  const results1 = await Promise.allSettled(promises1);
  expect(
    results1.every((res) => {
      if (res.status !== 'fulfilled') {
        return false;
      }

      expect(res.value).toBe('hello test');

      return true;
    }),
  ).toBe(true);

  // 11 is too many
  const promises2 = Array.from({ length: MAX_BATCH_SIZE + 1 }, () =>
    client.hello.query({ who: 'test' }),
  );
  const results2 = await Promise.allSettled(promises2);

  expect(
    results2.every((res) => {
      if (res.status !== 'rejected') {
        return false;
      }

      const err = res.reason as TRPCClientError<typeof appRouter>;
      expect(err.data?.code).toBe('BAD_REQUEST');
      expect(err.message).toBe('Batch call exceeds maximum size');

      return true;
    }),
  ).toBe(true);

  server.close();
});

// Regression check: without ending the body stream when the client
// disconnects, this test hangs — the procedure never runs and onError never
// fires
test('calls onError when the client disconnects mid-body', async () => {
  const onError = vi.fn();
  let procedureRan = false;

  const t = initTRPC.create();
  const appRouter = t.router({
    longInput: t.procedure.input(z.string()).mutation(({ input }) => {
      procedureRan = true;
      return input;
    }),
  });

  const server = createHTTPServer({
    router: appRouter,
    onError,
  });

  let receivedRequest = false;
  server.once('request', () => {
    receivedRequest = true;
  });

  server.listen(0);
  const port = (server.address() as AddressInfo).port;

  // a raw socket that sends half of a JSON body and then disconnects
  const socket = net.connect(port, '127.0.0.1');
  try {
    await new Promise<void>((resolve) => socket.once('connect', resolve));

    const body = 'x'.repeat(128);
    socket.write(
      [
        'POST /longInput HTTP/1.1',
        `Host: localhost:${port}`,
        'content-type: application/json',
        // claim more bytes than are sent, so the body can never end cleanly
        `content-length: ${body.length + 1024}`,
        '',
        '',
        body,
      ].join('\r\n'),
    );

    // wait for the server to start handling the request
    await vi.waitFor(() => expect(receivedRequest).toBe(true));

    socket.destroy();

    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1), {
      timeout: 1500,
    });

    // the procedure must not have run with a partial body
    expect(procedureRan).toBe(false);
  } finally {
    socket.destroy();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  }
});
