'use client';

import type { inferTRPCClientOptionsDecoration } from '@trpc/client';
import {
  createTRPCClientOptions,
  httpBatchLink,
  loggerLink,
} from '@trpc/client';
import type { AppRouter } from '~/server/routers/_app';
import { getUrl } from '~/trpc/shared';
import superjson from 'superjson';
import { cacheLink, refetchLink } from './_lib/cacheLink';
import { createReactClient } from './_lib/createReactClient';

const getTrpcOptions = createTRPCClientOptions<AppRouter>()(() => ({
  links: [
    loggerLink({
      enabled: (op) => true,
    }),
    cacheLink(),
    // FIXME: this is not working
    // testDecorationLink(),
    refetchLink(),
    httpBatchLink({
      transformer: superjson,
      url: getUrl(),
      headers() {
        return {
          'x-trpc-source': 'standalone',
        };
      },
    }),
  ],
}));

type $Decoration = inferTRPCClientOptionsDecoration<typeof getTrpcOptions>;
//   ^?
type $TT = $Decoration['query']['ignoreCache'];
//    ^?

export const standaloneClient = createReactClient(getTrpcOptions);

export function Provider(props: { children: React.ReactNode }) {
  return (
    <standaloneClient.Provider>{props.children}</standaloneClient.Provider>
  );
}
