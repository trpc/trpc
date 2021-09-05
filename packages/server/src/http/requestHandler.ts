/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { URLSearchParams } from 'url';
import { assertNotBrowser } from '../assertNotBrowser';
import {
  BaseRequest,
  BaseResponse,
  HTTPHandlerOptions,
} from '../adapters/node-http/types';
import { AnyRouter, inferRouterContext } from '../router';
import { getPostBody } from '../adapters/node-http/getPostBody';
import { HTTPRequest } from './internals/types';
import { resolveHttpResponse } from './internals/resolveHttpResponse';

assertNotBrowser();

export type CreateContextFnOptions<TRequest, TResponse> = {
  req: TRequest;
  res: TResponse;
};
export type CreateContextFn<TRouter extends AnyRouter, TRequest, TResponse> = (
  opts: CreateContextFnOptions<TRequest, TResponse>,
) => inferRouterContext<TRouter> | Promise<inferRouterContext<TRouter>>;

export async function requestHandler<
  TRouter extends AnyRouter,
  TRequest extends BaseRequest,
  TResponse extends BaseResponse,
>(
  opts: {
    req: TRequest;
    res: TResponse;
    path: string;
  } & HTTPHandlerOptions<TRouter, TRequest, TResponse>,
) {
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
  const result = await resolveHttpResponse({
    batching: opts.batching ?? { enabled: true },
    responseMeta: opts.responseMeta ?? (() => ({})),
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
    if (!value) {
      continue;
    }
    res.setHeader(key, value);
  }
  res.end(result.body);
  await opts.teardown?.();
}
