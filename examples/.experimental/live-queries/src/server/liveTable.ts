import type { LiveChange, LiveMessage, RowKey } from '../protocol';

type CommittedOp<TRow, TKey extends RowKey> =
  | { type: 'insert'; key: TKey; value: TRow }
  | { type: 'update'; key: TKey; value: TRow; previous: TRow }
  | { type: 'delete'; key: TKey; previous: TRow };

interface CommittedTx<TRow, TKey extends RowKey> {
  version: number;
  ops: CommittedOp<TRow, TKey>[];
}

export interface LiveTableTx<TRow, TKey extends RowKey> {
  insert(row: TRow): void;
  update(key: TKey, patch: Partial<TRow>): void;
  upsert(row: TRow): void;
  delete(key: TKey): void;
}

export interface LiveTableOptions<TRow, TKey extends RowKey> {
  getKey: (row: TRow) => TKey;
  initialRows?: TRow[];
  /**
   * How many committed transactions are kept so a reconnecting client can be
   * caught up with deltas instead of a fresh snapshot.
   * @default 1000
   */
  historySize?: number;
}

export interface LiveFeedOptions<TRow> {
  /** Last version the client applied, or `null` to request a snapshot. */
  since: number | null;
  signal: AbortSignal;
  /** Server-side "shape": only rows matching the predicate are sent. */
  where?: (row: TRow) => boolean;
}

/**
 * An in-memory, versioned table that fans out a single changelog to any
 * number of live subscribers.
 *
 * Production backends would replace the storage with a database and the
 * `mutate()` hook with a change feed (Postgres logical replication, LISTEN /
 * NOTIFY, Redis streams, ...). What matters is the contract: a monotonic
 * version per committed transaction, a consistent snapshot at a version, and
 * a bounded history for catch-up.
 */
export class LiveTable<TRow, TKey extends RowKey = RowKey> {
  private readonly rowsByKey = new Map<TKey, TRow>();
  private readonly history: CommittedTx<TRow, TKey>[] = [];
  private readonly listeners = new Set<(tx: CommittedTx<TRow, TKey>) => void>();
  private readonly historySize: number;
  private currentVersion = 0;

  constructor(private readonly opts: LiveTableOptions<TRow, TKey>) {
    this.historySize = opts.historySize ?? 1000;
    for (const row of opts.initialRows ?? []) {
      this.rowsByKey.set(opts.getKey(row), row);
    }
  }

  get version() {
    return this.currentVersion;
  }

  get subscriberCount() {
    return this.listeners.size;
  }

  rows(where?: (row: TRow) => boolean): TRow[] {
    const all = [...this.rowsByKey.values()];
    return where ? all.filter(where) : all;
  }

  get(key: TKey) {
    return this.rowsByKey.get(key);
  }

  /**
   * Apply a batch of writes atomically and return the version the batch was
   * committed at. Mutation procedures return this so clients can wait until
   * their own write has come back through the live stream.
   */
  mutate(fn: (tx: LiveTableTx<TRow, TKey>) => void): number {
    const ops: CommittedOp<TRow, TKey>[] = [];
    const staged = new Map(this.rowsByKey);
    const { getKey } = this.opts;

    fn({
      insert(row) {
        const key = getKey(row);
        if (staged.has(key)) {
          throw new Error(`Row with key ${String(key)} already exists`);
        }
        staged.set(key, row);
        ops.push({ type: 'insert', key, value: row });
      },
      update(key, patch) {
        const previous = staged.get(key);
        if (previous === undefined) {
          throw new Error(`Row with key ${String(key)} does not exist`);
        }
        const value = { ...previous, ...patch };
        staged.set(key, value);
        ops.push({ type: 'update', key, value, previous });
      },
      upsert(row) {
        const key = getKey(row);
        const previous = staged.get(key);
        staged.set(key, row);
        ops.push(
          previous === undefined
            ? { type: 'insert', key, value: row }
            : { type: 'update', key, value: row, previous },
        );
      },
      delete(key) {
        const previous = staged.get(key);
        if (previous === undefined) {
          return;
        }
        staged.delete(key);
        ops.push({ type: 'delete', key, previous });
      },
    });

    if (ops.length === 0) {
      return this.currentVersion;
    }

    this.rowsByKey.clear();
    for (const [key, row] of staged) {
      this.rowsByKey.set(key, row);
    }
    const tx: CommittedTx<TRow, TKey> = {
      version: ++this.currentVersion,
      ops,
    };
    this.history.push(tx);
    if (this.history.length > this.historySize) {
      this.history.splice(0, this.history.length - this.historySize);
    }
    for (const listener of this.listeners) {
      listener(tx);
    }
    return tx.version;
  }

