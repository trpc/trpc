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
    // refetchLink(),
    // httpBatchLink({
    //   transformer: superjson,
    //   url: getUrl(),
    //   headers() {
    //     return {
    //       'x-trpc-source': 'standalone',
    //     };
    //   },
    // }),
  ],
}));

type $Decoration = inferTRPCClientOptionTypes<typeof getTrpcOptions>;
//   ^?
type T = $Decoration['query']['ignoreCache'];
type T4 = $Decoration['query']['__fromTestLink1'];

type T3 = $Decoration['_debug']['$Declarations'];

// type IsEqual<T1, U> = T extends U ? (U extends T1 ? true : false) : false;

type T2 = $Decoration['_debug']['$Links'][1];
//                     ^?

export const standaloneClient = createReactClient(getTrpcOptions);
standaloneClient.$types.decoration;
export function Provider(props: { children: React.ReactNode }) {
  return (
    <standaloneClient.Provider>{props.children}</standaloneClient.Provider>
  );
}
