import {
  HTTPLinkOptions,
  HttpBatchLinkOptions,
  TRPCLink,
  httpBatchLink,
  httpLink,
} from '@trpc/client';
import { AnyRouter } from '@trpc/server';
import { generateCacheTag } from '../shared';

type NextFetchLinkOptions<TBatch extends boolean> = {
  batch?: TBatch;
} & (TBatch extends true ? HttpBatchLinkOptions : HTTPLinkOptions);

// ts-prune-ignore-next
export function experimental_nextHttpLink<
  TRouter extends AnyRouter,
  TBatch extends boolean,
>(opts: NextFetchLinkOptions<TBatch>): TRPCLink<TRouter> {
  return (runtime) => {
    return (ctx) => {
      const { path, input } = ctx.op;
      const cacheTag = generateCacheTag(path, input);

      console.log(`fetching ${path} with tag ${cacheTag}`);

      const linkFactory = opts.batch ? httpBatchLink : httpLink;
      const link = linkFactory({
        url: opts.url,
        fetch: (url, fetchOpts) => {
          return fetch(url, {
            ...fetchOpts,
            next: { tags: [cacheTag] },
          });
        },
      })(runtime);

      return link(ctx);
    };
  };
}
