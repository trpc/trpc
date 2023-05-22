import {
  AnyRouter,
  ProcedureType,
  inferRouterContext,
  inferRouterError,
} from '../../core';
import { TRPCError } from '../../error/TRPCError';
import { TRPCResponse } from '../../rpc';
import { Dict } from '../../types';
import { ResponseMeta } from '../types';

export type HTTPHeaders = Dict<string | string[]>;

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
  /**
   * `data` can be `undefined` in the case of a
   * batched HTTP request with a streamed response,
   * because in that case, the headers are evaluated
   * eagerly, before the responses are ready.
   *
   * This only applies to `httpBatchLink` using the
   * `streamRequester` option.
   */
  data?: TRPCResponse<unknown, inferRouterError<TRouter>>[];
  ctx?: inferRouterContext<TRouter>;
  /**
   * The different tRPC paths requested
   **/
  paths?: string[];
  type: ProcedureType | 'unknown';
  errors: TRPCError[];
}) => ResponseMeta;
