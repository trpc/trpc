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

interface SubscriptionEvents<TData> {
  data: (data: TData) => void;
  destroy: (reason: SubscriptionDestroyReason) => void;
  error: (error: Error) => void;
}
declare interface SubscriptionEventEmitter<TData> {
  on<U extends keyof SubscriptionEvents<TData>>(
    event: U,
    listener: SubscriptionEvents<TData>[U],
  ): this;

  once<U extends keyof SubscriptionEvents<TData>>(
    event: U,
    listener: SubscriptionEvents<TData>[U],
  ): this;

  emit<U extends keyof SubscriptionEvents<TData>>(
    event: U,
    ...args: Parameters<SubscriptionEvents<TData>[U]>
  ): boolean;
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
class SubscriptionEventEmitter<TData> extends EventEmitter {}

type UnsubscribeFn = () => void;
type EmitFn<TData> = (data: TData) => void;

export type SubscriptionEmit<TData> = {
  data: EmitFn<TData>;
  error: EmitFn<Error>;
};
export interface SubscriptionOptions<TData> {
  getInitialData?: (emit: SubscriptionEmit<TData>) => void | Promise<void>;
  start: (emit: SubscriptionEmit<TData>) => UnsubscribeFn;
}
export class Subscription<TData = unknown> {
  private readonly events: SubscriptionEventEmitter<TData>;
  private opts: Required<SubscriptionOptions<TData>>;
  private isDestroyed: boolean;

  constructor(opts: SubscriptionOptions<TData>) {
    this.isDestroyed = false;
    this.events = new SubscriptionEventEmitter<TData>();
    this.opts = {
      getInitialData: () => {
        // no-op
      },
      ...opts,
    };
    // debug('Subscription.constructor()');
  }

  public destroy(reason: SubscriptionDestroyReason) {
    if (this.isDestroyed) {
      return;
    }
    // debug('Subscription.destroy()', reason);
    this.isDestroyed = true;
    this.events.emit('destroy', reason);
    this.events.removeAllListeners();

    // Object.assign(this.events, {
    //   get on() {
    //     throw new Error(
    //       'Tried to access events.on on a destroyed Subscription',
    //     );
    //   },
    // });
  }

  public async start() {
    if (this.isDestroyed) {
      throw new Error('Called start() on a destroyed subscription');
    }
    try {
      const emit: SubscriptionEmit<TData> = {
        error: (err) => this.emitError(err),
        data: (data) => this.emitData(data),
      };
      await this.opts.getInitialData(emit);
      const cancel = this.opts.start(emit);
      this.events.on('destroy', () => {
        cancel();
      });
    } catch (err) {
      this.emitError(err);
    }
  }

  public async onceDataAndStop(): Promise<TData> {
    // debug('Subscription.onceDataAsync()');
    return new Promise<TData>(async (resolve, reject) => {
      const onDestroy = (reason: SubscriptionDestroyReason) => {
        reject(new SubscriptionDestroyError(reason));
        cleanup();
      };
      const onData = (data: TData) => {
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
        this.events.off('data', onData);
        this.events.off('destroy', onDestroy);
        this.events.off('error', onError);
      };

      this.events.once('data', onData);
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
  emitData(data: TData) {
    this.events.emit('data', data);
  }
  /**
   * Emit error
   */
  emitError(err: Error) {
    this.events.emit('error', err);
  }
}

export function subscriptionPullFatory<TData>(opts: {
  interval: number;
  pull(emit: SubscriptionEmit<TData>): void | Promise<void>;
}): Subscription<TData> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let timer: any;
  let stopped = false;
  async function _pull(emit: SubscriptionEmit<TData>) {
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

  return new Subscription<TData>({
    start(emit) {
      _pull(emit);
      return () => {
        clearTimeout(timer);
        stopped = true;
      };
    },
  });
}
