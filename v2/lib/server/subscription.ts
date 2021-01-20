import { EventEmitter } from 'events';
import { inferAsyncReturnType } from './router';

const debug = (...args: any[]) => console.log(...args);

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
class SubscriptionEventEmitter<TData> extends EventEmitter {
  constructor() {
    super();
  }
}

type UnsubscribeFn = () => void;
type EmitFn<TData> = (data: TData) => void;
export interface SubscriptionOptions<TData> {
  getInitialData?: (emit: EmitFn<TData>) => void | Promise<void>;
  start: (emit: EmitFn<TData>) => UnsubscribeFn;
}
export class Subscription<TData = unknown> {
  private readonly events: SubscriptionEventEmitter<TData>;
  private opts: Required<SubscriptionOptions<TData>>;
  private isDestroyed: boolean;

  constructor(opts: SubscriptionOptions<TData>) {
    this.isDestroyed = false;
    this.events = new SubscriptionEventEmitter<TData>();
    this.opts = {
      getInitialData: () => {},
      ...opts,
    };
    debug('Subscription.constructor()');
  }

  public destroy(reason: SubscriptionDestroyReason) {
    if (this.isDestroyed) {
      return;
    }
    debug('Subscription.destroy()', reason);
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
      const emitFn: EmitFn<TData> = (data: TData) => {
        this.events.emit('data', data);
      };
      this.opts.start(emitFn);
      await this.opts.getInitialData(emitFn);
    } catch (err) {
      this.events.emit(err);
    }
  }

  public async onceDataAndStop(): Promise<TData> {
    debug('Subscription.onceDataAsync()');
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

  emitData(data: TData) {
    this.events.emit('data', data);
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
