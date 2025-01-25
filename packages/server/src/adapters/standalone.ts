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
// @trpc/server
import { type AnyRouter } from '../@trpc/server';
// eslint-disable-next-line no-restricted-imports
import { run } from '../unstable-core-do-not-import';
import type {
  NodeHTTPCreateContextFnOptions,
  NodeHTTPHandlerOptions,
} from './node-http';
import {
  createURL,
  internal_exceptionHandler,
  nodeHTTPRequestHandler,
} from './node-http';

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
    run(async () => {
      const url = createURL(req);

      // get procedure path and remove the leading slash
      // /procedure -> procedure
      path = url.pathname.slice(1);

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

export function createHTTPServer<TRouter extends AnyRouter>(
  opts: CreateHTTPHandlerOptions<TRouter>,
) {
  return http.createServer(createHTTPHandler(opts));
}
