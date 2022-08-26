import { getTRPCErrorFromUnknown } from './error/utils';
import { Observable, Observer, observable } from './observable';

export function subscriptionPullFactory<TOutput>(opts: {
  /**
   * The interval of how often the function should run
   */
  intervalMs: number;
  pull(emit: Observer<TOutput, unknown>): void | Promise<void>;
}): Observable<TOutput, unknown> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let timer: any;
  let stopped = false;
  async function _pull(emit: Observer<TOutput, unknown>) {
    /* istanbul ignore next */
    if (stopped) {
      return;
    }
    try {
      await opts.pull(emit);
    } catch (err /* istanbul ignore next */) {
      emit.error(getTRPCErrorFromUnknown(err));
    }

    /* istanbul ignore else */
    if (!stopped) {
      timer = setTimeout(() => _pull(emit), opts.intervalMs);
    }
  }

  return observable<TOutput>((emit) => {
    _pull(emit).catch((err) => emit.error(getTRPCErrorFromUnknown(err)));
    return () => {
      clearTimeout(timer);
      stopped = true;
    };
  });
}
