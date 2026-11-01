/**
 * The APIs `.agent-docs/open/client-bundle-cuts.md` proposes, as types: B
 * (cuts 2 to 5) passes `batching()`, `sse()` and
 * `experimental_httpStreams()` to `httpLink` and wraps a custom
 * subscription link with `withSubscriptions`; C is B's API (cut 1 changes
 * no types); D (cut 6) adds `promiseLink` and `httpStreamLink`, and
 * `httpLink` carries only queries and mutations. A is `httpLink` as it is.
 */
import type {
  AnyLink,
  HttpLinkOptions,
  Operation,
  TrpcLink,
  httpLink,
} from '@trpc12/trpc/client';

type DeclOf<L> = L extends TrpcLink<infer D> ? D : never;
/** The declarations today's `httpLink` makes for options `TOpts`. */
type HttpDecl<TOpts extends HttpLinkOptions> = DeclOf<
  ReturnType<typeof httpLink<TOpts>>
>;

declare const feature: unique symbol;
interface Feature<TName extends string> {
  readonly [feature]: TName;
}

/** B: batches queries (and, separately, mutations) made in the same tick. */
export declare function batchingB(opts?: {
  maxItems?: number;
}): Feature<'batching'>;

/** B: carries subscriptions over SSE. */
export declare function sseB(opts?: {
  reconnect?: HttpLinkOptions['reconnect'];
}): Feature<'sse'>;

/** B: reads streamed outputs, as JSONL or binary frames. */
export declare function experimental_httpStreamsB(opts?: {
  binary?: boolean;
}): Feature<'httpStreams'>;

/** B: `httpLink`'s options, whose features are imports. */
export interface HttpLinkOptionsB extends Omit<
  HttpLinkOptions,
  'batch' | 'subscriptions' | 'binary' | 'reconnect'
> {
  batch?: Feature<'batching'>;
  subscriptions?: Feature<'sse'>;
  streams?: Feature<'httpStreams'>;
}

/** B: `httpLink`, which batches and carries subscriptions only when passed the feature. */
export declare function httpLinkB<TOpts extends HttpLinkOptionsB>(
  opts: TOpts,
): TrpcLink<
  HttpDecl<{
    url: string;
    batch: TOpts extends { batch: object } ? true : false;
    subscriptions: TOpts extends { subscriptions: object } ? true : false;
  }>
>;

/** B: marks a custom link as the one that ends a subscription's chain. */
export declare function withSubscriptionsB<L extends AnyLink>(link: L): L;

/** C: B's `batching()`. */
export declare const batchingC: typeof batchingB;
/** C: B's `sse()`. */
export declare const sseC: typeof sseB;
/** C: B's `httpLink`, sending with `fetch` through Effect's primitives. */
export declare const httpLinkC: typeof httpLinkB;

/** D: a `fetch` link for queries and mutations, without Effect. */
export declare function httpLinkD(opts: {
  url: string | URL;
  headers?: HttpLinkOptions['headers'];
  fetch?: HttpLinkOptions['fetch'];
}): TrpcLink<HttpDecl<{ url: string; subscriptions: false }>>;

/** D: today's `httpLink`: batching, streamed outputs, SSE. */
export declare const httpStreamLinkD: typeof httpLink;

/** D: a link written with Promises. */
export declare function promiseLinkD(
  fn: (opts: {
    readonly op: Operation;
    readonly next: (op: Operation) => Promise<unknown>;
  }) => Promise<unknown>,
): TrpcLink;
