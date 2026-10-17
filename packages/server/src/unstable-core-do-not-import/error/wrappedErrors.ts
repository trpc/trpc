// Share provenance across module copies without adding enumerable or serialized fields.
const wrappedErrorKey = Symbol.for('trpc.automaticallyWrappedError');

export function markAutomaticallyWrappedError(error: Error): void {
  Object.defineProperty(error, wrappedErrorKey, { value: true });
}

export function isAutomaticallyWrappedError(error: Error): boolean {
  return (
    Object.getOwnPropertyDescriptor(error, wrappedErrorKey)?.value === true
  );
}
