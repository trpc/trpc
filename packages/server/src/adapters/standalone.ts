/**
 * If you're making an adapter for tRPC and looking at this file for reference, you should import types and functions from `@trpc/server` and `@trpc/server/http`
 *
 * @example
 * ```ts
 * import type { AnyTRPCRouter } from '@trpc/server'
 * import type { HTTPBaseHandlerOptions } from '@trpc/server/http'
 * ```
 */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import http from 'http';
// @trpc/server
import { type AnyRouter } from '../@trpc/server';
import { toURL } from '../@trpc/server/http';
import type {
  NodeHTTPCreateContextFnOptions,
  NodeHTTPHandlerOptions,
} from './node-http';
import { internal_exceptionHandler, nodeHTTPRequestHandler } from './node-http';

export type CreateHTTPHandlerOptions<TRouter extends AnyRouter> =
  NodeHTTPHandlerOptions<TRouter, http.IncomingMessage, http.ServerResponse>;

export type CreateHTTPContextOptions = NodeHTTPCreateContextFnOptions<
  http.IncomingMessage,
  http.ServerResponse
>;

/**
 * @internal
 */
export function createHTTPHandler<TRouter extends AnyRouter>(
  opts: CreateHTTPHandlerOptions<TRouter>,
): http.RequestListener {
  return (req, res) => {
    let path = '';
    try {
      const url = toURL(req.url!);

      // get procedure path and remove the leading slash
      // /procedure -> procedure
      path = url.pathname.slice(1);

      nodeHTTPRequestHandler({
        ...(opts as any),
        req,
        res,
        path,
      });
    } catch (cause) {
      internal_exceptionHandler<
        TRouter,
        http.IncomingMessage,
        http.ServerResponse
      >({
        req,
        res,
        path,
        ...opts,
      })(cause);
    }
  };
}

export function createHTTPServer<TRouter extends AnyRouter>(
  opts: CreateHTTPHandlerOptions<TRouter>,
) {
  return http.createServer(createHTTPHandler(opts));
}
