import { Effect, Stream } from 'effect';
import { expect, test, vi } from 'vite-plus/test';
import {
  hasMediaType,
  isJsonContentType,
  isMultipartContentType,
  sseEvents,
  sseIdField,
  textLines,
} from './protocol.ts';

test('lines split mid-character decode whole, without TextDecoderStream', async () => {
  vi.stubGlobal('TextDecoderStream', undefined);
  const bytes = new TextEncoder().encode('{"a":"é"}\n{"b":1}');
  const lines = await Effect.runPromise(
    Stream.runCollect(
      textLines(Stream.make(bytes.slice(0, 7), bytes.slice(7))),
    ),
  );
  expect(lines).toEqual(['{"a":"é"}', '{"b":1}']);
});

test('a CRLF split across chunks ends one line, not two', async () => {
  const encoder = new TextEncoder();
  const events = await Effect.runPromise(
    Stream.runCollect(
      sseEvents(
        Stream.make(
          encoder.encode('event: x\r'),
          encoder.encode('\ndata: 1\r\n\r\n'),
        ),
      ),
    ),
  );
  expect(events).toEqual([{ event: 'x', data: '1', id: undefined }]);
});

test('an event id with line breaks or NUL is written as one id field', async () => {
  const written = [
    `${sseIdField('a\r\nevent: x\ndata: 2\0')}data: 1\n\n`,
    `${sseIdField('\n')}data: 3\n\n`,
    `${sseIdField(undefined)}data: 4\n\n`,
  ].join('');
  const events = await Effect.runPromise(
    Stream.runCollect(
      sseEvents(Stream.make(new TextEncoder().encode(written))),
    ),
  );
  expect(events).toEqual([
    { event: 'message', data: '1', id: 'aevent: xdata: 2' },
    { event: 'message', data: '3', id: undefined },
    { event: 'message', data: '4', id: undefined },
  ]);
});

test('content types match by media type, ignoring case and parameters', () => {
  expect(isJsonContentType('application/json')).toBe(true);
  expect(isJsonContentType('Application/JSON; charset=utf-8')).toBe(true);
  expect(isJsonContentType('application/json ;charset=utf-8')).toBe(true);
  expect(isJsonContentType('application/json-seq')).toBe(false);
  expect(isJsonContentType('application/jsonl')).toBe(false);
  expect(isJsonContentType(null)).toBe(false);
  expect(isMultipartContentType('multipart/form-data; boundary=x')).toBe(true);
  expect(isMultipartContentType('multipart/form-data-x')).toBe(false);
  expect(hasMediaType('TEXT/plain', 'text/csv', 'text/plain')).toBe(true);
});
