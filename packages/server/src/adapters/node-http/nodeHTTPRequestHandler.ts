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

export function incomingMessageToRequest(req: http.IncomingMessage): Request {
  const ac = new AbortController();
  const headers = new Headers(req.headers as any);
  const url = `http://${headers.get('host')}${req.url}`;
  req.once('aborted', () => ac.abort());

  return new Request(url, {
    headers,
    method: req.method,
    // does this even work?
    body: 'body' in req ? (req.body as any) : req,
    signal: ac.signal,
  });
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

    const res = await resolveResponse({
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

    opts.res.writeHead(res.status, Object.fromEntries(res.headers));
    opts.res.end(res.body);
  });
}
