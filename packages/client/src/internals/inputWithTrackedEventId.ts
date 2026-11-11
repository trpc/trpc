import { isObject } from '@trpc/server/unstable-core-do-not-import';

export function inputWithTrackedEventId(
  input: unknown,
  lastEventId: string | undefined,
) {
  if (!lastEventId) {
    return input;
  }
  // the server's `isObject` excludes arrays, so spreading one here would corrupt it
  if (input != null && !isObject(input)) {
    return input;
  }
  return {
    ...(input ?? {}),
    lastEventId,
  };
}
