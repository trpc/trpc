/* eslint-disable @typescript-eslint/no-empty-function */
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as trpc from '../src';
import * as trpcNext from '../src/adapters/next';
import { EventEmitter } from 'events';
import { HTTPErrorResponseEnvelope, HTTPSuccessResponseEnvelope } from '../src';

function mockReq(query: Record<string, any>) {
  const req = new EventEmitter() as any;

  req.method = 'GET';
  req.query = query;

  return { req };
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

  const { req } = mockReq({});
  const { res, status, json } = mockRes();

  await handler(req, res);
  expect(status).toHaveBeenCalledWith(500);

  const responseJson: HTTPErrorResponseEnvelope = (json.mock
    .calls[0] as any)[0];
  expect(responseJson.ok).toMatchInlineSnapshot(`false`);
  expect(responseJson.error.message).toMatchInlineSnapshot(
    `"Query \\"trpc\\" not found - is the file named [...trpc].ts?"`,
  );
  expect(responseJson.statusCode).toMatchInlineSnapshot(`500`);
});

test('ok request', async () => {
  const router = trpc.router().query('hello', {
    resolve: () => 'world',
  });

  const handler = trpcNext.createNextApiHandler({
    router,
    createContext() {},
  });

  const { req } = mockReq({
    trpc: ['hello'],
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

test('404', async () => {
  const router = trpc.router().query('hello', {
    resolve: () => 'world',
  });

  const handler = trpcNext.createNextApiHandler({
    router,
    createContext() {},
  });

  const { req } = mockReq({
    trpc: ['not-found-path'],
  });
  const { res, end } = mockRes();

  await handler(req, res);

  expect(res.statusCode).toBe(404);
  const json: HTTPErrorResponseEnvelope = JSON.parse(
    (end.mock.calls[0] as any)[0],
  );
  expect(json.statusCode).toBe(404);
  expect(json.error.message).toMatchInlineSnapshot(
    `"No such procedure \\"not-found-path\\""`,
  );
});
