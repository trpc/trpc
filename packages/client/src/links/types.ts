import type { Observable, Observer } from '@trpc/server/observable';
import type {
  InferrableClientTypes,
  Maybe,
  Simplify,
  TRPCResultMessage,
  TRPCSuccessResponse,
} from '@trpc/server/unstable-core-do-not-import';
import type { ResponseEsque } from '../internals/types';
import type { TRPCClientError } from '../TRPCClientError';
import type { TRPCConnectionState } from './internals/subscriptions';

export {
  isNonJsonSerializable,
  isFormData,
  isOctetType,
} from './internals/contentTypes';

/**
 * Context an operation carries through the links, set per call.
 * @see https://trpc.io/docs/client/links#managing-context
 * @internal
 */
export interface OperationContext extends Record<string, unknown> {}

/**
 * A procedure call as it goes through the links.
 * @internal
 */
export type Operation<
  TInput = unknown,
  TContext extends object = OperationContext,
> = {
  /** A number unique to the call within its client. */
  id: number;
  type: 'mutation' | 'query' | 'subscription';
  input: TInput;
  path: string;
  context: TContext;
  signal: Maybe<AbortSignal>;
};

interface HeadersInitEsque {
  [Symbol.iterator](): IterableIterator<[string, string]>;
}

/**
 * Request headers: a `Headers`-like iterable, or an object.
 * @internal
 */
export type HTTPHeaders =
  | HeadersInitEsque
  | Record<string, string[] | string | undefined>;

/**
 * The `fetch` the HTTP links call: only its `(url, options)` form.
 */
export type TRPCFetch = (
  url: string,
  options?: RequestInit,
) => Promise<ResponseEsque>;

/** What a link gets when the client is created. Empty for now. */
export interface TRPCClientRuntime {
  // nothing here anymore
}

/**
 * A result a link passes back: data, a subscription's `started` or
 * `stopped` event, or a change of connection state.
 * @internal
 */
export interface OperationResultEnvelope<TOutput, TError> {
  result:
    | TRPCResultMessage<TOutput>['result']
    | TRPCSuccessResponse<TOutput>['result']
    | TRPCConnectionState<TError>;
  context?: OperationContext;
}

/**
 * The observable of results a link returns for an operation.
 * @internal
 */
export type OperationResultObservable<
  TInferrable extends InferrableClientTypes,
  TOutput,
> = Observable<
  OperationResultEnvelope<TOutput, TRPCClientError<TInferrable>>,
  TRPCClientError<TInferrable>
>;

/**
 * An observer of a link's results.
 * @internal
 */
export type OperationResultObserver<
  TInferrable extends InferrableClientTypes,
  TOutput,
> = Observer<
  OperationResultEnvelope<TOutput, TRPCClientError<TInferrable>>,
  TRPCClientError<TInferrable>
>;

/**
 * Handles one operation: pass it on with `next(op)`, or send it and
 * return the results.
 * @see https://trpc.io/docs/client/links#creating-a-custom-link
 * @internal
 */
export type OperationLink<
  TInferrable extends InferrableClientTypes,
  TInput = unknown,
  TOutput = unknown,
> = (opts: {
  op: Operation<TInput>;
  next: (
    op: Operation<TInput>,
  ) => OperationResultObservable<TInferrable, TOutput>;
}) => OperationResultObservable<TInferrable, TOutput>;

/**
 * What a link declares about itself, for clients created with
 * `createTRPCClient({ router: routerType<AppRouter>(), links })`.
 * @see https://trpc.io/docs/client/links#typing-call-options
 * @public
 */
export interface LinkDecl {
  /**
   * The fields the link reads from `op.context`. Calls can pass them, typed,
   * as `.query(input, { context })`. `{}` declares that the link reads none.
   */
  context?: object;
}

/**
 * A link: a step every call goes through, such as logging or sending it
 * over HTTP. It's called once when the client is created.
 *
 * `TDecl` says what it reads from `op.context`. A link that doesn't
 * declare it may read any context.
 * @see https://trpc.io/docs/client/links#creating-a-custom-link
 * @public
 */
export type TRPCLink<
  TInferrable extends InferrableClientTypes,
  TDecl extends LinkDecl = LinkDecl,
> = ((opts: TRPCClientRuntime) => OperationLink<TInferrable>) & {
  /** Type-only: what the link declares. Never set. */
  readonly '~decl'?: TDecl;
};

type UnionToIntersection<TUnion> = (
  TUnion extends any ? (arg: TUnion) => void : never
) extends (arg: infer TIntersection) => void
  ? TIntersection
  : never;

// A function with no `~decl`, such as an inline `() => ({ op, next }) =>
// next(op)`, declares nothing either.
type inferLinkDecl<TLink> = TLink extends unknown
  ? '~decl' extends keyof TLink
    ? NonNullable<TLink['~decl' & keyof TLink]>
    : LinkDecl
  : never;

type inferDeclContext<TDecl> = TDecl extends unknown
  ? // a link that declares nothing may read any context
    LinkDecl extends TDecl
    ? OperationContext
    : TDecl extends { context: infer $Context }
      ? $Context
      : {}
  : never;

declare const noLinkReadsContext: unique symbol;

/**
 * The call options' `context` when no link reads one: passing any field is
 * an error.
 * @public
 */
// A type literal, not an interface: like `Record<string, unknown>`, it
// then fits where any context is taken, so procedures and handles from
// clients typed both ways stay compatible.
export type NoLinkReadsContext = {
  readonly [noLinkReadsContext]?: never;
};

/**
 * The fields the links in `TLinks` declare they read, merged, for a link
 * that wraps other links to declare.
 * @public
 */
export type inferLinksDeclaredContext<TLinks extends readonly unknown[]> =
  // boxed per link, so a link that declares a union of contexts keeps it
  // instead of having its alternatives intersected
  UnionToIntersection<
    TLinks[number] extends infer $Link
      ? $Link extends unknown
        ? { context: inferDeclContext<inferLinkDecl<$Link>> }
        : never
      : never
  > extends { context: infer $Context }
    ? $Context
    : {};

/**
 * The `context` calls can pass: the fields every link in `TLinks` reads,
 * merged.
 * @public
 */
export type inferLinksContext<TLinks extends readonly unknown[]> =
  inferLinksDeclaredContext<TLinks> extends infer $Context
    ? keyof $Context extends never
      ? NoLinkReadsContext
      : // optional: a call can leave out its options altogether
        Simplify<Partial<$Context>>
    : never;
