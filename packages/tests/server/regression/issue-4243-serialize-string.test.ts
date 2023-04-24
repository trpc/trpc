import { initTRPC } from '@trpc/server';
import * as trpcNext from '@trpc/server/src/adapters/next';
import EventEmitter from 'events';
import { z } from 'zod';

function mockReq({
  query,
  method = 'GET',
  headers = {},
  body,
}: {
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
}) {
  const req = new EventEmitter() as any;

  req.method = method;
  req.query = query;
  if (
    'content-type' in headers &&
    headers['content-type'] === 'application/json'
  ) {
    req.body = JSON.parse(body);
  } else {
    req.body = body;
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

test('string input is properly serialized and deserialized', async () => {
  const t = initTRPC.create();

  const router = t.router({
    doSomething: t.procedure.input(z.string()).mutation((opts) => {
      return `did ${opts.input}` as const;
    }),
  });

  const handler = trpcNext.createNextApiHandler({
    router,
    maxBodySize: 1,
  });

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
  expect(res.statusCode).toBe(200);
  expect(json).toMatchInlineSnapshot(`
  Object {
    "result": Object {
      "data": "did something",
    },
  }
`);
});
