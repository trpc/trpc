import { Cause, Effect, Option, Queue, Stream } from 'effect';
import {
  codeOfStatus,
  fromWireError,
  isTrpcError,
  streamErrors,
  TrpcError,
  type AnyTrpcError,
} from '../../internal/error.ts';
import {
  CONTENT_TYPE,
  HEADER,
  parseSse,
  toInputSearch,
  PROTOCOL_VERSION,
  readBlob,
  readLines,
  SSE_EVENT,
  type BatchCall,
  type BatchLine,
} from '../../internal/protocol.ts';
import { forEachSeq } from '../../internal/effects.ts';
import { decodeRecords } from '../../internal/frames.ts';
import type { FormOfOptions, MaybePromise } from '../../internal/types.ts';
import {
  jsonSerializer,
  type Frame,
  type SerializeReturn,
  type AnySerializer,
} from '../../serializer/index.ts';
import {
  toClientError,
  withSerializer,
  type Operation,
  type OperationStream,
  type TrpcLink,
  type TrpcRequestInit,
} from '../link.ts';
import {
  makeDeferredDecoder,
  parseError,
  serializeInput,
  type DeferredDecoder,
} from './events.ts';
import { resumeOf, type Resume } from './resume.ts';

/**
 * Options for {@link httpLink}.
 * @since 0.1.0
 * @stability stable
 */
export interface HttpLinkOptions<
  TSerializer extends AnySerializer = AnySerializer,
> {
  /** The endpoint, e.g. `http://localhost:3000/trpc`. */
  url: string | URL;
  /**
   * Must match the handler's; a response from a handler with another one
   * fails with `UNSUPPORTED_PROTOCOL`. Client types follow it.
   * @default jsonSerializer
   */
  serializer?: TSerializer | undefined;
  /** Extra headers, merged with each call's `context.headers`. */
  headers?:
    | HeadersInit
    | ((opts: { ops: ReadonlyArray<Operation> }) => MaybePromise<HeadersInit>);
  /**
   * Default `fetch` options, called once per HTTP request with the calls it
   * carries. Each call's `init` is merged onto it: shallowly, except
   * `headers` and `next`, which merge one level deeper.
   *
   * @example
   * ```ts
   * httpLink({ url, init: () => ({ credentials: 'include' }) });
   * await client.post.list.query(input, { init: { next: { tags: ['posts'] } } });
   * ```
   */
  init?:
    | TrpcRequestInit
    | ((opts: {
        ops: ReadonlyArray<Operation>;
      }) => MaybePromise<TrpcRequestInit | undefined>);
  /** A custom `fetch`. */
  fetch?: typeof globalThis.fetch;
  /**
   * Queries whose URL would be longer than this are sent with a body, as
   * `longQuery` says.
   * @default 2048
   */
  maxUrlLength?: number;
  /**
   * How a query too long for a URL is sent: `POST`, or the HTTP `QUERY`
   * method (a safe method with a body, which caches can key on). `QUERY`
   * needs every proxy in between to allow it.
   * @default 'post'
   */
  longQuery?: 'post' | 'query';
  /**
   * Batch queries (and, separately, mutations) made in the same tick into
   * one request. The server must enable batching too. A call opts out with
   * `{ batch: false }`.
   * @default false
   */
  batch?: boolean | { maxItems?: number };
  /**
   * `false` turns subscriptions (SSE) off: procedures lose `.subscribe()`,
   * for a link that should only carry queries and mutations.
   * @default true
   */
  subscriptions?: boolean;
  /**
   * Ask for streamed outputs as binary frames instead of JSONL, so `File`
   * and `Blob` bytes in them arrive unencoded rather than as base64 (a
   * third smaller). Servers that don't know frames answer with JSONL.
   * @default false
   */
  binary?: boolean;
  /** Subscription reconnects after a dropped connection. */
  reconnect?: {
    /** @default 5 */
    attempts?: number;
    /** @default attempt => Math.min(1000 * 2 ** (attempt - 1), 30_000) */
    delayMs?: (attempt: number) => number;
  };
}

