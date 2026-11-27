import type { Observable, Observer } from '@trpc/server/observable';
import type {
  InferrableClientTypes,
  Maybe,
  ProcedureType,
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
export type Operation<TInput = unknown> = {
  /** A number unique to the call within its client. */
  id: number;
  type: 'mutation' | 'query' | 'subscription';
  input: TInput;
  path: string;
  context: OperationContext;
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
  /**
   * The operation types the link can't carry, such as `'subscription'` for
   * `httpBatchLink`. Their client methods can't be called.
   */
  unsupported?: ProcedureType;
}

/**
 * A link: a step every call goes through, such as logging or sending it
 * over HTTP. It's called once when the client is created.
 *
 * `TDecl` says what it reads from `op.context` and what it can't carry. A
 * link that doesn't declare it may read any context.
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

type IsAny<TType> = 0 extends 1 & TType ? true : false;

type inferLinkDecl<TLink> = TLink extends { readonly '~decl'?: infer $Decl }
  ? NonNullable<$Decl>
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
export interface NoLinkReadsContext {
  readonly [noLinkReadsContext]?: never;
}

/**
 * The `context` calls can pass: the fields every link in `TLinks` reads,
 * merged.
 * @public
 */
export type inferLinksContext<TLinks extends readonly unknown[]> =
  UnionToIntersection<
    inferDeclContext<inferLinkDecl<TLinks[number]>>
  > extends infer $Context
    ? keyof $Context extends never
      ? NoLinkReadsContext
      : Simplify<$Context>
    : never;

type inferDeclUnsupported<TDecl> =
  IsAny<TDecl> extends true
    ? never
    : TDecl extends { unsupported: infer $Unsupported extends ProcedureType }
      ? $Unsupported
      : never;

/**
 * The operation types a chain can't carry: those any link in `TLinks`
 * declares it can't.
 * @public
 */
export type inferLinksUnsupported<TLinks extends readonly unknown[]> =
  inferDeclUnsupported<inferLinkDecl<TLinks[number]>>;
