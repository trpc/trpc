import { Cause, Effect, Exit, Queue, Scope, Stream } from 'effect';
import {
  codeOfStatus,
  fromWireError,
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
  AnySerializer,
  Frame,
  SerializeReturn,
} from '../../../serializer/index.ts';
import { toClientError, type Operation } from '../../link.ts';
import { badResponse, isByteStreamInput, serializeInput } from '../events.ts';
import { resumeOf, retrying, type Retries } from '../resume.ts';
import type { Batch } from './batch.ts';
import type { HttpLinkOptions } from './link.ts';

const isAbort = (cause: unknown) =>
  cause instanceof Error && cause.name === 'AbortError';

/** A fetch, URL or body failure as the call's error. */
export function toHttpError(cause: unknown): AnyTrpcError {
  if (isTrpcError(cause)) return cause;
  if (isAbort(cause)) {
    return new TrpcError({
      code: 'CLIENT_CLOSED_REQUEST',
      message: 'The request was aborted',
      cause,
    });
  }
  return new TrpcError({
    code: 'NETWORK_ERROR',
    message: cause instanceof Error ? cause.message : 'Network error',
    cause,
  });
}

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
 * A response, which `onResponse`, `File` outputs and raw responses hand on
 * as is.
 */
export interface Reply {
  readonly web: Response;
}

export const ok = (reply: Reply): boolean =>
  reply.web.status >= 200 && reply.web.status < 300;

/**
 * A response's body (callers check it has one). It fails with what the read
 * threw: SSE reconnects after anything but a tRPC error.
 */
export const bodyStream = (reply: Reply): Stream.Stream<Uint8Array, unknown> =>
  Stream.fromReadableStream({
    evaluate: () => reply.web.body!,
    onError: (cause) => cause,
  });

/**
 * `url` resolved against the page, as `fetch` would in a browser, so a
 * custom `fetch` gets an absolute URL there too.
 */
const resolveUrl = (url: string): string => {
  const page = (
    globalThis as { location?: { origin?: string; pathname?: string } }
  ).location;
  return new URL(
    url,
    page?.origin !== undefined && page.pathname !== undefined
      ? page.origin + page.pathname
      : undefined,
  ).href;
};

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

/** A request as `fetch` takes it. */
interface Prepared {
  readonly url: string;
  readonly init: RequestInit;
}

