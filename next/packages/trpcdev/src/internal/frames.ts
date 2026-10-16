/**
 * The binary frame format (`application/vnd.trpc.frames`): the JSONL lines
 * as length-prefixed records, with file bytes as raw attachments instead of
 * base64.
 *
 * A record is a kind byte, a big-endian `u32` length, then the payload. A
 * JSON record is one line's UTF-8 JSON; a bytes record is an attachment for
 * the next JSON record, which points at it as `{ "~trpc/bytes": n }`.
 *
 * @internal
 */
import { Stream } from 'effect';
import { Base64 } from 'effect/encoding';

const JSON_RECORD = 0;
const BYTES_RECORD = 1;
const HEADER_SIZE = 5;
const MARK = '~trpc/bytes';

/**
 * File bytes in a streamed value. `JSON.stringify` writes them as base64,
 * as JSONL and text WebSocket messages have always carried them; frames,
 * `postMessage` and in-process calls carry the bytes as they are.
 * @internal
 */
export class JsonBytes extends Uint8Array<ArrayBuffer> {
  static wrap(bytes: Uint8Array): JsonBytes {
    return new JsonBytes(
      bytes.buffer as ArrayBuffer,
      bytes.byteOffset,
      bytes.byteLength,
    );
  }
  toJSON(): string {
    return Base64.encode(this);
  }
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const record = (kind: number, payload: Uint8Array): Uint8Array => {
  const out = new Uint8Array(HEADER_SIZE + payload.byteLength);
  const view = new DataView(out.buffer);
  view.setUint8(0, kind);
  view.setUint32(1, payload.byteLength);
  out.set(payload, HEADER_SIZE);
  return out;
};

/** One line as records: its attachments, then its JSON. @internal */
export const encodeRecord = (line: unknown): Uint8Array => {
  const attachments: Uint8Array[] = [];
  const json = JSON.stringify(
    line,
    function (this: Record<string, unknown>, key, value: unknown) {
      const raw = this[key];
      if (!(raw instanceof JsonBytes)) return value;
      attachments.push(raw);
      return { [MARK]: attachments.length - 1 };
    },
  );
  const records = [
    ...attachments.map((bytes) => record(BYTES_RECORD, bytes)),
    record(JSON_RECORD, encoder.encode(json)),
  ];
  if (records.length === 1) return records[0]!;
  const out = new Uint8Array(records.reduce((n, r) => n + r.byteLength, 0));
  let offset = 0;
  for (const r of records) {
    out.set(r, offset);
    offset += r.byteLength;
  }
  return out;
};

/** Received bytes not yet cut into records, kept as chunks so large files copy once. */
class Pending {
  chunks: Uint8Array[] = [];
  size = 0;
  push(chunk: Uint8Array) {
    if (chunk.byteLength === 0) return;
    this.chunks.push(chunk);
    this.size += chunk.byteLength;
  }
  peek(n: number): Uint8Array {
    const first = this.chunks[0]!;
    return first.byteLength >= n ? first.subarray(0, n) : this.copy(n, false);
  }
  take(n: number): Uint8Array<ArrayBuffer> {
    return this.copy(n, true);
  }
  private copy(n: number, consume: boolean): Uint8Array<ArrayBuffer> {
    const out = new Uint8Array(n);
    let filled = 0;
    let i = 0;
    while (filled < n) {
      const chunk = this.chunks[i]!;
      const part = chunk.subarray(0, n - filled);
      out.set(part, filled);
      filled += part.byteLength;
      if (consume) {
        if (part.byteLength === chunk.byteLength) this.chunks.shift();
        else this.chunks[0] = chunk.subarray(part.byteLength);
      } else {
        i++;
      }
    }
    if (consume) this.size -= n;
    return out;
  }
}

interface DecodeState {
  readonly pending: Pending;
  attachments: Uint8Array<ArrayBuffer>[];
}

const parse = (text: string, attachments: Uint8Array[]): unknown =>
  attachments.length === 0
    ? JSON.parse(text)
    : JSON.parse(text, (_key, value: unknown) => {
        if (typeof value !== 'object' || value === null) return value;
        const index = (value as Record<string, unknown>)[MARK];
        return typeof index === 'number' && attachments[index]
          ? attachments[index]
          : value;
      });

/** Cuts every complete record out of `state.pending`; returns the lines they finish. */
const drain = (state: DecodeState): unknown[] => {
  const lines: unknown[] = [];
  while (state.pending.size >= HEADER_SIZE) {
    const header = state.pending.peek(HEADER_SIZE);
    const view = new DataView(header.buffer, header.byteOffset, HEADER_SIZE);
    const kind = view.getUint8(0);
    const length = view.getUint32(1);
    if (state.pending.size < HEADER_SIZE + length) break;
    state.pending.take(HEADER_SIZE);
    const payload = state.pending.take(length);
    if (kind === BYTES_RECORD) {
      state.attachments.push(payload);
    } else if (kind === JSON_RECORD) {
      lines.push(parse(decoder.decode(payload), state.attachments));
      state.attachments = [];
    } else {
      throw new Error(`Unknown frame record kind ${kind}`);
    }
  }
  return lines;
};

const ended = (state: DecodeState): boolean =>
  state.pending.size === 0 && state.attachments.length === 0;

/**
 * The lines in a frame stream, parsed, with attachments as `Uint8Array`s.
 * A malformed or truncated stream dies, as a bad JSONL line does.
 * @internal
 */
export const decodeRecords = <E, R>(
  bytes: Stream.Stream<Uint8Array, E, R>,
): Stream.Stream<unknown, E, R> =>
  bytes.pipe(
    Stream.mapAccum(
      (): DecodeState => ({ pending: new Pending(), attachments: [] }),
      (state, chunk) => {
        state.pending.push(chunk);
        return [state, drain(state)] as const;
      },
      {
        onHalt: (state) => {
          if (!ended(state)) {
            throw new Error('The frame stream ended mid-record');
          }
          return [];
        },
      },
    ),
  );

/**
 * A binary WebSocket message: one line's records. `undefined` if it isn't
 * exactly one whole line.
 * @internal
 */
export const decodeMessage = (bytes: Uint8Array): unknown => {
  const state: DecodeState = { pending: new Pending(), attachments: [] };
  state.pending.push(bytes);
  try {
    const lines = drain(state);
    return lines.length === 1 && ended(state) ? lines[0] : undefined;
  } catch {
    return undefined;
  }
};

/**
 * Whether a streamed chunk (`[index, status, { json }]`) holds file bytes.
 * @internal
 */
export const carriesBytes = (chunk: unknown): boolean =>
  Array.isArray(chunk) &&
  (chunk[2] as { json?: unknown } | undefined)?.json instanceof JsonBytes;

/**
 * Whether an `accept` header lists `type`.
 * @internal
 */
export const accepts = (accept: string | undefined, type: string): boolean =>
  accept !== undefined &&
  accept.split(',').some((entry) => {
    const [media, ...params] = entry.split(';').map((s) => s.trim());
    return media === type && !params.some((p) => /^q\s*=\s*0(\.0*)?$/.test(p));
  });
