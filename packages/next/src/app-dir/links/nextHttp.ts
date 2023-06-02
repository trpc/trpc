import {
  httpBatchLink,
  HttpBatchLinkOptions,
  httpLink,
  HTTPLinkOptions,
  TRPCLink,
} from '@trpc/client';
import { AnyRouter } from '@trpc/server';
import { generateCacheTag } from '../shared';

type NextFetchLinkOptions<TBatch extends boolean> = {
  /**
   * Batch requests to the server
   * @default false
   */
  batch?: TBatch;
  /**
   * How many ms to cache the response on the server
   * Set to `false` to stop revalidation
   * Set to 0 to prevent caching
   * @default false
   */
  revalidate?: number | false;
} & (TBatch extends true ? HttpBatchLinkOptions : HTTPLinkOptions);

// ts-prune-ignore-next
export function experimental_nextHttpLink<
  TRouter extends AnyRouter,
  TBatch extends boolean,
>(opts: NextFetchLinkOptions<TBatch>): TRPCLink<TRouter> {
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
      const noCache = revalidate === 0;

      const linkFactory = opts.batch ? httpBatchLink : httpLink;
      const link = linkFactory({
        headers: opts.headers as any,
        url: opts.url,
        fetch: (url, fetchOpts) => {
          if (noCache) {
            return fetch(url, {
              ...fetchOpts,
              cache: 'no-store',
            });
          }

          return fetch(url, {
            ...fetchOpts,
            next: {
              revalidate,
              tags: [cacheTag],
            },
          });
        },
      })(runtime);

      return link(ctx);
    };
  };
}
