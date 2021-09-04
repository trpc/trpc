import { Maybe } from '@trpc/server';
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
import { TRPCError } from '../../TRPCError';
import { CreateContextFn } from '../requestHandler';
import { ResponseMeta } from '../ResponseMeta';
import { HTTPRequest } from './HTTPResponse';

type ResponseMetaFn<TRouter extends AnyRouter> = (opts: {
  data: TRPCResponse<unknown, inferRouterError<TRouter>>[];
  ctx?: inferRouterContext<TRouter>;
  /**
   * The different tRPC paths requested
   **/
  paths?: string[];
  type: ProcedureType | 'unknown';
  errors: TRPCError[];
}) => ResponseMeta;

export interface HTTPHandlerOptionsBase<TRouter extends AnyRouter, TRequest>
  extends BaseHandlerOptions<TRouter, TRequest> {
  /**
   * Add handler to be called before response is sent to the user
   * Useful for setting cache headers
   * @link https://trpc.io/docs/caching
   */
  responseMeta?: ResponseMetaFn<TRouter>;
}

export type HTTPHandlerOptions<
  TRouter extends AnyRouter,
  TRequest extends BaseRequest,
  TResponse extends BaseResponse,
> = HTTPHandlerOptionsBase<TRouter, TRequest> & {
  teardown?: () => Promise<void>;
  maxBodySize?: number;
} & (inferRouterContext<TRouter> extends void
    ? {
        /**
         * @link https://trpc.io/docs/context
         **/
        createContext?: CreateContextFn<TRouter, TRequest, TResponse>;
      }
    : {
        /**
         * @link https://trpc.io/docs/context
         **/
        createContext: CreateContextFn<TRouter, TRequest, TResponse>;
      });

export interface HTTPHandlerInnerOptions<
  TRouter extends AnyRouter,
  TRequest extends HTTPRequest,
> extends HTTPHandlerOptionsBase<TRouter, TRequest> {
  createContext: () => Promise<inferRouterContext<TRouter>>;
  req: TRequest;
  path: string;
  error?: Maybe<TRPCError>;
}
