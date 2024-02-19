'use client';

import {
  createTRPCClientOptions,
  httpBatchLink,
  loggerLink,
} from '@trpc/client';
import type { AppRouter } from '~/server/routers/_app';
import { getUrl } from '~/trpc/shared';
import superjson from 'superjson';
import { createReactClient } from './_lib/createReactClient';

const optionsCallback = () =>
  createTRPCClientOptions<AppRouter>()(() => {
    return {
      links: [
        loggerLink({
          enabled: (op) => true,
        }),
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
    };
  });
type $Decoration = ReturnType<typeof optionsCallback>['$types']['decoration'];

export const standaloneClient = createReactClient<AppRouter>();

export function Provider(props: { children: React.ReactNode }) {
  return (
    <standaloneClient.Provider>{props.children}</standaloneClient.Provider>
  );
}
