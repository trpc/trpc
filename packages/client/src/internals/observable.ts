type SubscriptionCallback<TValue> = (item: TValue) => void;

export interface ObservableLike<TValue> {
  subscribe(subscription: SubscriptionCallback<TValue>): UnsubscribeFn;
  set(value: TValue): void;
  destroy(): void;
}
export interface ObservableSubject<TValue> extends ObservableLike<TValue> {
  get(): TValue;
}

type UnsubscribeFn = () => void;

export function observable<TValue>(): ObservableLike<TValue> {
  const subscribers: SubscriptionCallback<TValue>[] = [];
  let value: TValue | null = null;
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
    destroy() {
      while (subscribers.length) {
        subscribers.pop();
      }
    },
  };
}

export function observableSubject<TValue>(
  initialValue: TValue,
): ObservableSubject<TValue> {
  const $obs = observable<TValue>();
  let value = initialValue;
  $obs.set(initialValue);

  return {
    ...$obs,
    set(v) {
      value = v;
      $obs.set(v);
    },
    get() {
      return value;
    },
  };
}
