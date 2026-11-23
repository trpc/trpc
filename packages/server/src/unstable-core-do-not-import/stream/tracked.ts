const trackedSymbol = Symbol();

type TrackedId = string & {
  __brand: 'TrackedId';
};
/** An event wrapped by `tracked()`, with its id. */
export type TrackedEnvelope<TData> = [TrackedId, TData, typeof trackedSymbol];

/** A tracked event as the client gets it. */
export interface TrackedData<TData> {
  /**
   * The event's id, which the client sends back as `lastEventId` when it
   * reconnects.
   */
  id: string;
  /**
   * The event's data.
   */
  data: TData;
}
/**
 * Wraps an event with an id, so a client can resume from it.
 * @deprecated Use `tracked(id, data)` instead.
 */
export function sse<TData>(event: { id: string; data: TData }) {
  return tracked(event.id, event.data);
}

/** Whether a value was made by `tracked()`. */
export function isTrackedEnvelope<TData>(
  value: unknown,
): value is TrackedEnvelope<TData> {
  return Array.isArray(value) && value[2] === trackedSymbol;
}

/**
 * Gives a subscription event an id. When the connection drops, the client
 * reconnects with the last id it got, as `input.lastEventId`, so the
 * subscription can resume from there. The id can't be empty.
 * @example
 * ```ts
 * yield tracked(post.id, post);
 * ```
 * @see https://trpc.io/docs/server/subscriptions#tracked
 */
export function tracked<TData>(
  id: string,
  data: TData,
): TrackedEnvelope<TData> {
  if (id === '') {
    // This limitation could be removed by using different SSE event names / channels for tracked event and non-tracked event
    throw new Error(
      '`id` must not be an empty string as empty string is the same as not setting the id at all',
    );
  }
  if (/[\0\n\r]/.test(id)) {
    throw new Error(
      '`id` must not contain line breaks or null characters as they are not allowed in a Server-Sent Events id',
    );
  }
  return [id as TrackedId, data, trackedSymbol];
}

/** The type a client gets for an event, unwrapping `tracked()` events. */
export type inferTrackedOutput<TData> =
  TData extends TrackedEnvelope<infer $Data> ? TrackedData<$Data> : TData;
