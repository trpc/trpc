import type { ProcedureType } from './types.ts';

/**
 * The wire protocol version this build speaks.
 * @since 0.1.0
 * @stability stable
 */
export const PROTOCOL_VERSION = '12';

const canonical = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(canonical);
  if (v === null || typeof v !== 'object') return v;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(v).sort()) {
    out[k] = canonical((v as Record<string, unknown>)[k]);
  }
  return out;
};

/**
 * A GET call's query string: `input=` with the serialized input's JSON, and
 * `refs=` when the serializer made refs. Object keys are sorted, so equal
 * inputs give equal URLs and caches hit.
 * @internal
 */
export function toInputSearch(value: {
  json?: unknown;
  refs?: unknown;
}): string {
  const params = new URLSearchParams();
  if (value.json !== undefined) {
    params.set('input', JSON.stringify(canonical(value.json)));
  }
  if (value.refs !== undefined) params.set('refs', JSON.stringify(value.refs));
  return params.toString();
}

/**
 * `URLSearchParams`' first `input` and `refs`, without building it. `undefined`
 * when a key is encoded or a value doesn't decode strictly, where its lenient
 * rules apply.
 */
const readSearch = (
  search: string,
): { input: string | null; refs: string | null } | undefined => {
  let input: string | null = null;
  let refs: string | null = null;
  let start = 1;
  while (start < search.length) {
    let end = search.indexOf('&', start);
    if (end === -1) end = search.length;
    const eq = search.indexOf('=', start);
    const keyEnd = eq === -1 || eq > end ? end : eq;
    const key = search.slice(start, keyEnd);
    if (key.includes('%') || key.includes('+')) return undefined;
    if (
      (key === 'input' && input === null) ||
      (key === 'refs' && refs === null)
    ) {
      const raw = keyEnd === end ? '' : search.slice(keyEnd + 1, end);
      let value: string;
      try {
        value = decodeURIComponent(
          raw.includes('+') ? raw.replaceAll('+', ' ') : raw,
        );
      } catch {
        return undefined;
      }
      if (key === 'input') input = value;
      else refs = value;
    }
    start = end + 1;
  }
  return { input, refs };
};

const readParams = (search: string) => {
  const params = new URLSearchParams(search);
  return { input: params.get('input'), refs: params.get('refs') };
};

/**
 * Reads what {@link toInputSearch} wrote from a URL's search, `?` included;
 * `undefined` without an input.
 * @internal
 */
export function fromInputSearch(
  search: string,
): { json?: never; refs?: never } | undefined {
  const { input, refs } = readSearch(search) ?? readParams(search);
  if (input === null && refs === null) return undefined;
  return {
    ...(input === null ? {} : { json: JSON.parse(input) as never }),
    ...(refs === null ? {} : { refs: JSON.parse(refs) as never }),
  };
}

/**
 * Header names the protocol uses.
 * @since 0.1.0
 * @stability stable
 */
export const HEADER = {
  version: 'trpc-version',
  batch: 'trpc-batch',
  lastEventId: 'last-event-id',
  /**
   * On a response whose body is a root `File` or `Blob` output: the
   * URI-encoded JSON `{ type, name?, lastModified? }` the client rebuilds it from.
   */
  blob: 'trpc-blob',
  /** On a response a procedure returned itself: the client hands it over as is. */
  response: 'trpc-response',
  /** On a request: the call's id, which `experimental_durable()` keeps its result under. */
  callId: 'trpc-call-id',
  /**
   * On a durable call's retry: how many frames of its streamed output the
   * client already has, so the response starts after them.
   */
  resumeFrom: 'trpc-resume-from',
  /** On a response: the name of the serializer the handler uses. */
  serializer: 'trpc-serializer',
} as const;

/**
 * Content types the protocol uses.
 * @since 0.1.0
 * @stability stable
 */
export const CONTENT_TYPE = {
  json: 'application/json',
  jsonl: 'application/jsonl',
  /** JSONL's lines as length-prefixed records, with file bytes unencoded. */
  frames: 'application/vnd.trpc.frames',
  sse: 'text/event-stream',
} as const;

/**
 * One call in a batch request body.
 * @since 0.1.0
 * @stability stable
 */
export interface BatchCall {
  path: string;
  input?: unknown;
}

/**
 * One JSONL line of a batch response.
 * @since 0.1.0
 * @stability stable
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
      /** The client reads binary messages: file bytes may come as frame records. */
      binary?: true | undefined;
      /** The client's serializer's `name`; on another one, the server runs no calls. */
      serializer?: string | undefined;
    }
  | {
      id: number;
      type: 'request';
      method: ProcedureType;
      path: string;
      input?: unknown;
      lastEventId?: string | undefined;
      /** The client span's trace context (`traceparent`, `b3`), when it propagates one. */
      trace?: Record<string, string> | undefined;
    }
  | { id: number; type: 'abort' }
  | { type: 'ping' };

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
  | { id: number | null; type: 'error'; body: unknown }
  /** The answer to the client's `init`: the server's serializer's `name`, in plain JSON. */
  | { type: 'init'; serializer: string }
  | { type: 'pong' };

interface BlobMeta {
  type: string;
  name?: string;
  lastModified?: number;
}

/** `content-disposition` for a file, with an ASCII fallback name. */
export const contentDisposition = (name: string): string =>
  `inline; filename="${name.replace(/[^\x20-\x7e]|["\\]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`;

/** The headers that let the client rebuild a `File` or `Blob` response body. */
export function blobHeaders(blob: Blob): Record<string, string> {
  const meta: BlobMeta =
    typeof File !== 'undefined' && blob instanceof File
      ? { type: blob.type, name: blob.name, lastModified: blob.lastModified }
      : { type: blob.type };
  return {
    [HEADER.blob]: encodeURIComponent(JSON.stringify(meta)),
    ...(meta.name === undefined
      ? {}
      : { 'content-disposition': contentDisposition(meta.name) }),
  };
}

/** Rebuilds a `File` or `Blob` from a response that `blobHeaders()` marked. */
export async function readBlob(res: Response, header: string): Promise<Blob> {
  const meta = JSON.parse(decodeURIComponent(header)) as BlobMeta;
  const body = await res.blob();
  return meta.name === undefined
    ? body.slice(0, body.size, meta.type)
    : new File([body], meta.name, {
        type: meta.type,
        ...(meta.lastModified === undefined
          ? {}
          : { lastModified: meta.lastModified }),
      });
}

export const isJsonContentType = (value: string | null): boolean =>
  value !== null && /^application\/json\b/i.test(value);

export const isMultipartContentType = (value: string | null): boolean =>
  value !== null && /^multipart\/form-data\b/i.test(value);

/**
 * Reads a form body of `contentType`, failing with `tooLarge()` once it
 * passes `maxBytes`, as a declared length can't be trusted. Bytes past the
 * limit are drained and dropped: cancelling the body makes some servers
 * (Node) drop the connection before the 413 is sent.
 */
export async function readFormData(
  request: Request,
  contentType: string,
  maxBytes: number,
  tooLarge: () => Error,
): Promise<FormData> {
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
  const form = await new Response(body, {
    headers: { 'content-type': contentType },
  })
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
      const chunk = await reader.read();
      if (chunk.done) break;
      const text = decoder.decode(chunk.value, { stream: true });
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
