import { getTRPCErrorFromUnknown } from './error/TRPCError';
import { Observable, observable, Observer } from './observable';

/**
 * @deprecated
 * This functionality is deprecated and will be removed in the next major version.
 */
export function subscriptionPullFactory<TOutput>(opts: {
  /**
   * The interval of how often the function should run
   */
  intervalMs: number;
  pull(emit: Observer<TOutput, unknown>): Promise<void> | void;
}): Observable<TOutput, unknown> {
  let timer: any;
  let stopped = false;
  async function _pull(emit: Observer<TOutput, unknown>) {
    /* istanbul ignore next -- @preserve */
    if (stopped) {
      return;
    }
    try {
      await opts.pull(emit);
    } catch (err /* istanbul ignore next -- @preserve */) {
      emit.error(getTRPCErrorFromUnknown(err));
    }

    /* istanbul ignore else -- @preserve */
    if (!stopped) {
      timer = setTimeout(() => _pull(emit), opts.intervalMs);
    }
  }

  return observable<TOutput>((emit) => {
    _pull(emit).catch((err) => {
      emit.error(getTRPCErrorFromUnknown(err));
    });
    return () => {
      clearTimeout(timer);
      stopped = true;
    };
  });
}
