import type {
  DehydratedState,
  Mutation,
  Query,
  QueryClient,
} from '@tanstack/react-query';
import {
  defaultShouldDehydrateMutation,
  defaultShouldDehydrateQuery,
  dehydrate,
} from '@tanstack/react-query';

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
