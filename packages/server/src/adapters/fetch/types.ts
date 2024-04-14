import type { AnyRouter, inferRouterContext } from '../../core';
import type { HTTPBaseHandlerOptions } from '../../http';

export type FetchCreateContextFnOptions = {
  req: Request;
  resHeaders: Headers;
};

export type FetchCreateContextFn<TRouter extends AnyRouter> = (
  opts: FetchCreateContextFnOptions,
) => inferRouterContext<TRouter> | Promise<inferRouterContext<TRouter>>;

export type FetchCreateContextOption<TRouter extends AnyRouter> = {
  /**
   * @link https://trpc.io/docs/context
   **/
  createContext?: object extends inferRouterContext<TRouter>
    ? FetchCreateContextFn<TRouter> | void
    : FetchCreateContextFn<TRouter>;
};

export type FetchHandlerOptions<TRouter extends AnyRouter> =
  FetchCreateContextOption<TRouter> & HTTPBaseHandlerOptions<TRouter, Request>;
