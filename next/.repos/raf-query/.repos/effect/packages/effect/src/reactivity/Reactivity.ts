/**
 * Process-local invalidation for connecting writes to dependent reads.
 *
 * This module does not cache values itself. It lets callers register handlers
 * for keys, invalidate those keys, wrap successful mutations so they invalidate
 * keys, and expose effects as queues or streams that rerun when matching keys
 * change. The service can also batch invalidations so handlers run after the
 * batch completes.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Context from "../Context.ts"
import * as Effect from "../Effect.ts"
import type * as Exit from "../Exit.ts"
import * as Fiber from "../Fiber.ts"
import { dual, flow } from "../Function.ts"
import * as Hash from "../Hash.ts"
import * as Layer from "../Layer.ts"
import * as Queue from "../Queue.ts"
import type { ReadonlyRecord } from "../Record.ts"
import * as Scope from "../Scope.ts"
import * as Stream from "../Stream.ts"

/**
 * Brand type for `Reactivity`.
 *
 * @stability unstable
 * @category type IDs
 * @since 4.0.0
 */
export type TypeId = "~effect/reactivity/Reactivity"

/**
 * Brand for `Reactivity` implementations.
 *
 * @stability unstable
 * @category type IDs
 * @since 4.0.0
 */
export const TypeId: TypeId = "~effect/reactivity/Reactivity"

