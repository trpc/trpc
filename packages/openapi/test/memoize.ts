/**
 * Runs `fn` on the first call and returns the same promise afterwards, so a
 * describe block can share expensive read-only setup (such as generating an
 * OpenAPI document) without a `beforeAll` hook.
 */
export function memoize<T>(fn: () => Promise<T>): () => Promise<T> {
  let promise: Promise<T> | null = null;
  return () => (promise ??= fn());
}
