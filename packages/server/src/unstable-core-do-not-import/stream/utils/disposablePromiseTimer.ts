export const disposablePromiseTimerResult = Symbol();
export function disposablePromiseTimer(ms: number) {
  let timer: ReturnType<typeof setTimeout> | null = null;

  return {
    start() {
      if (timer) {
        throw new Error('Timer already started');
      }

      const promise = new Promise<typeof disposablePromiseTimerResult>(
        (resolve) => {
          timer = setTimeout(() => resolve(disposablePromiseTimerResult), ms);
        },
      );
      return promise;
    },
    [Symbol.dispose]: () => {
      if (timer) {
        clearTimeout(timer);
      }
    },
  };
}
