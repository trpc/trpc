import { EventEmitter } from 'events';
import * as http from 'http';
import type { AddressInfo } from 'net';
import type { inferRouterOutputs } from '@trpc/server';
import { initTRPC } from '@trpc/server';
import * as trpcNext from '@trpc/server/adapters/next';
import type { TRPCErrorResponse, TRPCSuccessResponse } from '@trpc/server/rpc';
import type { DefaultErrorShape } from '@trpc/server/unstable-core-do-not-import';
import { createDeferred } from '@trpc/server/unstable-core-do-not-import';
// @ts-expect-error - no types
import _request from 'supertest';

const request = _request as (handler: trpcNext.NextApiHandler) => {
  get: (path: string) => Promise<any>;
};

function createHttpServer(opts: {
  handler: trpcNext.NextApiHandler;
  query: object;
}) {
  const deferred = createDeferred<void>();
  const httpServer = http.createServer((req, res) => {
    const _req = req as any;
    const _res = res as any;

    _req.query = opts.query;

    Promise.resolve(opts.handler(_req, _res)).then(() => {
      deferred.resolve();
    });
  });

  const server = httpServer.listen(0);
  const httpPort = (server.address() as AddressInfo).port;
  const httpUrl = `http://localhost:${httpPort}`;

  return {
    httpUrl,
    close: async () => {
      await deferred.promise;
      server.close();
    },
  };
}

test('bad setup', async () => {
  const t = initTRPC.create();

  const router = t.router({
    hello: t.procedure.query(() => 'world'),
  });

  const server = createHttpServer({
    handler: trpcNext.createNextApiHandler({
      router,
    }),
    query: {},
  });

  const res = await fetch(server.httpUrl);
  const json: TRPCErrorResponse<DefaultErrorShape> = await res.json();

  json.error.data.stack = '[redacted]';

  expect(json).toMatchInlineSnapshot(`
    Object {
      "error": Object {
        "code": -32603,
        "data": Object {
          "code": "INTERNAL_SERVER_ERROR",
          "httpStatus": 500,
          "stack": "[redacted]",
        },
        "message": "Query "trpc" not found - is the file named \`[trpc]\`.ts or \`[...trpc].ts\`?",
      },
    }
  `);

  await server.close();
});

test('ok request', async () => {
  const t = initTRPC.create();

  const router = t.router({
    hello: t.procedure.query(() => 'world'),
  });

  const server = createHttpServer({
    handler: trpcNext.createNextApiHandler({
      router,
    }),
    query: {
      trpc: 'hello',
    },
  });

  const res = await fetch(server.httpUrl);
  const json: TRPCSuccessResponse<inferRouterOutputs<typeof router>['hello']> =
    await res.json();

  expect(json).toMatchInlineSnapshot(`
    Object {
      "result": Object {
        "data": "world",
      },
    }
  `);

  await server.close();
});

test('404', async () => {
  const t = initTRPC.create();

  const router = t.router({
    hello: t.procedure.query(() => 'world'),
  });

  const server = createHttpServer({
    handler: trpcNext.createNextApiHandler({
      router,
    }),
    query: {
      trpc: 'not-found-path',
    },
  });

  const res = await fetch(server.httpUrl);
  const json: TRPCErrorResponse<DefaultErrorShape> = await res.json();
  expect(res.status).toBe(404);

  json.error.data.stack = '[redacted]';

  expect(json).toMatchInlineSnapshot(`
    Object {
      "error": Object {
        "code": -32004,
        "data": Object {
          "code": "NOT_FOUND",
          "httpStatus": 404,
          "path": "not-found-path",
          "stack": "[redacted]",
        },
        "message": "No procedure found on path "not-found-path"",
      },
    }
  `);

  await server.close();
});

test('HEAD request', async () => {
  const t = initTRPC.create();

  const router = t.router({
    hello: t.procedure.query(() => 'world'),
  });

  const server = createHttpServer({
    handler: trpcNext.createNextApiHandler({
      router,
    }),
    query: {
      trpc: 'hello',
    },
  });

  const res = await fetch(server.httpUrl, { method: 'HEAD' });
  expect(res.status).toBe(204);

  await server.close();
});

test('PUT request (fails)', async () => {
  const t = initTRPC.create();

  const router = t.router({
    hello: t.procedure.query(() => 'world'),
  });

  const server = createHttpServer({
    handler: trpcNext.createNextApiHandler({
      router,
    }),
    query: {
      trpc: 'hello',
    },
  });

  const res = await fetch(server.httpUrl, {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
    },
  });
  const json: TRPCErrorResponse<DefaultErrorShape> = await res.json();

  json.error.data.stack = '[redacted]';

  expect(json).toMatchInlineSnapshot(`
    Object {
      "error": Object {
        "code": -32005,
        "data": Object {
          "code": "METHOD_NOT_SUPPORTED",
          "httpStatus": 405,
          "path": "hello",
          "stack": "[redacted]",
        },
        "message": "Unsupported PUT-request to query procedure at path "hello"",
      },
    }
  `);

  expect(res.status).toBe(405);

  await server.close();
});

test('middleware intercepts request', async () => {
  const t = initTRPC.create();

  const router = t.router({
    hello: t.procedure.query(() => 'world'),
  });

  const server = createHttpServer({
    handler: trpcNext.createNextApiHandler({
      middleware: (_req, res) => {
        res.statusCode = 419;
        res.end();
        return;
      },
      router,
    }),
    query: {
      trpc: 'hello',
    },
  });

  const res = await fetch(server.httpUrl, { method: 'PUT' });

  expect(res.status).toBe(419);

  await server.close();
});

test('middleware passes the request', async () => {
  const t = initTRPC.create();

  const router = t.router({
    hello: t.procedure.query(() => 'world'),
  });

  const server = createHttpServer({
    handler: trpcNext.createNextApiHandler({
      router,
    }),
    query: {
      trpc: 'hello',
    },
  });

  const res = await fetch(server.httpUrl);
  const json: TRPCSuccessResponse<inferRouterOutputs<typeof router>['hello']> =
    await res.json();

  expect(json).toMatchInlineSnapshot(`
    Object {
      "result": Object {
        "data": "world",
      },
    }
  `);

  await server.close();
});
