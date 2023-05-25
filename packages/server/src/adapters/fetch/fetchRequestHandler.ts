import { AnyRouter } from '../../core';
import { HTTPRequest } from '../../http';
import { resolveHTTPResponse } from '../../http/resolveHTTPResponse';
import { FetchHandlerOptions } from './types';

export type FetchHandlerRequestOptions<TRouter extends AnyRouter> = {
  req: Request;
  endpoint: string;
} & FetchHandlerOptions<TRouter>;

export async function fetchRequestHandler<TRouter extends AnyRouter>(
  opts: FetchHandlerRequestOptions<TRouter>,
): Promise<Response> {
  const resHeaders = new Headers();

  const createContext = async () => {
    return opts.createContext?.({ req: opts.req, resHeaders });
  };

  const url = new URL(opts.req.url);
  const path = url.pathname.slice(opts.endpoint.length + 1);
  const req: HTTPRequest = {
    query: url.searchParams,
    method: opts.req.method,
    headers: Object.fromEntries(opts.req.headers),
    body:
      opts.req.headers.get('content-type') === 'application/json'
        ? await opts.req.text()
        : '',
  };

  const result = await resolveHTTPResponse({
    req,
    createContext,
    path,
    router: opts.router,
    batching: opts.batching,
    responseMeta: opts.responseMeta,
    onError(o) {
      opts?.onError?.({ ...o, req: opts.req });
    },
  });

  for (const [key, value] of Object.entries(result.headers ?? {})) {
    /* istanbul ignore if -- @preserve */
    if (typeof value === 'undefined') {
      continue;
    }

    if (typeof value === 'string') {
      resHeaders.set(key, value);
      continue;
    }

    for (const v of value) {
      resHeaders.append(key, v);
    }
  }

  const res = new Response(result.body, {
    status: result.status,
    headers: resHeaders,
  });

  return res;
}
