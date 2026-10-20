import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import {
  createTrpcContext,
  createTrpcQueryUtils,
  hydrationOptions,
} from '@trpc12/tanstack-react-query';
import {
  createTrpcClient,
  dedupeLink,
  httpStreamLink,
  routerType,
} from '@trpc12/trpc/client';
import { useState, type ReactNode } from 'react';
import type { DirectoryRouter } from '../server/directory.ts';
import type { TrackerRouter } from '../server/tracker.ts';
import { registerIssueMutations } from './issues.ts';
import { serializer } from './serializer.ts';
import { storageKey } from './storage-key.ts';

export const makeTrackerClient = () =>
  createTrpcClient({
    router: routerType<TrackerRouter>(),
    // Two components asking for the same query at once share one request.
    links: [
      dedupeLink(),
      httpStreamLink({ url: '/trpc', batch: true, serializer }),
    ],
  });

const makeDirectoryClient = () =>
  createTrpcClient({
    router: routerType<DirectoryRouter>(),
    links: [
      httpStreamLink({ url: '/directory/trpc', batch: true, serializer }),
    ],
  });

export const [TrackerProvider, useTracker] =
  createTrpcContext<typeof makeTrackerClient>();

// The directory's keys start with `directory`, so its queries never collide
// with the tracker's in the shared `QueryClient`.
export const [DirectoryProvider, useDirectory] = createTrpcContext<
  typeof makeDirectoryClient
>({ keyPrefix: 'directory' });

export type Tracker = ReturnType<typeof useTracker>;

const day = 24 * 60 * 60 * 1000;

function makeState() {
  const tracker = makeTrackerClient();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { gcTime: day, staleTime: 5_000 } },
  });
  // Before the cache is restored: a persisted mutation resumes with the
  // `mutationFn` registered for its key.
  registerIssueMutations(
    queryClient,
    createTrpcQueryUtils({ client: tracker }),
  );
  // The persisted cache goes through the links' serializer, so `Date`s
  // survive the trip through localStorage.
  const hydration = hydrationOptions({ client: tracker });
  return {
    tracker,
    directory: makeDirectoryClient(),
    queryClient,
    persistOptions: {
      persister: createAsyncStoragePersister({
        storage: window.localStorage,
        key: storageKey,
        throttleTime: 100,
      }),
      maxAge: day,
      dehydrateOptions: { serializeData: hydration.dehydrate.serializeData },
      hydrateOptions: { defaultOptions: hydration.hydrate },
    },
  };
}

export function Providers(props: { children: ReactNode }) {
  const [state] = useState(makeState);
  return (
    <PersistQueryClientProvider
      client={state.queryClient}
      persistOptions={state.persistOptions}
      onSuccess={() => state.queryClient.resumePausedMutations()}
    >
      <TrackerProvider client={state.tracker}>
        <DirectoryProvider client={state.directory}>
          {props.children}
        </DirectoryProvider>
      </TrackerProvider>
    </PersistQueryClientProvider>
  );
}
