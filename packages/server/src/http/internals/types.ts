import {
  AnyRouter,
  ProcedureType,
  inferRouterContext,
  inferRouterError,
} from '../../core';
import { TRPCError } from '../../error/TRPCError';
import { BaseHandlerOptions } from '../../internals/types';
import { TRPCResponse } from '../../rpc';
import { Dict } from '../../types';
import { ResponseMeta } from '../types';

export type HTTPHeaders = Dict<string | string[]>;

export interface HTTPResponse {
  status: number;
  headers?: HTTPHeaders;
  body?: string;
}

export interface HTTPRequest {
  method: string;
  query: URLSearchParams;
  headers: HTTPHeaders;
  body: unknown;
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
}) => ResponseMeta;

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
