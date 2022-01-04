import { Observer, Subscribable, TeardownLogic } from './types';

export function observable<TValue, TError>(
  subscribe: (observer: Observer<TValue, TError>) => TeardownLogic,
): Subscribable<TValue, TError> {
  return {
    subscribe(observer) {
      const teardown = subscribe({
        next(v) {
          if (observer.next) {
            observer.next(v);
          }
        },
        complete() {
          if (observer.complete) {
            observer.complete();
          }
        },
        error(err) {
          if (observer.error) {
            observer.error(err);
          }
        },
      });
      return {
        unsubscribe() {
          if (!teardown) {
            return;
          }
          if (typeof teardown === 'function') {
            teardown();
            return;
          }
          if ('unsubscribe' in teardown) {
            teardown.unsubscribe();
            return;
          }
        },
      };
    },
  };
}
