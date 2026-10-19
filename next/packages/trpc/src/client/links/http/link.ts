import { type Effect, Stream } from 'effect';
import { TrpcError } from '../../../internal/error.ts';
import type { FormOfOptions, MaybePromise } from '../../../internal/types.ts';
import {
  jsonSerializer,
  type AnySerializer,
} from '../../../serializer/index.ts';
import type { AnyTrpcError } from '../../../internal/error.ts';
import {
  withSerializer,
  type Operation,
  type OperationStream,
  type TrpcLink,
  type TrpcRequestInit,
} from '../../link.ts';
import type { HttpBatching } from './batch.ts';
import type { HttpSse } from './sse.ts';
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
   * Ask for streamed outputs as binary frames instead of JSONL, so `File`
   * and `Blob` bytes in them arrive unencoded rather than as base64 (a
   * third smaller). Servers that don't know frames answer with JSONL.
   * @default false
   */
  binary?: boolean;
}

/**
 * What `httpLink` declares: its serializer's form, the responses it reports
 * to `onResponse`, the errors it makes (`NETWORK_ERROR` when `fetch`
 * fails or a connection drops, `BAD_RESPONSE` for a page that isn't tRPC's
 * or a body that doesn't decode, `STREAM_INTERRUPTED` for a stream that
 * stops early), batching with `batching()`, and subscriptions only with
 * `sse()`.
 * @since 0.1.0
 * @stability stable
 */
export type HttpLinkDecl<TOpts> = {
  form: FormOfOptions<TOpts>;
  provides: 'response';
  builtinErrors: 'NETWORK_ERROR' | 'BAD_RESPONSE' | 'STREAM_INTERRUPTED';
} & (TOpts extends { batch: HttpBatching } ? { batches: true } : {}) &
  (TOpts extends { subscriptions: HttpSse }
    ? {}
    : { unsupported: 'subscription' });

/**
 * Sends calls over HTTP (17: one link for every HTTP transport). Queries use
 * `GET` with an `?input=` param, mutations `POST`. Outputs with nested
 * `Promise`s or `AsyncIterable`s stream as JSONL. A call whose input holds a
 * `File` or `Blob` is sent alone as `multipart/form-data`. Batching
 * (`batching()`) and subscriptions over SSE (`sse()`) are imports of their
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
  const subscription = feature<(op: Operation) => OperationStream>(
    opts.subscriptions,
    'subscriptions',
    'sse',
  );

  return withSerializer(
    (({ op }) => {
      if (op.type === 'subscription') {
        if (!subscription) {
          return Stream.fail(
            new TrpcError({
              code: 'METHOD_NOT_SUPPORTED',
              message:
                'This httpLink carries no subscriptions: pass `subscriptions: sse()` to it',
            }),
          );
        }
        return subscription(op);
      }
      return Stream.fromEffect(send(op));
    }) as TrpcLink<any>,
    serializer,
  );
}
