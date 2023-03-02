import { IncomingMessage, ServerResponse } from 'http';
import { AnyRouter, inferRouterContext } from '../../core';
import { HTTPBaseHandlerOptions } from '../../http/internals/types';
import { MaybePromise } from '../../types';

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
> = object extends inferRouterContext<TRouter>
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

/**
 * @internal
 */
interface ConnectMiddleware<
  TRequest extends NodeHTTPRequest = NodeHTTPRequest,
  TResponse extends NodeHTTPResponse = NodeHTTPResponse,
> {
  (req: TRequest, res: TResponse, next: (err?: any) => any): void;
}

export type NodeHTTPHandlerOptions<
  TRouter extends AnyRouter,
  TRequest extends NodeHTTPRequest,
  TResponse extends NodeHTTPResponse,
> = HTTPBaseHandlerOptions<TRouter, TRequest> & {
  /**
   * By default, http `OPTIONS` requests are not handled, and CORS headers are not returned.
   *
   * This can be used to handle them manually or via the `cors` npm package: https://www.npmjs.com/package/cors
   *
   * ```ts
   * import cors from 'cors'
   *
   * nodeHTTPRequestHandler({
   *   cors: cors()
   * })
   * ```
   */
  middleware?: ConnectMiddleware;
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
) => MaybePromise<inferRouterContext<TRouter>>;
