import {
  MonoTypeOperatorFunction,
  Observable,
  Subscriber,
  Subscription,
} from 'rxjs';

export type inferObservableValue<TObservable extends Observable<any>> =
  TObservable extends Observable<infer TValue> ? TValue : never;

export class ObservableAbortError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ObservableAbortError';
    Object.setPrototypeOf(this, ObservableAbortError.prototype);
  }
}

/** @internal */
export function observableToPromise<TValue>(observable: Observable<TValue>) {
  let abort: () => void;
  const promise = new Promise<TValue>((resolve, reject) => {
    let isDone = false;
    function onDone() {
      if (isDone) {
        return;
      }
      isDone = true;
      reject(new ObservableAbortError('This operation was cancelled.'));
      subscription.unsubscribe();
    }
    const subscription = observable.subscribe({
      next(data) {
        isDone = true;
        resolve(data);
        onDone();
      },
      error(data) {
        isDone = true;
        reject(data);
        onDone();
      },
      complete() {
        isDone = true;
        onDone();
      },
    });
    abort = onDone;
  });
  return {
    promise,
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    abort: abort!,
  };
}

export function share<T>(): MonoTypeOperatorFunction<T> {
  const subscribers = new Set<Subscriber<T>>();
  let connection: Subscription | null = null;

  return (source) =>
    new Observable((subscriber) => {
      subscribers.add(subscriber);
      subscriber.add(() => {
        subscribers.delete(subscriber);
        if (subscribers.size === 0) {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          connection!.unsubscribe();
          connection = null;
        }
      });

      if (!connection) {
        connection = source.subscribe({
          next: (value) => subscribers.forEach((s) => s.next(value)),
          error: (error) => subscribers.forEach((s) => s.error(error)),
          complete: () => subscribers.forEach((s) => s.complete()),
        });
        connection.add(() => subscribers.clear());
      }
    });
}
