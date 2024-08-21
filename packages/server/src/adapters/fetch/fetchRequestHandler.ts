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

import type { AnyRouter } from '../../@trpc/server';
import type { ResolveHTTPRequestOptionsContextFn } from '../../@trpc/server/http';
import { resolveResponse, toURL } from '../../@trpc/server/http';
import type { FetchHandlerRequestOptions } from './types';

const trimSlashes = (path: string): string => {
  path = path.startsWith('/') ? path.slice(1) : path;
  path = path.endsWith('/') ? path.slice(0, -1) : path;

  return path;
};

export async function fetchRequestHandler<TRouter extends AnyRouter>(
  opts: FetchHandlerRequestOptions<TRouter>,
): Promise<Response> {
  const resHeaders = new Headers();

  const createContext: ResolveHTTPRequestOptionsContextFn<TRouter> = async (
    innerOpts,
  ) => {
    return opts.createContext?.({ req: opts.req, resHeaders, ...innerOpts });
  };

  const url = toURL(opts.req.url);

  const pathname = trimSlashes(url.pathname);
  const endpoint = trimSlashes(opts.endpoint);
  const path = trimSlashes(pathname.slice(endpoint.length));

  return await resolveResponse({
    ...opts,
    req: opts.req,
    createContext,
    path,
    error: null,
    onError(o) {
      opts?.onError?.({ ...o, req: opts.req });
    },
    responseMeta(data) {
      const meta = opts.responseMeta?.(data);

      if (meta?.headers) {
        if (meta.headers instanceof Headers) {
          for (const [key, value] of meta.headers.entries()) {
            resHeaders.append(key, value);
          }
        } else {
          /**
           * @deprecated, delete in v12
           */
          for (const [key, value] of Object.entries(meta.headers)) {
            if (Array.isArray(value)) {
              for (const v of value) {
                resHeaders.append(key, v);
              }
            } else if (typeof value === 'string') {
              resHeaders.set(key, value);
            }
          }
        }
      }

      return {
        headers: resHeaders,
        status: meta?.status,
      };
    },
  });
}
