export interface ObservableLike<TValue> {
  subscribe(subscription: {
    onNext?: (item: TValue) => void;
    onError?: (error: unknown) => void;
    onDone?: () => void;
  }): UnsubscribeFn;
  get(): TValue;
  set(value: TValue): void;
  destroy(): void;
}

type UnsubscribeFn = () => void;

interface SubscriptionInternal<TValue> {
  onNext?: (item: TValue) => void;
  onError?: (error: unknown) => void;
  onDone?: () => void;
}

export function observable<TValue>(
  initialValue: TValue,
): ObservableLike<TValue> {
  const subscribers: SubscriptionInternal<TValue>[] = [];
  let value = initialValue;
  return {
    subscribe(subscription) {
      subscribers.push(subscription);
      return () => {
        const index = subscribers.indexOf(subscription);
        if (index !== -1) {
          subscription.onDone?.();
          subscribers.splice(index, 1);
        }
      };
    },
    set(newValue) {
      const oldValue = value;
      value = newValue;
      if (oldValue !== newValue) {
        for (const subscription of subscribers) {
          subscription.onNext?.(newValue);
        }
      }
    },
    get() {
      return value;
    },
    destroy() {
      for (const subscription of subscribers) {
        subscription.onDone?.();
      }
      while (subscribers.length) {
        subscribers.pop();
      }
    },
  };
}
