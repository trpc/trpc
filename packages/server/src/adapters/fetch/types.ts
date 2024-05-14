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
} from '../../@trpc/server';
// @trpc/server/http
import type {
  HTTPBaseHandlerOptions,
  TRPCRequestInfo,
} from '../../@trpc/server/http';

export type FetchCreateContextFnOptions = {
  req: Request;
  resHeaders: Headers;
  info: TRPCRequestInfo;
};

export type FetchCreateContextFn<TRouter extends AnyRouter> = (
  opts: FetchCreateContextFnOptions,
) => inferRouterContext<TRouter> | Promise<inferRouterContext<TRouter>>;

export type FetchCreateContextOption<TRouter extends AnyRouter> =
  CreateContextCallback<
    inferRouterContext<TRouter>,
    FetchCreateContextFn<TRouter>
  >;

export type FetchHandlerOptions<TRouter extends AnyRouter> =
  FetchCreateContextOption<TRouter> &
    HTTPBaseHandlerOptions<TRouter, Request> & {
      req: Request;
      endpoint: string;
    };

export type FetchHandlerRequestOptions<TRouter extends AnyRouter> =
  HTTPBaseHandlerOptions<TRouter, Request> &
    CreateContextCallback<
      inferRouterContext<TRouter>,
      FetchCreateContextFn<TRouter>
    > & {
      req: Request;
      endpoint: string;
    };
