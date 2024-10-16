import { createDeferred } from './createDeferred';

export function createPromiseTimer(ms: number) {
  let deferred = createDeferred<void>();
  let timeout: ReturnType<typeof setTimeout> | null = null;

  const timer = {
    get promise() {
      return deferred.promise;
    },

    start,
    reset,
    clear,
  };
  return timer;

  function start(): PromiseTimer {
    if (timeout != null) {
      throw new Error('PromiseTimer already started.');
    }
    timeout = setTimeout(deferred.resolve, ms);
    return timer;
  }

  function reset(): PromiseTimer {
    clear();
    deferred = createDeferred();
    return timer;
  }

  function clear(): PromiseTimer {
    if (timeout != null) {
      clearTimeout(timeout);
      timeout = null;
    }
    return timer;
  }
}
export type PromiseTimer = ReturnType<typeof createPromiseTimer>;
