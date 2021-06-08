type SubscriptionCallback<TValue> = (item: TValue) => void;
export interface ObservableLike<TValue> {
  subscribe(subscription: SubscriptionCallback<TValue>): UnsubscribeFn;
  get(): TValue;
  set(value: TValue): void;
  destroy(): void;
}

export interface TransientObservable<TValue> {
  subscribe(subscription: SubscriptionCallback<TValue>): UnsubscribeFn;
  get(): TValue;
  set(value: TValue): void;
  destroy(): void;
}

type UnsubscribeFn = () => void;

export function observable<TValue>(
  initialValue: TValue,
): ObservableLike<TValue> {
  const subscribers: SubscriptionCallback<TValue>[] = [];
  let value = initialValue;
  return {
    subscribe(subscription) {
      subscribers.push(subscription);
      return () => {
        const index = subscribers.indexOf(subscription);
        if (index !== -1) {
          subscribers.splice(index, 1);
        }
      };
    },
    set(newValue) {
      const oldValue = value;
      value = newValue;
      if (oldValue !== newValue) {
        for (const subscription of subscribers) {
          subscription(newValue);
        }
      }
    },
    get() {
      return value;
    },
    destroy() {
      while (subscribers.length) {
        subscribers.pop();
      }
    },
  };
}
