import http from 'http';
import qs from 'qs';
import { inferRouterContext } from '../..';
import { HTTPBaseHandlerOptions } from '../../http/internals/HTTPHandlerOptions';
import { AnyRouter } from '../../router';

export type BaseRequest = http.IncomingMessage & {
  method?: string;
  query?: qs.ParsedQs;
  body?: unknown;
};
export type BaseResponse = http.ServerResponse;

export type NodeHTTPHandlerOptions<
  TRouter extends AnyRouter,
  TRequest extends BaseRequest,
  TResponse extends BaseResponse,
> = HTTPBaseHandlerOptions<TRouter, TRequest> & {
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

export type CreateContextFnOptions<TRequest, TResponse> = {
  req: TRequest;
  res: TResponse;
};
export type CreateContextFn<TRouter extends AnyRouter, TRequest, TResponse> = (
  opts: CreateContextFnOptions<TRequest, TResponse>,
) => inferRouterContext<TRouter> | Promise<inferRouterContext<TRouter>>;
