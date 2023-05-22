import { HTTPResponse, ResponseChunk } from '../../http/internals/types';
import { iteratorToResponse } from './nodeHTTPRequestHandler';
import { NodeHTTPResponse } from './types';

test('iterator to response', async () => {
  const res = {
    body: '',
    headers: new Headers(),
    write: (chunk: string) => (res.body += chunk),
    end: vi.fn(),
    setHeader: (k: string, v: string) => res.headers.append(k, v),
    getHeader: (k: string) => res.headers.get(k),
    statusCode: 200,
  };
  const iterator = (async function* () {
    yield {
      status: 200,
      headers: { 'x-hello': ['world'], vary: 'yolo' },
    } as HTTPResponse;
    yield [1, JSON.stringify({ foo: 'bar' })] as ResponseChunk;
    yield [0, JSON.stringify({ q: 'a' })] as ResponseChunk;
    return undefined;
  })();
  await iteratorToResponse(iterator, res as unknown as NodeHTTPResponse);
  expect(res.statusCode).toBe(200);
  expect(res.headers.get('x-hello')).toBe('world');
  expect(res.headers.get('vary')).toContain('yolo');
  expect(res.headers.get('vary')).toContain('x-trpc-batch-mode');
  expect(res.end).toHaveBeenCalledOnce();
  expect(res.body).toMatchInlineSnapshot(`
		"{
		\\"1\\":{\\"foo\\":\\"bar\\"}
		,\\"0\\":{\\"q\\":\\"a\\"}
		}"
	`);
});
