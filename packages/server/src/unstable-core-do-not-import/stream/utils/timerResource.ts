import { makeResource } from './disposable';

export const disposablePromiseTimerResult = Symbol();

export function timerResource(ms: number) {
  let timer: ReturnType<typeof setTimeout> | null = null;

  return makeResource(
    {
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
    },
    () => {
      if (timer) {
        clearTimeout(timer);
      }
    },
  );
}
