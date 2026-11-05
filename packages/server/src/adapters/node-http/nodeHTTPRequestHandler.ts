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
// oxlint-disable-next-line no-restricted-imports
import {
  getErrorShape,
  run,
  TRPC_ERROR_CODES_BY_KEY,
  type TRPCErrorShape,
} from '../../unstable-core-do-not-import';
import { incomingMessageToRequest } from './incomingMessageToRequest';
import type {
  NodeHTTPRequest,
  NodeHTTPRequestHandlerOptions,
  NodeHTTPResponse,
} from './types';
import { writeResponse } from './writeResponse';

/**
 * What the client gets when its error can't be formatted. It says nothing
 * about the error, which is what `errorFormatter` would have hidden.
 */
const fallbackErrorShape: TRPCErrorShape = {
  code: TRPC_ERROR_CODES_BY_KEY.INTERNAL_SERVER_ERROR,
  message: 'Internal server error',
  data: { code: 'INTERNAL_SERVER_ERROR', httpStatus: 500 },
};

/**
 * Answers with an error response when handling a request throws.
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

    const config = opts.router._def._config;
    const shape = run(() => {
      try {
        return getErrorShape({
          config,
          error,
          type: 'unknown',
          path: undefined,
          input: undefined,
          ctx: undefined,
        });
      } catch {
        // a throwing `errorFormatter` must not stop the response
        return fallbackErrorShape;
      }
    });

    opts.onError?.({
      req,
      error,
      type: 'unknown',
      path: undefined,
      input: undefined,
      ctx: undefined,
    });

    if (res.headersSent) {
      // a body that failed while streaming; writing again would throw
      res.end();
      return;
    }

    const transformed = transformTRPCResponse(opts.router._def._config, {
      error: shape,
    });

    res.statusCode = shape.data.httpStatus;
    res.end(JSON.stringify(transformed));
  };
}

/**
 * Handles a Node.js request for a router. The adapters for Express,
 * Next.js and the standalone server use it. The promise never rejects.
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
        const request = incomingMessageToRequest(opts.req, opts.res, {
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
          req: request,
          error: err ? getTRPCErrorFromUnknown(err) : null,
          createContext,
          onError(o) {
            opts?.onError?.({
              ...o,
              req: opts.req,
            });
          },
        });

        await writeResponse({
          request,
          response,
          rawResponse: opts.res,
        });
      }).catch(internal_exceptionHandler(opts));
    });
  });
}
