/**
 * If you're making an adapter for tRPC and looking at this file for reference, you should import types and functions from `@trpc/server` and `@trpc/server/http`
 *
 * @example
 * ```ts
 * import type { AnyTRPCRouter } from '@trpc/server'
 * import type { HTTPBaseHandlerOptions } from '@trpc/server/http'
 * ```
 */
// @trpc/server
import type {
  AnyRouter,
  CreateContextCallback,
  inferRouterContext,
  WrapCreateContext,
} from '../../@trpc/server';
// @trpc/server/http
import type {
  BaseContentTypeHandler,
  HTTPBaseHandlerOptions,
  TRPCRequestInfo,
} from '../../@trpc/server/http';

export type FetchCreateContextFnOptions<TRequest extends Request = Request> = {
  req: TRequest;
  resHeaders: Headers;
  info: TRPCRequestInfo;
};

export type FetchCreateContextFn<
  TRouter extends AnyRouter,
  TRequest extends Request = Request,
> = (
  opts: FetchCreateContextFnOptions<TRequest>,
) => inferRouterContext<TRouter> | Promise<inferRouterContext<TRouter>>;

export type FetchCreateContextOption<
  TRouter extends AnyRouter,
  TRequest extends Request = Request,
> = CreateContextCallback<
  inferRouterContext<TRouter>,
  FetchCreateContextFn<TRouter, TRequest>
>;

export type FetchHandlerOptions<
  TRouter extends AnyRouter,
  TRequest extends Request = Request,
> = FetchCreateContextOption<TRouter, TRequest> &
  HTTPBaseHandlerOptions<TRouter, TRequest> & {
    req: TRequest;
    endpoint: string;
  };

export type FetchHandlerRequestOptions<
  TRouter extends AnyRouter,
  TRequest extends Request = Request,
> = HTTPBaseHandlerOptions<TRouter, TRequest> &
  WrapCreateContext<FetchCreateContextFn<TRouter, TRequest>> & {
    req: TRequest;
    endpoint: string;
  };

export interface FetchHTTPContentTypeHandler<
  TRouter extends AnyRouter,
  TRequest extends Request,
> extends BaseContentTypeHandler<
    FetchHandlerRequestOptions<TRouter, TRequest> & {
      url: URL;
    }
  > {}
