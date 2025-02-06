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
// eslint-disable-next-line no-restricted-imports
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

// --- http1 ---
export type CreateHTTPHandlerOptions<TRouter extends AnyRouter> =
  NodeHTTPHandlerOptions<TRouter, http.IncomingMessage, http.ServerResponse>;

export type CreateHTTPContextOptions = NodeHTTPCreateContextFnOptions<
  http.IncomingMessage,
  http.ServerResponse
>;

function createHandler<
  TRouter extends AnyRouter,
  TRequest extends NodeHTTPRequest,
  TResponse extends NodeHTTPResponse,
>(
  opts: NodeHTTPHandlerOptions<TRouter, TRequest, TResponse>,
): (req: TRequest, res: TResponse) => void {
  return (req, res) => {
    let path = '';
    run(async () => {
      const url = createURL(req);

      path = opts.pathname
        ? url.pathname.slice(opts.pathname.length)
        : url.pathname;

      if (path.startsWith('/')) {
        path = path.slice(1);
      }

      await nodeHTTPRequestHandler({
        ...(opts as any),
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
 * @internal
 */
export function createHTTPHandler<TRouter extends AnyRouter>(
  opts: CreateHTTPHandlerOptions<TRouter>,
): http.RequestListener {
  return createHandler(opts);
}

export function createHTTPServer<TRouter extends AnyRouter>(
  opts: CreateHTTPHandlerOptions<TRouter>,
) {
  return http.createServer(createHTTPHandler(opts));
}

// --- http2 ---
export type CreateHTTP2HandlerOptions<TRouter extends AnyRouter> =
  NodeHTTPHandlerOptions<
    TRouter,
    http2.Http2ServerRequest,
    http2.Http2ServerResponse
  >;

export type CreateHTTP2ContextOptions = NodeHTTPCreateContextFnOptions<
  http2.Http2ServerRequest,
  http2.Http2ServerResponse
>;

export function createHTTP2Handler(opts: CreateHTTP2HandlerOptions<AnyRouter>) {
  return createHandler(opts);
}
