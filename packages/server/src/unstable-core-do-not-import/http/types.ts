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
 * @deprecated use `Headers` instead, this will be removed in v12
 */
type HTTPHeaders = Dict<string[] | string>;

export interface ResponseMeta {
  status?: number;
  headers?: Headers | HTTPHeaders;
}

/**
 * @internal
 */
export type ResponseMetaFn<TRouter extends AnyRouter> = (opts: {
  data: TRPCResponse<unknown, inferRouterError<TRouter>>[];
  ctx?: inferRouterContext<TRouter>;
  /**
   * The different tRPC paths requested
   * @deprecated use `info` instead, this will be removed in v12
   **/
  paths: readonly string[] | undefined;
  info: TRPCRequestInfo | undefined;
  type: ProcedureType | 'unknown';
  errors: TRPCError[];
  /**
   * `true` if the `ResponseMeta` is being generated without knowing the response data (e.g. for streamed requests).
   */
  eagerGeneration: boolean;
}) => ResponseMeta;

/**
 * Base interface for anything using HTTP
 */
export interface HTTPBaseHandlerOptions<TRouter extends AnyRouter, TRequest>
  extends BaseHandlerOptions<TRouter, TRequest> {
  /**
   * Add handler to be called before response is sent to the user
   * Useful for setting cache headers
   * @link https://trpc.io/docs/v11/caching
   */
  responseMeta?: ResponseMetaFn<TRouter>;
}

export type TRPCAcceptHeader = 'application/jsonl';

interface TRPCRequestInfoProcedureCall {
  path: string;
  /**
   * Read the raw input (deduped and memoized)
   */
  getRawInput: () => Promise<unknown>;
  /**
   * Get already parsed inputs - won't trigger reading the body or parsing the inputs
   */
  result: () => unknown;
  /**
   * The procedure being called, `null` if not found
   * @internal
   */
  procedure: AnyProcedure | null;
}

/**
 * Information about the incoming request
 * @public
 */
export interface TRPCRequestInfo {
  /**
   * The `trpc-accept` header
   */
  accept: TRPCAcceptHeader | null;
  /**
   * The type of the request
   */
  type: ProcedureType | 'unknown';
  /**
   * If the content type handler has detected that this is a batch call
   */
  isBatchCall: boolean;
  /**
   * The calls being made
   */
  calls: TRPCRequestInfoProcedureCall[];
  /**
   * Connection params when using `httpSubscriptionLink` or `createWSClient`
   */
  connectionParams: Dict<string> | null;
  /**
   * Signal when the request is aborted
   * Can be used to abort async operations during the request, e.g. `fetch()`-requests
   */
  signal: AbortSignal;
}

/**
 * Inner createContext function for `resolveResponse` used to forward `TRPCRequestInfo` to `createContext`
 * @internal
 */
export type ResolveHTTPRequestOptionsContextFn<TRouter extends AnyRouter> =
  (opts: { info: TRPCRequestInfo }) => Promise<inferRouterContext<TRouter>>;

interface HTTPErrorHandlerOptions<TRouter extends AnyRouter, TRequest>
  extends ErrorHandlerOptions<inferRouterContext<TRouter>> {
  req: TRequest;
}
/**
 * @internal
 */
export type HTTPErrorHandler<TRouter extends AnyRouter, TRequest> = (
  opts: HTTPErrorHandlerOptions<TRouter, TRequest>,
) => void;

/**
 * Base interface for any response handler
 * @internal
 */
export interface BaseHandlerOptions<TRouter extends AnyRouter, TRequest> {
  onError?: HTTPErrorHandler<TRouter, TRequest>;
  /**
   * @deprecated use `allowBatching` instead, this will be removed in v12
   */
  batching?: {
    /**
     * @default true
     */
    enabled: boolean;
  };
  router: TRouter;
  /**
   * Allow method override - will skip the method check
   * @default false
   */
  allowMethodOverride?: boolean;
  /**
   * Allow request batching
   * @default true
   */
  allowBatching?: boolean;
}