/**
 * Registers handlers and reruns queries when their keys are invalidated.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Reactivity {
  readonly [TypeId]: TypeId
  readonly invalidateUnsafe: (keys: ReadonlyArray<unknown> | ReadonlyRecord<string, ReadonlyArray<unknown>>) => void
  readonly registerUnsafe: (
    keys: ReadonlyArray<unknown> | ReadonlyRecord<string, ReadonlyArray<unknown>>,
    handler: () => void
  ) => () => void
  readonly invalidate: (
    keys: ReadonlyArray<unknown> | ReadonlyRecord<string, ReadonlyArray<unknown>>
  ) => Effect.Effect<void>
  readonly mutation: <A, E, R>(
    keys: ReadonlyArray<unknown> | ReadonlyRecord<string, ReadonlyArray<unknown>>,
    effect: Effect.Effect<A, E, R>
  ) => Effect.Effect<A, E, R>
  readonly query: <A, E, R>(
    keys: ReadonlyArray<unknown> | ReadonlyRecord<string, ReadonlyArray<unknown>>,
    effect: Effect.Effect<A, E, R>
  ) => Effect.Effect<Queue.Dequeue<A, E>, never, R | Scope.Scope>
  readonly stream: <A, E, R>(
    keys: ReadonlyArray<unknown> | ReadonlyRecord<string, ReadonlyArray<unknown>>,
    effect: Effect.Effect<A, E, R>
  ) => Stream.Stream<A, E, Exclude<R, Scope.Scope>>
  readonly withBatch: <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>
}

/**
 * Service key for reactive invalidation.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export const Reactivity: Context.Service<Reactivity, Reactivity> = Context.Service("effect/reactivity/Reactivity")

/**
 * Creates an in-memory `Reactivity` service.
 *
 * **Details**
 *
 * The service tracks handlers by hashed keys and runs the registered handlers when
 * matching keys are invalidated.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const make = Effect.sync(() => {
  const handlers = new Map<number | string, Set<() => void>>()

  const invalidateUnsafe = (keys: ReadonlyArray<unknown> | ReadonlyRecord<string, ReadonlyArray<unknown>>): void => {
    keysToHashes(keys, (hash) => {
      const set = handlers.get(hash)
      if (set === undefined) return
      set.forEach((run) => run())
    })
  }

  const invalidate = (
    keys: ReadonlyArray<unknown> | ReadonlyRecord<string, ReadonlyArray<unknown>>
  ): Effect.Effect<void> =>
    Effect.contextWith((services) => {
      const pending = Context.getOrUndefined(services, PendingInvalidation)
      if (pending) {
        keysToHashes(keys, (hash) => {
          pending.add(hash)
        })
      } else {
        invalidateUnsafe(keys)
      }
      return Effect.void
    })

  const mutation = <A, E, R>(
    keys: ReadonlyArray<unknown> | ReadonlyRecord<string, ReadonlyArray<unknown>>,
    effect: Effect.Effect<A, E, R>
  ): Effect.Effect<A, E, R> => Effect.tap(effect, invalidate(keys))

  const registerUnsafe = (
    keys: ReadonlyArray<unknown> | ReadonlyRecord<string, ReadonlyArray<unknown>>,
    handler: () => void
  ): () => void => {
    const resolvedKeys: Array<string | number> = []
    keysToHashes(keys, (hash) => {
      resolvedKeys.push(hash)
      let set = handlers.get(hash)
      if (set === undefined) {
        set = new Set()
        handlers.set(hash, set)
      }
      set.add(handler)
    })
    return () => {
      for (let i = 0; i < resolvedKeys.length; i++) {
        const set = handlers.get(resolvedKeys[i])
        if (set === undefined) continue
        set.delete(handler)
        if (set.size === 0) {
          handlers.delete(resolvedKeys[i])
        }
      }
    }
  }

  const query = <A, E, R>(
    keys: ReadonlyArray<unknown> | ReadonlyRecord<string, ReadonlyArray<unknown>>,
    effect: Effect.Effect<A, E, R>
  ): Effect.Effect<Queue.Dequeue<A, E>, never, R | Scope.Scope> =>
    Effect.gen(function*() {
      const services = yield* Effect.context<Scope.Scope | R>()
      const scope = Context.get(services, Scope.Scope)
      const results = yield* Queue.make<A, E>()
      const runFork = flow(Effect.runForkWith(services), Fiber.runIn(scope))

      let running = false
      let pending = false
      const handleExit = (exit: Exit.Exit<A, E>) => {
        if (exit._tag === "Failure") {
          Queue.failCauseUnsafe(results, exit.cause)
        } else {
          Queue.offerUnsafe(results, exit.value)
        }
        if (pending) {
          pending = false
          runFork(effect).addObserver(handleExit)
        } else {
          running = false
        }
      }

      function run() {
        if (running) {
          pending = true
          return
        }
        running = true
        runFork(effect).addObserver(handleExit)
      }

      const cancel = registerUnsafe(keys, run)
      yield* Scope.addFinalizer(scope, Effect.sync(cancel))
      run()

      return results as Queue.Dequeue<A, E>
    })

  const stream = <A, E, R>(
    tables: ReadonlyArray<unknown> | ReadonlyRecord<string, ReadonlyArray<unknown>>,
    effect: Effect.Effect<A, E, R>
  ): Stream.Stream<A, E, Exclude<R, Scope.Scope>> =>
    query(tables, effect).pipe(
      Effect.map(Stream.fromQueue),
      Stream.unwrap
    )

  const withBatch = <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
    Effect.suspend(() => {
      const pending = new Set<string | number>()
      return effect.pipe(
        Effect.provideService(PendingInvalidation, pending),
        Effect.onExit((_) =>
          Effect.sync(() => {
            pending.forEach((hash) => {
              const set = handlers.get(hash)
              if (set === undefined) return
              set.forEach((run) => run())
            })
          })
        )
      )
    })

  return Reactivity.of({
    [TypeId]: TypeId,
    mutation,
    query,
    stream,
    invalidateUnsafe,
    invalidate,
    registerUnsafe,
    withBatch
  })
})

class PendingInvalidation extends Context.Service<PendingInvalidation, Set<string | number>>()(
  "effect/reactivity/Reactivity/PendingInvalidation"
) {}

/**
 * Wraps an effect so the supplied keys are invalidated after the effect succeeds.
 *
 * **Gotchas**
 *
 * If the effect fails, the keys are not invalidated.
 *
 * @stability unstable
 * @category accessors
 * @since 4.0.0
 */
export const mutation: {
  (
    keys: ReadonlyArray<unknown> | ReadonlyRecord<string, ReadonlyArray<unknown>>
  ): <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R | Reactivity>
  <A, E, R>(
    effect: Effect.Effect<A, E, R>,
    keys: ReadonlyArray<unknown> | ReadonlyRecord<string, ReadonlyArray<unknown>>
  ): Effect.Effect<A, E, R | Reactivity>
} = dual(2, <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  keys: ReadonlyArray<unknown> | ReadonlyRecord<string, ReadonlyArray<unknown>>
): Effect.Effect<A, E, R | Reactivity> => Reactivity.use((_) => _.mutation(keys, effect)))

