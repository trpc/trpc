/**
 * If you're making an adapter for tRPC and looking at this file for reference, you should import types and functions from `@trpc/server` and `@trpc/server/http`
 *
 * @example
 * ```ts
 * import type { AnyTRPCRouter } from '@trpc/server'
 * import type { HTTPBaseHandlerOptions } from '@trpc/server/http'
 * ```
 */

// @trpc/server

import {
  getTRPCErrorFromUnknown,
  transformTRPCResponse,
  type AnyRouter,
} from '../../@trpc/server';
import type { ResolveHTTPRequestOptionsContextFn } from '../../@trpc/server/http';
import { resolveResponse } from '../../@trpc/server/http';
// eslint-disable-next-line no-restricted-imports
import { getErrorShape, run } from '../../unstable-core-do-not-import';
import { incomingMessageToRequest } from './incomingMessageToRequest';
import type {
  NodeHTTPRequest,
  NodeHTTPRequestHandlerOptions,
  NodeHTTPResponse,
} from './types';

/**
 * @internal
 */
export function internal_exceptionHandler<
  TRouter extends AnyRouter,
  TRequest extends NodeHTTPRequest,
  TResponse extends NodeHTTPResponse,
>(opts: NodeHTTPRequestHandlerOptions<TRouter, TRequest, TResponse>) {
  return (cause: unknown) => {
    const { res, req } = opts;
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

    const transformed = transformTRPCResponse(opts.router._def._config, {
      error: shape,
    });

    res.statusCode = shape.data.httpStatus;
    res.end(JSON.stringify(transformed));
  };
}

/**
 * @remark the promise never rejects
 */
export async function nodeHTTPRequestHandler<
  TRouter extends AnyRouter,
  TRequest extends NodeHTTPRequest,
  TResponse extends NodeHTTPResponse,
>(opts: NodeHTTPRequestHandlerOptions<TRouter, TRequest, TResponse>) {
  return new Promise<void>((resolve) => {
    const handleViaMiddleware =
      opts.middleware ?? ((_req, _res, next) => next());

    opts.res.once('finish', () => {
      resolve();
    });
    return handleViaMiddleware(opts.req, opts.res, (err: unknown) => {
      run(async () => {
        const req = incomingMessageToRequest(opts.req, {
          maxBodySize: opts.maxBodySize ?? null,
        });

        // Build tRPC dependencies
        const createContext: ResolveHTTPRequestOptionsContextFn<
          TRouter
        > = async (innerOpts) => {
          return await opts.createContext?.({
            ...opts,
            ...innerOpts,
          });
        };

        const response = await resolveResponse({
          ...opts,
          req,
          error: err ? getTRPCErrorFromUnknown(err) : null,
          createContext,
          onError(o) {
            opts?.onError?.({
              ...o,
              req: opts.req,
            });
          },
        });

        const { res } = opts;
        if (res.statusCode === 200) {
          // if the status code is set, we assume that it's been manually overridden
          res.statusCode = response.status;
        }
        for (const [key, value] of response.headers) {
          res.setHeader(key, value);
        }
        if (response.body) {
          const reader = response.body.getReader();
          const onAbort = () => {
            // cancelling the reader will cause the whole stream to be cancelled
            reader.cancel().catch(() => {
              // console.error('reader.cancel() error', err);
            });
          };
          req.signal.addEventListener('abort', onAbort, {
            once: true,
          });

          while (true) {
            const { done, value } = await reader.read();

            if (done) {
              break;
            }
            if (!res.writable) {
              break;
            }
            if (res.write(value) === false) {
              await new Promise<void>((resolve) => {
                res.once('drain', resolve);
              });
            }

            // useful for debugging chunked responses:
            // console.log('wrote', Buffer.from(value).toString());

            // IMPORTANT - flush the response buffer, otherwise the client will not receive the data until `.end()`
            res.flush?.();
          }
          req.signal.removeEventListener('abort', onAbort);
        }
        res.end();
      }).catch(internal_exceptionHandler(opts));
    });
  });
}
