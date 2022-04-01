/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { URLSearchParams } from 'url';
import { assertNotBrowser } from '../../assertNotBrowser';
import { HTTPRequest } from '../../http/internals/types';
import { resolveHTTPResponse } from '../../http/resolveHTTPResponse';
import { AnyRouter, inferRouterContext } from '../../router';
import { getPostBody } from './internals/getPostBody';
import {
  NodeHTTPHandlerOptions,
  NodeHTTPRequest,
  NodeHTTPResponse,
} from './types';

assertNotBrowser();

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
  const createContext = async function _createContext(): Promise<
    inferRouterContext<TRouter>
  > {
    return await opts.createContext?.(opts);
  };
  const { path, router } = opts;

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
  const result = await resolveHTTPResponse({
    batching: opts.batching,
    responseMeta: opts.responseMeta,
    path,
    createContext,
    router,
    req,
    error: bodyResult.ok ? null : bodyResult.error,
    onError(o) {
      opts?.onError?.({
        ...o,
        req: opts.req,
      });
    },
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
  await opts.teardown?.();
}
