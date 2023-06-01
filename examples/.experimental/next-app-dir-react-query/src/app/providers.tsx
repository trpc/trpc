// app/providers.jsx
'use client';

import {
  ContextOptions,
  DehydratedState,
  Hydrate,
  QueryClient,
  QueryClientProvider,
  dehydrate,
  useQueryClient,
} from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import React, { use, useRef, useState } from 'react';
import { createDataStream } from './lib/UseClientHydrationStreamProvider';

const stream = createDataStream<DehydratedState>();

function Hydration(props: {
  children: React.ReactNode;
  context?: ContextOptions['context'];
}) {
  const streamContext = use(stream.context);
  const queryClient = useQueryClient({
    context: props.context,
  });
  const isSubscribed = useRef(false);
  const seenKeys = useRef(new Set<string>());
  const [dehydratedState, setDehydratedState] = useState<DehydratedState>({
    queries: [],
    mutations: [],
  });

  const cache = queryClient.getQueryCache();
  // On the server, we want to subscribe to cache changes
  if (typeof window === 'undefined' && !isSubscribed.current) {
    // Do we need to care about unsubscribing? I don't think so to be honest
    cache.subscribe((event) => {
      switch (event.type) {
        case 'added':
        case 'updated':
          console.log(
            'tracking',
            event.query.queryHash,
            'b/c of a',
            event.type,
          );
          seenKeys.current.add(event.query.queryHash);
      }
    });
  }

  return (
    <stream.Provider
      onEntries={(entries) => {
        console.log('received', entries.length, 'entries');
        const combinedEntries: DehydratedState = {
          queries: [],
          mutations: [],
        };
        for (const entry of entries) {
          combinedEntries.queries.push(...entry.queries);
          combinedEntries.mutations.push(...entry.mutations);
        }
        setDehydratedState(combinedEntries);
      }}
      onFlush={() => {
        const dehydratedState = dehydrate(queryClient, {
          shouldDehydrateQuery(query) {
            const shouldDehydrate =
              seenKeys.current.has(query.queryHash) &&
              query.state.status !== 'loading';
            return shouldDehydrate;
          },
        });
        seenKeys.current.clear();

        return [dehydratedState];
      }}
    >
      <Hydrate state={dehydratedState}>{props.children}</Hydrate>
    </stream.Provider>
  );
}
export function Providers(props: { children: React.ReactNode }) {
  const [queryClient] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnReconnect: false,
            refetchOnMount: false,
            refetchInterval: Infinity,
            refetchOnWindowFocus: false,
            staleTime: Infinity,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <Hydration>{props.children}</Hydration>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
