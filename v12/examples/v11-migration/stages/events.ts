interface V11Subscribable<TInput, TEvent> {
  subscribe(
    input: TInput,
    opts: { onData: (event: TEvent) => void; onError: (err: unknown) => void },
  ): { unsubscribe(): void };
}

/**
 * The first `count` events of a v11 client's `subscribe(input, { onData })`,
 * then unsubscribes. `onEach` runs after each earlier event.
 */
export function firstEvents<TInput, TEvent>(
  procedure: V11Subscribable<TInput, TEvent>,
  input: TInput,
  count: number,
  onEach?: (event: TEvent) => unknown,
): Promise<TEvent[]> {
  return new Promise((resolve, reject) => {
    const events: TEvent[] = [];
    const subscription = procedure.subscribe(input, {
      onData(event) {
        events.push(event);
        if (events.length === count) {
          subscription.unsubscribe();
          resolve(events);
        } else {
          Promise.resolve(onEach?.(event)).catch(reject);
        }
      },
      onError(err) {
        subscription.unsubscribe();
        reject(err);
      },
    });
  });
}
