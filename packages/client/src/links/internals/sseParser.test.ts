import type { SSEMessage } from './sseParser';
import { parseSSE } from './sseParser';

async function parse(chunks: string[]) {
  async function* source() {
    yield* chunks;
  }
  const messages: SSEMessage[] = [];
  for await (const message of parseSSE(source())) {
    messages.push(message);
  }
  return messages;
}

test('reads events, data and ids', async () => {
  expect(
    await parse([
      'event: connected\ndata: {}\n\n',
      'data: 1\nid: a\n\n',
      'data: 2\n\n',
    ]),
  ).toEqual([
    { event: 'connected', data: '{}', id: undefined },
    { event: 'message', data: '1', id: 'a' },
    { event: 'message', data: '2', id: undefined },
  ]);
});

test('accepts CRLF, CR and LF line endings, split across chunks', async () => {
  expect(
    await parse(['data: a\r', '\n\r', '\ndata: b\r\rdata: c\n', '\n']),
  ).toEqual([
    { event: 'message', data: 'a', id: undefined },
    { event: 'message', data: 'b', id: undefined },
    { event: 'message', data: 'c', id: undefined },
  ]);
});

test('joins data lines and strips one leading space', async () => {
  expect(await parse(['data:  x\ndata:y\n\n'])).toEqual([
    { event: 'message', data: ' x\ny', id: undefined },
  ]);
});

test('an empty data line dispatches an empty string', async () => {
  expect(await parse(['event: return\ndata: \n\n'])).toEqual([
    { event: 'return', data: '', id: undefined },
  ]);
});

test('skips comments, blocks without data and unknown fields', async () => {
  expect(
    await parse([
      ': ping\n\n',
      'event: x\n\n',
      'retry: 10\nfoo: bar\ndata: 1\n\n',
    ]),
  ).toEqual([{ event: 'message', data: '1', id: undefined }]);
});

test('waits for the blank line before dispatching', async () => {
  expect(await parse(['data: 1'])).toEqual([]);
  expect(await parse(['data: 1', '\n', '\n'])).toEqual([
    { event: 'message', data: '1', id: undefined },
  ]);
});

test('ignores an id with a NUL character', async () => {
  expect(await parse(['id: a\0b\ndata: 1\n\n'])).toEqual([
    { event: 'message', data: '1', id: undefined },
  ]);
});

test('a chunk of only the LF of a CRLF ends nothing else', async () => {
  expect(await parse(['data: a\r', '\n', '\n'])).toEqual([
    { event: 'message', data: 'a', id: undefined },
  ]);
});

test('reads a line split across many chunks', async () => {
  const value = 'x'.repeat(10_000);
  const chunks = `data: ${value}\n\n`.match(/[\s\S]{1,7}/g) ?? [];
  expect(await parse(chunks)).toEqual([
    { event: 'message', data: value, id: undefined },
  ]);
});
