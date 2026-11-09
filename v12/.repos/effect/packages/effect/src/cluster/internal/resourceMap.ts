import * as Context from "../../Context.ts"
import * as Deferred from "../../Deferred.ts"
import * as Effect from "../../Effect.ts"
import * as Exit from "../../Exit.ts"
import * as Fiber from "../../Fiber.ts"
import * as MutableHashMap from "../../MutableHashMap.ts"
import * as MutableRef from "../../MutableRef.ts"
import * as Scope from "../../Scope.ts"

/**
 * @internal
 */
export class ResourceMap<K, A, E> {
  readonly lookup: (key: K, scope: Scope.Scope) => Effect.Effect<A, E>
  readonly entries: BackingMap<K, A, E>
  readonly isClosed: MutableRef.MutableRef<boolean>
  constructor(
    lookup: (key: K, scope: Scope.Scope) => Effect.Effect<A, E>,
    entries: BackingMap<K, A, E>,
    isClosed: MutableRef.MutableRef<boolean>
  ) {
    this.lookup = lookup
    this.entries = entries
    this.isClosed = isClosed
  }

  static make = Effect.fnUntraced(function*<K, A, E, R>(lookup: (key: K) => Effect.Effect<A, E, R>, options?: {
    readonly referential?: boolean | undefined
  }) {
    const scope = yield* Effect.scope
    const services = yield* Effect.context<R>()
    const isClosed = MutableRef.make(false)

    const entries: BackingMap<K, A, E> = options?.referential ?
      {
        _tag: "Referential",
        map: new Map()
      } :
      {
        _tag: "Equal",
        map: MutableHashMap.empty()
      }

    yield* Scope.addFinalizerExit(
      scope,
      (exit) => {
        MutableRef.set(isClosed, true)
        return Effect.forEach(entries.map, ([key, { fiber, scope }]) => {
          backingDelete(entries, key)
          return Effect.exit(Effect.andThen(Fiber.interrupt(fiber), Scope.close(scope, exit)))
        }, { concurrency: "unbounded", discard: true })
      }
    )

    return new ResourceMap(
      (key, scope) => Effect.provide(lookup(key), Context.add(services, Scope.Scope, scope)),
      entries,
      isClosed
    )
  })

  hasUnsafe(key: K): boolean {
    return backingGet(this.entries, key) !== undefined
  }

  keysUnsafe(): Array<K> {
    return Array.from(this.entries.map, ([key]) => key)
  }

  get(key: K): Effect.Effect<A, E> {
    return Effect.uninterruptibleMask((restore) => {
      if (MutableRef.get(this.isClosed)) {
        return Effect.interrupt
      }
      const existing = backingGet(this.entries, key)
      if (existing) {
        return this.awaitEntry(key, existing, restore)
      }
      const entry: Entry<A, E> = {
        scope: Scope.makeUnsafe(),
        deferred: Deferred.makeUnsafe<A, E>(),
        fiber: undefined as any,
        awaiters: 0
      }
      backingSet(this.entries, key, entry)
      // Run the lookup on a detached fiber so it is shared by every caller and
      // only interrupted once all of them have been interrupted.
      entry.fiber = Effect.runForkWith(Fiber.getCurrent()!.context)(
        Effect.onExit(this.lookup(key, entry.scope), (exit) => {
          if (exit._tag === "Success") {
            return Deferred.done(entry.deferred, exit)
          }
          this.deleteEntry(key, entry)
          return Effect.andThen(
            Deferred.done(entry.deferred, exit),
            Scope.close(entry.scope, exit)
          )
        })
      )
      return this.awaitEntry(key, entry, restore)
    })
  }

  private awaitEntry(
    key: K,
    entry: Entry<A, E>,
    restore: <AX, EX, RX>(effect: Effect.Effect<AX, EX, RX>) => Effect.Effect<AX, EX, RX>
  ): Effect.Effect<A, E> {
    if (Deferred.isDoneUnsafe(entry.deferred)) return Deferred.await(entry.deferred)
    entry.awaiters++
    return Effect.onExit(restore(Deferred.await(entry.deferred)), () => {
      if (--entry.awaiters > 0 || Deferred.isDoneUnsafe(entry.deferred)) {
        return Effect.void
      }
      // Detach the abandoned entry first so new callers start a fresh lookup
      // instead of joining one that is being interrupted.
      this.deleteEntry(key, entry)
      return Fiber.interrupt(entry.fiber)
    })
  }

  private deleteEntry(key: K, entry: Entry<A, E>): void {
    // Never delete a replacement entry created after this one was removed.
    if (backingGet(this.entries, key) === entry) {
      backingDelete(this.entries, key)
    }
  }

  remove(key: K): Effect.Effect<void> {
    return Effect.suspend(() => {
      const entry = backingGet(this.entries, key)
      if (!entry) {
        return Effect.void
      }
      backingDelete(this.entries, key)
      return Scope.close(entry.scope, Exit.void)
    })
  }

  removeIgnore(key: K): Effect.Effect<void> {
    return Effect.catchCause(this.remove(key), (cause) =>
      Effect.annotateLogs(Effect.logDebug(cause), {
        module: "ResourceMap",
        method: "removeIgnore",
        key
      }))
  }
}

type BackingMap<K, A, E> = {
  readonly _tag: "Equal"
  readonly map: MutableHashMap.MutableHashMap<K, Entry<A, E>>
} | {
  readonly _tag: "Referential"
  readonly map: Map<K, Entry<A, E>>
}

type Entry<A, E> = {
  readonly scope: Scope.Closeable
  readonly deferred: Deferred.Deferred<A, E>
  // Assigned as soon as the lookup is forked.
  fiber: Fiber.Fiber<unknown, unknown>
  awaiters: number
}

const backingGet = <K, A, E>(map: BackingMap<K, A, E>, key: K): Entry<A, E> | undefined => {
  if (map._tag === "Equal") {
    return MutableHashMap.get(map.map, key).valueOrUndefined
  }
  return map.map.get(key)
}
const backingSet = <K, A, E>(map: BackingMap<K, A, E>, key: K, entry: Entry<A, E>): void => {
  if (map._tag === "Equal") {
    MutableHashMap.set(map.map, key, entry)
  } else {
    map.map.set(key, entry)
  }
}
const backingDelete = <K, A, E>(map: BackingMap<K, A, E>, key: K): void => {
  if (map._tag === "Equal") {
    MutableHashMap.remove(map.map, key)
  } else {
    map.map.delete(key)
  }
}
