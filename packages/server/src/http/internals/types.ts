import { AnyRouter, inferRouterContext, inferRouterError, ProcedureType } from '../../core';
import { TRPCError } from '../../error/TRPCError';
import { TRPCResponse } from '../../rpc';
import { Dict } from '../../types';
import { ResponseMeta } from '../types';


/**
 * @deprecated use the native Fetch API's `Headers` class
 */
export type HTTPHeaders = Dict<string | string[]>;

/**
 * @deprecated use the native Fetch API's `Response` class
 */
export interface HTTPResponse {
  status: number;
  headers?: HTTPHeaders;
  body?: string;
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
