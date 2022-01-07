export interface ObservableCallbacks<TValue, TError> {
  /**
   * @deprecated use `next`
   */
  onNext?: (opts: TValue) => void;
  /**
   * @deprecated use `error`
   */
  onError?: (opts: TError) => void;
  /**
   * @deprecated use `completed`
   */
  onDone?: () => void;
}

export interface ObservableLike<TValue, TError = unknown> {
  subscribe(callbacks: ObservableCallbacks<TValue, TError>): UnsubscribeFn;
  next(value: TValue): void;
  done(): void;
  error(error: TError): void;
}
export interface ObservableSubject<TValue, TError = unknown>
  extends ObservableLike<TValue, TError> {
  get(): TValue;
}

export type UnsubscribeFn = () => void;

export function observable<TValue, TError = unknown>(): ObservableLike<
  TValue,
  TError
> {
  type Listener = {
    callbacks: ObservableCallbacks<TValue, TError>;
    unsubscribe: () => void;
  };
  const listeners: Listener[] = [];

  let value: TValue | null = null;
  return {
    subscribe(callbacks) {
      const listener: Listener = {
        callbacks,
        unsubscribe() {
          const index = listeners.indexOf(listener);
          if (index !== -1) {
            listeners.splice(index, 1);
            listener.callbacks.completed?.();
          }
        },
      };
      listeners.push(listener);
      return () => {
        listener.unsubscribe();
      };
    },
    next(newValue) {
      const oldValue = value;
      value = newValue;
      if (oldValue !== newValue) {
        for (const listener of listeners) {
          listener.callbacks.next?.(newValue);
        }
      }
    },
    done() {
      while (listeners.length) {
        const listener = listeners.pop();
        listener?.callbacks.completed?.();
        listener?.unsubscribe();
      }
    },
    error(error) {
      for (const listener of listeners) {
        listener.callbacks.error?.(error);
      }
    },
  };
}

export function observableSubject<TValue, TError = unknown>(
  initialValue: TValue,
): ObservableSubject<TValue, TError> {
  const $obs = observable<TValue>();
  let value = initialValue;
  $obs.next(initialValue);

  return {
    ...$obs,
    next(v) {
      value = v;
      $obs.next(v);
    },
    get() {
      return value;
    },
  };
}
