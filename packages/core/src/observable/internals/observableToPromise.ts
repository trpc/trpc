import type { Observable } from '../types';

export class ObservableAbortError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ObservableAbortError';
    Object.setPrototypeOf(this, ObservableAbortError.prototype);
  }
}

/** @internal */
export function observableToPromise<TValue>(
  observable: Observable<TValue, unknown>,
) {
  let abort: () => void;
  const promise = new Promise<TValue>((resolve, reject) => {
    let isDone = false;
    function onDone() {
      if (isDone) {
        return;
      }
      isDone = true;
      reject(new ObservableAbortError('This operation was aborted.'));
      obs$.unsubscribe();
    }
    const obs$ = observable.subscribe({
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
