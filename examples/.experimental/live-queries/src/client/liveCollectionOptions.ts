import type {
  BaseCollectionConfig,
  CollectionConfig,
  SyncConfig,
  UtilsRecord,
} from '@tanstack/db';
import type { RowKey } from '../protocol';
import type { LiveTransport } from './transport';

export interface LiveCollectionUtils extends UtilsRecord {
  /**
   * Resolve once the collection has accepted a live message at or after
   * `version`. Mutation handlers use this with the version returned by a
   * mutation procedure so the optimistic state is dropped exactly when the
   * server-confirmed row arrives.
   */
  awaitVersion: (version: number, timeoutMs?: number) => Promise<void>;
  /** Last version applied to the collection, or `null` before the snapshot */
  getVersion: () => number | null;
}

export interface LiveCollectionConfig<TRow extends object, TKey extends RowKey>
  extends Omit<
    BaseCollectionConfig<TRow, TKey, never, LiveCollectionUtils>,
    'utils' | 'syncMode'
  > {
  transport: LiveTransport<TRow, TKey>;
}

interface VersionWaiter {
  version: number;
  resolve: () => void;
  reject: (error: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * TanStack DB collection options backed by a tRPC live query.
 *
 * @example
 * const todos = createCollection(
 *   liveCollectionOptions({
 *     id: 'todos',
 *     getKey: (todo) => todo.id,
 *     transport: liveSubscription(client.todos.live, {}),
 *     onInsert: async ({ transaction, collection }) => {
 *       const { version } = await client.todos.create.mutate(
 *         transaction.mutations.map((m) => m.modified),
 *       );
 *       await collection.utils.awaitVersion(version);
 *     },
 *   }),
 * );
 */
export function liveCollectionOptions<TRow extends object, TKey extends RowKey>(
  config: LiveCollectionConfig<TRow, TKey>,
): CollectionConfig<TRow, TKey, never, LiveCollectionUtils> & {
  utils: LiveCollectionUtils;
} {
  const { transport, ...rest } = config;
  let version: number | null = null;
  const waiters = new Set<VersionWaiter>();

  function advance(next: number) {
    version = next;
    for (const waiter of waiters) {
      if (waiter.version <= next) {
        clearTimeout(waiter.timer);
        waiters.delete(waiter);
        waiter.resolve();
      }
    }
  }

  function rejectAll(error: unknown) {
    for (const waiter of waiters) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
    waiters.clear();
  }

  const utils: LiveCollectionUtils = {
    getVersion: () => version,
    awaitVersion(target, timeoutMs = 10_000) {
      if (version !== null && version >= target) {
        return Promise.resolve();
      }
      return new Promise<void>((resolve, reject) => {
        const waiter: VersionWaiter = {
          version: target,
          resolve,
          reject,
          timer: setTimeout(() => {
            waiters.delete(waiter);
            reject(
              new Error(`Timed out after ${timeoutMs}ms waiting for v${target}`),
            );
          }, timeoutMs),
        };
        waiters.add(waiter);
      });
    },
  };

  const sync: SyncConfig<TRow, TKey>['sync'] = (params) => {
    const { begin, write, commit, markReady, markError, truncate } = params;
    let ready = false;

    const unsubscribe = transport.subscribe({
      onMessage(message) {
        if (message.kind === 'changes' && message.changes.length === 0) {
          advance(message.version);
          return;
        }
        begin();
        if (message.kind === 'snapshot') {
          truncate();
          for (const row of message.rows) {
            write({ type: 'insert', value: row });
          }
        } else {
          for (const change of message.changes) {
            if (change.type === 'delete') {
              write({ type: 'delete', key: change.key });
            } else {
              write({ type: change.type, value: change.value });
            }
          }
        }
        // The commit receipt only settles once in-flight optimistic
        // transactions finish, and those transactions may be awaiting this
        // very version, so waiters are released on acceptance instead.
        const receipt = commit();
        if (receipt !== true) {
          receipt.catch(() => null);
        }
        if (!ready) {
          ready = true;
          markReady();
        }
        advance(message.version);
      },
      onError(error) {
        if (!ready) {
          markError(error);
        }
        rejectAll(error);
      },
    });

    return {
      cleanup() {
        unsubscribe();
        version = null;
        rejectAll(new Error('Live collection was cleaned up'));
      },
    };
  };

  return {
    ...rest,
    sync: { sync, rowUpdateMode: 'full' },
    utils,
  };
}
