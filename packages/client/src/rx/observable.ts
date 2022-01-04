import {
  Observer,
  Subscribable,
  SubscriptionLike,
  TeardownLogic,
} from './types';

export function observable<TValue, TError>(
  subscribe: (observer: Observer<TValue, TError>) => TeardownLogic,
): Subscribable<TValue, TError> {
  return {
    subscribe(observer) {
      const teardown = subscribe({
        next() {},
        complete() {},
        error() {},
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

const obs = observable<number, Error>((observer) => {
  observer.next(1);
  observer.complete();
});
