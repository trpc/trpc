export function inputWithTrackedEventId(
  input: unknown,
  lastEventId: string | undefined,
) {
  if (input != null && typeof input !== 'object') {
    return input;
  }
  return {
    ...(input ?? {}),
    lastEventId,
  };
}
