import { Cause, Effect, Queue, Stream } from 'effect';
import {
  fromWireError,
  isTrpcError,
  TrpcError,
  type AnyTrpcError,
} from '../../internal/error.ts';
import {
  CONTENT_TYPE,
  HEADER,
  parseSse,
  PROTOCOL_VERSION,
  readLines,
  SSE_EVENT,
  type BatchCall,
  type BatchLine,
} from '../../internal/protocol.ts';
import type { MaybePromise } from '../../internal/types.ts';
import {
  defaultSerializer,
  type Frame,
  type SerializeReturn,
  type Serializer,
} from '../../serializer/index.ts';
import type { Operation, OperationStream, TrpcLink } from '../link.ts';
import { DeferredDecoder, serializeInput } from './events.ts';

/**
 * Options for {@link httpLink}.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface HttpLinkOptions {
  /** The endpoint, e.g. `http://localhost:3000/trpc`. */
  url: string | URL;
  /** Must match the server's. @default defaultSerializer */
  serializer?: Serializer;
  /** Extra headers, merged with each call's `context.headers`. */
  headers?:
    | HeadersInit
    | ((opts: { ops: ReadonlyArray<Operation> }) => MaybePromise<HeadersInit>);
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
   * one request. The server must enable batching too.
   * @default false
   */
  batch?: boolean | { maxItems?: number };
  /** Subscription reconnects after a dropped connection. */
  reconnect?: {
    /** @default 5 */
    attempts?: number;
    /** @default attempt => Math.min(1000 * 2 ** (attempt - 1), 30_000) */
    delayMs?: (attempt: number) => number;
  };
}

