import { IncomingMessage, ServerResponse } from 'http';
import { HTTPBaseHandlerOptions } from '../../http/internals/types';
import { AnyRouter, inferRouterContext } from '../../router';

interface ParsedQs {
  [key: string]: undefined | string | string[] | ParsedQs | ParsedQs[];
}

export type NodeHTTPRequest = IncomingMessage & {
  query?: ParsedQs;
  body?: unknown;
};
export type NodeHTTPResponse = ServerResponse;

export type NodeHTTPCreateContextOption<
  TRouter extends AnyRouter,
  TRequest,
  TResponse,
> = unknown extends inferRouterContext<TRouter>
  ? {
      /**
       * @link https://trpc.io/docs/context
       **/
      createContext?: NodeHTTPCreateContextFn<TRouter, TRequest, TResponse>;
    }
  : {
      /**
       * @link https://trpc.io/docs/context
       **/
      createContext: NodeHTTPCreateContextFn<TRouter, TRequest, TResponse>;
    };

export type NodeHTTPHandlerOptions<
  TRouter extends AnyRouter,
  TRequest extends NodeHTTPRequest,
  TResponse extends NodeHTTPResponse,
> = HTTPBaseHandlerOptions<TRouter, TRequest> & {
  teardown?: () => Promise<void>;
  maxBodySize?: number;
} & NodeHTTPCreateContextOption<TRouter, TRequest, TResponse>;

export type NodeHTTPCreateContextFnOptions<TRequest, TResponse> = {
  req: TRequest;
  res: TResponse;
};
export type NodeHTTPCreateContextFn<
  TRouter extends AnyRouter,
  TRequest,
  TResponse,
> = (
  opts: NodeHTTPCreateContextFnOptions<TRequest, TResponse>,
) => inferRouterContext<TRouter> | Promise<inferRouterContext<TRouter>>;
