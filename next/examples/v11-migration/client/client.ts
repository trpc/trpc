import {
  batching,
  createTrpcClient,
  httpLink,
  routerType,
  sse,
} from '@trpc12/trpc/client';
import { fromV11Link } from '@trpc12/trpc/interop';
import type { AppRouter } from '../server/router.ts';
import { serializer } from '../server/serializer.ts';
import { callLogLink, type CallLog } from '../v11/client/links.ts';

/**
 * The client moved to v12, on the v12 endpoint. httpLink batches, streams
 * and subscribes, so it replaces the splitLink of three v11 links; the
 * app's own v11 link stays until someone rewrites it.
 */
export function makeClient(opts: {
  url: string;
  token: string | null;
  log: CallLog[];
}) {
  return createTrpcClient({
    router: routerType<AppRouter>(),
    links: [
      fromV11Link(callLogLink(opts.log)),
      httpLink({
        url: opts.url,
        batch: batching(),
        subscriptions: sse(),
        serializer,
        headers: (): HeadersInit =>
          opts.token ? { authorization: opts.token } : {},
      }),
    ],
  });
}

export type Client = ReturnType<typeof makeClient>;
