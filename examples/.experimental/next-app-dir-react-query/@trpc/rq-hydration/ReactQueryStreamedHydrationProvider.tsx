// app/providers.jsx
'use client';

import {
  ContextOptions,
  DehydratedState,
  dehydrate,
  hydrate,
  useQueryClient,
} from '@tanstack/react-query';
import React, { useRef } from 'react';
import { createHydrationStreamProvider } from './HydrationStreamProvider';

const stream = createHydrationStreamProvider<DehydratedState>();

/**
 * This component is responsible for:
 * - hydrating the query client on the server
 * - dehydrating the query client on the server
 */
export function ReactQueryStreamedHydration(props: {
  children: React.ReactNode;
  context?: ContextOptions['context'];
}) {
  const queryClient = useQueryClient({
    context: props.context,
  });
  const isSubscribed = useRef(false);
  const seenKeys = useRef(new Set<string>());

  const cache = queryClient.getQueryCache();

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
      // Happens on server:
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

        if (!dehydratedState.queries.length) {
          return [];
        }

        return [dehydratedState];
      }}
      // Happens in browser:
      onEntries={(entries) => {
        const combinedEntries: DehydratedState = {
          queries: [],
          mutations: [],
        };
        for (const entry of entries) {
          combinedEntries.queries.push(...entry.queries);
          combinedEntries.mutations.push(...entry.mutations);
        }

        console.log(
          'received',
          combinedEntries.queries.length,
          'entries:',
          combinedEntries.queries.map((q) => q.queryHash),
        );

        hydrate(queryClient, combinedEntries);
      }}
    >
      {props.children}
    </stream.Provider>
  );
}
