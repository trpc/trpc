const trackedSymbol = Symbol.for('trpc.tracked');

/**
 * A subscription event with an id the client can resume from.
 * @since 0.1.0
 * @stability stable
 */
export interface TrackedEnvelope<TData> {
  readonly id: string;
  readonly data: TData;
}

/**
 * Wraps a subscription event with an id. It's sent as the SSE `id:`, and a
 * reconnecting client sends it back as `lastEventId`.
 *
 * @example
 * ```ts
 * t.procedure.subscription(async function* ({ lastEventId }) {
 *   for await (const post of posts.since(lastEventId)) yield tracked(post.id, post);
 * });
 * ```
 * @since 0.1.0
 * @stability stable
 */
export function tracked<TData>(
  id: string,
  data: TData,
): TrackedEnvelope<TData> {
  if (id === '') throw new Error('tracked(): id must be non-empty');
  // An SSE `id:` field ends at a line break, so the rest would become new fields.
  if (/[\r\n\0]/.test(id)) {
    throw new Error('tracked(): id must not contain line breaks or NUL');
  }
  return { id, data, [trackedSymbol]: true } as TrackedEnvelope<TData>;
}

/** @internal */
export function isTracked(value: unknown): value is TrackedEnvelope<unknown> {
  return typeof value === 'object' && value !== null && trackedSymbol in value;
}
