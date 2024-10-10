import { EventEmitter } from 'events';
import { waitFor } from '@testing-library/dom';
import { initTRPC } from '@trpc/server';
import * as trpcNext from '@trpc/server/adapters/next';
import type { TRPCResponse } from '@trpc/server/rpc';
import { createDeferred } from '@trpc/server/unstable-core-do-not-import';
import type { DefaultErrorShape } from '@trpc/server/unstable-core-do-not-import';
// @ts-expect-error - no types
import _request from 'supertest';

const request = _request as (handler: trpcNext.NextApiHandler) => {
  get: (path: string) => Promise<any>;
};

function mockReq({
  query,
  method = 'GET',
  body,
}: {
  query: Record<string, any>;
  method?:
    | 'CONNECT'
    | 'DELETE'
    | 'GET'
    | 'HEAD'
    | 'OPTIONS'
    | 'POST'
    | 'PUT'
    | 'TRACE';
  body?: unknown;
}) {
  const req = new EventEmitter() as trpcNext.NextApiRequest & { socket: any };

  req.method = method;
  req.query = query;
  req.headers = {
    'content-type': 'application/json',
  };

  const socket = {
    destroy: vi.fn(),
  };
  req.socket = socket;

  setTimeout(() => {
    if (body) {
      req.emit('data', JSON.stringify(body));
    }
    req.emit('end');
  });

  return { req, socket };
}
function mockRes() {
  const res = new EventEmitter() as any;

  type ResponseShape = TRPCResponse<unknown, DefaultErrorShape>;
  const waitResponse = createDeferred<ResponseShape | null>();

  const setHeader = vi.fn(() => res);
  const end = vi.fn((data) => {
    if (!data) {
      waitResponse.resolve(null);
      return res;
    }
    const json = JSON.parse(data) as ResponseShape;
    if (json.error?.data.stack) {
      json.error.data.stack = '[redacted]';
    }
    waitResponse.resolve(json);
    return res;
  });
  const write = vi.fn(() => res);
  res.setHeader = setHeader;
  res.end = end;
  res.write = write;
  res.statusCode = 200;

  return {
    res,
    setHeader,
    text: () => {
      return res.write.mock.calls
        .map((args: any) => {
          return new TextDecoder().decode(args[0]);
        })
        .join('');
    },
    waitResponse: waitResponse.promise,
  };
}
test('bad setup', async () => {
  const t = initTRPC.create();

  const router = t.router({
    hello: t.procedure.query(() => 'world'),
  });

  const handler = trpcNext.createNextApiHandler({
    router,
  });

  const { req } = mockReq({ query: {} });
  const { res, waitResponse } = mockRes();

  handler(req, res);

  const json = (await waitResponse)!;

  expect(json.error!.message).toMatchInlineSnapshot(
    `"Query "trpc" not found - is the file named \`[trpc]\`.ts or \`[...trpc].ts\`?"`,
  );
  expect(json.error?.data?.httpStatus).toMatchInlineSnapshot(`500`);
});

describe('ok request', () => {
  const t = initTRPC.create();

  const router = t.router({
    hello: t.procedure.query(() => 'world'),
  });

  const handler = trpcNext.createNextApiHandler({
    router,
  });

  test('[...trpc].ts', async () => {
    const res = await request((req, res) => {
      req.query = { trpc: ['hello'] };
      return handler(req, res);
    }).get('/');

    expect(res.statusCode).toBe(200);

    const json: any = JSON.parse(res.text);
    expect(json).toMatchInlineSnapshot(`
      Object {
        "result": Object {
          "data": "world",
        },
      }
    `);
  });

  test('[trpc].ts', async () => {
    const res = await request((req, res) => {
      req.query = { trpc: 'hello' };
      return handler(req, res);
    }).get('/');

    const json: any = JSON.parse(res.text);
    expect(json).toMatchInlineSnapshot(`
      Object {
        "result": Object {
          "data": "world",
        },
      }
    `);
  });
});

test('404', async () => {
  const t = initTRPC.create();

  const router = t.router({
    hello: t.procedure.query(() => 'world'),
  });

  const handler = trpcNext.createNextApiHandler({
    router,
  });

  const res = await request((req, res) => {
    req.query = { trpc: ['not-found-path'] };
    return handler(req, res);
  }).get('/');

  expect(res.statusCode).toBe(404);
  const json: any = JSON.parse(res.text);

  expect(json.error.message).toMatchInlineSnapshot(
    `"No procedure found on path "not-found-path""`,
  );
});

test('HEAD request', async () => {
  const t = initTRPC.create();

  const router = t.router({
    hello: t.procedure.query(() => 'world'),
  });

  const handler = trpcNext.createNextApiHandler({
    router,
  });

  const { req } = mockReq({
    query: {
      trpc: [],
    },
    method: 'HEAD',
  });
  const { res, waitResponse } = mockRes();

  handler(req, res);
  await waitResponse;

  expect(res.statusCode).toBe(204);
});

test('PUT request (fails)', async () => {
  const t = initTRPC.create();

  const router = t.router({
    hello: t.procedure.query(() => 'world'),
  });

  const handler = trpcNext.createNextApiHandler({
    router,
  });

  const { req } = mockReq({
    query: {
      trpc: 'hello',
    },
    method: 'PUT',
  });
  const { res, waitResponse } = mockRes();

  handler(req, res);

  await waitResponse;

  expect(res.statusCode).toBe(405);
});

test('middleware intercepts request', async () => {
  const t = initTRPC.create();

  const router = t.router({
    hello: t.procedure.query(() => 'world'),
  });

  const handler = trpcNext.createNextApiHandler({
    middleware: (_req, res, _next) => {
      res.statusCode = 419;
      res.end();
      return;
    },
    router,
  });

  const { req } = mockReq({
    query: {
      trpc: [],
    },
    method: 'PUT',
  });
  const { res, waitResponse } = mockRes();

  handler(req, res);

  await waitResponse;

  expect(res.statusCode).toBe(419);
});

test('middleware passes the request', async () => {
  const t = initTRPC.create();

  const router = t.router({
    hello: t.procedure.query(() => 'world'),
  });

  const handler = trpcNext.createNextApiHandler({
    middleware: (_req, _res, next) => {
      return next();
    },
    router,
  });

  const { req } = mockReq({
    query: {
      trpc: [],
    },
    method: 'PUT',
  });
  const { res, waitResponse } = mockRes();

  handler(req, res);

  await waitResponse;

  expect(res.statusCode).toBe(404);
});
