import type {
  HTTPBatchLinkOptions,
  HTTPLinkOptions,
  TRPCLink,
} from '@trpc/client';
import { httpBatchLink, httpLink } from '@trpc/client';
import type {
  AnyRootTypes,
  AnyRouter,
} from '@trpc/server/unstable-core-do-not-import';
import { generateCacheTag } from '../shared';

interface NextLinkBaseOptions {
  /**
   * How many seconds Next.js caches a response. `false` caches it until it is
   * revalidated. A call can override this with `context.revalidate`.
   * @default false
   */
  revalidate?: number | false;
  /**
   * Send each call with `httpBatchLink` instead of `httpLink`. Each call
   * gets its own link, so calls aren't combined into one request.
   */
  batch?: boolean;
}

type NextLinkSingleOptions<TRoot extends AnyRootTypes> = NextLinkBaseOptions &
  Omit<HTTPLinkOptions<TRoot>, 'fetch'> & {
    batch?: false;
  };

type NextLinkBatchOptions<TRoot extends AnyRootTypes> = NextLinkBaseOptions &
  Omit<HTTPBatchLinkOptions<TRoot>, 'fetch'> & {
    batch: true;
  };

/**
 * A terminating link that sends calls over HTTP with Next.js cache tags, so
 * they can be revalidated.
 *
 * @see https://trpc.io/docs/client/nextjs/app-router-setup
 */
// ts-prune-ignore-next
export function experimental_nextHttpLink<TRouter extends AnyRouter>(
  opts:
    | NextLinkSingleOptions<TRouter['_def']['_config']['$types']>
    | NextLinkBatchOptions<TRouter['_def']['_config']['$types']>,
): TRPCLink<TRouter> {
  return (runtime) => {
    return (ctx) => {
      const { path, input, context } = ctx.op;
      const cacheTag = generateCacheTag(path, input);

      // Let per-request revalidate override global revalidate
      const requestRevalidate =
        typeof context['revalidate'] === 'number' ||
        context['revalidate'] === false
          ? context['revalidate']
          : undefined;

      const revalidate = requestRevalidate ?? opts.revalidate ?? false;

      const _fetch: NonNullable<HTTPLinkOptions<AnyRootTypes>['fetch']> = (
        url,
        fetchOpts,
      ) => {
        return fetch(url, {
          ...fetchOpts,
          // cache: 'no-cache',
          next: {
            revalidate,
            tags: [cacheTag],
          },
        });
      };
      const link = opts.batch
        ? httpBatchLink({
            ...(opts as any),
            fetch: _fetch,
          })
        : httpLink({
            ...(opts as any),
            fetch: _fetch,
          });

      return link(runtime)(ctx);
    };
  };
}
