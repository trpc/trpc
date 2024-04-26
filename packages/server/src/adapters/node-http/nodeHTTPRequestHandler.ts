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

import type * as http from 'http';
import { getTRPCErrorFromUnknown, type AnyRouter } from '../../@trpc/server';
import type { ResolveHTTPRequestOptionsContextFn } from '../../@trpc/server/http';
import { resolveResponse } from '../../@trpc/server/http';
import type {
  NodeHTTPRequest,
  NodeHTTPRequestHandlerOptions,
  NodeHTTPResponse,
} from './types';

function assertAsyncIterable<TValue>(
  value: any,
): asserts value is AsyncIterable<TValue> {
  if (!(Symbol.asyncIterator in value)) {
    throw new Error('Expected AsyncIterable - are you using Node >= 18.0.0?');
  }
}

export function incomingMessageToRequest(req: http.IncomingMessage): Request {
  const ac = new AbortController();
  const headers = new Headers(req.headers as any);
  const url = `http://${headers.get('host')}${req.url}`;
  req.once('aborted', () => ac.abort());

  const init: RequestInit = {
    headers,
    method: req.method,
    signal: ac.signal,
    // @ts-expect-error this is fine
    duplex: 'half',
  };
  if (req.method === 'POST') {
    if (!('body' in req)) {
      init.body = req as any;
    } else if (typeof req.body === 'string') {
      init.body = req.body;
    } else if (req.body !== undefined) {
      init.body = JSON.stringify(req.body);
    }
  }
  const request = new Request(url, init);

  return request;
}

export async function nodeHTTPRequestHandler<
  TRouter extends AnyRouter,
  TRequest extends NodeHTTPRequest,
  TResponse extends NodeHTTPResponse,
>(opts: NodeHTTPRequestHandlerOptions<TRouter, TRequest, TResponse>) {
  const handleViaMiddleware = opts.middleware ?? ((_req, _res, next) => next());

  return handleViaMiddleware(opts.req, opts.res, async (err) => {
    const req = incomingMessageToRequest(opts.req);

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

    if (opts.res.statusCode === 200) {
      // if the status code is set, we assume that it's been manually overridden
      opts.res.statusCode = response.status;
    }
    for (const [key, value] of response.headers) {
      opts.res.setHeader(key, value);
    }
    if (response.body) {
      assertAsyncIterable(response.body);
      for await (const chunk of response.body) {
        opts.res.write(chunk);
      }
    }
    opts.res.end();
  });
}
