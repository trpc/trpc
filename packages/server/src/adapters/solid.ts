import { type APIEvent } from 'solid-start';
import { AnyRouter, inferRouterContext } from '../core';
import { TRPCError } from '../error/TRPCError';
import { HTTPRequest } from '../http/internals/types';
import { resolveHTTPResponse } from '../http/resolveHTTPResponse';
import { TRPCErrorResponse } from '../rpc';
import { FetchHandlerOptions } from './fetch/types';

export type CreateSolidApiHandlerOptions<TRouter extends AnyRouter> = Omit<
  FetchHandlerOptions<TRouter>,
  'createContext'
> & {
  createContext?: (
    opts: CreateSolidContextOptions,
  ) => inferRouterContext<TRouter> | Promise<inferRouterContext<TRouter>>;
};

export type CreateSolidContextOptions = {
  event: APIEvent;
  resHeaders: Headers;
};

const innerSolidHandler = async <TRouter extends AnyRouter>(
  opts: CreateSolidApiHandlerOptions<TRouter>,
  event: APIEvent,
) => {
  const resHeaders = new Headers();

  const createContext = async () => {
    return opts.createContext?.({ event, resHeaders });
  };

  const path = event.params.trpc;
  if (!path) {
    const error = opts.router.getErrorShape({
      error: new TRPCError({
        message:
          'Query "trpc" not found - is the file named `[trpc]`.ts or `[...trpc].ts`?',
        code: 'INTERNAL_SERVER_ERROR',
      }),
      type: 'unknown',
      ctx: undefined,
      path: undefined,
      input: undefined,
    });
    const json: TRPCErrorResponse = {
      id: -1,
      error,
    };
    return new Response(JSON.stringify(json), { status: 500 });
  }
  const url = new URL(event.request.url);
  const req: HTTPRequest = {
    query: url.searchParams,
    method: event.request.method,
    headers: Object.fromEntries(event.request.headers),
    body: await event.request.text(),
  };

  const result = await resolveHTTPResponse({
    req,
    createContext,
    path,
    router: opts.router,
    batching: opts.batching,
    responseMeta: opts.responseMeta,
    onError(o) {
      opts?.onError?.({ ...o, req: event.request });
    },
  });

  for (const [key, value] of Object.entries(result.headers ?? {})) {
    /* istanbul ignore if  */
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
};

export function createSolidApiHandler<TRouter extends AnyRouter>(
  opts: CreateSolidApiHandlerOptions<TRouter>,
) {
  return {
    GET: async (event: APIEvent) => await innerSolidHandler(opts, event),
    POST: async (event: APIEvent) => await innerSolidHandler(opts, event),
  };
}
