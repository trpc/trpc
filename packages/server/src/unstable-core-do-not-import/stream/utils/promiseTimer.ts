export function disposablePromiseTimer(ms: number) {
  let timer: ReturnType<typeof setTimeout> | null = null;

  return {
    start() {
      if (timer) {
        throw new Error('Timer already started');
      }

      const promise = new Promise<void>((resolve) => {
        timer = setTimeout(resolve, ms);
      });
      return promise;
    },
    [Symbol.dispose]: () => {
      if (timer) {
        clearTimeout(timer);
      }
    },
  };
}
export type PromiseTimer = ReturnType<typeof disposablePromiseTimer>;
