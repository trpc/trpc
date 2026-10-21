import { Cause, Effect, Exit, Queue, Scope, Stream } from 'effect';
import {
  FetchHttpClient,
  HttpBody,
  HttpClient,
  HttpClientError,
  HttpClientRequest,
  Url,
  type HttpClientResponse,
  type HttpMethod,
} from 'effect/http';
import {
  abortedError,
  codeOfStatus,
  fromWireError,
  isAbortReason,
  isTrpcError,
  streamErrors,
  TrpcError,
  type AnyTrpcError,
} from '../../../internal/error.ts';
import { decodeRecords } from '../../../internal/frames.ts';
import {
  CONTENT_TYPE,
  HEADER,
  PROTOCOL_VERSION,
  readBlob,
  textLines,
  toInputSearch,
  type BatchCall,
  type BatchLine,
} from '../../../internal/protocol.ts';
import type {
  AnyTransformer,
  Frame,
  SerializeReturn,
} from '../../../transformer/index.ts';
import { toClientError, type Operation } from '../../link.ts';
import { badResponse, isByteStreamInput, serializeInput } from '../events.ts';
import { resumeOf, retrying, type Retries } from '../resume.ts';
import type { Batch } from './batch.ts';
import type { HttpLinkOptions } from './link.ts';

const NO_BODY_STATUSES = new Set([204, 205, 304]);

/** An `HttpClientError` stands for what it wraps: a fetch or body failure. */
export function toHttpError(cause: unknown): AnyTrpcError {
  if (HttpClientError.isHttpClientError(cause)) {
    const inner = cause.reason.cause;
    // An invalid URL wraps `new URL`'s own error in a `UrlError`.
    return toHttpError(inner instanceof Url.UrlError ? inner.cause : inner);
  }
  if (isTrpcError(cause)) return cause;
  if (isAbortReason(cause)) return abortedError(cause);
  return new TrpcError({
    code: 'NETWORK_ERROR',
    message: cause instanceof Error ? cause.message : 'Network error',
    cause,
  });
}

/**
 * A streamed response that ends before its head never answered the call, so
 * it failed like a cut connection; `STREAM_INTERRUPTED` is for values still
 * open after the call resolved.
 */
const headless = (error: AnyTrpcError): AnyTrpcError =>
  error.code === 'STREAM_INTERRUPTED'
    ? new TrpcError({
        code: 'NETWORK_ERROR',
        message: 'The response ended before its result',
        cause: error,
      })
    : error;

/**
 * Calls batch together only when their `init`s are equal. `undefined` for
 * an `init` that can't be compared (it holds something JSON can't write).
 */
function initKey(op: Operation): string | undefined {
  const init = op.context.init;
  if (!init) return '';
  try {
    const { headers, ...rest } = init;
    const sorted = (value: unknown): unknown =>
      value && typeof value === 'object' && !Array.isArray(value)
        ? Object.fromEntries(
            Object.entries(value)
              .sort(([a], [b]) => (a < b ? -1 : 1))
              .map(([k, v]) => [k, sorted(v)]),
          )
        : value;
    return JSON.stringify([[...new Headers(headers).entries()], sorted(rest)]);
  } catch {
    return undefined;
  }
}

/**
 * A response: Effect's, for reading its body, and the web one it wraps,
 * which `onResponse`, `File` outputs and raw responses hand on.
 */
export interface Reply {
  readonly response: HttpClientResponse.HttpClientResponse;
  readonly web: Response;
}

export const ok = (reply: Reply): boolean =>
  reply.response.status >= 200 && reply.response.status < 300;

/**
 * Runs `effect` with a scope that closes, aborting its requests, only if
 * it's interrupted: a body it returns keeps streaming after it returns.
 */
export const abortOnInterrupt = <A, E>(
  effect: Effect.Effect<A, E, Scope.Scope>,
): Effect.Effect<A, E> =>
  Effect.flatMap(Scope.make(), (scope) =>
    effect.pipe(
      Scope.provide(scope),
      Effect.onInterrupt(() => Scope.close(scope, Exit.void)),
    ),
  );

