/**
 * If you're making an adapter for tRPC and looking at this file for reference, you should import types and functions from `@trpc/server` and `@trpc/server/http`
 *
 * @example
 * ```ts
 * import type { AnyTRPCRouter } from '@trpc/server'
 * import type { HTTPBaseHandlerOptions } from '@trpc/server/http'
 * ```
 */

import http from 'http';
// --- http2 ---
import type * as http2 from 'http2';
// @trpc/server
import { type AnyRouter } from '../@trpc/server';
// oxlint-disable-next-line no-restricted-imports
import { run } from '../unstable-core-do-not-import';
import type {
  NodeHTTPCreateContextFnOptions,
  NodeHTTPHandlerOptions,
  NodeHTTPRequest,
  NodeHTTPResponse,
} from './node-http';
import {
  createURL,
  internal_exceptionHandler,
  nodeHTTPRequestHandler,
} from './node-http';

// same as in the fetch adapter
const trimSlashes = (path: string): string => {
  path = path.startsWith('/') ? path.slice(1) : path;
  path = path.endsWith('/') ? path.slice(0, -1) : path;

  return path;
};

export type StandaloneHandlerOptions<
  TRouter extends AnyRouter,
  TRequest extends NodeHTTPRequest,
  TResponse extends NodeHTTPResponse,
> = NodeHTTPHandlerOptions<TRouter, TRequest, TResponse> & {
  /**
   * The path the router is served at, such as `/trpc/`. It's cut from the
   * start of each request's path.
   * @default '/'
   * @see https://trpc.io/docs/server/adapters/standalone#custom-basePath
   */
  basePath?: string;
};

// --- http1 ---
/** The options of `createHTTPServer` and `createHTTPHandler`. */
export type CreateHTTPHandlerOptions<TRouter extends AnyRouter> =
  StandaloneHandlerOptions<TRouter, http.IncomingMessage, http.ServerResponse>;

/**
 * What `createContext` gets in the standalone adapter: `req`, `res` and
 * the request's `info`.
 * @see https://trpc.io/docs/server/adapters/standalone#2-use-the-standalone-adapter
 */
export type CreateHTTPContextOptions = NodeHTTPCreateContextFnOptions<
  http.IncomingMessage,
  http.ServerResponse
>;

function createHandler<
  TRouter extends AnyRouter,
  TRequest extends NodeHTTPRequest,
  TResponse extends NodeHTTPResponse,
>(
  opts: StandaloneHandlerOptions<TRouter, TRequest, TResponse>,
): (req: TRequest, res: TResponse) => void {
  const basePath = trimSlashes(opts.basePath ?? '/');

  return (req, res) => {
    let path = '';

    run(async () => {
      const url = createURL(req);

      // get procedure(s) path and remove the slashes around it
      path = trimSlashes(trimSlashes(url.pathname).slice(basePath.length));

      await nodeHTTPRequestHandler({
        ...opts,
        req,
        res,
        path,
      });
    }).catch(
      internal_exceptionHandler({
        req,
        res,
        path,
        ...opts,
      }),
    );
  };
}

/**
 * Creates a Node.js request listener for a router, to use with your own
 * `http.createServer()`.
 * @see https://trpc.io/docs/server/adapters/standalone#adding-a-handler-to-a-custom-http-server
 * @internal
 */
export function createHTTPHandler<TRouter extends AnyRouter>(
  opts: CreateHTTPHandlerOptions<TRouter>,
): http.RequestListener {
  return createHandler(opts);
}

/**
 * Creates a Node.js HTTP server for a router. Call `.listen()` on it.
 * @example
 * ```ts
 * createHTTPServer({ router: appRouter, createContext }).listen(3000);
 * ```
 * @see https://trpc.io/docs/server/adapters/standalone#2-use-the-standalone-adapter
 */
export function createHTTPServer<TRouter extends AnyRouter>(
  opts: CreateHTTPHandlerOptions<TRouter>,
) {
  return http.createServer(createHTTPHandler(opts));
}

// --- http2 ---
/** The options of `createHTTP2Handler`. */
export type CreateHTTP2HandlerOptions<TRouter extends AnyRouter> =
  StandaloneHandlerOptions<
    TRouter,
    http2.Http2ServerRequest,
    http2.Http2ServerResponse
  >;

/**
 * What `createContext` gets in the HTTP/2 standalone adapter.
 * @see https://trpc.io/docs/server/adapters/standalone#http2
 */
export type CreateHTTP2ContextOptions = NodeHTTPCreateContextFnOptions<
  http2.Http2ServerRequest,
  http2.Http2ServerResponse
>;

/**
 * Creates a request listener for a router, to use with Node.js's
 * `http2.createSecureServer()`.
 * @see https://trpc.io/docs/server/adapters/standalone#http2
 */
export function createHTTP2Handler(opts: CreateHTTP2HandlerOptions<AnyRouter>) {
  return createHandler(opts);
}
