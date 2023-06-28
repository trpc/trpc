import {
  httpBatchLink,
  HTTPBatchLinkOptions,
  httpLink,
  HTTPLinkOptions,
  TRPCLink,
} from '@trpc/client';
import { AnyRouter } from '@trpc/server';
import { generateCacheTag } from '../shared';

type NextFetchLinkOptions<TBatch extends boolean> = (TBatch extends true
  ? HTTPBatchLinkOptions
  : HTTPLinkOptions) & {
  batch?: TBatch;
  revalidate?: number | false;
};

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

      const linkFactory = opts.batch ? httpBatchLink : httpLink;
      const link = linkFactory({
        headers: opts.headers as any,
        url: opts.url,
        fetch: (url, fetchOpts) => {
          return fetch(url, {
            ...fetchOpts,
            // cache: 'no-cache',
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
