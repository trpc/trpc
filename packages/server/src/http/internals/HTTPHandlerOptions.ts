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
import { CreateContextFn } from '../requestHandler';

type BeforeEndFunction<TRouter extends AnyRouter> = (opts: {
  data: TRPCResponse<unknown, inferRouterError<TRouter>>[];
  ctx?: inferRouterContext<TRouter>;
  /**
   * The different tRPC paths requested
   **/
  paths?: string[];
  type: ProcedureType | 'unknown';
}) => void;

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
  beforeEnd?: BeforeEndFunction<TRouter>;
}