/** What {@link makeTransport} gives the link. */
export interface Transport {
  readonly serializer: AnySerializer;
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
  serializer: AnySerializer,
): Transport {
  const baseUrl = String(opts.url).replace(/\/+$/, '');
  const maxUrlLength = opts.maxUrlLength ?? 2048;
  const longQueryMethod = opts.longQuery === 'query' ? 'QUERY' : 'POST';
  const rawFetch = opts.fetch ?? globalThis.fetch;
  const reviveError = (value: unknown) => fromWireError(value);
  const readText = (reply: Reply) =>
    Effect.tryPromise({ try: () => reply.web.text(), catch: toHttpError });

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
    method: 'GET' | 'POST' | 'QUERY',
    url: string,
    extra: Record<string, string>,
    body?: string | FormData | ReadableStream<Uint8Array>,
  ): Effect.Effect<Prepared, AnyTrpcError> =>
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
        // Runs for every request, so it must not throw where there's no
        // `ReadableStream` (Hermes), as a bare `instanceof` would.
        const stream = isByteStreamInput(body);
        // A JSON body names its type; `fetch` sets a multipart one's, with
        // its boundary.
        if (typeof body === 'string') {
          headers.set('content-type', CONTENT_TYPE.json);
        } else if (stream) {
          headers.set('content-type', CONTENT_TYPE.octet);
        } else if (body) {
          headers.delete('content-type');
        }
        headers.delete('content-length');
        const init: RequestInit = {
          ...base,
          ...call,
          ...(next ? { next } : {}),
          method,
          headers,
          ...(body === undefined ? {} : { body }),
          // `fetch` only sends a stream body half-duplex.
          ...(stream ? { duplex: 'half' } : {}),
        } as RequestInit;
        return { url: resolveUrl(url), init };
      },
      catch: toHttpError,
    });

  /**
   * Sends `request`, aborting it when the caller's scope closes (its body
   * can outlive the call) or `signal` aborts.
   */
  const execute = (
    request: Prepared,
    signal: AbortSignal | undefined,
  ): Effect.Effect<Reply, AnyTrpcError, Scope.Scope> =>
    Effect.gen(function* () {
      const controller = new AbortController();
      yield* Effect.addFinalizer(() => Effect.sync(() => controller.abort()));
      const web = yield* Effect.tryPromise({
        try: async () => {
          const res = await rawFetch(request.url, {
            ...request.init,
            signal: signal
              ? AbortSignal.any([controller.signal, signal])
              : controller.signal,
          });
          const theirs = res.headers.get(HEADER.serializer);
          if (theirs !== null && theirs !== serializer.name) {
            await res.body?.cancel().catch(() => {});
            throw new TrpcError({
              code: 'UNSUPPORTED_PROTOCOL',
              message: `The server uses the '${theirs}' serializer, but this httpLink uses '${serializer.name}'. Pass the same serializer to the handler and httpLink.`,
            });
          }
          return res;
        },
        catch: toHttpError,
      });
      return { web };
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
          : serializeInput(serializer, op.input, { parts });
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
    readText(reply).pipe(
      Effect.flatMap((text) => {
        let body: unknown;
        let cause: unknown;
        try {
          body = serializer.deserialize(JSON.parse(text));
        } catch (err) {
          cause = err;
        }
        const error = (body as { error?: unknown } | null | undefined)?.error;
        return Effect.fail(
          typeof error === 'object' && error !== null
            ? fromWireError(body)
            : new TrpcError({
                code: codeOfStatus(reply.web.status) ?? 'BAD_RESPONSE',
                message: `Unexpected ${reply.web.status} response`,
                cause: cause ?? body,
              }),
        );
      }),
    );

  const streamType = opts.binary
    ? `${CONTENT_TYPE.frames}, ${CONTENT_TYPE.jsonl}`
    : CONTENT_TYPE.jsonl;
  const contentType = (reply: Reply) =>
    reply.web.headers.get('content-type') ?? '';
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
    const bytes = bodyStream(reply).pipe(Stream.mapError(toHttpError));
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
          yield* prepare([op], 'POST', url, headers, op.input),
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
          yield* prepare([op], 'POST', url, headers, form),
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
          json === undefined ? '' : JSON.stringify(json),
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
      return Effect.tryPromise({
        // The web body: a browser can keep a large `Blob` on disk.
        try: () => readBlob(reply.web, blob),
        catch: toHttpError,
      });
    }
    if (streamed(reply)) {
      const frames = readStream(reply) as Stream.Stream<Frame, AnyTrpcError>;
      // A byte stream input is sent once, so its call can't be asked again.
      const resume = isByteStreamInput(op.input)
        ? undefined
        : resumeOf(op.context);
      return serializer
        .deserializeStream(resume ? resumable(op, resume, frames) : frames, {
          reviveError,
          ...streamErrors,
        })
        .pipe(
          Effect.mapError(toHttpError),
          Effect.catchDefect((defect) => Effect.fail(toHttpError(defect))),
        );
    }
    return readText(reply).pipe(
      Effect.flatMap((text) =>
        Effect.try({
          try: () =>
            text ? serializer.deserialize(JSON.parse(text)) : undefined,
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
            error = fromWireError(serializer.deserialize(line.body as never));
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
          serializer
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
            JSON.stringify(calls),
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
    serializer,
    call,
    single,
    sendBatch,
    readError,
    reported,
    unbatchable,
    batchKey: (op) => `${op.type} ${initKey(op)}`,
  };
}
