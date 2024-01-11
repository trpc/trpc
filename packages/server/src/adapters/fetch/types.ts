import type { AnyRouter, inferRouterContext } from '../../@trpc-server'; // @trpc/server

// @trpc/server/http
import type {
  HTTPBaseHandlerOptions,
  TRPCRequestInfo,
} from '../../@trpc-server/http';

export type FetchCreateContextFnOptions = {
  req: Request;
  resHeaders: Headers;
  info: TRPCRequestInfo;
};

export type FetchCreateContextFn<TRouter extends AnyRouter> = (
  opts: FetchCreateContextFnOptions,
) => inferRouterContext<TRouter> | Promise<inferRouterContext<TRouter>>;

export type FetchCreateContextOption<TRouter extends AnyRouter> =
  unknown extends inferRouterContext<TRouter>
    ? {
        /**
         * @link https://trpc.io/docs/context
         **/
        createContext?: FetchCreateContextFn<TRouter>;
      }
    : {
        /**
         * @link https://trpc.io/docs/context
         **/
        createContext: FetchCreateContextFn<TRouter>;
      };

export type FetchHandlerOptions<TRouter extends AnyRouter> =
  FetchCreateContextOption<TRouter> & HTTPBaseHandlerOptions<TRouter, Request>;
