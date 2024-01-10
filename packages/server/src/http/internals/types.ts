import type {
  AnyRouter,
  inferRouterContext,
  inferRouterError,
  ProcedureType,
} from '../../core';
import type { TRPCError } from '../../error/TRPCError';
import type { TRPCResponse } from '../../rpc';
import type { Dict } from '../../types';
import type { ResponseMeta } from '../types';

export type HTTPHeaders = Dict<string[] | string>;

export interface HTTPResponse {
  status: number;
  headers?: HTTPHeaders;
  body?: string;
}

export type ResponseChunk = [procedureIndex: number, responseBody: string];

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
