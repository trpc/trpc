import { Effect, Predicate, Queue, Stream } from 'effect';
import {
  HttpBody,
  HttpServerResponse,
  type HttpServerRequest,
} from 'effect/http';
import { statusOf, type AnyTrpcError } from '../../internal/error.ts';
import { backpressure } from '../../internal/effects.ts';
import { accepts, encodeRecord } from '../../internal/frames.ts';
import {
  CONTENT_TYPE,
  HEADER,
  PROTOCOL_VERSION,
} from '../../internal/protocol.ts';
import type { Chunk } from '../../transformer/progressive-json/index.ts';
import { responseOptions } from './body.ts';
import { wire, type HttpHandler } from './http-handler.ts';

const encoder = /* @__PURE__ */ new TextEncoder();

/**
 * A response with the protocol's headers and those a response handle set
 * (`set`). A `Blob` streams with its size as the content length. @internal
 */
export const respond = (
  handler: HttpHandler,
  status: number,
  body: string | Blob | Stream.Stream<Uint8Array>,
  contentType: string,
  extra?: Record<string, string>,
  set?: Headers,
): HttpServerResponse.HttpServerResponse => {
  const fromSet = responseOptions(set);
  const options: HttpServerResponse.Options.WithContentType = {
    status,
    contentType,
    headers: {
      ...fromSet.headers,
      [HEADER.version]: PROTOCOL_VERSION,
      [HEADER.transformer]: handler.transformer.name,
      ...extra,
    },
    cookies: fromSet.cookies,
  };
  if (typeof body === 'string') return HttpServerResponse.text(body, options);
  if (body instanceof Blob) {
    return HttpServerResponse.stream(
      Stream.fromReadableStream({
        evaluate: () => body.stream(),
        onError: (cause) => cause,
      }) as Stream.Stream<Uint8Array>,
      { ...options, contentLength: body.size },
    );
  }
  return HttpServerResponse.stream(body, options);
};

const textBodies = /* @__PURE__ */ new WeakMap<Response, string>();

/** A web `Response` of `text` that {@link fromWebResponse} sends as text. @internal */
export const textWebResponse = (text: string, init: ResponseInit): Response => {
  const response = new Response(text, init);
  textBodies.set(response, text);
  return response;
};

/**
 * `response` as Effect's. A {@link textWebResponse}'s body stays text; any
 * other body is a stream, which the handler waits for until it's read
 * (Effect only pulls a body as it's read). @internal
 */
export const fromWebResponse = (
  response: Response,
): HttpServerResponse.HttpServerResponse => {
  const text = textBodies.get(response);
  if (text === undefined) return HttpServerResponse.fromWeb(response);
  return HttpServerResponse.setBody(
    HttpServerResponse.fromWeb(new Response(null, response)),
    HttpBody.text(text, response.headers.get('content-type') ?? undefined),
  );
};

/** `body` as JSON. @internal */
export const jsonResponse = (
  handler: HttpHandler,
  status: number,
  body: unknown,
  set?: Headers,
): HttpServerResponse.HttpServerResponse =>
  respond(
    handler,
    status,
    JSON.stringify(body),
    CONTENT_TYPE.json,
    undefined,
    set,
  );

/** @internal */
export const errorResponse = (
  handler: HttpHandler,
  err: AnyTrpcError,
  status: number = statusOf(err),
  set?: Headers,
): HttpServerResponse.HttpServerResponse =>
  jsonResponse(handler, status, wire(handler, err), set);

/** A procedure's own response, with the handle's headers and the raw marker. @internal */
export const rawResponse = (
  response: HttpServerResponse.HttpServerResponse,
  set: Headers | undefined,
): HttpServerResponse.HttpServerResponse => {
  const options = responseOptions(set);
  let out = HttpServerResponse.setHeaders(response, {
    ...options.headers,
    ...response.headers,
    [HEADER.version]: PROTOCOL_VERSION,
    [HEADER.response]: '1',
  });
  if (options.cookies) {
    out = HttpServerResponse.mergeCookies(out, options.cookies);
  }
  return out;
};

/** Frames when the client asks for them, JSONL otherwise. @internal */
export const streamType = (
  request: HttpServerRequest.HttpServerRequest,
): string =>
  accepts(request.headers['accept'], CONTENT_TYPE.frames)
    ? CONTENT_TYPE.frames
    : CONTENT_TYPE.jsonl;

const linesBodies = new WeakSet<Stream.Stream<Uint8Array, unknown>>();

/** The stream of a body `linesResponse` made, if `response` has one. @internal */
export const linesBody = (
  response: HttpServerResponse.HttpServerResponse,
): HttpBody.Stream | undefined =>
  Predicate.isTagged(response.body, 'Stream') &&
  linesBodies.has(response.body.stream)
    ? response.body
    : undefined;

/**
 * A streamed body of `produce`'s lines: binary records for frames, JSON
 * lines otherwise, and SSE's text as is. Uncached, and varying on
 * `accept` unless it's SSE. @internal
 */
export const linesResponse = (
  handler: HttpHandler,
  produce: (
    write: (line: unknown) => Effect.Effect<void>,
  ) => Effect.Effect<void>,
  contentType: string = CONTENT_TYPE.jsonl,
  headers?: Headers,
): HttpServerResponse.HttpServerResponse => {
  const binary = contentType === CONTENT_TYPE.frames;
  const lines = Stream.callback<Uint8Array>(
    (queue) =>
      Effect.andThen(
        produce((line) =>
          Effect.asVoid(
            Queue.offer(
              queue,
              binary
                ? encodeRecord(line)
                : encoder.encode(
                    typeof line === 'string'
                      ? line
                      : `${JSON.stringify(line)}\n`,
                  ),
            ),
          ),
        ),
        Queue.end(queue),
      ),
    backpressure,
  );
  linesBodies.add(lines);
  const defaults: Record<string, string> = {};
  if (!headers?.has('cache-control')) defaults['cache-control'] = 'no-cache';
  if (contentType !== CONTENT_TYPE.sse) {
    const vary = headers?.get('vary');
    defaults['vary'] = vary ? `${vary}, accept` : 'accept';
  }
  return respond(handler, 200, lines, contentType, defaults, headers);
};

/** Writes a deferred value's chunks; a failure is already in them. @internal */
export const runChunks = (
  chunks: Stream.Stream<Chunk, unknown>,
  onChunk: (chunk: Chunk) => Effect.Effect<void>,
): Effect.Effect<void> =>
  Stream.runForEach(chunks, onChunk).pipe(Effect.ignore);
