import { expect, test, vi } from 'vite-plus/test';
import { parseSse, readLines } from './protocol.ts';

const streamOf = (...chunks: (string | Uint8Array)[]) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      for (const chunk of chunks) {
        controller.enqueue(
          typeof chunk === 'string' ? encoder.encode(chunk) : chunk,
        );
      }
      controller.close();
    },
  });

const collect = async <T>(it: AsyncIterable<T>) => {
  const out: T[] = [];
  for await (const value of it) out.push(value);
  return out;
};

test('lines split mid-character decode whole, without TextDecoderStream', async () => {
  vi.stubGlobal('TextDecoderStream', undefined);
  const bytes = new TextEncoder().encode('{"a":"é"}\n{"b":1}');
  const lines = await collect(
    readLines(streamOf(bytes.slice(0, 7), bytes.slice(7))),
  );
  expect(lines).toEqual(['{"a":"é"}', '{"b":1}']);
});

test('a CRLF split across chunks ends one line, not two', async () => {
  const events = await collect(
    parseSse(streamOf('event: x\r', '\ndata: 1\r\n\r\n')),
  );
  expect(events).toEqual([{ event: 'x', data: '1', id: undefined }]);
});
