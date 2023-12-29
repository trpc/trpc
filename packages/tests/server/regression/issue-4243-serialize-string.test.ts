import EventEmitter from 'events';
import { initTRPC } from '@trpc/core';
import * as trpcNext from '@trpc/server/src/adapters/next';
import { z } from 'zod';

function mockReq(opts: {
  query: Record<string, any>;
  headers?: Record<string, string>;
  method?:
    | 'CONNECT'
    | 'DELETE'
    | 'GET'
    | 'HEAD'
    | 'OPTIONS'
    | 'POST'
    | 'PUT'
    | 'TRACE';
  body?: any;
  parseBody?: boolean;
}) {
  const req = new EventEmitter() as any;

  req.method = opts.method;
  req.query = opts.query;
  const headers = opts.headers ?? {};
  req.headers = headers;
  if (req.method === 'POST') {
    if (
      'content-type' in headers &&
      headers['content-type'] === 'application/json' &&
      opts.parseBody
    ) {
      req.body = JSON.parse(opts.body);
    } else {
      setImmediate(() => {
        req.emit('data', opts.body);
        req.emit('end');
      });
    }
  }

  const socket = {
    destroy: vi.fn(),
  };
  req.socket = socket;

  return { req, socket };
}
function mockRes() {
  const res = new EventEmitter() as any;

  const json = vi.fn(() => res);
  const setHeader = vi.fn(() => res);
  const end = vi.fn(() => res);
  res.json = json;
  res.setHeader = setHeader;
  res.end = end;

  return { res, json, setHeader, end };
}

describe('string inputs are properly serialized and deserialized', () => {
  const t = initTRPC.create();

  const router = t.router({
    doSomething: t.procedure.input(z.string()).mutation((opts) => {
      return `did mutate ${opts.input}` as const;
    }),
    querySomething: t.procedure.input(z.string()).query((opts) => {
      return `did query ${opts.input}` as const;
    }),
  });

  const handler = trpcNext.createNextApiHandler({
    router,
  });

  test('mutation', async () => {
    const { req } = mockReq({
      query: {
        trpc: ['doSomething'],
      },
      headers: {
        'content-type': 'application/json',
      },
      method: 'POST',
      body: JSON.stringify('something'),
    });
    const { res, end } = mockRes();
    await handler(req, res);
    const json: any = JSON.parse((end.mock.calls[0] as any)[0]);

    expect(json).toMatchInlineSnapshot(`
      Object {
        "result": Object {
          "data": "did mutate something",
        },
      }
    `);
    expect(res.statusCode).toBe(200);
  });
});

describe('works good with bodyParser disabled', () => {
  const t = initTRPC.create();

  const router = t.router({
    doSomething: t.procedure.input(z.string()).mutation((opts) => {
      return `did mutate ${opts.input}` as const;
    }),
    querySomething: t.procedure.input(z.string()).query((opts) => {
      return `did query ${opts.input}` as const;
    }),
  });

  const handler = trpcNext.createNextApiHandler({
    router,
  });

  test('mutation', async () => {
    const { req } = mockReq({
      query: {
        trpc: ['doSomething'],
      },
      headers: {
        'content-type': 'application/json',
      },
      method: 'POST',
      parseBody: false,
      body: JSON.stringify('something'),
    });
    const { res, end } = mockRes();
    await handler(req, res);
    const json: any = JSON.parse((end.mock.calls[0] as any)[0]).result.data;
    expect(res.statusCode).toBe(200);
    expect(json).toMatchInlineSnapshot('"did mutate something"');
  });
});
