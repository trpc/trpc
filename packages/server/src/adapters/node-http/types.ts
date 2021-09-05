import http from 'http';
import qs from 'qs';
import { AnyRouter } from '../../router';
import { OnErrorFunction } from '../../internals/OnErrorFunction';
import { HTTPHandlerOptionsBase } from '../../http/internals/HTTPHandlerOptions';
import { inferRouterContext, CreateContextFn } from '../..';

export type BaseRequest = http.IncomingMessage & {
  method?: string;
  query?: qs.ParsedQs;
  body?: unknown;
};
export type BaseResponse = http.ServerResponse;

/**
 * Base interface for any HTTP/WSS handlers
 */
export interface BaseHandlerOptions<TRouter extends AnyRouter, TRequest> {
  onError?: OnErrorFunction<TRouter, TRequest>;
  batching?: {
    enabled: boolean;
  };
  router: TRouter;
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
