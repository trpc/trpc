import { EventEmitter } from 'events';
import { getErrorFromUnknown } from './internals/errors';

interface SubscriptionEvents<TOutput> {
  data: (data: TOutput) => void;
  destroy: () => void;
  error: (error: Error) => void;
}
declare interface SubscriptionEventEmitter<TOutput> {
  on<U extends keyof SubscriptionEvents<TOutput>>(
    event: U,
    listener: SubscriptionEvents<TOutput>[U],
  ): this;

  once<U extends keyof SubscriptionEvents<TOutput>>(
    event: U,
    listener: SubscriptionEvents<TOutput>[U],
  ): this;

  emit<U extends keyof SubscriptionEvents<TOutput>>(
    event: U,
    ...args: Parameters<SubscriptionEvents<TOutput>[U]>
  ): boolean;
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
class SubscriptionEventEmitter<TOutput> extends EventEmitter {}

type UnsubscribeFn = () => void;
type EmitFn<TOutput> = (data: TOutput) => void;

export type SubscriptionEmit<TOutput> = {
  data: EmitFn<TOutput>;
  error: EmitFn<Error>;
};
export type SubscriptionCallback<TOutput> = (
  emit: SubscriptionEmit<TOutput>,
) => UnsubscribeFn | Promise<UnsubscribeFn>;

/**
 * @beta
 */
export class Subscription<TOutput = unknown> {
  private readonly events: SubscriptionEventEmitter<TOutput>;
  private callback;
  private isDestroyed: boolean;

  constructor(callback: SubscriptionCallback<TOutput>) {
    this.isDestroyed = false;
    this.events = new SubscriptionEventEmitter<TOutput>();
    this.callback = callback;
  }

  public destroy() {
    if (this.isDestroyed) {
      return;
    }
    // debug('Subscription.destroy()', reason);
    this.isDestroyed = true;
    this.events.emit('destroy');
    this.events.removeAllListeners();
  }

  public async start() {
    /* istanbul ignore next */
    if (this.isDestroyed) {
      throw new Error('Called start() on a destroyed subscription');
    }
    try {
      const emit: SubscriptionEmit<TOutput> = {
        error: (err) => this.emitError(err),
        data: (data) => this.emitOutput(data),
      };
      const cancel = await this.callback(emit);
      if (
        this.isDestroyed
        /* istanbul ignore next */
      ) {
        cancel();
      } else {
        this.events.on('destroy', cancel);
      }
    } catch (
      cause
      /* istanbul ignore next */
    ) {
      this.emitError(getErrorFromUnknown(cause));
    }
  }

  /* istanbul ignore next */
  /**
   * @deprecated This method is just here to help with `inferSubscriptionOutput` which I can't get working without it
   */
  public output(): TOutput {
    throw new Error('Not in use');
  }

  /**
   * Emit data
   */
  emitOutput(data: TOutput) {
    this.events.emit('data', data);
  }
  /**
   * Emit error
   */
  emitError(err: Error) {
    this.events.emit('error', err);
  }

  on(...args: Parameters<SubscriptionEventEmitter<TOutput>['on']>) {
    return this.events.on(...args);
  }
  off(...args: Parameters<SubscriptionEventEmitter<TOutput>['off']>) {
    return this.events.off(...args);
  }
}

/**
 * @alpha Might be removed
 */
export function subscriptionPullFactory<TOutput>(opts: {
  /**
   * The interval of how often the function should run
   */
  intervalMs: number;
  pull(emit: SubscriptionEmit<TOutput>): void | Promise<void>;
}): Subscription<TOutput> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let timer: any;
  let stopped = false;
  async function _pull(emit: SubscriptionEmit<TOutput>) {
    /* istanbul ignore next */
    if (stopped) {
      return;
    }
    try {
      await opts.pull(emit);
    } catch (err /* istanbul ignore next */) {
      emit.error(getErrorFromUnknown(err));
    }

    /* istanbul ignore else */
    if (!stopped) {
      timer = setTimeout(() => _pull(emit), opts.intervalMs);
    }
  }

  return new Subscription<TOutput>((emit) => {
    _pull(emit).catch((err) => emit.error(getErrorFromUnknown(err)));
    return () => {
      clearTimeout(timer);
      stopped = true;
    };
  });
}
