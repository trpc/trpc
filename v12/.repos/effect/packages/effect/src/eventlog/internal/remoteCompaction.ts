import * as Data from "../../Data.ts"
import * as Effect from "../../Effect.ts"
import * as Stream from "../../Stream.ts"
import type { Entry } from "../EventJournal.ts"
import type { Registry } from "../EventLog.ts"

/** A second pass over the kept set dropped `entries`, so a compactor does not compose. */
export class IdempotenceError extends Data.TaggedError("IdempotenceError")<{
  readonly entries: ReadonlyArray<Entry>
}> {}

type Compactor = Registry["Service"]["compactors"] extends ReadonlyMap<string, infer A> ? A : never

/**
 * Folds the opted-in compactors over `entries`, which arrive in input order
 * without repeated ids, and returns the kept entries in input order.
 *
 * Each step folds a chunk into the kept set. The chunk starts at `chunkSize`
 * and grows to the size of the kept set, so a run stays linear when little is
 * dropped and memory stays at about twice the kept set. A compactor that
 * composes keeps the same entries at any chunking.
 *
 * Fails with `IdempotenceError` when a second pass over the kept set drops
 * more. A compactor defect fails the run.
 */
export const run = <E, R>(options: {
  readonly compactors: Registry["Service"]["compactors"]
  readonly entries: Stream.Stream<Entry, E, R>
  readonly chunkSize: number
}): Effect.Effect<ReadonlyArray<Entry>, E | IdempotenceError, R> => {
  const drop = Effect.fnUntraced(function*(entries: ReadonlyArray<Entry>) {
    const kept = new Set<Entry>()
    const calls = new Map<Compactor, Array<Entry>>()
    for (const entry of entries) {
      const compactor = options.compactors.get(entry.event)
      if (compactor === undefined || !compactor.remote) {
        kept.add(entry)
        continue
      }
      const input = calls.get(compactor)
      if (input === undefined) calls.set(compactor, [entry])
      else input.push(entry)
    }
    for (const [compactor, input] of calls) {
      const inputs = new Set(input)
      const forwarded = new Set<Entry>()
      let replaced = false
      yield* compactor.effect({
        entries: input,
        remote: true,
        write: (entry) =>
          Effect.sync(() => {
            if (inputs.has(entry)) forwarded.add(entry)
            else replaced = true
          })
      })
      // Only forwarded input entries can be kept verbatim, so a call that
      // outputs anything else keeps its whole input.
      if (replaced) {
        yield* Effect.logWarning("A remote compactor wrote an entry it was not given, so its input is kept").pipe(
          Effect.annotateLogs({ events: [...compactor.events] })
        )
      }
      for (const entry of replaced ? input : forwarded) kept.add(entry)
    }
    return entries.filter((entry) => kept.has(entry))
  })

  return Effect.gen(function*() {
    let kept: ReadonlyArray<Entry> = []
    let pending: Array<Entry> = []
    yield* options.entries.pipe(
      Stream.grouped(options.chunkSize),
      Stream.runForEach((group) => {
        for (const entry of group) pending.push(entry)
        if (pending.length < Math.max(options.chunkSize, kept.length)) return Effect.void
        const input = kept.concat(pending)
        pending = []
        return Effect.map(drop(input), (next) => {
          kept = next
        })
      })
    )
    if (pending.length > 0) kept = yield* drop(kept.concat(pending))
    const again = yield* drop(kept)
    if (again.length !== kept.length) {
      const survivors = new Set(again)
      return yield* new IdempotenceError({ entries: kept.filter((entry) => !survivors.has(entry)) })
    }
    return kept
  })
}
