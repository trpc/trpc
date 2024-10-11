import type { AddressInfo } from 'net';
import { networkInterfaces } from 'os';
import { createTRPCClient, httpBatchLink, TRPCClientError } from '@trpc/client';
import { initTRPC, TRPCError } from '@trpc/server';
import type { CreateHTTPHandlerOptions } from '@trpc/server/adapters/standalone';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import fetch from 'node-fetch';
import { z } from 'zod';

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

let server: ReturnType<typeof createHTTPServer>;

async function startServer(
  opts: CreateHTTPHandlerOptions<any> & { host?: string },
): Promise<{
  port: number;
  address: string;
}> {
  server = createHTTPServer(opts);

  // NOTE: Using custom hostname requires awaiting for `listening` event.
  // Prior to this event, it's not possible to retrieve resolved `port` and `address` values.
  return new Promise((resolve, reject) => {
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
}

afterEach(async () => {
  if (server) {
    server.close();
  }
});

test('simple query', async () => {
  const { port, address } = await startServer({
    router,
  });
  const client = createClient(port, address);

  const result = await client.hello.query({ who: 'test' });
  expect(result).toMatchInlineSnapshot(`
    Object {
      "text": "hello test",
    }
  `);
});

test('batched requests in body work correctly', async () => {
  const { port, address } = await startServer({
    router,
  });
  const client = createClient(port, address);

  const res = await Promise.all([
    client.helloMutation.mutate('world'),
    client.helloMutation.mutate('KATT'),
  ]);
  expect(res).toEqual(['hello world', 'hello KATT']);
});

test('error query', async () => {
  const { port, address } = await startServer({
    router,
  });
  const client = createClient(port, address);

  try {
    await client.exampleError.query();
  } catch (e) {
    expect(e).toStrictEqual(new TRPCClientError('Unexpected error'));
  }
});

test('middleware intercepts request', async () => {
  const { port, address } = await startServer({
    middleware: (_req, res, _next) => {
      res.statusCode = 419;
      res.end();
      return;
    },
    router,
  });

  const result = await fetch(`http://${address}:${port}`, {
    headers: {
      'content-type': 'application/json',
    },
  });
  expect(result.status).toBe(419);
});

test('middleware passes the request', async () => {
  const { port, address } = await startServer({
    middleware: (_req, _res, next) => {
      return next();
    },
    router,
  });
  const client = createClient(port, address);

  const result = await client.hello.query({ who: 'test' });
  expect(result).toMatchInlineSnapshot(`
    Object {
      "text": "hello test",
    }
  `);
});

test('custom host', async () => {
  const { port, address } = await startServer({
    host: findPossibleLocalAddress(),
    router,
  });
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
  const { port, address } = await startServer({
    router,
  });

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

test('bad url does not crash server', async () => {
  const { port, address } = await startServer({
    router,
  });

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
