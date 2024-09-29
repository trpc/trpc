const trackedSymbol = Symbol('TrackedEnvelope');

type TrackedId = string & {
  __brand: 'TrackedId';
};
export type TrackedEnvelope<TData> = [TrackedId, TData, typeof trackedSymbol];

export type TrackedData<TData> = {
  /**
   * The id of the message to keep track of in case the connection gets lost
   */
  id: string;
  /**
   * The data field of the message - this can be anything
   */
  data: TData;
};
/**
 * Produce a typed server-sent event message
 * @deprecated use `tracked(id, data)` instead
 */
export function sse<TData>(event: { id: string; data: TData }) {
  return tracked(event.id, event.data);
}

export function isTrackedEnvelope<TData>(
  value: unknown,
): value is TrackedEnvelope<TData> {
  return Array.isArray(value) && value[2] === trackedSymbol;
}

/**
 * Automatically track an event so that it can be resumed from a given id if the connection is lost
 * @remark - do not use this type directly outside of `.subscription()` functions as we actually lie about the response value here in order to make our inference easier
 */
export function tracked<TData>(id: string, data: TData): TrackedData<TData> {
  if (id === '') {
    // This limitation could be removed by using different SSE event names / channels for tracked event and non-tracked event
    throw new Error(
      '`id` must not be an empty string as empty string is the same as not setting the id at all',
    );
  }
  // @ts-expect-error we lie about the return value
  return [id as TrackedId, data, trackedSymbol] as TrackedData<TData>;
}

export type inferTrackedOutput<TData> = TData extends TrackedEnvelope<
  infer $Data
>
  ? TrackedData<$Data>
  : TData;
