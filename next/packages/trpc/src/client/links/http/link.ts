import { Stream, type Duration } from 'effect';
import { TrpcError } from '../../../internal/error.ts';
import type { FormOfOptions, MaybePromise } from '../../../internal/types.ts';
import {
  jsonSerializer,
  type AnySerializer,
} from '../../../transformer/index.ts';
import {
  withSerializer,
  type BuiltinCallOptions,
  type Operation,
  type TrpcLink,
  type TrpcRequestInit,
} from '../../link.ts';
import { makeBatcher } from './batch.ts';
import { makeSubscriptions } from './sse.ts';
import { makeTransport } from './transport.ts';

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
    /**
     * Delay before each reconnect: milliseconds, a string like `'2 seconds'`
     * or a `Duration`.
     * @default attempt => Math.min(1000 * 2 ** (attempt - 1), 30_000)
     */
    delay?: (attempt: number) => Duration.Input;
  };
}

/**
 * What `httpLink` declares: the call options it reads (`headers`, `init`,
 * `batch`, `reconnect`, `onResponse`), its serializer's form, the responses it reports
 * to `onResponse`, the errors it makes (`NETWORK_ERROR` when `fetch`
 * fails or a connection drops, `BAD_RESPONSE` for a page that isn't tRPC's
 * or a body that doesn't decode, `STREAM_INTERRUPTED` for a stream that
 * stops early), batching unless it's off (a `batch` that may be on, such
 * as a `boolean`, counts as on), and no subscriptions when they're off.
 * @since 0.1.0
 * @stability stable
 */
export type HttpLinkDecl<TOpts> = {
  context: BuiltinCallOptions;
  form: FormOfOptions<TOpts>;
  provides: 'response';
  builtinErrors: 'NETWORK_ERROR' | 'BAD_RESPONSE' | 'STREAM_INTERRUPTED';
} & ('batch' extends keyof TOpts
  ? [Exclude<TOpts[keyof TOpts & 'batch'], undefined>] extends [false]
    ? {}
    : { batches: true }
  : {}) &
  (TOpts extends { subscriptions: false }
    ? { unsupported: 'subscription' }
    : {});

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
  const transport = makeTransport(opts, serializer);
  const maxItems =
    opts.batch === true ? 10 : opts.batch ? (opts.batch.maxItems ?? 10) : 0;
  const batched = makeBatcher<Operation>({
    // Calls without an `initKey` are unbatchable, so they never get here.
    key: transport.batchKey,
    maxItems,
    send: transport.sendBatch,
  });
  const subscription = makeSubscriptions(transport, opts);

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
      return Stream.fromEffect(
        maxItems > 0 && !transport.unbatchable(op)
          ? batched(op)
          : transport.single(op),
      );
    }) as TrpcLink<any>,
    serializer,
  );
}
