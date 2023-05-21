import * as trpcLambda from '.';
import { HTTPResponse, ResponseChunk } from '../../http/internals/types';

test('iterator to response', async () => {
  const iterator = (async function* () {
    yield { status: 200, headers: { 'x-hello': ['world'] } } as HTTPResponse;
    yield [1, JSON.stringify({ foo: 'bar' })] as ResponseChunk;
    yield [0, JSON.stringify({ q: 'a' })] as ResponseChunk;
    return undefined;
  })();
  const response = await trpcLambda.accumulateIteratorIntoResponseFormat(
    iterator,
  );
  expect(response.status).toBe(200);
  expect(response.headers).toMatchInlineSnapshot(`
    Object {
      "x-hello": Array [
        "world",
      ],
    }
  `);
  expect(response.body).toMatchInlineSnapshot(
    '"[{\\"q\\":\\"a\\"},{\\"foo\\":\\"bar\\"}]"',
  );
});
