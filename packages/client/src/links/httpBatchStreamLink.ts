import type { AnyTRPCRouter } from '@trpc/server';
import { httpBatchLink } from './httpBatchLink';
import type { HTTPBatchLinkOptions } from './HTTPLinkOptions';
import type { TRPCLink } from './types';

/**
 * @deprecated this is now an alias for `httpBatchLink` with `streaming: true`
 * @see https://trpc.io/docs/client/links/httpBatchLink
 */
export function httpBatchStreamLink<TRouter extends AnyTRPCRouter>(
  opts: HTTPBatchLinkOptions<TRouter['_def']['_config']['$types']>,
): TRPCLink<TRouter> {
  opts.streaming = true;
  return httpBatchLink<TRouter>(opts);
}
