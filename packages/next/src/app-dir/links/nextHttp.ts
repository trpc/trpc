import {
  httpBatchLink,
  HTTPBatchLinkOptions,
  httpLink,
  HTTPLinkOptions,
  TRPCLink,
} from '@trpc/client';
import { AnyRouter } from '@trpc/server';
import { generateCacheTag } from '../shared';

interface NextLinkBaseOptions {
  revalidate?: number | false;
  batch?: boolean;
}

interface NextLinkSingleOptions
  extends NextLinkBaseOptions,
    Omit<HTTPLinkOptions, 'fetch'> {
  batch?: false;
}

interface NextLinkBatchOptions
  extends NextLinkBaseOptions,
    Omit<HTTPBatchLinkOptions, 'fetch'> {
  batch: true;
}

// ts-prune-ignore-next
export function experimental_nextHttpLink<TRouter extends AnyRouter>(
  opts: NextLinkSingleOptions | NextLinkBatchOptions,
): TRPCLink<TRouter> {
  return (runtime) => {
    return (ctx) => {
      const { path, input, context } = ctx.op;
      const cacheTag = generateCacheTag(path, input);

      // Let per-request revalidate override global revalidate
      const requestRevalidate =
        typeof context.revalidate === 'number' || context.revalidate === false
          ? context.revalidate
          : undefined;

      const revalidate = requestRevalidate ?? opts.revalidate ?? false;

      const _fetch: NonNullable<HTTPLinkOptions['fetch']> = (
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
            ...opts,
            fetch: _fetch,
          })
        : httpLink({
            ...opts,
            fetch: _fetch,
          });

      return link(runtime)(ctx);
    };
  };
}
