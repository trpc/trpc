import { TRPCError } from '../error/TRPCError';
import { AnyRouter } from '../router';
import { inferRouterContext, ProcedureType } from '../types';
import { HTTPHeaders, ResponseMetaFn } from './internals/types';

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
   * @link https://trpc.io/docs/caching
   */
  responseMeta?: ResponseMetaFn<TRouter>;
}

export interface ResponseMeta {
  status?: number;
  headers?: HTTPHeaders;
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
/**
 * Base interface for any response handler
 * @internal
 */

export interface BaseHandlerOptions<TRouter extends AnyRouter, TRequest> {
  onError?: OnErrorFunction<TRouter, TRequest>;
  batching?: {
    enabled: boolean;
  };
  router: TRouter;
}
/**
 * @internal
 */

export type OnErrorFunction<TRouter extends AnyRouter, TRequest> = (opts: {
  error: TRPCError;
  type: ProcedureType | 'unknown';
  path: string | undefined;
  req: TRequest;
  input: unknown;
  ctx: inferRouterContext<TRouter> | undefined;
}) => void;
