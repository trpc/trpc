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

/**
 * What `createContext` gets in the Fetch adapter.
 * @see https://trpc.io/docs/server/adapters/fetch#create-the-context
 */
export type FetchCreateContextFnOptions = {
  req: Request;
  /** The response's headers, which you can add to, such as to set cookies. */
  resHeaders: Headers;
  info: TRPCRequestInfo;
};

/** The `createContext` function the Fetch adapter takes. */
export type FetchCreateContextFn<TRouter extends AnyRouter> = (
  opts: FetchCreateContextFnOptions,
) => inferRouterContext<TRouter> | Promise<inferRouterContext<TRouter>>;

/** The Fetch adapter's `createContext` option. */
export type FetchCreateContextOption<TRouter extends AnyRouter> =
  CreateContextCallback<
    inferRouterContext<TRouter>,
    FetchCreateContextFn<TRouter>
  >;

/** The options of the Fetch adapter. */
export type FetchHandlerOptions<TRouter extends AnyRouter> =
  FetchCreateContextOption<TRouter> &
    HTTPBaseHandlerOptions<TRouter, Request> & {
      req: Request;
      /** The path the router is served at, such as `/trpc`. */
      endpoint: string;
    };

/**
 * The options of `fetchRequestHandler`.
 * @see https://trpc.io/docs/server/adapters/fetch
 */
export type FetchHandlerRequestOptions<TRouter extends AnyRouter> =
  HTTPBaseHandlerOptions<TRouter, Request> &
    CreateContextCallback<
      inferRouterContext<TRouter>,
      FetchCreateContextFn<TRouter>
    > & {
      req: Request;
      /** The path the router is served at, such as `/trpc`. */
      endpoint: string;
    };
