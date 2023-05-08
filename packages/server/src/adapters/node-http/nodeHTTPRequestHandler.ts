/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { Readable } from 'stream';
import { AnyRouter } from '../../core';
import { inferRouterContext } from '../../core/types';
import { HTTPRequest } from '../../http';
import { resolveHTTPResponse } from '../../http/resolveHTTPResponse';
import {
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

    const createContext = async (): Promise<inferRouterContext<TRouter>> => {
      return await opts.createContext?.(opts);
    };

    const query = opts.req.query
      ? new URLSearchParams(opts.req.query as any)
      : new URLSearchParams(opts.req.url!.split('?')[1]);

    const req: HTTPRequest = {
      method: opts.req.method!,
      headers: opts.req.headers,
      query,
      // TODO: remove this?
      body: undefined,
    };

    const result = await resolveHTTPResponse({
      requestUtils: {
        getHeaders() {
          return opts.req.headers;
        },
        async getBody() {
          return Readable.toWeb(opts.req);
        },
      },
      batching: opts.batching,
      responseMeta: opts.responseMeta,
      path: opts.path,
      createContext,
      router: opts.router,
      req,
      // TODO: remove this?
      error: undefined,
      // TODO: ensure this remains implemented at the right level
      preprocessedBody: false,
      // error: bodyResult.ok ? null : bodyResult.error,
      // preprocessedBody: bodyResult.ok ? bodyResult.preprocessed : false,
      onError(o) {
        opts?.onError?.({
          ...o,
          req: opts.req,
        });
      },
      customContentDecoders: opts.experimental_contentDecoders,
    });

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
