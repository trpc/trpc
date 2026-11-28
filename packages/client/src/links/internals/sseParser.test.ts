import type { SSEMessage } from './sseParser';
import { createSSEParser } from './sseParser';

function parse(chunks: string[]) {
  const messages: SSEMessage[] = [];
  const parser = createSSEParser((message) => messages.push(message));
  for (const chunk of chunks) {
    parser.push(chunk);
  }
  return messages;
}

test('reads events, data and ids', () => {
  expect(
    parse([
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

test('accepts CRLF, CR and LF line endings, split across chunks', () => {
  expect(parse(['data: a\r', '\n\r', '\ndata: b\r\rdata: c\n', '\n'])).toEqual([
    { event: 'message', data: 'a', id: undefined },
    { event: 'message', data: 'b', id: undefined },
    { event: 'message', data: 'c', id: undefined },
  ]);
});

test('joins data lines and strips one leading space', () => {
  expect(parse(['data:  x\ndata:y\n\n'])).toEqual([
    { event: 'message', data: ' x\ny', id: undefined },
  ]);
});

test('an empty data line dispatches an empty string', () => {
  expect(parse(['event: return\ndata: \n\n'])).toEqual([
    { event: 'return', data: '', id: undefined },
  ]);
});

test('skips comments, blocks without data and unknown fields', () => {
  expect(
    parse([': ping\n\n', 'event: x\n\n', 'retry: 10\nfoo: bar\ndata: 1\n\n']),
  ).toEqual([{ event: 'message', data: '1', id: undefined }]);
});

test('waits for the blank line before dispatching', () => {
  expect(parse(['data: 1'])).toEqual([]);
  expect(parse(['data: 1', '\n', '\n'])).toEqual([
    { event: 'message', data: '1', id: undefined },
  ]);
});

test('ignores an id with a NUL character', () => {
  expect(parse(['id: a\0b\ndata: 1\n\n'])).toEqual([
    { event: 'message', data: '1', id: undefined },
  ]);
});
