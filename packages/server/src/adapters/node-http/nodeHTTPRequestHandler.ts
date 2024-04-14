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

// @trpc/server
import type { AnyRouter } from '../../@trpc/server';
import type {
  HTTPRequest,
  HTTPResponse,
  ResolveHTTPRequestOptionsContextFn,
  ResponseChunk,
} from '../../@trpc/server/http';
import {
  getBatchStreamFormatter,
  resolveHTTPResponse,
} from '../../@trpc/server/http';
import { getFormDataContentTypeHandler } from './content-type/form-data';
import { getNodeHTTPJSONContentTypeHandler } from './content-type/json';
import { getOctetContentTypeHandler } from './content-type/octet';
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
    if (err) throw err;

    //
    // Build tRPC dependencies

    const createContext: ResolveHTTPRequestOptionsContextFn<TRouter> = async (
      innerOpts,
    ) => {
      return await opts.createContext?.({
        ...opts,
        ...innerOpts,
      });
    };

    const query = opts.req.query
      ? new URLSearchParams(opts.req.query as any)
      : new URLSearchParams(opts.req.url!.split('?')[1]);

    // We put Json first as it's the most common
    const defaultJsonHandler = getNodeHTTPJSONContentTypeHandler<
      TRouter,
      TRequest,
      TResponse
    >();
    const contentHandlerFactories = [
      defaultJsonHandler,
      getFormDataContentTypeHandler<TRouter, TRequest, TResponse>(),
      getOctetContentTypeHandler<TRouter, TRequest, TResponse>(),
    ];

    const contentTypeHandler =
      contentHandlerFactories.find((handler) => {
        return handler.isMatch({ ...opts, query });
      }) ?? defaultJsonHandler;

    const req: HTTPRequest = {
      method: opts.req.method!,
      headers: opts.req.headers,
      query,
    };

    let isStream = false;
    let formatter: ReturnType<typeof getBatchStreamFormatter>;
    const unstable_onHead = (head: HTTPResponse, isStreaming: boolean) => {
      if (
        'status' in head &&
        (!opts.res.statusCode || opts.res.statusCode === 200)
      ) {
        opts.res.statusCode = head.status;
      }
      for (const [key, value] of Object.entries(head.headers ?? {})) {
        /* istanbul ignore if -- @preserve */
        if (typeof value === 'undefined') {
          continue;
        }
        opts.res.setHeader(key, value);
      }
      if (isStreaming) {
        opts.res.setHeader('Transfer-Encoding', 'chunked');
        const vary = opts.res.getHeader('Vary');
        opts.res.setHeader(
          'Vary',
          vary ? 'trpc-batch-mode, ' + vary : 'trpc-batch-mode',
        );
        isStream = true;
        formatter = getBatchStreamFormatter();
        opts.res.flushHeaders();
      }
    };

    const unstable_onChunk = ([index, string]: ResponseChunk) => {
      if (index === -1) {
        /**
         * Full response, no streaming. This can happen
         * - if the response is an error
         * - if response is empty (HEAD request)
         */
        opts.res.end(string);
      } else {
        opts.res.write(formatter!(index, string));
        opts.res.flush?.();
      }
    };

    await resolveHTTPResponse<TRouter, HTTPRequest>({
      ...opts,
      req,
      createContext,
      onError(o) {
        opts?.onError?.({
          ...o,
          req: opts.req,
        });
      },
      async getInput(inputsOpts) {
        return await contentTypeHandler.getInputs(
          { ...opts, query },
          inputsOpts,
        );
      },
      unstable_onHead,
      unstable_onChunk,
    });

    if (isStream) {
      opts.res.write(formatter!.end());
      opts.res.end();
    }

    return opts.res;
  });
}
