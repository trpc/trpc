import { createDeferred } from './createDeferred';

export function createPromiseTimer(ms: number) {
  let deferred = createDeferred<void>();
  let timeout: ReturnType<typeof setTimeout> | null = null;

  const timer = {
    promise() {
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

export function disposablePromiseTimer(ms: number) {
  let timer: ReturnType<typeof setTimeout>;

  const promise = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, ms);
  });

  return {
    promise,
    [Symbol.dispose]: () => {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      clearTimeout(timer!);
    },
  };
}
export type PromiseTimer = ReturnType<typeof createPromiseTimer>;
