import type { TRPCError } from '../error/TRPCError';
import type { ErrorHandlerOptions, ProcedureType } from '../procedure';
import type {
  AnyRouter,
  inferRouterContext,
  inferRouterError,
} from '../router';
import type { TRPCResponse } from '../rpc';
import type { Dict } from '../types';

export type HTTPHeaders = Dict<string[] | string>;

export interface HTTPResponse {
  status: number;
  headers?: HTTPHeaders;
  body?: string;
}

export type ResponseChunk = [procedureIndex: number, responseBody: string];

export interface ResponseMeta {
  status?: number;
  headers?: HTTPHeaders;
}

/**
 * @internal
 */
export type ResponseMetaFn<TRouter extends AnyRouter> = (opts: {
  data: TRPCResponse<unknown, inferRouterError<TRouter>>[];
  ctx?: inferRouterContext<TRouter>;
  /**
   * The different tRPC paths requested
   **/
  paths?: string[];
  type: ProcedureType | 'unknown';
  errors: TRPCError[];
  /**
   * `true` if the `ResponseMeta` are being
   * generated without knowing the response data
   * (e.g. for streaming requests).
   */
  eagerGeneration?: boolean;
}) => ResponseMeta;

export interface HTTPRequest {
  method: string;
  query: URLSearchParams;
  headers: HTTPHeaders;
  body: unknown;
}

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

/** @internal */
export type ProcedureCall = {
  type: ProcedureType;
  input?: unknown;
  path: string;
};

/**
 * Information about the incoming request
 * @internal
 */
export type TRPCRequestInfo = {
  isBatchCall: boolean;
  calls: ProcedureCall[];
};

/**
 * Inner createContext function for `resolveHTTPResponse` used to forward `TRPCRequestInfo` to `createContext`
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