class AsyncQueue<T> implements AsyncIterable<T> {
  #items: T[] = [];
  #waiting: ((r: IteratorResult<T>) => void)[] = [];
  #ended = false;
  push(item: T) {
    const waiter = this.#waiting.shift();
    if (waiter) waiter({ value: item, done: false });
    else this.#items.push(item);
  }
  end() {
    this.#ended = true;
    for (const waiter of this.#waiting.splice(0)) {
      waiter({ value: undefined, done: true });
    }
  }
  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => {
        const item = this.#items.shift();
        if (item !== undefined)
          return Promise.resolve({ value: item, done: false });
        if (this.#ended)
          return Promise.resolve({ value: undefined, done: true });
        return new Promise((resolve) => this.#waiting.push(resolve));
      },
    };
  }
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });

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
 * Sends calls over HTTP (17: one link for every HTTP transport). Queries use
 * `GET` with legible params, mutations `POST`, subscriptions SSE. Outputs
 * with nested `Promise`s or `AsyncIterable`s stream as JSONL. A call whose
 * input holds a `File` or `Blob` is sent alone as `multipart/form-data`.
 *
 * @example
 * ```ts
 * createTrpcClient<AppRouter>({
 *   links: [httpLink({ url: 'http://localhost:3000/trpc', batch: true })],
 * });
 * ```
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export function httpLink(opts: HttpLinkOptions): TrpcLink {
  const serializer = opts.serializer ?? defaultSerializer;
  const baseUrl = String(opts.url).replace(/\/+$/, '');
  const maxUrlLength = opts.maxUrlLength ?? 2048;
  const longQueryMethod = opts.longQuery === 'query' ? 'QUERY' : 'POST';
  const fetchFn = opts.fetch ?? globalThis.fetch;
  const maxItems =
    opts.batch === true ? 10 : opts.batch ? (opts.batch.maxItems ?? 10) : 0;
  const reconnectAttempts = opts.reconnect?.attempts ?? 5;
  const reconnectDelay =
    opts.reconnect?.delayMs ??
    ((attempt: number) => Math.min(1000 * 2 ** (attempt - 1), 30_000));
  const reviveError = (value: unknown) => fromWireError(value);

  async function buildHeaders(
    ops: ReadonlyArray<Operation>,
    extra: Record<string, string>,
  ): Promise<Headers> {
    const headers = new Headers(
      typeof opts.headers === 'function'
        ? await opts.headers({ ops })
        : opts.headers,
    );
    for (const op of ops) {
      new Headers(op.context.headers).forEach((v, k) => headers.set(k, v));
    }
    headers.set(HEADER.version, PROTOCOL_VERSION);
    for (const [k, v] of Object.entries(extra)) headers.set(k, v);
    return headers;
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
    try {
      return encode(op).parts.length > 0;
    } catch {
      return true;
    }
  };

  async function readError(res: Response): Promise<AnyTrpcError> {
    const text = await res.text();
    try {
      return fromWireError(
        serializer.deserialize(JSON.parse(text)),
        res.status,
      );
    } catch (cause) {
      return new TrpcError({
        code: 'PARSE_ERROR',
        message: `Unexpected ${res.status} response`,
        status: res.status,
        cause,
      });
    }
  }

  async function readResult(res: Response): Promise<unknown> {
    if (!res.ok) throw await readError(res);
    const type = res.headers.get('content-type') ?? '';
    if (type.startsWith(CONTENT_TYPE.jsonl) && res.body) {
      const frames = Stream.fromAsyncIterable(
        readLines(res.body),
        toHttpError,
      ).pipe(Stream.map((line) => JSON.parse(line) as Frame));
      return Effect.runPromise(
        serializer.deserializeStream(frames, { reviveError }),
      );
    }
    const text = await res.text();
    return text ? serializer.deserialize(JSON.parse(text)) : undefined;
  }

  /** `GET` with the input in the URL, or a body above `maxUrlLength`. */
  async function send(
    op: Operation,
    accept: string,
    extra: Record<string, string>,
    signal: AbortSignal,
  ): Promise<Response> {
    const url = `${baseUrl}/${op.path}`;
    const { json, parts } = encode(op);
    if (parts.length > 0) {
      const form = new FormData();
      form.append('input', JSON.stringify(json));
      for (const [i, blob] of parts.entries()) {
        form.append(String(i), blob, blob instanceof File ? blob.name : 'blob');
      }
      return fetchFn(url, {
        method: 'POST',
        headers: await buildHeaders([op], { accept, ...extra }),
        body: form,
        signal,
      });
    }
    if (op.type !== 'mutation') {
      const search =
        op.input === undefined ? '' : serializer.toSearch(op.input);
      const full = search ? `${url}?${search}` : url;
      if (full.length <= maxUrlLength) {
        return fetchFn(full, {
          method: 'GET',
          headers: await buildHeaders([op], { accept, ...extra }),
          signal,
        });
      }
    }
    return fetchFn(url, {
      method: op.type === 'query' ? longQueryMethod : 'POST',
      headers: await buildHeaders([op], {
        accept,
        'content-type': CONTENT_TYPE.json,
        ...extra,
      }),
      body: json === undefined ? '' : JSON.stringify(json),
      signal,
    });
  }

  const linked = (signal: AbortSignal, op: Operation) =>
    op.signal ? AbortSignal.any([signal, op.signal]) : signal;

  const single = (op: Operation): OperationStream =>
    Stream.fromEffect(
      Effect.tryPromise({
        try: async (signal) =>
          readResult(
            await send(
              op,
              `${CONTENT_TYPE.json}, ${CONTENT_TYPE.jsonl}`,
              {},
              linked(signal, op),
            ),
          ),
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

  async function dispatch(items: Pending[]) {
    const live = items.filter((item) => !item.aborted);
    if (live.length === 0) return;
    const controller = new AbortController();
    for (const item of live) {
      item.onAbort = () => {
        if (live.every((i) => i.aborted || i.settled)) controller.abort();
      };
    }
    const frames = live.map(() => new AsyncQueue<Frame>());
    const received = new Set<number>();
    try {
      const calls: BatchCall[] = live.map((item) => {
        const { json } = encode(item.op);
        return {
          path: item.op.path,
          ...(json === undefined ? {} : { input: json }),
        };
      });
      const res = await fetchFn(baseUrl, {
        method: 'POST',
        headers: await buildHeaders(
          live.map((i) => i.op),
          {
            accept: CONTENT_TYPE.jsonl,
            'content-type': CONTENT_TYPE.json,
            [HEADER.batch]: '1',
          },
        ),
        body: JSON.stringify(calls),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const err = await readError(res);
        for (const item of live) item.reject(err);
        return;
      }
      for await (const text of readLines(res.body)) {
        const line = JSON.parse(text) as BatchLine;
        const item = live[line.i];
        const queue = frames[line.i];
        if (!item || !queue) continue;
        if ('chunk' in line) {
          queue.push(line.chunk as Frame);
          continue;
        }
        received.add(line.i);
        if (line.status >= 400) {
          item.reject(
            fromWireError(
              serializer.deserialize(line.body as never),
              line.status,
            ),
          );
          queue.end();
          continue;
        }
        queue.push(line.body as Frame);
        Effect.runPromise(
          serializer.deserializeStream(
            Stream.fromAsyncIterable(queue, toHttpError),
            { reviveError },
          ),
        ).then(item.resolve, (cause) => item.reject(toHttpError(cause)));
      }
      for (const [i, item] of live.entries()) {
        if (received.has(i)) continue;
        item.reject(
          new TrpcError({
            code: 'PARSE_ERROR',
            message: 'The batch response ended without a result',
          }),
        );
      }
    } catch (cause) {
      for (const [i, item] of live.entries()) {
        if (!received.has(i)) item.reject(toHttpError(cause));
      }
    } finally {
      for (const queue of frames) queue.end();
    }
  }

  function flush() {
    scheduled = false;
    for (const type of ['query', 'mutation'] as const) {
      const items = queues[type].splice(0);
      for (let i = 0; i < items.length; i += maxItems) {
        void dispatch(items.slice(i, i + maxItems));
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
          setTimeout(flush, 0);
        }
        return Effect.sync(() => {
          item.aborted = true;
          item.onAbort?.();
        });
      }),
    );

  // --- subscriptions ------------------------------------------------------------------

  async function* events(op: Operation, signal: AbortSignal) {
    let lastEventId = op.lastEventId;
    let attempt = 0;
    const retry = () => op.context.reconnect !== false;
    while (!signal.aborted) {
      let res: Response | undefined;
      try {
        res = await send(
          op,
          CONTENT_TYPE.sse,
          lastEventId ? { [HEADER.lastEventId]: lastEventId } : {},
          signal,
        );
      } catch (cause) {
        if (signal.aborted) return;
        if (!retry() || ++attempt > reconnectAttempts) {
          throw toHttpError(cause);
        }
      }
      if (res) {
        if (!res.ok || !res.body) throw await readError(res);
        const decoder = new DeferredDecoder(serializer);
        try {
          for await (const event of parseSse(res.body)) {
            switch (event.event) {
              case SSE_EVENT.done:
                return;
              case SSE_EVENT.error:
                throw fromWireError(
                  serializer.deserialize(JSON.parse(event.data)),
                );
              case SSE_EVENT.chunk: {
                const frame = JSON.parse(event.data) as {
                  e: number;
                  chunk?: unknown;
                };
                if ('chunk' in frame) decoder.chunk(frame.e, frame.chunk);
                else decoder.end(frame.e);
                continue;
              }
              case SSE_EVENT.message:
              case SSE_EVENT.deferred: {
                if (event.id !== undefined) lastEventId = event.id;
                attempt = 0;
                const data = JSON.parse(event.data) as unknown;
                yield await (event.event === SSE_EVENT.deferred
                  ? decoder.decode(
                      (data as { body: unknown }).body,
                      (data as { e: number }).e,
                    )
                  : decoder.decode(data, undefined));
                continue;
              }
            }
          }
        } catch (cause) {
          if (isTrpcError(cause)) throw cause;
        } finally {
          decoder.close();
        }
        if (signal.aborted) return;
        if (!retry() || ++attempt > reconnectAttempts) {
          throw new TrpcError({
            code: 'NETWORK_ERROR',
            message: 'The subscription connection was lost',
          });
        }
      }
      await sleep(reconnectDelay(attempt), signal);
    }
  }

  const subscription = (op: Operation): OperationStream =>
    Stream.callback<unknown, AnyTrpcError>((queue) =>
      Effect.gen(function* () {
        const controller = new AbortController();
        yield* Effect.addFinalizer(() => Effect.sync(() => controller.abort()));
        void (async () => {
          try {
            for await (const event of events(op, controller.signal)) {
              Queue.offerUnsafe(queue, event);
            }
            Queue.endUnsafe(queue);
          } catch (cause) {
            if (!controller.signal.aborted) {
              Queue.failCauseUnsafe(queue, Cause.fail(toHttpError(cause)));
            }
          }
        })();
      }),
    );

  return ({ op }) => {
    if (op.type === 'subscription') return subscription(op);
    return maxItems > 0 && !unbatchable(op) ? batched(op) : single(op);
  };
}
