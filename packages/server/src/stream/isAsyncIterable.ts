export function isAsyncIterable<TValue>(
  value: unknown,
): value is AsyncIterable<TValue> {
  return (
    value != null && typeof value == 'object' && Symbol.asyncIterator in value
  );
}
