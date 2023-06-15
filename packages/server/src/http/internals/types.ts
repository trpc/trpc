import {
  AnyRouter,
  inferRouterContext,
  inferRouterError,
  ProcedureType,
} from '../../core';
import { TRPCError } from '../../error/TRPCError';
import { TRPCResponse } from '../../rpc';
import { Dict } from '../../types';
import { ResponseMeta } from '../types';

export type HTTPHeaders = Dict<string | string[]>;

/** @deprecated - use StreamHTTPResponse instead */
export interface HTTPResponse {
  status: number;
  //FIXME: How is this ever unset? Can this be a required property? It would be more accurate.
  headers?: HTTPHeaders;
  body?: string;
}

export interface StreamHTTPResponse {
  status: number;
  headers: HTTPHeaders;
  body: ReadableStream<Uint8Array> | null;
  text(): Promise<string>;
  json(): Promise<unknown>;
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
