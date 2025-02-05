/* eslint-disable @typescript-eslint/no-duplicate-type-constituents */
/**
 * If you're making an adapter for tRPC and looking at this file for reference, you should import types and functions from `@trpc/server` and `@trpc/server/http`
 *
 * @example
 * ```ts
 * import type { AnyTRPCRouter } from '@trpc/server'
 * import type { HTTPBaseHandlerOptions } from '@trpc/server/http'
 * ```
 */
import type * as http from 'http';
import type * as http2 from 'http2';
import type { EventEmitter } from 'stream';
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
// eslint-disable-next-line no-restricted-imports
import type { MaybePromise } from '../../unstable-core-do-not-import';

export interface NodeHTTPRequest extends EventEmitter {
  /**
   * Many adapters will add a `body` property to the incoming message and pre-parse the body
   */
  body?: unknown;
  /**
   * Socket is not always available in all deployments, so we need to make it optional
   * @see https://github.com/trpc/trpc/issues/6341
   * The socket object provided in the request does not fully implement the expected Node.js Socket interface.
   * @see https://github.com/trpc/trpc/pull/6358
   */
  socket?: Partial<http.IncomingMessage['socket']>;

  headers:
    | http.IncomingMessage['headers']
    | http2.Http2ServerRequest['headers'];

  url?: http.IncomingMessage['url'] | http2.Http2ServerRequest['url'];
  method?: http.IncomingMessage['method'] | http2.Http2ServerRequest['method'];
  destroy:
    | http.IncomingMessage['destroy']
    | http2.Http2ServerRequest['destroy'];
}

export interface NodeHTTPResponse extends EventEmitter {
  write: (chunk: string | Uint8Array) => boolean;
  end: http.ServerResponse['end'] | http2.Http2ServerResponse['end'];
  /**
   * Force the partially-compressed response to be flushed to the client.
   *
   * Added by compression middleware
   * (depending on the environment,
   * e.g. Next <= 12,
   * e.g. Express w/ `compression()`)
   */
  flush?: () => void;

  statusCode:
    | http.ServerResponse['statusCode']
    | http2.Http2ServerResponse['statusCode'];

  headersSent:
    | http.ServerResponse['headersSent']
    | http2.Http2ServerResponse['headersSent'];

  setHeader:
    | http.ServerResponse['setHeader']
    | http2.Http2ServerResponse['setHeader'];
}

export type NodeHTTPCreateContextOption<
  TRouter extends AnyRouter,
  TRequest,
  TResponse,
> = CreateContextCallback<
  inferRouterContext<TRouter>,
  NodeHTTPCreateContextFn<TRouter, TRequest, TResponse>
>;

/**
 * @internal
 */
type ConnectMiddleware<
  TRequest extends NodeHTTPRequest = NodeHTTPRequest,
  TResponse extends NodeHTTPResponse = NodeHTTPResponse,
> = (req: TRequest, res: TResponse, next: (err?: any) => any) => void;

export type NodeHTTPHandlerOptions<
  TRouter extends AnyRouter,
  TRequest extends NodeHTTPRequest,
  TResponse extends NodeHTTPResponse,
> = HTTPBaseHandlerOptions<TRouter, TRequest> &
  NodeHTTPCreateContextOption<TRouter, TRequest, TResponse> & {
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
     *
     * You can also use it for other needs which a connect/node.js compatible middleware can solve,
     *  though you might wish to consider an alternative solution like the Express adapter if your needs are complex.
     */
    middleware?: ConnectMiddleware<TRequest, TResponse>;
    maxBodySize?: number;
  };

export type NodeHTTPRequestHandlerOptions<
  TRouter extends AnyRouter,
  TRequest extends NodeHTTPRequest,
  TResponse extends NodeHTTPResponse,
> = {
  req: TRequest;
  res: TResponse;
  path: string;
} & NodeHTTPHandlerOptions<TRouter, TRequest, TResponse>;

export type NodeHTTPCreateContextFnOptions<TRequest, TResponse> = {
  req: TRequest;
  res: TResponse;
  info: TRPCRequestInfo;
};
export type NodeHTTPCreateContextFn<
  TRouter extends AnyRouter,
  TRequest,
  TResponse,
> = (
  opts: NodeHTTPCreateContextFnOptions<TRequest, TResponse>,
) => MaybePromise<inferRouterContext<TRouter>>;
