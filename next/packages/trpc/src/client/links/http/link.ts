import { Stream, type Effect } from 'effect';
import { TrpcError, type AnyTrpcError } from '../../../internal/error.ts';
import type { FormOfOptions, MaybePromise } from '../../../internal/types.ts';
import {
  jsonSerializer,
  type AnySerializer,
} from '../../../serializer/index.ts';
import {
  withSerializer,
  type BuiltinCallOptions,
  type Operation,
  type TrpcLink,
  type TrpcRequestInit,
} from '../../link.ts';
import type { HttpBatching } from './batch.ts';
import type { HttpSse, Subscriptions } from './sse.ts';
import type { HttpStreams } from './streams.ts';
import { makeTransport, type HttpFeature } from './transport.ts';

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
  /**
   * A custom `fetch`, called with the URL as a string. Any function with
   * that call shape fits, so a wrapper needn't copy extras like Bun's
   * `fetch.preconnect`.
   */
  fetch?: (url: string, init: RequestInit) => Promise<Response>;
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
   * `batching()` batches queries (and, separately, mutations) made in the
   * same tick into one request. The server must enable batching too. A
   * call opts out with `{ batch: false }`. Without it every call is its own
   * request, and batching's code isn't bundled.
   *
   * @example
   * ```ts
   * httpLink({ url, batch: batching({ maxItems: 20 }) });
   * ```
   */
  batch?: HttpBatching | undefined;
  /**
   * `sse()` carries subscriptions over server-sent events. Without it
   * procedures have no `.subscribe()` on this link, and SSE's code isn't
   * bundled.
   *
   * @example
   * ```ts
   * httpLink({ url, subscriptions: sse({ reconnect: { attempts: 3 } }) });
   * ```
   */
  subscriptions?: HttpSse | undefined;
  /**
   * `experimental_httpStreams()` reads streamed outputs (and binary
   * frames). Without it, a call whose output holds a promise, an async
   * iterable or a `Stream` fails with `UNSUPPORTED_PROTOCOL` after it has
   * run, and the decoders aren't bundled; batched calls read their
   * deferred values either way.
   *
   * @example
   * ```ts
   * httpLink({ url, streams: experimental_httpStreams() });
   * ```
   */
  streams?: HttpStreams | undefined;
  /** Moved to `streams: experimental_httpStreams({ binary: true })`. */
  binary?: never;
}

/**
 * What `httpLink` declares: the call options it reads (`headers`, `init`,
 * `batch`, `reconnect`, `onResponse`), its serializer's form, the responses it reports
 * to `onResponse`, the errors it makes (`NETWORK_ERROR` when `fetch`
 * fails or a connection drops, `BAD_RESPONSE` for a page that isn't tRPC's
 * or a body that doesn't decode, `STREAM_INTERRUPTED` for a stream that
 * stops early), batching with `batching()` (a `batch` that may be set
 * counts as set), and subscriptions only with `sse()`.
 * @since 0.1.0
 * @stability stable
 */
export type HttpLinkDecl<TOpts> = {
  context: BuiltinCallOptions;
  form: FormOfOptions<TOpts>;
  provides: 'response';
  builtinErrors: 'NETWORK_ERROR' | 'BAD_RESPONSE' | 'STREAM_INTERRUPTED';
} & ('batch' extends keyof TOpts
  ? [Exclude<TOpts[keyof TOpts & 'batch'], undefined>] extends [never]
    ? {}
    : { batches: true }
  : {}) &
  (TOpts extends { subscriptions: HttpSse }
    ? {}
    : { unsupported: 'subscription' });

/**
 * Sends calls over HTTP (17: one link for every HTTP transport). Queries use
 * `GET` with an `?input=` param, mutations `POST`. Outputs with nested
 * `Promise`s or `AsyncIterable`s stream as JSONL, read with
 * `streams: experimental_httpStreams()`. A call whose input holds a `File`
 * or `Blob` is sent alone as `multipart/form-data`. Batching (`batching()`),
 * subscriptions over SSE (`sse()`) and streamed outputs are imports of their
 * own, so a client bundles only the ones it passes.
 *
 * @example
 * ```ts
 * createTrpcClient({
 *   router: routerType<AppRouter>(),
 *   links: [
 *     httpLink({
 *       url: 'http://localhost:3000/trpc',
 *       batch: batching(),
 *       subscriptions: sse(),
 *     }),
 *   ],
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
  const transport = makeTransport(opts, serializer);
  const feature = <F>(
    value: object | undefined,
    option: string,
    name: string,
  ): F | undefined => {
    // `false`, as before these were imports, still leaves the feature out.
    if (!value) return undefined;
    const given = value as Partial<HttpFeature<F>>;
    if (typeof given.build !== 'function') {
      throw new TypeError(
        `httpLink's \`${option}\` option takes \`${name}()\`, imported from '@trpc12/trpc/client'`,
      );
    }
    return given.build(transport);
  };
  const send =
    feature<(op: Operation) => Effect.Effect<unknown, AnyTrpcError>>(
      opts.batch,
      'batch',
      'batching',
    ) ?? transport.single;
  const subscriptions = feature<Subscriptions>(
    opts.subscriptions,
    'subscriptions',
    'sse',
  );

  const link = (({ op }) => {
    if (op.type === 'subscription') {
      if (!subscriptions) {
        return Stream.fail(
          new TrpcError({
            code: 'METHOD_NOT_SUPPORTED',
            message:
              'This httpLink carries no subscriptions: pass `subscriptions: sse()` to it',
          }),
        );
      }
      return subscriptions.subscribe(op);
    }
    return Stream.fromEffect(send(op));
  }) as TrpcLink<any>;
  return withSerializer(
    subscriptions ? subscriptions.mark(link) : link,
    serializer,
  );
}
