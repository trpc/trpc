import { EventEmitter } from 'events';
import { initTRPC } from '@trpc/server';
import * as trpcNext from '@trpc/server/adapters/next';

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

  const json = vi.fn(() => res);
  const setHeader = vi.fn(() => res);
  const end = vi.fn(() => res);
  const write = vi.fn(() => res);
  res.setHeader = setHeader;
  res.end = end;
  res.write = write;
  res.json = json;
  res.statusCode = 200;

  return {
    res,
    json,
    setHeader,
    end,
    text: () => {
      return res.write.mock.calls
        .map((args: any) => {
          return new TextDecoder().decode(args[0]);
        })
        .join('');
    },
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
  const { res, json } = mockRes();

  await handler(req, res);

  const responseJson: any = (json.mock.calls[0] as any)[0];
  expect(responseJson.ok).toMatchInlineSnapshot(`undefined`);
  expect(responseJson.error.message).toMatchInlineSnapshot(
    `"Query "trpc" not found - is the file named \`[trpc]\`.ts or \`[...trpc].ts\`?"`,
  );
  expect(responseJson.statusCode).toMatchInlineSnapshot(`undefined`);
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
    const { req } = mockReq({
      query: {
        trpc: ['hello'],
      },
    });
    const { res, text } = mockRes();

    await handler(req, res);
    expect(res.statusCode).toBe(200);

    const json: any = JSON.parse(text());
    expect(json).toMatchInlineSnapshot(`
      Object {
        "result": Object {
          "data": "world",
        },
      }
    `);
  });

  test('[trpc].ts', async () => {
    const { req } = mockReq({
      query: {
        trpc: 'hello',
      },
    });
    const { res, text } = mockRes();

    await handler(req, res);

    const json: any = JSON.parse(text());
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

  const { req } = mockReq({
    query: {
      trpc: ['not-found-path'],
    },
  });
  const { res, end, text } = mockRes();

  await handler(req, res);

  expect(res.statusCode).toBe(404);
  const json: any = JSON.parse(text());

  expect(json.error.message).toMatchInlineSnapshot(
    `"No "query"-procedure on path "not-found-path""`,
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
  const { res } = mockRes();

  await handler(req, res);

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
      trpc: [],
    },
    method: 'PUT',
  });
  const { res } = mockRes();

  await handler(req, res);

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
  const { res } = mockRes();

  await handler(req, res);

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
  const { res } = mockRes();

  await handler(req, res);

  expect(res.statusCode).toBe(405);
});