  private canReplayFrom(since: number) {
    if (since > this.currentVersion) {
      return false;
    }
    if (since === this.currentVersion) {
      return true;
    }
    const oldest = this.history[0];
    return oldest !== undefined && oldest.version <= since + 1;
  }

  /**
   * A live feed for one subscriber. Yields a snapshot (or a catch-up batch
   * when `since` is still within history), then one `changes` message per
   * burst of commits.
   */
  async *live(opts: LiveFeedOptions<TRow>): AsyncGenerator<
    LiveMessage<TRow, TKey>,
    void
  > {
    const { signal, where } = opts;
    const queue: CommittedTx<TRow, TKey>[] = [];
    let wake: (() => void) | null = null;
    const notify = () => {
      wake?.();
      wake = null;
    };

    // Register before reading state so that no commit can fall between the
    // snapshot and the first queued transaction.
    const listener = (tx: CommittedTx<TRow, TKey>) => {
      queue.push(tx);
      notify();
    };
    this.listeners.add(listener);
    signal.addEventListener('abort', notify);

    try {
      let lastSent: number;
      if (opts.since !== null && this.canReplayFrom(opts.since)) {
        const pending = this.history.filter((tx) => tx.version > opts.since!);
        lastSent = opts.since;
        if (pending.length > 0) {
          lastSent = pending.at(-1)!.version;
          yield {
            kind: 'changes',
            version: lastSent,
            changes: toVisibleChanges(pending, where),
          };
        }
      } else {
        lastSent = this.currentVersion;
        yield { kind: 'snapshot', version: lastSent, rows: this.rows(where) };
      }

      while (!signal.aborted) {
        if (queue.length === 0) {
          await new Promise<void>((resolve) => {
            wake = resolve;
          });
          continue;
        }
        const burst = queue.splice(0).filter((tx) => tx.version > lastSent);
        if (burst.length === 0) {
          continue;
        }
        lastSent = burst.at(-1)!.version;
        // Bursts that are invisible to this subscriber still advance its
        // cursor, so `awaitVersion()` on the client never hangs on a write
        // that fell outside its shape.
        yield {
          kind: 'changes',
          version: lastSent,
          changes: toVisibleChanges(burst, where),
        };
      }
    } finally {
      this.listeners.delete(listener);
      signal.removeEventListener('abort', notify);
    }
  }
}

function toVisibleChanges<TRow, TKey extends RowKey>(
  txs: CommittedTx<TRow, TKey>[],
  where: ((row: TRow) => boolean) | undefined,
): LiveChange<TRow, TKey>[] {
  const changes: LiveChange<TRow, TKey>[] = [];
  for (const tx of txs) {
    for (const op of tx.ops) {
      if (!where) {
        changes.push(
          op.type === 'delete'
            ? { type: 'delete', key: op.key }
            : { type: op.type, value: op.value },
        );
        continue;
      }
      // A filtered subscriber sees rows entering and leaving its shape as
      // inserts and deletes.
      const before = op.type === 'insert' ? false : where(op.previous);
      const after = op.type === 'delete' ? false : where(op.value);
      if (before && after) {
        changes.push({ type: 'update', value: (op as { value: TRow }).value });
      } else if (after) {
        changes.push({ type: 'insert', value: (op as { value: TRow }).value });
      } else if (before) {
        changes.push({ type: 'delete', key: op.key });
      }
    }
  }
  return changes;
}
