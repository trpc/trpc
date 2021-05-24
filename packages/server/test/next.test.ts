/* eslint-disable @typescript-eslint/no-empty-function */
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as trpc from '../src';
import * as trpcNext from '../src/adapters/next';
import { EventEmitter } from 'events';
import { HTTPErrorResponseEnvelope, HTTPSuccessResponseEnvelope } from '../src';

function mockReq({
  query,
  method = 'GET',
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
}) {
  const req = new EventEmitter() as any;

  req.method = method;
  req.query = query;

  const socket = {
    destroy: jest.fn(),
  };
  req.socket = socket;

  return { req, socket };
}
function mockRes() {
  const res = new EventEmitter() as any;

  const status = jest.fn(() => res);
  const json = jest.fn(() => res);
  const setHeader = jest.fn(() => res);
  const end = jest.fn(() => res);
  res.json = json;
  res.status = status;
  res.setHeader = setHeader;
  res.end = end;

  return { res, status, json, setHeader, end };
}
test('bad setup', async () => {
  const router = trpc.router().query('hello', {
    resolve: () => 'world',
  });

  const handler = trpcNext.createNextApiHandler({
    router,
    createContext() {},
  });

  const { req } = mockReq({ query: {} });
  const { res, status, json } = mockRes();

  await handler(req, res);
  expect(status).toHaveBeenCalledWith(500);

  const responseJson: HTTPErrorResponseEnvelope<typeof router> = (
    json.mock.calls[0] as any
  )[0];
  expect(responseJson.ok).toMatchInlineSnapshot(`false`);
  expect(responseJson.error.message).toMatchInlineSnapshot(
    `"Query \\"trpc\\" not found - is the file named \`[trpc]\`.ts or \`[...trpc].ts\`?"`,
  );
  expect(responseJson.statusCode).toMatchInlineSnapshot(`500`);
});

describe('ok request', () => {
  const router = trpc.router().query('hello', {
    resolve: () => 'world',
  });

  const handler = trpcNext.createNextApiHandler({
    router,
    createContext() {},
  });
  test('[...trpc].ts', async () => {
    const { req } = mockReq({
      query: {
        trpc: ['hello'],
      },
    });
    const { res, end } = mockRes();

    await handler(req, res);
    expect(res.statusCode).toBe(200);

    const json: HTTPSuccessResponseEnvelope<string> = JSON.parse(
      (end.mock.calls[0] as any)[0],
    );
    expect(json).toMatchInlineSnapshot(`
      Object {
        "data": "world",
        "ok": true,
        "statusCode": 200,
      }
    `);
  });

  test('[trpc].ts', async () => {
    const { req } = mockReq({
      query: {
        trpc: 'hello',
      },
    });
    const { res, end } = mockRes();

    await handler(req, res);
    expect(res.statusCode).toBe(200);

    const json: HTTPSuccessResponseEnvelope<string> = JSON.parse(
      (end.mock.calls[0] as any)[0],
    );
    expect(json).toMatchInlineSnapshot(`
      Object {
        "data": "world",
        "ok": true,
        "statusCode": 200,
      }
    `);
  });
});

test('404', async () => {
  const router = trpc.router().query('hello', {
    resolve: () => 'world',
  });

  const handler = trpcNext.createNextApiHandler({
    router,
    createContext() {},
  });

  const { req } = mockReq({
    query: {
      trpc: ['not-found-path'],
    },
  });
  const { res, end } = mockRes();

  await handler(req, res);

  expect(res.statusCode).toBe(404);
  const json: HTTPErrorResponseEnvelope<typeof router> = JSON.parse(
    (end.mock.calls[0] as any)[0],
  );
  expect(json.statusCode).toBe(404);
  expect(json.error.message).toMatchInlineSnapshot(
    `"No such query procedure \\"not-found-path\\""`,
  );
});

test('payload too large', async () => {
  const router = trpc.router().mutation('hello', {
    resolve: () => 'world',
  });

  const handler = trpcNext.createNextApiHandler({
    router,
    createContext() {},
    maxBodySize: 1,
  });

  const { req } = mockReq({
    query: {
      trpc: ['hello'],
    },
    method: 'POST',
  });
  const { res, end } = mockRes();

  setImmediate(() => {
    req.emit('data', JSON.stringify('123456789'));
    req.emit('end');
  });
  await handler(req, res);

  expect(res.statusCode).toBe(413);
  const json: HTTPErrorResponseEnvelope<typeof router> = JSON.parse(
    (end.mock.calls[0] as any)[0],
  );
  expect(json.statusCode).toBe(413);
  expect(json.error.message).toMatchInlineSnapshot(`"Payload Too Large"`);
});

test('HEAD request', async () => {
  const router = trpc.router().query('hello', {
    resolve: () => 'world',
  });

  const handler = trpcNext.createNextApiHandler({
    router,
    createContext() {},
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
  const router = trpc.router().query('hello', {
    resolve: () => 'world',
  });

  const handler = trpcNext.createNextApiHandler({
    router,
    createContext() {},
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
