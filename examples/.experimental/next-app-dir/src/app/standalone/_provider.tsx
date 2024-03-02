'use client';

import type { inferTRPCClientOptionTypes } from '@trpc/client';
import {
  createTRPCClientOptions,
  httpBatchLink,
  loggerLink,
} from '@trpc/client';
import type { AppRouter } from '~/server/routers/_app';
import { getUrl } from '~/trpc/shared';
import superjson from 'superjson';
import { cacheLink, refetchLink, testDecorationLink } from './_lib/cacheLink';
import { createReactClient } from './_lib/createReactClient';

const getTrpcOptions = createTRPCClientOptions<AppRouter>()(() => ({
  links: [
    loggerLink({
      enabled: (op) => true,
    }),
    cacheLink(),
    testDecorationLink(),
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

type $Decoration = inferTRPCClientOptionTypes<typeof getTrpcOptions>;
//   ^?
type T = $Decoration['query'];

export const standaloneClient = createReactClient(getTrpcOptions);
standaloneClient.$types.decoration;
export function Provider(props: { children: React.ReactNode }) {
  return (
    <standaloneClient.Provider>{props.children}</standaloneClient.Provider>
  );
}
