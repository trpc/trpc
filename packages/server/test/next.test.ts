/* eslint-disable @typescript-eslint/no-empty-function */
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as trpc from '../src';
import * as trpcNext from '../src/adapters/next';
import { EventEmitter } from 'events';
import { HTTPErrorResponseEnvelope } from '../src';

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
  res.json = json;
  res.status = status;

  return { res, status, json };
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
