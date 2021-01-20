import { EventEmitter } from 'events';
import { inferAsyncReturnType } from './router';

const debug = (...args: any[]) => console.log(...args);

type SubscriptionDestroyReason = 'timeout' | 'stopped' | 'startError';

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
  started: () => void;
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
class SubscriptionEventEmitter<TData> extends EventEmitter {
  constructor() {
    super();
  }
}

export interface SubscriptionOptions<TData> {
  getInitialData?: (emit: (data: TData) => void) => void | Promise<void>;
}
export class Subscription<TData = unknown> {
  public readonly events: SubscriptionEventEmitter<TData>;
  private opts: Required<SubscriptionOptions<TData>>;
  private _isRunning: boolean;
  private isDestroyed: boolean;

  public get isRunning() {
    return this._isRunning;
  }

  constructor(opts: SubscriptionOptions<TData>) {
    this._isRunning = false;
    this.isDestroyed = false;
    this.events = new SubscriptionEventEmitter<TData>();
    this.opts = {
      getInitialData: () => null,
      ...opts,
    };
    debug('Subscription.constructor()');
  }

  public destroy(reason: SubscriptionDestroyReason) {
    if (this.isDestroyed) {
      return;
    }
    debug('Subscription.destroy()', reason);
    this._isRunning = false;
    this.isDestroyed = true;
    this.events.emit('destroy', reason);
    this.events.removeAllListeners();
  }

  public async start() {
    debug('Subscription.start() - running:', this._isRunning);
    if (this._isRunning) {
      return;
    }
    this._isRunning = true;
    this.events.emit('started');
    try {
      await this.opts.getInitialData((data) => {
        this.events.emit('data', data);
      });
    } catch (err) {
      this.events.emit(err);
    }
  }

  public async onceDataAndStop(): Promise<TData> {
    debug('Subscription.onceDataAsync()');
    return new Promise<TData>(async (resolve, reject) => {
      const onDestroy = (reason: SubscriptionDestroyReason) => {
        reject(new SubscriptionDestroyError(reason));
      };
      const onData = (data: TData) => {
        resolve(data);
        this.destroy('stopped');
      };
      const onError = (err: Error) => {
        reject(err);
        this.destroy('stopped');
      };

      this.events.once('data', onData);
      this.events.once('destroy', onDestroy);
      this.events.once('error', onError);

      this.start().catch(() => {
        // is handled through event
      });
    });
  }
  attachEvents(opts: { on: () => void; off: () => void }) {
    if (this.isDestroyed) {
      return;
    }
    let onStart = () => {
      if (!this.isDestroyed) {
        opts.on();
      }
    };
    this.events.on('started', onStart);
    this.events.once('destroy', () => {
      opts.off();
    });
  }
}

// export function subscriptionPullFatory<TData>(opts: {
//   interval: number;
//   pull(): TData | Promise<TData>;
//   shouldEmit?: (data: TData) => boolean;
// }) {
//   let timer: NodeJS.Timeout;
//   const { shouldEmit = () => true } = opts;

//   return new Subscription<TData>({
//     start(sub) {
//       async function pull() {
//         try {
//           const data = await opts.pull();
//           if (shouldEmit(data)) {
//             sub.events.emit('data', data);
//           }
//         } catch (err) {
//           sub.events.emit('error', err);
//         }

//         if (sub.isRunning) {
//           timer = setTimeout(pull, opts.interval);
//         }
//       }
//       sub.events.once('destroy', () => {
//         clearTimeout(timer);
//       });
//       return pull();
//     },
//   });
// }

export type inferSubscriptionData<
  TSubscription extends Subscription<any>
> = inferAsyncReturnType<TSubscription['onceDataAndStop']>;

// async function main() {
//   const startTime = Date.now();
//   async function pull() {
//     return (Date.now() - startTime) / 1000;
//   }
//   const sub = subscriptionPullFatory({
//     pull,
//     shouldEmit(d) {
//       return d > 2;
//     },
//     interval: 1000,
//   });
//   console.log('yay', await sub.onceDataAndStop());
// }

// main();