/**
 * What `httpLink` declares: its serializer's form, the responses it reports
 * to `onResponse`, batching when on, and no subscriptions when they're off.
 * @since 0.1.0
 * @stability stable
 */
export type HttpLinkDecl<TOpts> = {
  form: FormOfOptions<TOpts>;
  provides: 'response';
} & (TOpts extends { batch: true | { maxItems?: number } }
  ? { batches: true }
  : {}) &
  (TOpts extends { subscriptions: false }
    ? { unsupported: 'subscription' }
    : {});

const isAbort = (cause: unknown) =>
  cause instanceof Error && cause.name === 'AbortError';

function toHttpError(cause: unknown): AnyTrpcError {
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
 * Sends calls over HTTP (17: one link for every HTTP transport). Queries use
 * `GET` with an `?input=` param, mutations `POST`, subscriptions SSE.
 * Outputs with nested `Promise`s or `AsyncIterable`s stream as JSONL. A call
 * whose input holds a `File` or `Blob` is sent alone as `multipart/form-data`.
 *
 * @example
 * ```ts
 * createTrpcClient({
 *   router: routerType<AppRouter>(),
 *   links: [httpLink({ url: 'http://localhost:3000/trpc', batch: true })],
 * });
 * ```
 * @since 0.1.0
 * @stability stable
 */
export function httpLink<TOpts extends HttpLinkOptions>(
  opts: TOpts,
): TrpcLink<HttpLinkDecl<TOpts>>;
export function httpLink(opts: HttpLinkOptions): TrpcLink<any> {
  const serializer = opts.serializer ?? jsonSerializer;
  const baseUrl = String(opts.url).replace(/\/+$/, '');
  const maxUrlLength = opts.maxUrlLength ?? 2048;
  const longQueryMethod = opts.longQuery === 'query' ? 'QUERY' : 'POST';
  const rawFetch = opts.fetch ?? globalThis.fetch;
  const fetchFn = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const res = await rawFetch(input, init);
    const theirs = res.headers.get(HEADER.serializer);
    if (theirs !== null && theirs !== serializer.name) {
      await res.body?.cancel().catch(() => {});
      throw new TrpcError({
        code: 'UNSUPPORTED_PROTOCOL',
        message: `The server uses the '${theirs}' serializer, but this httpLink uses '${serializer.name}'. Pass the same serializer to the handler and httpLink.`,
      });
    }
    return res;
  };
  const maxItems =
    opts.batch === true ? 10 : opts.batch ? (opts.batch.maxItems ?? 10) : 0;
  const reconnectAttempts = opts.reconnect?.attempts ?? 5;
  const reconnectDelay =
    opts.reconnect?.delayMs ??
    ((attempt: number) => Math.min(1000 * 2 ** (attempt - 1), 30_000));
  const reviveError = (value: unknown) => fromWireError(value);
  /** Hands `op` its response; an `onResponse` that throws fails the call. */
  const report = (op: Operation, status: number, headers: Headers) => {
    try {
      op.context.onResponse?.({ status, headers });
    } catch (cause) {
      throw toClientError(cause);
    }
  };

  /**
   * The request options for `ops`, which share one `init` (see `initKey`).
   * Headers, lowest first: `init()`'s, the link's `headers`, the call's
   * `init.headers`, the call's `headers`, then the protocol's.
   */
  async function requestInit(
    ops: ReadonlyArray<Operation>,
    extra: Record<string, string>,
    request: { method: string; body?: BodyInit; signal: AbortSignal },
  ): Promise<RequestInit> {
    const base =
      typeof opts.init === 'function' ? await opts.init({ ops }) : opts.init;
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
      base?.next || call?.next ? { ...base?.next, ...call?.next } : undefined;
    return {
      ...base,
      ...call,
      ...(next ? { next } : {}),
      headers,
      ...request,
    };
  }

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
  /** Blobs need a multipart request of their own; a bad input fails alone. */
  const unbatchable = (op: Operation) => {
    if (op.context.batch === false) return true;
    try {
      return encode(op).parts.length > 0 || initKey(op) === undefined;
    } catch {
      return true;
    }
  };

  async function readError(res: Response): Promise<AnyTrpcError> {
    const text = await res.text();
    try {
      return fromWireError(serializer.deserialize(JSON.parse(text)));
    } catch (cause) {
      return new TrpcError({
        code: codeOfStatus(res.status) ?? 'PARSE_ERROR',
        message: `Unexpected ${res.status} response`,
        cause,
      });
    }
  }

  const streamType = opts.binary
    ? `${CONTENT_TYPE.frames}, ${CONTENT_TYPE.jsonl}`
    : CONTENT_TYPE.jsonl;
  const streamed = (type: string) =>
    type.startsWith(CONTENT_TYPE.jsonl) || type.startsWith(CONTENT_TYPE.frames);
  /** A streamed body's lines, parsed. */
  const readStream = (
    type: string,
    body: ReadableStream<Uint8Array>,
  ): Stream.Stream<unknown, AnyTrpcError> =>
    type.startsWith(CONTENT_TYPE.frames)
      ? decodeRecords(
          Stream.fromReadableStream({
            evaluate: () => body,
            onError: toHttpError,
          }),
        )
      : Stream.fromAsyncIterable(readLines(body), toHttpError).pipe(
          Stream.map((line) => JSON.parse(line) as unknown),
        );

  async function readResult(res: Response, op?: Operation): Promise<unknown> {
    if (res.headers.get(HEADER.response) === '1') return res;
    if (!res.ok) throw await readError(res);
    const blob = res.headers.get(HEADER.blob);
    if (blob !== null) return readBlob(res, blob);
    const type = res.headers.get('content-type') ?? '';
    if (streamed(type) && res.body) {
      const frames = readStream(type, res.body) as Stream.Stream<
        Frame,
        AnyTrpcError
      >;
      const resume = op && resumeOf(op.context);
      return Effect.runPromise(
        serializer.deserializeStream(
          resume ? resumable(op, resume, frames) : frames,
          { reviveError, ...streamErrors },
        ),
      );
    }
    const text = await res.text();
    return text ? serializer.deserialize(JSON.parse(text)) : undefined;
  }

  /**
   * `frames`, then, when the connection drops, the rest from a retry that
   * says how many arrived (`trpc-resume-from`), fed to the same deserializer.
   */
  const resumable = (
    op: Operation,
    resume: Resume,
    frames: Stream.Stream<Frame, AnyTrpcError>,
  ): Stream.Stream<Frame, AnyTrpcError> => {
    let count = 0;
    const reopen = (
      n: number,
      error: AnyTrpcError,
    ): Stream.Stream<Frame, AnyTrpcError> =>
      n < resume.retries && resume.lost(error)
        ? Stream.unwrap(
            Effect.sleep(resume.delayMs(n + 1, error)).pipe(
              Effect.andThen(
                Effect.tryPromise({
                  try: async (signal) => {
                    const res = await send(
                      op,
                      `${CONTENT_TYPE.json}, ${streamType}`,
                      { [HEADER.resumeFrom]: String(count) },
                      linked(signal, op),
                    );
                    report(op, res.status, res.headers);
                    if (!res.ok) throw await readError(res);
                    const type = res.headers.get('content-type') ?? '';
                    if (!streamed(type) || !res.body) {
                      throw new TrpcError({
                        code: 'PARSE_ERROR',
                        message: 'A resumed call answered without frames',
                      });
                    }
                    return readStream(type, res.body) as Stream.Stream<
                      Frame,
                      AnyTrpcError
                    >;
                  },
                  catch: toHttpError,
                }),
              ),
              Effect.match({
                onFailure: (next) => reopen(n + 1, next),
                onSuccess: (next) => attempt(n + 1, next),
              }),
            ),
          )
        : Stream.fail(error);
    const attempt = (
      n: number,
      from: Stream.Stream<Frame, AnyTrpcError>,
    ): Stream.Stream<Frame, AnyTrpcError> =>
      Stream.catch(
        Stream.tap(from, () => Effect.sync(() => count++)),
        (error) => reopen(n, error),
      );
    return attempt(0, frames);
  };

  /** `GET` with the input in the URL, or a body above `maxUrlLength`. */
  async function send(
    op: Operation,
    accept: string,
    extra: Record<string, string>,
    signal: AbortSignal,
  ): Promise<Response> {
    const url = `${baseUrl}/${op.path}`;
    const encoded = encode(op);
    const { json } = encoded;
    if (encoded.parts.length > 0) {
      const form = new FormData();
      form.append('input', JSON.stringify(json));
      for (const [i, blob] of encoded.parts.entries()) {
        form.append(String(i), blob, blob instanceof File ? blob.name : 'blob');
      }
      return fetchFn(
        url,
        await requestInit(
          [op],
          { accept, ...extra },
          {
            method: 'POST',
            body: form,
            signal,
          },
        ),
      );
    }
    if (op.type !== 'mutation') {
      const search = json === undefined ? '' : toInputSearch(json);
      const full = search ? `${url}?${search}` : url;
      if (full.length <= maxUrlLength) {
        return fetchFn(
          full,
          await requestInit(
            [op],
            { accept, ...extra },
            { method: 'GET', signal },
          ),
        );
      }
    }
    return fetchFn(
      url,
      await requestInit(
        [op],
        { accept, 'content-type': CONTENT_TYPE.json, ...extra },
        {
          method: op.type === 'query' ? longQueryMethod : 'POST',
          body: json === undefined ? '' : JSON.stringify(json),
          signal,
        },
      ),
    );
  }

  const linked = (signal: AbortSignal, op: Operation) =>
    op.signal ? AbortSignal.any([signal, op.signal]) : signal;

  const single = (op: Operation): OperationStream =>
    Stream.fromEffect(
      Effect.tryPromise({
        try: async (signal) => {
          const res = await send(
            op,
            `${CONTENT_TYPE.json}, ${streamType}`,
            {},
            linked(signal, op),
          );
          report(op, res.status, res.headers);
          return readResult(res, op);
        },
        catch: toHttpError,
      }),
    );

  // --- batching -------------------------------------------------------------------

  interface Pending {
    op: Operation;
    aborted: boolean;
    settled: boolean;
    resolve: (value: unknown) => void;
    reject: (error: AnyTrpcError) => void;
    onAbort?: () => void;
  }
  const queues = { query: [] as Pending[], mutation: [] as Pending[] };
  let scheduled = false;

  const dispatch = (items: Pending[]): Effect.Effect<void> =>
    Effect.suspend(() => {
      const live = items.filter((item) => !item.aborted);
      if (live.length === 0) return Effect.void;
      const controller = new AbortController();
      for (const item of live) {
        item.onAbort = () => {
          if (live.every((i) => i.aborted || i.settled)) controller.abort();
        };
      }
      const received = new Set<number>();
      const rejectRest = (err: AnyTrpcError) => {
        for (const [i, item] of live.entries()) {
          if (!received.has(i)) item.reject(err);
        }
      };
      return Effect.gen(function* () {
        const frames = yield* forEachSeq(live, () =>
          Queue.unbounded<Frame, AnyTrpcError | Cause.Done>(),
        );
        const onLine = (line: BatchLine, headers: Headers) => {
          const item = live[line.i];
          const queue = frames[line.i];
          if (!item || !queue) return Effect.void;
          if ('chunk' in line) {
            Queue.offerUnsafe(queue, line.chunk as Frame);
            return Effect.void;
          }
          received.add(line.i);
          try {
            report(item.op, line.status, headers);
          } catch (error) {
            item.reject(error as AnyTrpcError);
            Queue.endUnsafe(queue);
            return Effect.void;
          }
          if (line.status >= 400) {
            let error: AnyTrpcError;
            try {
              error = fromWireError(serializer.deserialize(line.body as never));
            } catch (cause) {
              error = parseError('Invalid error message')(cause);
            }
            item.reject(error);
            Queue.endUnsafe(queue);
            return Effect.void;
          }
          Queue.offerUnsafe(queue, line.body as Frame);
          return serializer
            .deserializeStream(Stream.fromQueue(queue), {
              reviveError,
              ...streamErrors,
            })
            .pipe(
              Effect.matchCause({
                onSuccess: item.resolve,
                onFailure: (cause) =>
                  item.reject(toHttpError(Cause.squash(cause))),
              }),
              Effect.forkDetach,
            );
        };
        yield* Effect.gen(function* () {
          const calls: BatchCall[] = live.map((item) => {
            const encoded = encode(item.op);
            return {
              path: item.op.path,
              ...(encoded.json === undefined ? {} : { input: encoded.json }),
            };
          });
          const res = yield* Effect.tryPromise({
            try: async () =>
              fetchFn(
                baseUrl,
                await requestInit(
                  live.map((i) => i.op),
                  {
                    accept: streamType,
                    'content-type': CONTENT_TYPE.json,
                    [HEADER.batch]: '1',
                  },
                  {
                    method: 'POST',
                    body: JSON.stringify(calls),
                    signal: controller.signal,
                  },
                ),
              ),
            catch: toHttpError,
          });
          if (!res.ok || !res.body) {
            const err = yield* Effect.promise(() => readError(res));
            for (const item of live) {
              let failure = err;
              try {
                report(item.op, res.status, res.headers);
              } catch (error) {
                failure = error as AnyTrpcError;
              }
              item.reject(failure);
            }
            return;
          }
          yield* readStream(
            res.headers.get('content-type') ?? '',
            res.body,
          ).pipe(
            Stream.runForEach((line) => onLine(line as BatchLine, res.headers)),
          );
          rejectRest(
            new TrpcError({
              code: 'PARSE_ERROR',
              message: 'The batch response ended without a result',
            }),
          );
        }).pipe(
          Effect.catchCause((cause) =>
            Effect.sync(() => rejectRest(toHttpError(Cause.squash(cause)))),
          ),
          Effect.ensuring(
            Effect.sync(() => {
              for (const queue of frames) Queue.endUnsafe(queue);
            }),
          ),
        );
      });
    });

  function flush() {
    scheduled = false;
    for (const type of ['query', 'mutation'] as const) {
      const groups = new Map<string, Pending[]>();
      for (const item of queues[type].splice(0)) {
        // Calls without a key are unbatchable, so they never get here.
        const key = initKey(item.op)!;
        let group = groups.get(key);
        if (!group) groups.set(key, (group = []));
        group.push(item);
      }
      for (const items of groups.values()) {
        for (let i = 0; i < items.length; i += maxItems) {
          Effect.runFork(dispatch(items.slice(i, i + maxItems)));
        }
      }
    }
  }

  const batched = (op: Operation): OperationStream =>
    Stream.fromEffect(
      Effect.callback<unknown, AnyTrpcError>((resume) => {
        const item: Pending = {
          op,
          aborted: false,
          settled: false,
          resolve: (value) => {
            if (item.settled) return;
            item.settled = true;
            resume(Effect.succeed(value));
          },
          reject: (error) => {
            if (item.settled) return;
            item.settled = true;
            resume(Effect.fail(error));
          },
        };
        queues[op.type as 'query' | 'mutation'].push(item);
        if (!scheduled) {
          scheduled = true;
          // A macrotask, so calls started in the same tick share a request.
          Effect.runFork(Effect.andThen(Effect.sleep(0), Effect.sync(flush)));
        }
        return Effect.sync(() => {
          item.aborted = true;
          item.onAbort?.();
        });
      }),
    );

  // --- subscriptions ------------------------------------------------------------------

  const subscription = (op: Operation): OperationStream =>
    Stream.callback<Effect.Effect<unknown, AnyTrpcError>, AnyTrpcError>(
      (queue) => {
        const controller = new AbortController();
        let lastEventId = op.lastEventId;
        let attempt = 0;
        const giveUp = () =>
          op.context.reconnect === false || ++attempt > reconnectAttempts;

        const read = (
          event: { event: string; data: string; id?: string | undefined },
          decoder: DeferredDecoder,
        ): Effect.Effect<boolean, unknown> => {
          switch (event.event) {
            case SSE_EVENT.done:
              return Effect.succeed(true);
            case SSE_EVENT.error:
              return Effect.try({
                try: () =>
                  fromWireError(serializer.deserialize(JSON.parse(event.data))),
                catch: (cause) => cause,
              }).pipe(Effect.flatMap(Effect.fail));
            case SSE_EVENT.chunk:
              return Effect.try({
                try: () =>
                  JSON.parse(event.data) as { e: number; chunk?: unknown },
                catch: (cause) => cause,
              }).pipe(
                Effect.flatMap((frame) =>
                  'chunk' in frame
                    ? decoder.chunk(frame.e, frame.chunk)
                    : decoder.end(frame.e),
                ),
                Effect.as(false),
              );
            case SSE_EVENT.message:
            case SSE_EVENT.deferred: {
              if (event.id !== undefined) lastEventId = event.id;
              attempt = 0;
              return Effect.try({
                try: () => JSON.parse(event.data) as unknown,
                catch: (cause) => cause,
              }).pipe(
                Effect.flatMap((data) =>
                  event.event === SSE_EVENT.deferred
                    ? decoder.decode(
                        (data as { body: unknown }).body,
                        (data as { e: number }).e,
                      )
                    : decoder.decode(data, undefined),
                ),
                Effect.map((value) => {
                  Queue.offerUnsafe(
                    queue,
                    Effect.mapError(value, parseError('Invalid event')),
                  );
                  return false;
                }),
              );
            }
            default:
              return Effect.succeed(false);
          }
        };

        /** One connection; `true` once the server ended the subscription. */
        const connect = Effect.gen(function* () {
          const res = yield* Effect.tryPromise({
            try: () =>
              send(
                op,
                CONTENT_TYPE.sse,
                lastEventId ? { [HEADER.lastEventId]: lastEventId } : {},
                linked(controller.signal, op),
              ),
            catch: (cause) => cause,
          }).pipe(
            Effect.catch((cause) =>
              giveUp() ? Effect.fail(toHttpError(cause)) : Effect.succeed(null),
            ),
          );
          if (!res) return false;
          yield* Effect.try({
            try: () => report(op, res.status, res.headers),
            catch: toClientError,
          });
          if (!res.ok || !res.body) {
            return yield* Effect.fail(
              yield* Effect.promise(() => readError(res)),
            );
          }
          const decoder = makeDeferredDecoder(serializer);
          const ended = yield* Stream.fromAsyncIterable(
            parseSse(res.body),
            (cause) => cause,
          ).pipe(
            Stream.mapEffect((event) => read(event, decoder)),
            Stream.takeUntil((done) => done),
            Stream.runLast,
            Effect.map((last) => Option.getOrElse(last, () => false)),
            // Anything but a server error reconnects.
            Effect.catch((cause) =>
              isTrpcError(cause) ? Effect.fail(cause) : Effect.succeed(false),
            ),
            Effect.ensuring(decoder.close),
          );
          if (ended) return true;
          if (giveUp()) {
            return yield* Effect.fail(
              new TrpcError({
                code: 'NETWORK_ERROR',
                message: 'The subscription connection was lost',
              }),
            );
          }
          return false;
        });

        const loop: Effect.Effect<void, AnyTrpcError> = Effect.flatMap(
          connect,
          (ended) =>
            ended
              ? Effect.void
              : Effect.andThen(
                  Effect.sleep(reconnectDelay(attempt)),
                  Effect.suspend(() => loop),
                ),
        );
        return loop.pipe(
          Effect.matchCause({
            onSuccess: () => Queue.endUnsafe(queue),
            onFailure: (cause) => Queue.failCauseUnsafe(queue, cause),
          }),
          Effect.forkScoped,
          // Finalizers run last-added first: aborting the response unblocks
          // the body read before the fiber is interrupted.
          Effect.andThen(
            Effect.addFinalizer(() => Effect.sync(() => controller.abort())),
          ),
        );
      },
    ).pipe(Stream.mapEffect((value) => value));

  return withSerializer(
    (({ op }) => {
      if (op.type === 'subscription') {
        if (opts.subscriptions === false) {
          return Stream.fail(
            new TrpcError({
              code: 'METHOD_NOT_SUPPORTED',
              message: 'This httpLink has subscriptions turned off',
            }),
          );
        }
        return subscription(op);
      }
      return maxItems > 0 && !unbatchable(op) ? batched(op) : single(op);
    }) as TrpcLink<any>,
    serializer,
  );
}
