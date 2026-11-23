/**
 * If you're making an adapter for tRPC and looking at this file for reference, you should import types and functions from `@trpc/server` and `@trpc/server/http`
 *
 * @example
 * ```ts
 * import type { AnyTRPCRouter } from '@trpc/server'
 * import type { HTTPBaseHandlerOptions } from '@trpc/server/http'
 * ```
 */
import type * as express from 'express';
import type { AnyRouter } from '../@trpc/server';
// oxlint-disable-next-line no-restricted-imports
import { run } from '../unstable-core-do-not-import';
import type {
  NodeHTTPCreateContextFnOptions,
  NodeHTTPHandlerOptions,
} from './node-http';
import { internal_exceptionHandler, nodeHTTPRequestHandler } from './node-http';

/**
 * What `createContext` gets in the Express adapter: `req`, `res` and the
 * request's `info`.
 * @see https://trpc.io/docs/server/adapters/express#2-create-a-trpc-router
 */
export type CreateExpressContextOptions = NodeHTTPCreateContextFnOptions<
  express.Request,
  express.Response
>;

/**
 * Creates an Express middleware that serves a router. Mount it on a path,
 * such as `/trpc`.
 * @see https://trpc.io/docs/server/adapters/express#3-use-the-express-adapter
 */
export function createExpressMiddleware<TRouter extends AnyRouter>(
  opts: NodeHTTPHandlerOptions<TRouter, express.Request, express.Response>,
): express.Handler {
  return (req, res) => {
    let path = '';
    run(async () => {
      path = req.path.slice(req.path.lastIndexOf('/') + 1);

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
