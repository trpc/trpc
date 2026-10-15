import type { ProcedureType } from './types.ts';

/**
 * The wire protocol version this build speaks.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export const PROTOCOL_VERSION = '1';

/**
 * Header names the protocol uses.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export const HEADER = {
  version: 'trpc-version',
  batch: 'trpc-batch',
  lastEventId: 'last-event-id',
} as const;

/**
 * Content types the protocol uses.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export const CONTENT_TYPE = {
  json: 'application/json',
  jsonl: 'application/jsonl',
  sse: 'text/event-stream',
} as const;

/**
 * One call in a batch request body.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface BatchCall {
  path: string;
  input?: unknown;
}

/**
 * One JSONL line of a batch response.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type BatchLine =
  | { i: number; status: number; body: unknown }
  | { i: number; chunk: unknown };

/**
 * SSE event names. A subscription event with deferred values (`Promise`s,
 * `AsyncIterable`s) is sent as a `deferred` event carrying `{ e, body }`;
 * its chunks follow as `chunk` events carrying `{ e, chunk }`, then
 * `{ e }` once that event's deferred values have all settled.
 */
export const SSE_EVENT = {
  message: 'message',
  deferred: 'deferred',
  chunk: 'chunk',
  error: 'error',
  done: 'done',
} as const;

/** What a WebSocket or MessagePort client sends (10). */
export type ClientMessage =
  | {
      type: 'init';
      version: string;
      connectionParams?: Record<string, unknown> | undefined;
    }
  | {
      id: number;
      type: 'request';
      method: ProcedureType;
      path: string;
      input?: unknown;
      lastEventId?: string | undefined;
    }
  | { id: number; type: 'abort' };

/**
 * What a WebSocket or MessagePort server sends (10). A `result` or `event`
 * with `deferred` is followed by its `chunk`s. A query with deferred values,
 * and every subscription, ends with `done`. `id: null` is a connection error.
 */
export type ServerMessage =
  | { id: number; type: 'result'; body: unknown; deferred?: true }
  | {
      id: number;
      type: 'event';
      body: unknown;
      eventId?: string;
      deferred?: number;
    }
  | { id: number; type: 'chunk'; event?: number; chunk: unknown }
  | { id: number; type: 'chunkEnd'; event: number }
  | { id: number; type: 'done' }
  | { id: number | null; type: 'error'; status: number; body: unknown };

export const isJsonContentType = (value: string | null): boolean =>
  value !== null && /^application\/json\b/i.test(value);

export const isMultipartContentType = (value: string | null): boolean =>
  value !== null && /^multipart\/form-data\b/i.test(value);

/**
 * Reads a form body, failing with `tooLarge()` once it passes `maxBytes`,
 * whether or not the request declares its length. Bytes past the limit are
 * drained and dropped: cancelling the body makes some servers (Node) drop
 * the connection before the 413 is sent.
 */
export async function readFormData(
  request: Request,
  maxBytes: number,
  tooLarge: () => Error,
): Promise<FormData> {
  if (Number(request.headers.get('content-length') ?? 0) > maxBytes) {
    throw tooLarge();
  }
  if (!request.body) return new FormData();
  let size = 0;
  const body = request.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        size += chunk.byteLength;
        if (size <= maxBytes) controller.enqueue(chunk);
      },
    }),
  );
  const headers = { 'content-type': request.headers.get('content-type') ?? '' };
  const form = await new Response(body, { headers })
    .formData()
    .catch((cause: unknown) => {
      if (size > maxBytes) throw tooLarge();
      throw cause;
    });
  if (size > maxBytes) throw tooLarge();
  return form;
}

/**
 * Decodes a byte stream as UTF-8 text. `TextDecoder` with `stream: true`
 * rather than `TextDecoderStream`, which React Native's Hermes lacks.
 */
async function* readText(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      if (text) yield text;
    }
    const rest = decoder.decode();
    if (rest) yield rest;
  } finally {
    await reader.cancel().catch(() => {});
  }
}

/** Parses SSE events out of a text stream, per the HTML spec's rules. */
export async function* parseSse(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<{ event: string; data: string; id: string | undefined }> {
  let buffer = '';
  let data: string[] = [];
  let event = '';
  let id: string | undefined;
  for await (const value of readText(stream)) {
    buffer += value;
    let newline: number;
    while ((newline = buffer.search(/\r\n|\r|\n/)) !== -1) {
      // A trailing `\r` may be the first half of a `\r\n` split across chunks.
      if (newline === buffer.length - 1 && buffer.endsWith('\r')) break;
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(
        newline + (buffer.startsWith('\r\n', newline) ? 2 : 1),
      );
      if (line === '') {
        if (data.length > 0 || event) {
          yield { event: event || 'message', data: data.join('\n'), id };
        }
        data = [];
        event = '';
        id = undefined;
        continue;
      }
      if (line.startsWith(':')) continue;
      const colon = line.indexOf(':');
      const field = colon === -1 ? line : line.slice(0, colon);
      let val = colon === -1 ? '' : line.slice(colon + 1);
      if (val.startsWith(' ')) val = val.slice(1);
      if (field === 'data') data.push(val);
      else if (field === 'event') event = val;
      else if (field === 'id') id = val;
    }
  }
}

/** Splits a byte stream into non-empty lines. */
export async function* readLines(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<string> {
  let buffer = '';
  for await (const value of readText(stream)) {
    buffer += value;
    let newline: number;
    while ((newline = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) yield line;
    }
  }
  if (buffer.trim()) yield buffer.trim();
}
