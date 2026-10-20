import { Effect, Stream } from 'effect';
import { expect, test, vi } from 'vite-plus/test';
import {
  hasMediaType,
  isJsonContentType,
  isMultipartContentType,
  sseEvents,
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
