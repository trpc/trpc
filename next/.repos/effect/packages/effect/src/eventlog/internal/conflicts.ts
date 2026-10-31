import type * as Arr from "../../Array.ts"
import * as Order from "../../Order.ts"
import type { Entry } from "../EventJournal.ts"

/** Orders entry ids by their raw UUID bytes. */
export const entryIdOrder = Order.make<Uint8Array>((a, b) => {
  for (let i = 0; i < 16; i++) {
    if (a[i] !== b[i]) {
      return a[i] < b[i] ? -1 : 1
    }
  }
  return 0
})

/** Orders entries by id. */
const entryOrder = Order.make<Entry>((a, b) => entryIdOrder(a.id, b.id))

/**
 * The source entry a compaction output stands for, and the output's position
 * among the outputs written for that source.
 */
interface Anchor {
  readonly entry: Entry
  readonly index: number
}

// Set during client replay only, so it never leaves the process.
const anchors = new WeakMap<Entry, Anchor>()

/**
 * Records that `entry` was written by a compactor for `source`, as its
 * `index`th output for that source. Untagged entries are their own anchor.
 */
export const setAnchor = (entry: Entry, source: Entry, index: number): void => {
  anchors.set(entry, { entry: source, index })
}

const anchorEntry = (entry: Entry): Entry => anchors.get(entry)?.entry ?? entry
const anchorIndex = (entry: Entry): number => anchors.get(entry)?.index ?? 0

// Sorts by anchor id, then by write order among one anchor's outputs.
const compareAnchors = (a: Entry, b: Entry): number =>
  entryOrder(anchorEntry(a), anchorEntry(b)) || anchorIndex(a) - anchorIndex(b)

/**
 * Pairs a batch of incoming entries with the stored entries that conflict with
 * them: same event and primary key, and an id strictly greater than the
 * incoming entry's anchor.
 *
 * The batch is sorted by anchor id, then by write order, so it is applied in
 * the same order on every replica and a compaction output takes its source's
 * place and precedence. Add the stored entries that may conflict, then call
 * `toBatch` to sort and filter them.
 */
export class ConflictIndex {
  /** The incoming entries in anchor order. */
  readonly batch: ReadonlyArray<Entry>
  /** The anchor of the first incoming entry. Only stored entries with a greater id can conflict. */
  readonly oldest: Entry
  /** Creation time of `oldest`, for coarse filters. */
  readonly oldestMillis: number
  private readonly stored = new Map<string, Map<string, ConflictGroup>>()

  constructor(batch: Arr.NonEmptyReadonlyArray<Entry>) {
    this.batch = batch.slice().sort(compareAnchors)
    this.oldest = anchorEntry(this.batch[0])
    this.oldestMillis = this.oldest.createdAtMillis
    for (const entry of this.batch) {
      let byKey = this.stored.get(entry.event)
      if (byKey === undefined) {
        byKey = new Map()
        this.stored.set(entry.event, byKey)
      }
      if (!byKey.has(entry.primaryKey)) {
        byKey.set(entry.primaryKey, {
          event: entry.event,
          primaryKey: entry.primaryKey,
          oldest: anchorEntry(entry),
          entries: []
        })
      }
    }
  }

  /** The `(event, primaryKey)` groups in the batch. */
  *groups(): Iterable<ConflictGroup> {
    for (const byKey of this.stored.values()) {
      yield* byKey.values()
    }
  }

  add(entry: Entry): void {
    this.stored.get(entry.event)?.get(entry.primaryKey)?.entries.push(entry)
  }

  toBatch(): Array<{ readonly entry: Entry; readonly conflicts: ReadonlyArray<Entry> }> {
    for (const group of this.groups()) {
      group.entries.sort(entryOrder)
    }
    return this.batch.map((entry) => {
      const anchor = anchorEntry(entry)
      return {
        entry,
        conflicts: this.stored.get(entry.event)!.get(entry.primaryKey)!.entries.filter((stored) =>
          entryOrder(stored, anchor) > 0
        )
      }
    })
  }
}

/** An event and primary key in the batch, with the stored entries added for it. */
export interface ConflictGroup {
  readonly event: string
  readonly primaryKey: string
  /** The lowest anchor among the group's incoming entries. Only stored entries with a greater id can conflict. */
  readonly oldest: Entry
  readonly entries: Array<Entry>
}