/**
 * Runs an effect as a query tied to the supplied invalidation keys.
 *
 * **Details**
 *
 * The returned queue receives the initial result and each later result after the
 * keys are invalidated. The registration is removed when the current scope closes.
 *
 * @stability unstable
 * @category accessors
 * @since 4.0.0
 */
export const query: {
  (
    keys: ReadonlyArray<unknown> | ReadonlyRecord<string, ReadonlyArray<unknown>>
  ): <A, E, R>(
    effect: Effect.Effect<A, E, R>
  ) => Effect.Effect<Queue.Dequeue<A, E>, never, R | Scope.Scope | Reactivity>
  <A, E, R>(
    effect: Effect.Effect<A, E, R>,
    keys: ReadonlyArray<unknown> | ReadonlyRecord<string, ReadonlyArray<unknown>>
  ): Effect.Effect<Queue.Dequeue<A, E>, never, R | Scope.Scope | Reactivity>
} = dual(2, <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  keys: ReadonlyArray<unknown> | ReadonlyRecord<string, ReadonlyArray<unknown>>
): Effect.Effect<Queue.Dequeue<A, E>, never, R | Scope.Scope | Reactivity> =>
  Reactivity.use((r) => r.query(keys, effect)))

/**
 * Runs an effect as a stream of query results tied to the supplied invalidation
 * keys.
 *
 * **Details**
 *
 * The effect runs initially and reruns whenever the keys are invalidated.
 *
 * @stability unstable
 * @category accessors
 * @since 4.0.0
 */
export const stream: {
  (
    keys: ReadonlyArray<unknown> | ReadonlyRecord<string, ReadonlyArray<unknown>>
  ): <A, E, R>(effect: Effect.Effect<A, E, R>) => Stream.Stream<A, E, Exclude<R, Scope.Scope> | Reactivity>
  <A, E, R>(
    effect: Effect.Effect<A, E, R>,
    keys: ReadonlyArray<unknown> | ReadonlyRecord<string, ReadonlyArray<unknown>>
  ): Stream.Stream<A, E, Exclude<R, Scope.Scope> | Reactivity>
} = dual(2, <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  keys: ReadonlyArray<unknown> | ReadonlyRecord<string, ReadonlyArray<unknown>>
): Stream.Stream<A, E, Exclude<R, Scope.Scope> | Reactivity> =>
  Reactivity.use((r) => r.query(keys, effect)).pipe(
    Effect.map(Stream.fromQueue),
    Stream.unwrap
  ))

/**
 * Invalidates the supplied keys through the `Reactivity` service.
 *
 * **Details**
 *
 * Registered queries for matching keys are rerun immediately, or collected until
 * the enclosing reactivity batch completes.
 *
 * @stability unstable
 * @category accessors
 * @since 4.0.0
 */
export const invalidate = (
  keys: ReadonlyArray<unknown> | ReadonlyRecord<string, ReadonlyArray<unknown>>
): Effect.Effect<void, never, Reactivity> => Reactivity.use((r) => r.invalidate(keys))

/**
 * The default layer that provides an in-memory `Reactivity` service.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layer: Layer.Layer<Reactivity> = Layer.effect(Reactivity)(make)

function stringOrHash(u: unknown): string | number {
  switch (typeof u) {
    case "string":
    case "number":
    case "bigint":
    case "boolean":
      return String(u)
    default:
      return Hash.hash(u)
  }
}

const keysToHashes = (
  keys: ReadonlyArray<unknown> | ReadonlyRecord<string, ReadonlyArray<unknown>>,
  f: (hash: string | number) => void
): void => {
  if (Array.isArray(keys)) {
    for (let i = 0; i < keys.length; i++) {
      f(stringOrHash(keys[i]))
    }
    return
  }
  for (const key in keys) {
    f(key)
    const ids = (keys as ReadonlyRecord<string, ReadonlyArray<unknown>>)[key]
    for (let i = 0; i < ids.length; i++) {
      f(`${key}:${stringOrHash(ids[i])}`)
    }
  }
}
