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
import type {
  DistributiveOmit,
  MaybePromise,
} from '../../unstable-core-do-not-import';

export type NodeHTTPRequest = DistributiveOmit<
  http.IncomingMessage | http2.Http2ServerRequest,
  'socket'
> & {
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
  socket?:
    | Partial<http.IncomingMessage['socket']>
    | Partial<http2.Http2ServerRequest['socket']>;
};

export type NodeHTTPResponse = DistributiveOmit<
  http.ServerResponse | http2.Http2ServerResponse,
  'write'
> & {
  /**
   * Force the partially-compressed response to be flushed to the client.
   *
   * Added by compression middleware
   * (depending on the environment,
   * e.g. Next <= 12,
   * e.g. Express w/ `compression()`)
   */
  flush?: () => void;

  write: (chunk: string | Uint8Array) => boolean;
};
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
     *   middleware: cors()
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
> = NodeHTTPHandlerOptions<TRouter, TRequest, TResponse> & {
  req: TRequest;
  res: TResponse;
  /**
   * The tRPC path to handle requests for
   * @example 'post.all'
   */
  path: string;
};

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
