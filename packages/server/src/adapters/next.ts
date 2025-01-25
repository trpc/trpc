/**
 * If you're making an adapter for tRPC and looking at this file for reference, you should import types and functions from `@trpc/server` and `@trpc/server/http`
 *
 * @example
 * ```ts
 * import type { AnyTRPCRouter } from '@trpc/server'
 * import type { HTTPBaseHandlerOptions } from '@trpc/server/http'
 * ```
 */
import type { NextApiHandler, NextApiRequest, NextApiResponse } from 'next';
// @trpc/server
import type { AnyRouter } from '../@trpc/server';
// @trpc/server
import { TRPCError } from '../@trpc/server';
// eslint-disable-next-line no-restricted-imports
import { run } from '../unstable-core-do-not-import';
import type {
  NodeHTTPCreateContextFnOptions,
  NodeHTTPHandlerOptions,
} from './node-http';
import { internal_exceptionHandler, nodeHTTPRequestHandler } from './node-http';

export type CreateNextContextOptions = NodeHTTPCreateContextFnOptions<
  NextApiRequest,
  NextApiResponse
>;

/**
 * Preventing "TypeScript where it's tough not to get "The inferred type of 'xxxx' cannot be named without a reference to [...]"
 */
export type { NextApiHandler, NextApiRequest, NextApiResponse } from 'next';

export function createNextApiHandler<TRouter extends AnyRouter>(
  opts: NodeHTTPHandlerOptions<TRouter, NextApiRequest, NextApiResponse>,
): NextApiHandler {
  return async (req, res) => {
    let path = '';

    await run(async () => {
      path = run(() => {
        if (typeof req.query['trpc'] === 'string') {
          return req.query['trpc'];
        }
        if (Array.isArray(req.query['trpc'])) {
          return req.query['trpc'].join('/');
        }
        throw new TRPCError({
          message:
            'Query "trpc" not found - is the file named `[trpc]`.ts or `[...trpc].ts`?',
          code: 'INTERNAL_SERVER_ERROR',
        });
      });

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
