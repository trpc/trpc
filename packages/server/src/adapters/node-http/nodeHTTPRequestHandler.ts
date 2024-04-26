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

  console.log('---------creating req');

  const init: RequestInit = {
    headers,
    method: req.method,
    signal: ac.signal,
    // @ts-expect-error this is fine
    duplex: 'half',
  };
  if (req.method === 'POST') {
    init.body = 'body' in req ? req.body : (req as any);
  }
  const request = new Request(url, init);

  console.log('---------created req');
  return request;
}
export async function nodeHTTPRequestHandler<
  TRouter extends AnyRouter,
  TRequest extends NodeHTTPRequest,
  TResponse extends NodeHTTPResponse,
>(opts: NodeHTTPRequestHandlerOptions<TRouter, TRequest, TResponse>) {
  const handleViaMiddleware = opts.middleware ?? ((_req, _res, next) => next());

  return handleViaMiddleware(opts.req, opts.res, async (err) => {
    console.log('got here');
    const req = incomingMessageToRequest(opts.req);
    console.log('got here2');
    // Build tRPC dependencies
    const createContext: ResolveHTTPRequestOptionsContextFn<TRouter> = async (
      innerOpts,
    ) => {
      return await opts.createContext?.({
        ...opts,
        ...innerOpts,
      });
    };
    console.log('got here3');
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
    console.log('got here4');

    opts.res.writeHead(res.status, Object.fromEntries(res.headers));
    for await (const chunk of res.body) {
      opts.res.write(chunk);
    }
    opts.res.end();
  });
}
