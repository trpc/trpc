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

import { getTRPCErrorFromUnknown, type AnyRouter } from '../../@trpc/server';
import type { ResolveHTTPRequestOptionsContextFn } from '../../@trpc/server/http';
import { resolveResponse } from '../../@trpc/server/http';
import { incomingMessageToRequest } from './incomingMessageToRequest';
import type {
  NodeHTTPRequest,
  NodeHTTPRequestHandlerOptions,
  NodeHTTPResponse,
} from './types';

export async function nodeHTTPRequestHandler<
  TRouter extends AnyRouter,
  TRequest extends NodeHTTPRequest,
  TResponse extends NodeHTTPResponse,
>(opts: NodeHTTPRequestHandlerOptions<TRouter, TRequest, TResponse>) {
  const handleViaMiddleware = opts.middleware ?? ((_req, _res, next) => next());

  return handleViaMiddleware(opts.req, opts.res, async (err) => {
    const req = incomingMessageToRequest(opts.req, {
      maxBodySize: opts.maxBodySize ?? null,
    });

    // Build tRPC dependencies
    const createContext: ResolveHTTPRequestOptionsContextFn<TRouter> = async (
      innerOpts,
    ) => {
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
        // IMPORTANT - flush the response buffer, otherwise the client will not receive the data until `.end()`
        res.flush?.();
      }
      req.signal.removeEventListener('abort', onAbort);
    }
    res.end();
  });
}
