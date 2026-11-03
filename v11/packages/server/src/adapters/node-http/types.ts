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
// oxlint-disable-next-line no-restricted-imports
import type {
  DistributiveOmit,
  MaybePromise,
} from '../../unstable-core-do-not-import';

/** A Node.js HTTP/1 or HTTP/2 request, as the Node.js adapters take it. */
export type NodeHTTPRequest = DistributiveOmit<
  http.IncomingMessage | http2.Http2ServerRequest,
  'socket'
> & {
  /**
   * The body, if a framework or middleware parsed it already. tRPC reads
   * it instead of the stream.
   */
  body?: unknown;
  /**
   * Optional, and maybe partial: some hosts don't give a full Node.js
   * socket (https://github.com/trpc/trpc/issues/6341).
   */
  socket?:
    | Partial<http.IncomingMessage['socket']>
    | Partial<http2.Http2ServerRequest['socket']>;
};

/** A Node.js HTTP/1 or HTTP/2 response, as the Node.js adapters take it. */
export type NodeHTTPResponse = DistributiveOmit<
  http.ServerResponse | http2.Http2ServerResponse,
  'write'
> & {
  /**
   * Sends what a compression middleware (such as Express's `compression()`)
   * has buffered so far. tRPC calls it while streaming.
   */
  flush?: () => void;

  write: (chunk: string | Uint8Array) => boolean;
};
/** The Node.js adapters' `createContext` option. */
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

// `NodeHTTPCreateContextOption` must stay the last member: spreading a generic
// `opts` into an object literal merges the new properties into the trailing
// non-generic member, which makes `{ ...opts, req, res, path }` unassignable
// to `NodeHTTPRequestHandlerOptions` (https://github.com/trpc/trpc/issues/6057)
/** The options of the Node.js adapters. */
export type NodeHTTPHandlerOptions<
  TRouter extends AnyRouter,
  TRequest extends NodeHTTPRequest,
  TResponse extends NodeHTTPResponse,
> = HTTPBaseHandlerOptions<TRouter, TRequest> & {
  /**
   * A Connect-style middleware that runs before tRPC. tRPC doesn't answer
   * `OPTIONS` requests or set CORS headers, so use this for `cors()`.
   * @example
   * ```ts
   * createHTTPServer({ middleware: cors(), router: appRouter });
   * ```
   * @see https://trpc.io/docs/server/adapters/standalone#handling-cors--options
   */
  middleware?: ConnectMiddleware<TRequest, TResponse>;
  /**
   * The largest request body, in bytes. A larger one gets a
   * `PAYLOAD_TOO_LARGE` error. It only applies to bodies tRPC reads from
   * the stream; if a body-parsing middleware sets `req.body`, limit the
   * size there.
   */
  maxBodySize?: number;
} & NodeHTTPCreateContextOption<TRouter, TRequest, TResponse>;

/** The options of `nodeHTTPRequestHandler`. */
export type NodeHTTPRequestHandlerOptions<
  TRouter extends AnyRouter,
  TRequest extends NodeHTTPRequest,
  TResponse extends NodeHTTPResponse,
> = NodeHTTPHandlerOptions<TRouter, TRequest, TResponse> & {
  req: TRequest;
  res: TResponse;
  /**
   * The procedure path to handle, such as `post.all`, or several joined by
   * commas for a batch.
   */
  path: string;
};

/**
 * What `createContext` gets in the Node.js adapters: `req`, `res` and the
 * request's `info`.
 * @see https://trpc.io/docs/server/context#creating-the-context
 */
export type NodeHTTPCreateContextFnOptions<TRequest, TResponse> = {
  req: TRequest;
  res: TResponse;
  info: TRPCRequestInfo;
};
/** The `createContext` function the Node.js adapters take. */
export type NodeHTTPCreateContextFn<
  TRouter extends AnyRouter,
  TRequest,
  TResponse,
> = (
  opts: NodeHTTPCreateContextFnOptions<TRequest, TResponse>,
) => MaybePromise<inferRouterContext<TRouter>>;
