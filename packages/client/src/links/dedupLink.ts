/**
 * tRPC - In-flight Request Deduplication Link
 */
export function createDedupLink() {
  const inFlight = new Map<string, Promise<unknown>>();

  return () =>
    ({
      op,
      next,
    }: {
      op: { path: string; input: unknown };
      next: (op: unknown) => Promise<unknown>;
    }) => {
      const key = `${op.path}:${JSON.stringify(op.input)}`;
      if (inFlight.has(key)) {
        return inFlight.get(key);
      }
      const promise = next(op).finally(() => inFlight.delete(key));
      inFlight.set(key, promise);
      return promise;
    };
}
