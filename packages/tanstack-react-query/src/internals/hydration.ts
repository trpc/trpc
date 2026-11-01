import type {
  DehydratedState,
  Mutation,
  Query,
  QueryClient,
  QueryKey,
} from '@tanstack/react-query';
import {
  defaultShouldDehydrateMutation,
  defaultShouldDehydrateQuery,
  dehydrate,
  hydrate,
} from '@tanstack/react-query';

type DehydratedQuery = DehydratedState['queries'][number];

const noop = () => {
  // handled where the promise is read
};

interface SentQuery {
  dataUpdatedAt: number;
  /** The request whose result is already on its way, if it was sent pending */
  promise: Promise<unknown> | undefined;
}

interface SentEntries {
  queries: Map<string, SentQuery>;
  mutations: WeakSet<Mutation>;
  watchingPending: boolean;
}

/**
 * Keyed by the request's `QueryClient`, so one server render's boundaries
 * share it and the next request starts over.
 */
const sentByClient = new WeakMap<QueryClient, SentEntries>();

function sentEntries(queryClient: QueryClient) {
  let sent = sentByClient.get(queryClient);
  if (!sent) {
    sent = {
      queries: new Map(),
      mutations: new WeakSet(),
      watchingPending: false,
    };
    sentByClient.set(queryClient, sent);
  }
  return sent;
}

/**
 * A query sent pending carries its request's promise, so the data that
 * request writes is already on its way. Record it once it lands: the query
 * drops its promise after settling, so it can't be compared later.
 */
function watchPendingSends(queryClient: QueryClient, sent: SentEntries) {
  if (sent.watchingPending) {
    return;
  }
  sent.watchingPending = true;
  queryClient.getQueryCache().subscribe((event) => {
    if (
      event.type !== 'updated' ||
      event.action.type !== 'success' ||
      event.action.manual
    ) {
      return;
    }
    const entry = sent.queries.get(event.query.queryHash);
    if (entry?.promise && entry.promise === event.query.promise) {
      entry.dataUpdatedAt = event.query.state.dataUpdatedAt;
      entry.promise = undefined;
    }
  });
}

function isAlreadySent(query: Query, sent: SentQuery | undefined) {
  return sent !== undefined && query.state.dataUpdatedAt <= sent.dataUpdatedAt;
}

/**
 * Dehydrate what the client's `dehydrate` defaults select, minus entries an
 * earlier call already sent for this client with the same or newer data.
 * @internal
 */
export function dehydrateUnsent(queryClient: QueryClient): DehydratedState {
  const defaults = queryClient.getDefaultOptions().dehydrate;
  const shouldDehydrateQuery =
    defaults?.shouldDehydrateQuery ?? defaultShouldDehydrateQuery;
  const shouldDehydrateMutation =
    defaults?.shouldDehydrateMutation ?? defaultShouldDehydrateMutation;
  const sent = sentEntries(queryClient);

  return dehydrate(queryClient, {
    shouldDehydrateQuery: (query) => {
      if (
        isAlreadySent(query, sent.queries.get(query.queryHash)) ||
        !shouldDehydrateQuery(query)
      ) {
        return false;
      }
      const promise =
        query.state.status === 'pending' ? query.promise : undefined;
      if (promise) {
        watchPendingSends(queryClient, sent);
      }
      sent.queries.set(query.queryHash, {
        dataUpdatedAt: query.state.dataUpdatedAt,
        promise,
      });
      return true;
    },
    shouldDehydrateMutation: (mutation) => {
      if (sent.mutations.has(mutation) || !shouldDehydrateMutation(mutation)) {
        return false;
      }
      sent.mutations.add(mutation);
      return true;
    },
  });
}

/**
 * Keyed by the query's state object, which changes on every update: handles
 * minted for the same state share one dehydrated copy, which the RSC payload
 * then sends once.
 */
const dehydratedByState = new WeakMap<object, DehydratedQuery>();

/**
 * The dehydrated form of one query, for a self-hydrating handle. Pending
 * queries carry their request's promise. Failed queries aren't sent, so the
 * browser fetches them again and gets a `TRPCClientError`.
 * @internal
 */
export function dehydrateHandleQuery(
  queryClient: QueryClient,
  queryKey: QueryKey,
): DehydratedQuery | undefined {
  const query = queryClient.getQueryCache().find({ queryKey, exact: true });
  if (
    !query ||
    (query.state.status !== 'success' && query.state.status !== 'pending')
  ) {
    return undefined;
  }
  const cached = dehydratedByState.get(query.state);
  if (cached) {
    return cached;
  }
  const [dehydrated] = dehydrate(queryClient, {
    shouldDehydrateQuery: (candidate) => candidate === query,
    shouldDehydrateMutation: () => false,
  }).queries;
  if (dehydrated) {
    // A handle that never reaches the browser leaves nothing to handle a rejection
    dehydrated.promise?.catch(noop);
    dehydratedByState.set(query.state, dehydrated);
  }
  return dehydrated;
}

const hydratedByClient = new WeakMap<QueryClient, WeakSet<object>>();

function isNewerThan(dehydrated: DehydratedQuery, existing: Query) {
  return (
    dehydrated.state.dataUpdatedAt > existing.state.dataUpdatedAt ||
    (dehydrated.promise !== undefined &&
      existing.state.status !== 'pending' &&
      existing.state.fetchStatus !== 'fetching' &&
      dehydrated.dehydratedAt !== undefined &&
      dehydrated.dehydratedAt > existing.state.dataUpdatedAt)
  );
}

/**
 * Write a self-hydrating handle's query into the reading client, once per
 * handle. Like `HydrationBoundary`, a query nothing on screen observes is
 * written during render, so the read finds it. Newer data for an observed
 * query waits until after the render: a read can't run an effect.
 * @internal
 */
export function hydrateHandleQuery(
  queryClient: QueryClient,
  dehydrated: unknown,
) {
  if (typeof dehydrated !== 'object' || dehydrated === null) {
    return;
  }
  let hydrated = hydratedByClient.get(queryClient);
  if (!hydrated) {
    hydrated = new WeakSet();
    hydratedByClient.set(queryClient, hydrated);
  }
  if (hydrated.has(dehydrated)) {
    return;
  }
  hydrated.add(dehydrated);

  const query = dehydrated as DehydratedQuery;
  const state = { queries: [query], mutations: [] };
  const existing = queryClient.getQueryCache().get(query.queryHash);
  if (!existing || existing.getObserversCount() === 0) {
    hydrate(queryClient, state);
  } else if (isNewerThan(query, existing)) {
    queueMicrotask(() => hydrate(queryClient, state));
  }
}
