import type { TRPCError } from '../error/TRPCError';
import type {
  AnyProcedure,
  ErrorHandlerOptions,
  ProcedureType,
} from '../procedure';
import type {
  AnyRouter,
  inferRouterContext,
  inferRouterError,
} from '../router';
import type { TRPCResponse } from '../rpc';
import type { Dict } from '../types';

/**
 * @deprecated Use `Headers` instead. This will be removed in v12.
 */
type HTTPHeaders = Dict<string[] | string>;

/**
 * The status and headers `responseMeta` sets on a response.
 * @see https://trpc.io/docs/server/caching#using-responsemeta-to-cache-responses
 */
export interface ResponseMeta {
  /** The HTTP status. Defaults to the one tRPC picks from the results. */
  status?: number;
  /** Headers to add to the response. */
  headers?: Headers | HTTPHeaders;
}

/**
 * Sets a response's status and headers from the request and its results.
 * @see https://trpc.io/docs/server/caching#using-responsemeta-to-cache-responses
 * @internal
 */
export type ResponseMetaFn<TRouter extends AnyRouter> = (opts: {
  data: TRPCResponse<unknown, inferRouterError<TRouter>>[];
  ctx?: inferRouterContext<TRouter>;
  /**
   * The paths of the procedures called.
   * @deprecated Use `info` instead. This will be removed in v12.
   **/
  paths: readonly string[] | undefined;
  /** The request, if it could be parsed. */
  info: TRPCRequestInfo | undefined;
  type: ProcedureType | 'unknown';
  /** The errors the calls threw. */
  errors: TRPCError[];
  /**
   * `true` when it's called before the results are known, as for streamed
   * responses.
   */
  eagerGeneration: boolean;
}) => ResponseMeta;

/**
 * The options every HTTP adapter takes.
 */
export interface HTTPBaseHandlerOptions<
  TRouter extends AnyRouter,
  TRequest,
> extends BaseHandlerOptions<TRouter, TRequest> {
  /**
   * Sets the response's status and headers before it's sent, for example
   * to cache it.
   * @see https://trpc.io/docs/server/caching#using-responsemeta-to-cache-responses
   */
  responseMeta?: ResponseMetaFn<TRouter>;
}

/** The `trpc-accept` header's value for a streamed response. */
export type TRPCAcceptHeader = 'application/jsonl';

/** One procedure call in a request. */
export interface TRPCRequestInfoProcedureCall {
  path: string;
  /**
   * Reads the call's input as the client sent it. It's read once, however
   * often it's called.
   */
  getRawInput: () => Promise<unknown>;
  /**
   * The input if it was read already. Doesn't read the body.
   */
  result: () => unknown;
  /**
   * The procedure being called, `null` if not found
   * @internal
   */
  procedure: AnyProcedure | null;
  /**
   * The index of this call in a batch request.
   */
  batchIndex: number;
}

/**
 * What tRPC knows about a request, which `createContext` gets as `info`.
 * @see https://trpc.io/docs/server/context#creating-the-context
 * @public
 */
export interface TRPCRequestInfo {
  /**
   * The `trpc-accept` header.
   */
  accept: TRPCAcceptHeader | null;
  /**
   * The type of the procedures called.
   */
  type: ProcedureType | 'unknown';
  /**
   * Whether the request is a batch.
   */
  isBatchCall: boolean;
  /**
   * Only on a pipelined batch: reads its `pipe`, which says which parts of the
   * calls' inputs to fill in from earlier calls' data. Not validated.
   * @internal
   */
  experimental_getPipe?: () => Promise<unknown>;
  /**
   * The procedure calls in the request.
   */
  calls: TRPCRequestInfoProcedureCall[];
  /**
   * The connection params the client sent with `httpSubscriptionLink` or
   * `createWSClient`.
   */
  connectionParams: Dict<string> | null;
  /**
   * Aborts when the request does. Pass it on to work the request starts,
   * such as `fetch()` calls.
   */
  signal: AbortSignal;
  /**
   * The request's URL, if known.
   */
  url: URL | null;
}

/**
 * The `createContext` that `resolveResponse` takes: it gets the request's
 * `info`.
 * @internal
 */
export type ResolveHTTPRequestOptionsContextFn<TRouter extends AnyRouter> =
  (opts: { info: TRPCRequestInfo }) => Promise<inferRouterContext<TRouter>>;

interface HTTPErrorHandlerOptions<
  TRouter extends AnyRouter,
  TRequest,
> extends ErrorHandlerOptions<inferRouterContext<TRouter>> {
  req: TRequest;
}
/**
 * Called with each error a procedure throws. With streamed responses the
 * response may have started already, so don't rely on setting headers.
 * @see https://trpc.io/docs/server/error-handling#handling-errors
 * @internal
 */
export type HTTPErrorHandler<TRouter extends AnyRouter, TRequest> = (
  opts: HTTPErrorHandlerOptions<TRouter, TRequest>,
) => void;

/**
 * The options every adapter takes.
 * @internal
 */
export interface BaseHandlerOptions<TRouter extends AnyRouter, TRequest> {
  /**
   * Called with each error a procedure throws, for example to log it.
   * @see https://trpc.io/docs/server/error-handling#handling-errors
   */
  onError?: HTTPErrorHandler<TRouter, TRequest>;
  /**
   * @deprecated Use `allowBatching` instead. This will be removed in v12.
   */
  batching?: {
    /**
     * @default true
     */
    enabled: boolean;
  };
  /** The router to serve. */
  router: TRouter;
  /**
   * Lets clients call queries and subscriptions with POST as well as GET.
   * Mutations always use POST.
   * @see https://trpc.io/docs/rpc#overriding-the-default-http-method
   * @default false
   */
  allowMethodOverride?: boolean;
  /**
   * Whether clients can batch calls into one request.
   * @see https://trpc.io/docs/client/links/httpBatchLink#disabling-request-batching
   * @default true
   */
  allowBatching?: boolean;
  /**
   * Whether to accept pipelined batches: batches where a query reads parts of
   * its input from the data of an earlier query. The server fills them in, so
   * a query that depends on another costs no extra round trip. Every call
   * still validates its input and runs its middleware. Enable
   * `experimental_pipelining` on the client's batch link too.
   *
   * Experimental: it may change in a minor release.
   * @see https://trpc.io/docs/client/tanstack-react-query/dependent-queries#one-request
   * @default false
   */
  experimental_allowPipelining?: boolean;
  /**
   * The most calls a batch can have. Larger batches get a 400 error. Set
   * the client's `maxItems` to the same or a lower number.
   * @see https://trpc.io/docs/client/links/httpBatchLink#limiting-batch-size
   * @default unlimited
   */
  maxBatchSize?: number;
}
