import { FastifyReply } from 'fastify';
import { Readable } from 'node:stream';
import { HTTPResponse, ResponseChunk } from '../../http/internals/types';
import { iteratorToResponse } from './fastifyRequestHandler';

test('iterator to response', async () => {
  const res = {
    body: undefined,
    headers: new Headers(),
    send: (chunk: string | void | Readable) => (res.body = chunk as any),
    header: (k: string, v: string) => res.headers.set(k, v),
    hasHeader: (k: string) => res.headers.has(k),
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
  await iteratorToResponse(iterator, res as unknown as FastifyReply);
  expect(res.statusCode).toBe(200);
  expect(res.headers.get('x-hello')).toBe('world');
  expect(res.headers.get('vary')).toContain('yolo');
  expect(res.headers.get('vary')).toContain('trpc-batch-mode');
  expect((res.body as any) instanceof Readable).toBe(true);
  const text = await new Promise((resolve) => {
    const readable = res.body as unknown as Readable;
    let text = '';
    readable.on('data', (chunk) => {
      text += chunk;
    });
    readable.on('end', () => {
      resolve(text);
    });
  });
  expect(text).toMatchInlineSnapshot(`
		"{
		\\"1\\":{\\"foo\\":\\"bar\\"}
		,\\"0\\":{\\"q\\":\\"a\\"}
		}"
	`);
});
