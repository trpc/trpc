import type { LiveMessage, RowKey, TrackedLiveMessage } from '../protocol';

export interface LiveTransportHandlers<TRow, TKey extends RowKey> {
  onMessage: (message: LiveMessage<TRow, TKey>) => void;
  onError: (error: unknown) => void;
}

/**
 * Anything that can deliver a stream of live messages for one query: a
 * dedicated subscription procedure, or one slot of a pooled stream.
 */
export interface LiveTransport<TRow, TKey extends RowKey> {
  subscribe(handlers: LiveTransportHandlers<TRow, TKey>): () => void;
}

/**
 * Structural type of a vanilla tRPC client subscription procedure such as
 * `client.todos.live`, used to infer the row type from the router.
 */
export interface LiveSubscriptionProcedure<TInput, TRow, TKey extends RowKey> {
  subscribe(
    input: TInput,
    opts: {
      onData?: (data: TrackedLiveMessage<TRow, TKey>) => void;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onError?: (err: any) => void;
    },
  ): { unsubscribe(): void };
}

/**
 * A transport backed by one dedicated subscription procedure that yields
 * `trackLive(...)`.
 */
export function liveSubscription<TInput, TRow, TKey extends RowKey>(
  procedure: LiveSubscriptionProcedure<TInput, TRow, TKey>,
  input: TInput,
): LiveTransport<TRow, TKey> {
  return {
    subscribe(handlers) {
      const subscription = procedure.subscribe(input, {
        onData: (event) => handlers.onMessage(event.data),
        onError: (err) => handlers.onError(err),
      });
      return () => subscription.unsubscribe();
    },
  };
}
