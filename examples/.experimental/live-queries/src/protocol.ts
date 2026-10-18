/**
 * Wire protocol for a "live query": a subscription that yields an initial
 * snapshot followed by row-level change batches, each stamped with a
 * monotonically increasing `version`.
 *
 * Every message is yielded through `tracked(String(version), message)` so the
 * existing `lastEventId` machinery in `wsLink` and `httpSubscriptionLink`
 * resumes a dropped stream from the last applied version.
 */

export type RowKey = string | number;

export type LiveChange<TRow, TKey extends RowKey = RowKey> =
  | { type: 'insert'; value: TRow }
  | { type: 'update'; value: TRow }
  | { type: 'delete'; key: TKey };

export type LiveMessage<TRow, TKey extends RowKey = RowKey> =
  /**
   * Replace everything the client holds for this query. Sent on first connect
   * and whenever the server can no longer replay from the client's cursor.
   */
  | { kind: 'snapshot'; version: number; rows: TRow[] }
  | { kind: 'changes'; version: number; changes: LiveChange<TRow, TKey>[] };

/**
 * Structural type of the `{ id, data }` object that a client receives for a
 * subscription that yields `tracked(id, LiveMessage)`.
 */
export interface TrackedLiveMessage<TRow, TKey extends RowKey = RowKey> {
  id: string;
  data: LiveMessage<TRow, TKey>;
}

export function parseVersion(lastEventId: string | null | undefined) {
  if (lastEventId == null || lastEventId === '') {
    return null;
  }
  const version = Number(lastEventId);
  return Number.isSafeInteger(version) ? version : null;
}
