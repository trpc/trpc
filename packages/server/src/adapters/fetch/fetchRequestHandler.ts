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
import { resolveResponse } from '../../@trpc/server/http';
import type { FetchHandlerRequestOptions } from './types';

const trimSlashes = (path: string): string => {
  path = path.startsWith('/') ? path.slice(1) : path;
  path = path.endsWith('/') ? path.slice(0, -1) : path;

  return path;
};

/**
 * Handles a Fetch API `Request` for a router and returns its `Response`.
 * Works in edge runtimes, Deno, Bun, Cloudflare Workers and Next.js route
 * handlers.
 * @example
 * ```ts
 * const handler = (req: Request) =>
 *   fetchRequestHandler({ endpoint: '/trpc', req, router: appRouter });
 * ```
 * @see https://trpc.io/docs/server/adapters/fetch
 */
export async function fetchRequestHandler<TRouter extends AnyRouter>(
  opts: FetchHandlerRequestOptions<TRouter>,
): Promise<Response> {
  const resHeaders = new Headers();

  const createContext: ResolveHTTPRequestOptionsContextFn<TRouter> = async (
    innerOpts,
  ) => {
    return opts.createContext?.({ req: opts.req, resHeaders, ...innerOpts });
  };

  const url = new URL(opts.req.url);

  const pathname = trimSlashes(url.pathname);
  const endpoint = trimSlashes(opts.endpoint);
  const path = trimSlashes(pathname.slice(endpoint.length));

  return await resolveResponse({
    ...opts,
    req: opts.req,
    createContext,
    path,
    error: null,
    resHeaders,
    onError(o) {
      opts?.onError?.({ ...o, req: opts.req });
    },
    responseMeta(data) {
      const meta = opts.responseMeta?.(data);
      // a copy, so `resHeaders` keeps only the headers set outside `responseMeta`
      const headers = new Headers(resHeaders);

      if (meta?.headers) {
        if (meta.headers instanceof Headers) {
          for (const [key, value] of meta.headers.entries()) {
            headers.append(key, value);
          }
        } else {
          /**
           * @deprecated, delete in v12
           */
          for (const [key, value] of Object.entries(meta.headers)) {
            if (Array.isArray(value)) {
              for (const v of value) {
                headers.append(key, v);
              }
            } else if (typeof value === 'string') {
              headers.set(key, value);
            }
          }
        }
      }

      return {
        headers,
        status: meta?.status,
      };
    },
  });
}
