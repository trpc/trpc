import { EventEmitter } from 'events';

// const debug = (...args: unknown[]) => console.log(...args);

type SubscriptionDestroyReason =
  | 'timeout'
  | 'stopped'
  | 'startError'
  | 'closed';

export class SubscriptionDestroyError extends Error {
  public readonly reason: SubscriptionDestroyReason;
  constructor(reason: SubscriptionDestroyReason) {
    super(reason);

    this.reason = reason;
    Object.setPrototypeOf(this, SubscriptionDestroyError.prototype);
  }
}

interface SubscriptionEvents<TOutput> {
  data: (data: TOutput) => void;
  destroy: (reason: SubscriptionDestroyReason) => void;
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
  getInitialOutput?: (emit: SubscriptionEmit<TOutput>) => void | Promise<void>;
  start: (emit: SubscriptionEmit<TOutput>) => UnsubscribeFn;
}
export class Subscription<TOutput = unknown> {
  private readonly events: SubscriptionEventEmitter<TOutput>;
  private opts: Required<SubscriptionOptions<TOutput>>;
  private isDestroyed: boolean;

  constructor(opts: SubscriptionOptions<TOutput>) {
    this.isDestroyed = false;
    this.events = new SubscriptionEventEmitter<TOutput>();
    this.opts = {
      getInitialOutput: () => {
        // no-op
      },
      ...opts,
    };
  }

  public destroy(reason: SubscriptionDestroyReason) {
    if (this.isDestroyed) {
      return;
    }
    // debug('Subscription.destroy()', reason);
    this.isDestroyed = true;
    this.events.emit('destroy', reason);
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
      await this.opts.getInitialOutput(emit);
      const cancel = this.opts.start(emit);
      this.events.on('destroy', () => {
        cancel();
      });
    } catch (err) {
      this.emitError(err);
    }
  }

  public async onceOutputAndStop(): Promise<TOutput> {
    // debug('Subscription.onceOutputAsync()');
    return new Promise<TOutput>(async (resolve, reject) => {
      const onDestroy = (reason: SubscriptionDestroyReason) => {
        reject(new SubscriptionDestroyError(reason));
        cleanup();
      };
      const onOutput = (data: TOutput) => {
        resolve(data);
        cleanup();
        this.destroy('stopped');
      };
      const onError = (err: Error) => {
        reject(err);
        cleanup();
        this.destroy('stopped');
      };

      const cleanup = () => {
        this.events.off('data', onOutput);
        this.events.off('destroy', onDestroy);
        this.events.off('error', onError);
      };

      this.events.once('data', onOutput);
      this.events.once('destroy', onDestroy);
      this.events.once('error', onError);

      this.start().catch(() => {
        // is handled through event
      });
    });
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
}

export function subscriptionPullFatory<TOutput>(opts: {
  interval: number;
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
      timer = setTimeout(() => _pull(emit), opts.interval);
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
