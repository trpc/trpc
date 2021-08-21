import {
  BaseHandlerOptions,
  BaseRequest,
  BaseResponse,
} from '../../internals/BaseHandlerOptions';
import {
  AnyRouter,
  inferRouterContext,
  inferRouterError,
  ProcedureType,
} from '../../router';
import { TRPCResponse } from '../../rpc';
import { Dict } from '../../types';
import { CreateContextFn } from '../requestHandler';

type ResponseHeadersFunction<TRouter extends AnyRouter> = (opts: {
  data: TRPCResponse<unknown, inferRouterError<TRouter>>[];
  ctx?: inferRouterContext<TRouter>;
  /**
   * The different tRPC paths requested
   **/
  paths?: string[];
  type: ProcedureType | 'unknown';
}) => Dict<string>;

export interface HTTPHandlerOptions<
  TRouter extends AnyRouter,
  TRequest extends BaseRequest,
  TResponse extends BaseResponse,
> extends BaseHandlerOptions<TRouter, TRequest> {
  /**
   * @link https://trpc.io/docs/context
   **/
  createContext: CreateContextFn<TRouter, TRequest, TResponse>;
  /**
   * Add handler to be called before response is sent to the user
   * Useful for setting cache headers
   * @link https://trpc.io/docs/caching
   */
  getResponseHeaders?: ResponseHeadersFunction<TRouter>;
}
