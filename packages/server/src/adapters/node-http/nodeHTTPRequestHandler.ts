/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { AnyRouter } from '../../core';
import { inferRouterContext } from '../../core/types';
import { HTTPRequest } from '../../http';
import { resolveHTTPFetchResponse } from '../../http/resolveHTTPResponse';
import { nodeHTTPJSONContentTypeHandler } from './content-type/json';
import { NodeHTTPContentTypeHandler } from './internals/contentType';
import {
  NodeHTTPRequest,
  NodeHTTPRequestHandlerOptions,
  NodeHTTPResponse,
} from './types';

const defaultJSONContentTypeHandler = nodeHTTPJSONContentTypeHandler();

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

    const jsonContentTypeHandler =
      defaultJSONContentTypeHandler as unknown as NodeHTTPContentTypeHandler<
        TRequest,
        TResponse
      >;

    const contentTypeHandlers = opts.experimental_contentTypeHandlers ?? [
      jsonContentTypeHandler,
    ];

    const contentTypeHandler =
      contentTypeHandlers.find((handler) =>
        handler.isMatch({
          ...opts,
          query,
        }),
      ) ??
      // fallback to json
      jsonContentTypeHandler;

    const bodyResult = await contentTypeHandler.getBody({
      ...opts,
      query,
    });

    const req: HTTPRequest = {
      method: opts.req.method!,
      headers: opts.req.headers,
      query,
      body: bodyResult.ok ? bodyResult.data : undefined,
    };

    const res = await resolveHTTPFetchResponse({
      batching: opts.batching,
      responseMeta: opts.responseMeta,
      path: opts.path,
      createContext,
      router: opts.router,
      req,
      error: bodyResult.ok ? null : bodyResult.error,
      preprocessedBody: bodyResult.ok ? bodyResult.preprocessed : false,
      onError(o) {
        opts?.onError?.({
          ...o,
          req: opts.req,
        });
      },
      contentTypeHandler,
    });

    // res is of type `Request` but node.js wants us to call res.send etc

    opts.res.statusCode = res.status;
    opts.res.statusMessage = res.statusText;
    for (const [key, value] of res.headers.entries()) {
      opts.res.setHeader(key, value);
    }

    for await (const chunk of res.body) {
      opts.res.write(chunk);
    }
    opts.res.end();

    return opts.res;
  });
}
