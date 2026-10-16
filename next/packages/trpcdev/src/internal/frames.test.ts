import { Effect, Exit, Stream } from 'effect';
import { expect, test } from 'vite-plus/test';
import {
  accepts,
  carriesBytes,
  decodeMessage,
  decodeRecords,
  encodeRecord,
  JsonBytes,
} from './frames.ts';

const decode = (chunks: Uint8Array[]) =>
  Effect.runPromiseExit(
    Stream.runCollect(decodeRecords(Stream.fromIterable(chunks))),
  );

const bytes = (...values: number[]) => JsonBytes.wrap(new Uint8Array(values));

test('JSON writes file bytes as base64, so JSONL lines are unchanged', () => {
  expect(JSON.stringify([3, 0, { json: bytes(0, 255, 1) }])).toBe(
    '[3,0,{"json":"AP8B"}]',
  );
});

test('records carry lines and their bytes unencoded, however the stream is cut', async () => {
  const lines = [
    { json: { title: 'Post' } },
    [1, 0, { json: bytes(0, 255, 1) }],
    {
      i: 0,
      chunk: [2, 0, { json: bytes(...Array.from({ length: 300 }, () => 7)) }],
    },
    [2, 2, {}],
  ];
  const encoded = lines.map(encodeRecord);
  const whole = new Uint8Array(encoded.reduce((n, r) => n + r.byteLength, 0));
  let offset = 0;
  for (const r of encoded) {
    whole.set(r, offset);
    offset += r.byteLength;
  }
  expect(whole.byteLength).toBeLessThan(JSON.stringify(lines).length + 4 * 10);
  const oneByteEach = [...whole].map((b) => new Uint8Array([b]));
  for (const chunks of [[whole], oneByteEach]) {
    const exit = await decode(chunks);
    expect(Exit.isSuccess(exit)).toBe(true);
    const out = Exit.isSuccess(exit) ? exit.value : [];
    expect(out).toHaveLength(4);
    expect(out[0]).toEqual({ json: { title: 'Post' } });
    expect((out[1] as [number, number, { json: Uint8Array }])[2].json).toEqual(
      new Uint8Array([0, 255, 1]),
    );
    const batched = out[2] as {
      chunk: [number, number, { json: Uint8Array }];
    };
    expect(batched.chunk[2].json).toBeInstanceOf(Uint8Array);
    expect(batched.chunk[2].json.every((b) => b === 7)).toBe(true);
    expect(out[3]).toEqual([2, 2, {}]);
  }
});

test('a marker-shaped value in a line without attachments stays as it is', async () => {
  const line = { json: { '~trpc/bytes': 0 } };
  const exit = await decode([encodeRecord(line)]);
  expect(exit).toEqual(Exit.succeed([line]));
});

test('a truncated or unknown record fails the stream', async () => {
  const record = encodeRecord({ json: 1 });
  expect(Exit.isFailure(await decode([record.subarray(0, -1)]))).toBe(true);
  const unknown = record.slice();
  unknown[0] = 9;
  expect(Exit.isFailure(await decode([unknown]))).toBe(true);
});

test('accepts reads media types from an accept header', () => {
  const type = 'application/vnd.trpc.frames';
  expect(accepts(`application/json, ${type}`, type)).toBe(true);
  expect(accepts(`${type};q=0.5`, type)).toBe(true);
  expect(accepts(`${type}; q=0`, type)).toBe(false);
  expect(accepts('application/jsonl', type)).toBe(false);
  expect(accepts(undefined, type)).toBe(false);
});

test('a binary WebSocket message is exactly one line', () => {
  const message = { id: 1, type: 'chunk', chunk: [2, 0, { json: bytes(1) }] };
  expect(carriesBytes(message.chunk)).toBe(true);
  expect(carriesBytes([2, 0, { json: 'AQ==' }])).toBe(false);
  const one = encodeRecord(message);
  expect(decodeMessage(one)).toEqual({
    ...message,
    chunk: [2, 0, { json: new Uint8Array([1]) }],
  });
  const two = new Uint8Array([...one, ...encodeRecord({ type: 'pong' })]);
  expect(decodeMessage(two)).toBeUndefined();
  expect(decodeMessage(one.subarray(0, -1))).toBeUndefined();
});
