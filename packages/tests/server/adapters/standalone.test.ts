import {
  TRPCClientError,
  createTRPCProxyClient,
  httpBatchLink,
} from '@trpc/client/src';
import { TRPCError, initTRPC } from '@trpc/server';
import {
  CreateHTTPHandlerOptions,
  createHTTPServer,
} from '@trpc/server/src/adapters/standalone';
import { AddressInfo } from 'net';
import fetch from 'node-fetch';
import { NetworkInterfaceInfo, networkInterfaces } from 'os';
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
      const info = netInterface as NetworkInterfaceInfo;
      return info.family === 'IPv4' && !info.internal;
    });
  return bestMatch?.address;
}

function createClient(port: number, address: string) {
  return createTRPCProxyClient<typeof router>({
    links: [
      httpBatchLink({
        url: `http://${address}:${port}`,
        AbortController,
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
    server.addListener('error', (err) => reject(err));
    server.addListener('listening', () =>
      resolve({
        ...(server.address() as AddressInfo),
      }),
    );
    server.listen(0, opts.host || '127.0.0.1');
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

  const result = await fetch(`http://${address}:${port}`);
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
