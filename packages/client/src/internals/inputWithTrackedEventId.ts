import { isPlainObject } from '@trpc/server/unstable-core-do-not-import';

export function inputWithTrackedEventId(
  input: unknown,
  lastEventId: string | undefined,
) {
  if (!lastEventId) {
    return input;
  }
  // Spreading an array, a `Date` or a class instance would corrupt it, so only
  // a plain object can carry the id.
  if (input != null && !isPlainObject(input)) {
    return input;
  }
  return {
    ...(input ?? {}),
    lastEventId,
  };
}
