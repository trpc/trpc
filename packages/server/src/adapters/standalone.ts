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
import { getTRPCErrorFromUnknown, type AnyRouter } from '../@trpc/server';
import { toURL } from '../@trpc/server/http';
// eslint-disable-next-line no-restricted-imports
import { getErrorShape, run } from '../unstable-core-do-not-import';
import type {
  NodeHTTPCreateContextFnOptions,
  NodeHTTPHandlerOptions,
} from './node-http';
import { nodeHTTPRequestHandler } from './node-http';

export type CreateHTTPHandlerOptions<TRouter extends AnyRouter> =
  NodeHTTPHandlerOptions<TRouter, http.IncomingMessage, http.ServerResponse>;

export type CreateHTTPContextOptions = NodeHTTPCreateContextFnOptions<
  http.IncomingMessage,
  http.ServerResponse
>;

export function createHTTPServer<TRouter extends AnyRouter>(
  opts: CreateHTTPHandlerOptions<TRouter>,
) {
  return http.createServer((req, res) => {
    run(async () => {
      const url = toURL(req.url!);

      // get procedure path and remove the leading slash
      // /procedure -> procedure
      const path = url.pathname.slice(1);

      await nodeHTTPRequestHandler({
        ...(opts as any),
        req,
        res,
        path,
      });
    }).catch((cause) => {
      const error = getTRPCErrorFromUnknown(cause);

      const shape = getErrorShape({
        config: opts.router._def._config,
        error,
        type: 'unknown',
        path: undefined,
        input: undefined,
        ctx: undefined,
      });
      opts.onError?.({
        req,
        error,
        type: 'unknown',
        path: undefined,
        input: undefined,
        ctx: undefined,
      });
      res.statusCode = shape.data.httpStatus;
      res.end(JSON.stringify(shape));
    });
  });
}