/** What {@link makeTransport} gives the link. */
export interface Transport {
  readonly transformer: AnyTransformer;
  readonly call: (
    op: Operation,
    accept: string,
    extra?: Record<string, string>,
  ) => Effect.Effect<Reply, AnyTrpcError, Scope.Scope>;
  readonly single: (op: Operation) => Effect.Effect<unknown, AnyTrpcError>;
  readonly sendBatch: (
    batch: Batch<Operation>,
  ) => Effect.Effect<void, AnyTrpcError>;
  readonly readError: (reply: Reply) => Effect.Effect<never, AnyTrpcError>;
  readonly reported: (
    op: Operation,
    reply: Reply,
  ) => Effect.Effect<void, AnyTrpcError>;
  readonly unbatchable: (op: Operation) => boolean;
  /** Calls with differing `init`s or types never share a batch. */
  readonly batchKey: (op: Operation) => string;
}

/** The HTTP side of `httpLink`: requests, responses and their bodies. */
export function makeTransport(
  opts: HttpLinkOptions,
  transformer: AnyTransformer,
): Transport {
  const baseUrl = String(opts.url).replace(/\/+$/, '');
  const maxUrlLength = opts.maxUrlLength ?? 2048;
  const longQueryMethod = opts.longQuery === 'query' ? 'QUERY' : 'POST';
  const rawFetch = opts.fetch ?? globalThis.fetch;
  // `withScope`: requests abort when the caller's scope closes, rather than
  // when the response is garbage collected (or, without a
  // `FinalizationRegistry`, after 5 s unread), since bodies outlive it.
  const client = HttpClient.withScope(
    Effect.runSync(
      Effect.provide(
        Effect.service(HttpClient.HttpClient),
        FetchHttpClient.layer,
      ),
    ),
  );
  const reviveError = (value: unknown) => fromWireError(value);

  /** Hands `op` its response; an `onResponse` that throws fails the call. */
  const report = (op: Operation, status: number, headers: Headers) => {
    try {
      op.context.onResponse?.({ status, headers });
    } catch (cause) {
      throw toClientError(cause);
    }
  };
  const reported = (op: Operation, reply: Reply) =>
    Effect.try({
      try: () => report(op, reply.web.status, reply.web.headers),
      catch: (error) => error as AnyTrpcError,
    });

  /**
   * The request for `ops`, which share one `init` (see `initKey`). Headers,
   * lowest first: `init()`'s, the link's `headers`, the call's
   * `init.headers`, the call's `headers`, then the protocol's.
   */
  const prepare = (
    ops: ReadonlyArray<Operation>,
    method: HttpMethod.HttpMethod,
    url: string,
    extra: Record<string, string>,
    body?: HttpBody.HttpBody,
  ) =>
    Effect.tryPromise({
      try: async () => {
        const base =
          typeof opts.init === 'function'
            ? await opts.init({ ops })
            : opts.init;
        const call = ops[0]?.context.init;
        const headers = new Headers(base?.headers);
        const set = (init: HeadersInit | undefined) =>
          new Headers(init).forEach((v, k) => headers.set(k, v));
        set(
          typeof opts.headers === 'function'
            ? await opts.headers({ ops })
            : opts.headers,
        );
        set(call?.headers);
        for (const op of ops) set(op.context.headers);
        set(ops[0]?.trace);
        headers.set(HEADER.version, PROTOCOL_VERSION);
        for (const [k, v] of Object.entries(extra)) headers.set(k, v);
        const next =
          base?.next || call?.next
            ? { ...base?.next, ...call?.next }
            : undefined;
        const request = HttpClientRequest.make(method)(url, { headers });
        return {
          // The body goes last: it sets the request's `content-type`.
          request: body ? HttpClientRequest.setBody(request, body) : request,
          init: { ...base, ...call, ...(next ? { next } : {}) } as RequestInit,
        };
      },
      catch: toHttpError,
    });

  /**
   * Sends `request` through `HttpClient`, with the options it can't carry
   * (`credentials`, `cache`, Next's `next`) as `init`. Aborts when the
   * caller's scope closes or `signal` aborts.
   */
  const execute = (
    prepared: {
      request: HttpClientRequest.HttpClientRequest;
      init: RequestInit;
    },
    signal: AbortSignal | undefined,
  ): Effect.Effect<Reply, AnyTrpcError, Scope.Scope> =>
    Effect.suspend(() => {
      let web: Response | undefined;
      // `HttpClientResponse` keeps the web response private, so it's caught
      // on its way out of `fetch`. `FetchHttpClient` passes a `URL` and
      // Effect `Headers`; a custom `fetch` gets a string and web `Headers`.
      const fetch = async (url: URL, init: RequestInit = {}) => {
        const res = await rawFetch(url.href, {
          ...init,
          headers: new Headers(init.headers),
          ...(signal && init.signal
            ? { signal: AbortSignal.any([init.signal, signal]) }
            : {}),
        });
        const theirs = res.headers.get(HEADER.serializer);
        if (theirs !== null && theirs !== transformer.name) {
          await res.body?.cancel().catch(() => {});
          throw new TrpcError({
            code: 'UNSUPPORTED_PROTOCOL',
            tag: 'TransformerMismatch',
            message: `The server uses the '${theirs}' transformer, but this httpLink uses '${transformer.name}'. Pass the same transformer to the handler and httpLink.`,
          });
        }
        web = res;
        return res;
      };
      return client.execute(prepared.request).pipe(
        Effect.map((response): Reply => ({ response, web: web! })),
        Effect.provideService(
          FetchHttpClient.Fetch,
          fetch as typeof globalThis.fetch,
        ),
        Effect.provideService(FetchHttpClient.RequestInit, prepared.init),
        // Calls carry their own span's trace headers (`op.trace`).
        Effect.provideService(HttpClient.TracerDisabledWhen, () => true),
        Effect.mapError(toHttpError),
      );
    });

  interface Encoded {
    json: SerializeReturn | undefined;
    parts: Blob[];
  }
  const encodings = new WeakMap<Operation, Encoded>();
  const encode = (op: Operation): Encoded => {
    let encoded = encodings.get(op);
    if (!encoded) {
      const parts: Blob[] = [];
      const json =
        op.input === undefined
          ? undefined
          : serializeInput(transformer, op.input, { parts });
      encoded = { json, parts };
      encodings.set(op, encoded);
    }
    return encoded;
  };
  /**
   * Blobs need a multipart request of their own, and a byte stream is the
   * body of its own; a bad input fails alone.
   */
  const unbatchable = (op: Operation) => {
    if (op.context.batch === false || isByteStreamInput(op.input)) return true;
    try {
      return encode(op).parts.length > 0 || initKey(op) === undefined;
    } catch {
      return true;
    }
  };

  /**
   * A tRPC error body, else a page from something in between (a proxy, a
   * framework's JSON 404), whose status names the error.
   */
  const readError = (reply: Reply): Effect.Effect<never, AnyTrpcError> =>
    reply.response.text.pipe(
      Effect.mapError(toHttpError),
      Effect.flatMap((text) => {
        let body: unknown;
        let cause: unknown;
        try {
          body = transformer.deserialize(JSON.parse(text));
        } catch (err) {
          cause = err;
        }
        const error = (body as { error?: unknown } | null | undefined)?.error;
        return Effect.fail(
          typeof error === 'object' && error !== null
            ? fromWireError(body)
            : new TrpcError({
                code: codeOfStatus(reply.response.status) ?? 'BAD_RESPONSE',
                message: `Unexpected ${reply.response.status} response`,
                cause: cause ?? body,
              }),
        );
      }),
    );

  const streamType = opts.binary
    ? `${CONTENT_TYPE.frames}, ${CONTENT_TYPE.jsonl}`
    : CONTENT_TYPE.jsonl;
  const contentType = (reply: Reply) =>
    reply.response.headers['content-type'] ?? '';
  const streamed = (reply: Reply) => {
    const type = contentType(reply);
    return (
      reply.web.body !== null &&
      (type.startsWith(CONTENT_TYPE.jsonl) ||
        type.startsWith(CONTENT_TYPE.frames))
    );
  };
  /** A streamed body's lines, parsed. */
  const readStream = (reply: Reply): Stream.Stream<unknown, AnyTrpcError> => {
    const bytes = reply.response.stream.pipe(Stream.mapError(toHttpError));
    return contentType(reply).startsWith(CONTENT_TYPE.frames)
      ? decodeRecords(bytes)
      : textLines(bytes).pipe(
          Stream.map((line) => line.trim()),
          Stream.filter((line) => line !== ''),
          // Line by line, so the lines before an unreadable one still arrive.
          // An unreadable line is a defect: what's still open fails as a
          // broken stream.
          Stream.mapEffect((line) =>
            Effect.sync(() => JSON.parse(line) as unknown),
          ),
        );
  };

  /** One call's request: `GET` with its input in the URL, else a body. */
  const call = (
    op: Operation,
    accept: string,
    extra: Record<string, string> = {},
  ): Effect.Effect<Reply, AnyTrpcError, Scope.Scope> =>
    Effect.gen(function* () {
      const url = `${baseUrl}/${op.path}`;
      const headers: Record<string, string> = { accept, ...extra };
      if (isByteStreamInput(op.input)) {
        return yield* execute(
          yield* prepare(
            [op],
            'POST',
            url,
            headers,
            HttpBody.raw(op.input, { contentType: CONTENT_TYPE.octet }),
          ),
          op.signal,
        );
      }
      const encoded = yield* Effect.try({
        try: () => encode(op),
        catch: toHttpError,
      });
      const { json } = encoded;
      if (encoded.parts.length > 0) {
        const form = new FormData();
        form.append('input', JSON.stringify(json));
        for (const [i, blob] of encoded.parts.entries()) {
          form.append(
            String(i),
            blob,
            blob instanceof File ? blob.name : 'blob',
          );
        }
        return yield* execute(
          yield* prepare([op], 'POST', url, headers, HttpBody.formData(form)),
          op.signal,
        );
      }
      if (op.type !== 'mutation') {
        const search = json === undefined ? '' : toInputSearch(json);
        const full = search ? `${url}?${search}` : url;
        if (full.length <= maxUrlLength) {
          return yield* execute(
            yield* prepare([op], 'GET', full, headers),
            op.signal,
          );
        }
      }
      return yield* execute(
        yield* prepare(
          [op],
          op.type === 'query' ? longQueryMethod : 'POST',
          url,
          headers,
          HttpBody.raw(json === undefined ? '' : JSON.stringify(json), {
            contentType: CONTENT_TYPE.json,
          }),
        ),
        op.signal,
      );
    });

  /**
   * `frames`, then, when the connection drops, the rest from a retry that
   * says how many arrived (`trpc-resume-from`), fed to the same deserializer.
   */
  const resumable = (
    op: Operation,
    resume: Retries,
    frames: Stream.Stream<Frame, AnyTrpcError>,
  ): Stream.Stream<Frame, AnyTrpcError> => {
    let count = 0;
    const reopen = abortOnInterrupt(
      Effect.gen(function* () {
        const reply = yield* call(op, `${CONTENT_TYPE.json}, ${streamType}`, {
          [HEADER.resumeFrom]: String(count),
        });
        yield* reported(op, reply);
        if (!ok(reply)) return yield* readError(reply);
        if (!streamed(reply)) {
          return yield* Effect.fail(
            badResponse('A resumed call answered without frames')(),
          );
        }
        return readStream(reply) as Stream.Stream<Frame, AnyTrpcError>;
      }),
    );
    return retrying(resume, (n) =>
      Stream.tap(n === 0 ? frames : Stream.unwrap(reopen), () =>
        Effect.sync(() => count++),
      ),
    );
  };

  /** A call's output, from its own response. */
  const readResult = (
    reply: Reply,
    op: Operation,
  ): Effect.Effect<unknown, AnyTrpcError> => {
    if (reply.web.headers.get(HEADER.response) === '1') {
      return Effect.succeed(reply.web);
    }
    if (!ok(reply)) return readError(reply);
    const blob = reply.web.headers.get(HEADER.blob);
    if (blob !== null) {
      // The web body: a browser can keep a large `Blob` on disk.
      return Effect.mapError(readBlob(reply.web, blob), toHttpError);
    }
    if (streamed(reply)) {
      const frames = readStream(reply) as Stream.Stream<Frame, AnyTrpcError>;
      // A byte stream input is sent once, so its call can't be asked again.
      const resume = isByteStreamInput(op.input)
        ? undefined
        : resumeOf(op.context);
      return transformer
        .deserializeStream(resume ? resumable(op, resume, frames) : frames, {
          reviveError,
          ...streamErrors,
        })
        .pipe(
          Effect.mapError((error) => headless(toHttpError(error))),
          Effect.catchDefect((defect) => Effect.fail(toHttpError(defect))),
        );
    }
    return reply.response.text.pipe(
      Effect.flatMap((text) =>
        // A tRPC server always writes a body (`{}` for `undefined`), except
        // for a status that can't have one.
        text === '' && !NO_BODY_STATUSES.has(reply.response.status)
          ? Effect.fail(badResponse('Empty response body')())
          : Effect.try({
              try: () =>
                text ? transformer.deserialize(JSON.parse(text)) : undefined,
              catch: badResponse('Invalid response body'),
            }),
      ),
      Effect.mapError(toHttpError),
    );
  };

  /** A call alone: its request, `onResponse`, then its output. */
  const single = (op: Operation): Effect.Effect<unknown, AnyTrpcError> =>
    abortOnInterrupt(
      Effect.gen(function* () {
        const reply = yield* call(op, `${CONTENT_TYPE.json}, ${streamType}`);
        yield* reported(op, reply);
        return yield* readResult(reply, op);
      }),
    );

  /** Sends a batch as one request and answers each call from its lines. */
  const sendBatch = (
    batch: Batch<Operation>,
  ): Effect.Effect<void, AnyTrpcError> =>
    Effect.gen(function* () {
      const ops = batch.calls;
      const frames = yield* Effect.forEach(ops, () =>
        Queue.unbounded<Frame, AnyTrpcError | Cause.Done>(),
      );
      const onLine = (line: BatchLine, headers: Headers) => {
        const op = ops[line.i];
        const queue = frames[line.i];
        if (!op || !queue) return Effect.void;
        if ('chunk' in line) {
          Queue.offerUnsafe(queue, line.chunk as Frame);
          return Effect.void;
        }
        try {
          report(op, line.status, headers);
        } catch (error) {
          batch.settle(line.i, Exit.fail(error as AnyTrpcError));
          Queue.endUnsafe(queue);
          return Effect.void;
        }
        if (line.status >= 400) {
          let error: AnyTrpcError;
          try {
            error = fromWireError(transformer.deserialize(line.body as never));
          } catch (cause) {
            error = badResponse('Invalid error message')(cause);
          }
          batch.settle(line.i, Exit.fail(error));
          Queue.endUnsafe(queue);
          return Effect.void;
        }
        Queue.offerUnsafe(queue, line.body as Frame);
        return batch.settleWith(
          line.i,
          transformer
            .deserializeStream(Stream.fromQueue(queue), {
              reviveError,
              ...streamErrors,
            })
            .pipe(
              Effect.catchCause((cause) =>
                Effect.fail(toHttpError(Cause.squash(cause))),
              ),
            ),
        );
      };
      return yield* Effect.gen(function* () {
        const calls: BatchCall[] = ops.map((op) => {
          const encoded = encode(op);
          return {
            path: op.path,
            ...(encoded.json === undefined ? {} : { input: encoded.json }),
          };
        });
        const reply = yield* execute(
          yield* prepare(
            ops,
            'POST',
            baseUrl,
            { accept: streamType, [HEADER.batch]: '1' },
            HttpBody.raw(JSON.stringify(calls), {
              contentType: CONTENT_TYPE.json,
            }),
          ),
          undefined,
        ).pipe(Scope.provide(batch.scope));
        if (!ok(reply) || reply.web.body === null) {
          const err = yield* Effect.flip(readError(reply));
          for (const [i, op] of ops.entries()) {
            try {
              report(op, reply.web.status, reply.web.headers);
            } catch (error) {
              batch.settle(i, Exit.fail(error as AnyTrpcError));
            }
          }
          return yield* Effect.fail(err);
        }
        yield* readStream(reply).pipe(
          Stream.runForEach((line) =>
            onLine(line as BatchLine, reply.web.headers),
          ),
        );
      }).pipe(
        Effect.catchCause((cause) =>
          Effect.fail(toHttpError(Cause.squash(cause))),
        ),
        Effect.ensuring(
          Effect.sync(() => {
            for (const queue of frames) Queue.endUnsafe(queue);
          }),
        ),
      );
    });

  return {
    transformer,
    call,
    single,
    sendBatch,
    readError,
    reported,
    unbatchable,
    batchKey: (op) => `${op.type} ${initKey(op)}`,
  };
}
