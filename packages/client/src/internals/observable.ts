export interface ObservableSubscription<TValue, TError> {
  onNext?: (opts: TValue) => void;
  onError?: (opts: TError) => void;
  onDone?: () => void;
}

export interface ObservableLike<TValue, TError = unknown> {
  subscribe(
    subscription: ObservableSubscription<TValue, TError>,
  ): UnsubscribeFn;
  set(value: TValue): void;
  done(): void;
  error(error: TError): void;
}
export interface ObservableSubject<TValue, TError = unknown>
  extends ObservableLike<TValue, TError> {
  get(): TValue;
}

type UnsubscribeFn = () => void;

export function observable<TValue, TError = unknown>(): ObservableLike<
  TValue,
  TError
> {
  type Listener = {
    subscription: ObservableSubscription<TValue, TError>;
    unsubscribe: () => void;
  };
  const listeners: Listener[] = [];

  let value: TValue | null = null;
  return {
    subscribe(subscription) {
      const listener: Listener = {
        subscription,
        unsubscribe() {
          const index = listeners.indexOf(listener);
          if (index !== -1) {
            listeners.splice(index, 1);
            listener.subscription.onDone?.();
          }
        },
      };
      listeners.push(listener);
      return () => {
        listener.unsubscribe();
      };
    },
    set(newValue) {
      const oldValue = value;
      value = newValue;
      if (oldValue !== newValue) {
        for (const listener of listeners) {
          listener.subscription.onNext?.(newValue);
        }
      }
    },
    done() {
      while (listeners.length) {
        const listener = listeners.pop();
        listener?.subscription.onDone?.();
        listener?.unsubscribe();
      }
    },
    error(error) {
      for (const listener of listeners) {
        listener.subscription.onError?.(error);
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

export function observableSubjectAsPromise<
  TObservable extends ObservableSubject<TValue, unknown>,
  TValue,
>($obs: TObservable) {
  const promise = new Promise<TValue>((resolve, reject) => {
    if ($obs.get()) {
      resolve($obs.get());
      $obs.done();
      return;
    }
    $obs.subscribe({
      onNext: (result) => {
        resolve(result);

        $obs.done();
      },
      onError(err) {
        reject(err);
        $obs.done();
      },
      onDone() {
        reject(new Error('Done'));
      },
    });
  });
  const cancel = () => $obs.done();

  return { promise, cancel };
}
