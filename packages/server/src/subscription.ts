/* istanbul ignore file */

import { EventEmitter } from 'events';

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
export interface SubscriptionOptions<TOutput> {
  start: (
    emit: SubscriptionEmit<TOutput>,
  ) => UnsubscribeFn | Promise<UnsubscribeFn>;
}
export class Subscription<TOutput = unknown> {
  private readonly events: SubscriptionEventEmitter<TOutput>;
  private opts: Required<SubscriptionOptions<TOutput>>;
  private isDestroyed: boolean;

  constructor(opts: SubscriptionOptions<TOutput>) {
    this.isDestroyed = false;
    this.events = new SubscriptionEventEmitter<TOutput>();
    this.opts = {
      ...opts,
    };
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
    if (this.isDestroyed) {
      throw new Error('Called start() on a destroyed subscription');
    }
    try {
      const emit: SubscriptionEmit<TOutput> = {
        error: (err) => this.emitError(err),
        data: (data) => this.emitOutput(data),
      };
      const cancel = await this.opts.start(emit);
      if (this.isDestroyed) {
        cancel();
      } else {
        this.events.on('destroy', cancel);
      }
    } catch (err) {
      this.emitError(err);
    }
  }

  /**
   * This method is just here to help with `inferSubscriptionOutput` which I can't get working without it
   * @deprecated
   */
  protected output(): TOutput {
    throw new Error('Legacy');
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
    if (stopped) {
      return;
    }
    try {
      await opts.pull(emit);
    } catch (err) {
      emit.error(err);
    }
    if (!stopped) {
      timer = setTimeout(() => _pull(emit), opts.intervalMs);
    }
  }

  return new Subscription<TOutput>({
    start(emit) {
      _pull(emit);
      return () => {
        clearTimeout(timer);
        stopped = true;
      };
    },
  });
}
