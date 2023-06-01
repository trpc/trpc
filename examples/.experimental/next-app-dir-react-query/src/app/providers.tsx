// app/providers.jsx
'use client';

import {
  ContextOptions,
  DehydratedState,
  Hydrate,
  Query,
  QueryClient,
  QueryClientProvider,
  dehydrate,
  useHydrate,
  useQueryClient,
} from '@tanstack/react-query';
import React, { use, useEffect, useRef, cache, useState } from 'react';
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
          console.log({
            event,
          });
          seenKeys.current.add(event.query.queryHash);
      }
    });
  }

  return (
    <stream.Provider
      onEntries={(entries) => {
        for (const entry of entries) {
          setDehydratedState(entry);
        }
      }}
      onDehydrate={() => {
        const dehydratedState = dehydrate(queryClient, {
          shouldDehydrateQuery(query) {
            return seenKeys.current.has(query.queryHash);
          },
        });

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
    </QueryClientProvider>
  );
}
