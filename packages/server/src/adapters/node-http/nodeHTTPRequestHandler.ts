/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { AnyRouter } from '../../core';
import { inferRouterContext } from '../../core/types';
import { HTTPRequest } from '../../http';
import { resolveHTTPResponse } from '../../http/resolveHTTPResponse';
import { getPostBody } from './internals/getPostBody';
import {
  NodeHTTPHandlerOptions,
  NodeHTTPRequest,
  NodeHTTPResponse,
} from './types';

type NodeHTTPRequestHandlerOptions<
  TRouter extends AnyRouter,
  TRequest extends NodeHTTPRequest,
  TResponse extends NodeHTTPResponse,
> = {
  req: TRequest;
  res: TResponse;
  path: string;
} & NodeHTTPHandlerOptions<TRouter, TRequest, TResponse>;

export async function nodeHTTPRequestHandler<
  TRouter extends AnyRouter,
  TRequest extends NodeHTTPRequest,
  TResponse extends NodeHTTPResponse,
>(opts: NodeHTTPRequestHandlerOptions<TRouter, TRequest, TResponse>) {
  const handleViaMiddleware =
    opts.middleware ??
    ((_req, _res, next) => {
      return next();
    });

  return handleViaMiddleware(opts.req, opts.res, async (err) => {
    if (err) {
      throw err;
    }

    //
    // Build tRPC dependencies

    async function createContext(): Promise<inferRouterContext<TRouter>> {
      return await opts.createContext?.(opts);
    }

    const bodyResult = await getPostBody(opts);

    const query = opts.req.query
      ? new URLSearchParams(opts.req.query as any)
      : new URLSearchParams(opts.req.url!.split('?')[1]);

    const req: HTTPRequest = {
      method: opts.req.method!,
      headers: opts.req.headers,
      query,
      body: bodyResult.ok ? bodyResult.data : undefined,
    };

    //
    // Invoke tRPC

    const result = await resolveHTTPResponse({
      batching: opts.batching,
      responseMeta: opts.responseMeta,
      path: opts.path,
      createContext,
      router: opts.router,
      req,
      error: bodyResult.ok ? null : bodyResult.error,
      onError(o) {
        opts?.onError?.({
          ...o,
          req: opts.req,
        });
      },
    });

    //
    // Handle result

    const { res } = opts;
    if ('status' in result && (!res.statusCode || res.statusCode === 200)) {
      res.statusCode = result.status;
    }

    for (const [key, value] of Object.entries(result.headers ?? {})) {
      if (typeof value === 'undefined') {
        continue;
      }

      res.setHeader(key, value);
    }

    res.end(result.body);
  });
}
