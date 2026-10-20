import { Effect, Exit, Scope, Stream } from 'effect';
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
} from '../../../internal/protocol.ts';
import type {
  AnySerializer,
  Frame,
  SerializeReturn,
} from '../../../serializer/index.ts';
import { toClientError, type Operation } from '../../link.ts';
import { badResponse, isByteStreamInput, serializeInput } from '../events.ts';
import { resumeOf, retrying, type Retries } from '../resume.ts';
import type { HttpLinkOptions } from './link.ts';

const NO_BODY_STATUSES = new Set([204, 205, 304]);

const isAbort = (cause: unknown) =>
  cause instanceof Error && cause.name === 'AbortError';

/** An `HttpClientError` stands for what it wraps: a fetch or body failure. */
export function toHttpError(cause: unknown): AnyTrpcError {
  if (HttpClientError.isHttpClientError(cause)) {
    const inner = cause.reason.cause;
    // An invalid URL wraps `new URL`'s own error in a `UrlError`.
    return toHttpError(inner instanceof Url.UrlError ? inner.cause : inner);
  }
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
 * A response: Effect's, for reading its body, and the web one it wraps,
 * which `onResponse`, `File` outputs and raw responses hand on.
 */
export interface Reply {
  readonly response: HttpClientResponse.HttpClientResponse;
  readonly web: Response;
}

export const ok = (reply: Reply): boolean =>
  reply.response.status >= 200 && reply.response.status < 300;

const contentType = (reply: Reply) =>
  reply.response.headers['content-type'] ?? '';

/** Whether `reply` streams its output as JSONL or binary frames. */
const streamed = (reply: Reply) => {
  const type = contentType(reply);
  return (
    reply.web.body !== null &&
    (type.startsWith(CONTENT_TYPE.jsonl) ||
      type.startsWith(CONTENT_TYPE.frames))
  );
};

/** A streamed body's lines, parsed. */
export const readStream = (
  reply: Reply,
): Stream.Stream<unknown, AnyTrpcError> => {
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

/** A call's input, serialized: JSON, and the `Blob`s it holds. */
export interface Encoded {
  readonly json: SerializeReturn | undefined;
  readonly parts: Blob[];
}

/** What {@link makeTransport} gives the link and its features. */
export interface Transport {
  readonly serializer: AnySerializer;
  /** The endpoint, without a trailing `/`. */
  readonly baseUrl: string;
  /** The `accept` for streamed outputs: JSONL, and frames with `binary`. */
  readonly streamType: string;
  /** `op`'s input, serialized once. Throws for one that can't be. */
  readonly encode: (op: Operation) => Encoded;
  readonly call: (
    op: Operation,
    accept: string,
    extra?: Record<string, string>,
  ) => Effect.Effect<Reply, AnyTrpcError, Scope.Scope>;
  /** A `POST` of `json` for `ops`, which share one `init`. */
  readonly post: (
    ops: ReadonlyArray<Operation>,
    url: string,
    extra: Record<string, string>,
    json: unknown,
  ) => Effect.Effect<Reply, AnyTrpcError, Scope.Scope>;
  readonly single: (op: Operation) => Effect.Effect<unknown, AnyTrpcError>;
  readonly readError: (reply: Reply) => Effect.Effect<never, AnyTrpcError>;
  /** Hands `op` its response; throws what an `onResponse` that throws did. */
  readonly report: (op: Operation, status: number, headers: Headers) => void;
  readonly reported: (
    op: Operation,
    reply: Reply,
  ) => Effect.Effect<void, AnyTrpcError>;
}

/**
 * An `httpLink` feature, such as `batching()` or `sse()`: an import whose
 * `build` the link calls with its transport, so a client that doesn't pass
 * it doesn't bundle it.
 */
export interface HttpFeature<F> {
  readonly build: (transport: Transport) => F;
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
        if (theirs !== null && theirs !== serializer.name) {
          await res.body?.cancel().catch(() => {});
          throw new TrpcError({
            code: 'UNSUPPORTED_PROTOCOL',
            message: `The server uses the '${theirs}' serializer, but this httpLink uses '${serializer.name}'. Pass the same serializer to the handler and httpLink.`,
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
          body = serializer.deserialize(JSON.parse(text));
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
      return serializer
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

  const post: Transport['post'] = (ops, url, extra, json) =>
    Effect.flatMap(
      prepare(
        ops,
        'POST',
        url,
        extra,
        HttpBody.raw(JSON.stringify(json), { contentType: CONTENT_TYPE.json }),
      ),
      (prepared) => execute(prepared, undefined),
    );

  return {
    serializer,
    baseUrl,
    streamType,
    encode,
    call,
    post,
    single,
    readError,
    report,
    reported,
  };
}
