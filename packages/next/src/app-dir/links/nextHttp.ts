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
  revalidate?: number | false;
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
