/**
 * Keyed circuit breakers for calls to unreliable dependencies.
 *
 * A `CircuitBreaker` holds one circuit per key, so one policy can guard many
 * hosts or tenants. State lives in a `CircuitBreakerStore`: `layerStoreMemory`
 * keeps it in the process, `layerStoreRedis` shares it between processes.
 *
 * **Details**
 *
 * - Closed: calls run, and the trip policy decides when the circuit opens.
 * - Open: calls fail with `CircuitOpen` until the open time ends.
 * - HalfOpen: the next call is the probe, and other calls fail with
 *   `CircuitHalfOpen` while it runs. A successful probe closes the circuit and
 *   a failed one reopens it. An interrupted or `Ignored` probe frees the slot.
 * - The backoff count survives a close. It resets once the circuit has stayed
 *   closed as long as it was last open.
 * - Calls that must always run pass `onRejection: "allow"`. The circuit
 *   records them when it would admit them, and runs them unrecorded when it
 *   would refuse them, as in "Recording calls that must always run" below.
 *
 * The breaker never waits. Retry rejections outside it, as in "Retrying
 * rejections" below. Put `Effect.retry` and `Effect.timeout` inside it, so it
 * sees one outcome per call. With `ExecutionPlan`, put a breaker inside each
 * step under its own key.
 *
 * The breaker emits no metrics or spans. Observe it through `state(key)`,
 * `transitions` and the typed error.
 *
 * **Gotchas**
 *
 * - Use one policy per key. Breakers that share a key and a store share one
 *   circuit, and nothing checks that their policies match. Separate them with
 *   distinct keys or a Redis `prefix`.
 * - Calls admitted before a trip still run to completion, but their outcomes
 *   change nothing.
 * - "Consecutive" counts in order of completion, not of start.
 * - `state(key)` reads the shared store. `transitions` only shows what this
 *   breaker instance did.
 * - Store errors the breaker swallows (a fail-open admit, a failed record, a
 *   failed Redis lease renewal) are reported with their cause at
 *   `References.UnhandledLogLevel`. Set it to `undefined` to silence them.
 * - Cap an exponential `openDuration`, with `Schedule.upTo` or with
 *   `Schedule.min` and a `Schedule.spaced`, or it keeps growing for a
 *   dependency that flaps.
 *
 * **Example** (Rejecting calls once a circuit opens)
 *
 * ```ts import.meta.vitest
 * import { Data, Effect } from "effect"
 * import { CircuitBreaker } from "effect/persistence"
 *
 * class PaymentsError extends Data.TaggedError("PaymentsError") {}
 *
 * const program = Effect.gen(function*() {
 *   const breaker = yield* CircuitBreaker.make({
 *     tripPolicy: CircuitBreaker.consecutive(2),
 *     openDuration: "30 seconds"
 *   })
 *   const charge = Effect.fail(new PaymentsError()).pipe(
 *     breaker.execute({ key: "payments" })
 *   )
 *
 *   // Two failures in a row open the circuit.
 *   yield* Effect.flip(charge)
 *   yield* Effect.flip(charge)
 *
 *   // The third call is rejected without running.
 *   return yield* charge.pipe(
 *     Effect.catchReason("CircuitBreakerError", "CircuitOpen", (reason) => Effect.succeed(`${reason.key} is open`))
 *   )
 * }).pipe(Effect.scoped, Effect.provide(CircuitBreaker.layerStoreMemory()))
 *
 * await Effect.runPromise(program) // => "payments is open"
 * ```
 *
 * **Example** (Retrying rejections)
 *
 * For `CircuitOpen`, wait at least the rejection's `retryAfter`. For
 * `CircuitHalfOpen`, the jittered backoff keeps waiting callers from retrying
 * at the same moment. Store errors and the call's own errors are not retried.
 *
 * ```ts import.meta.vitest
 * import { Data, Duration, Effect, Ref, Schedule } from "effect"
 * import { CircuitBreaker } from "effect/persistence"
 *
 * const isRejection = (error: unknown): error is CircuitBreaker.CircuitBreakerError =>
 *   error instanceof CircuitBreaker.CircuitBreakerError && error.reason._tag !== "CircuitBreakerStoreError"
 *
 * const retryRejections = Schedule.exponential("20 millis").pipe(
 *   Schedule.jittered,
 *   Schedule.modifyDelay(({ duration, input }) =>
 *     Effect.succeed(
 *       isRejection(input) && input.reason._tag === "CircuitOpen"
 *         ? Duration.max(duration, input.reason.retryAfter)
 *         : duration
 *     )
 *   )
 * )
 *
 * class QuoteError extends Data.TaggedError("QuoteError") {}
 *
 * const program = Effect.gen(function*() {
 *   const breaker = yield* CircuitBreaker.make({
 *     tripPolicy: CircuitBreaker.consecutive(1),
 *     openDuration: "50 millis"
 *   })
 *   const healthy = yield* Ref.make(false)
 *   const quote = Effect.flatMap(Ref.get(healthy), (ok) => ok ? Effect.succeed(42) : Effect.fail(new QuoteError()))
 *
 *   // One failure opens the circuit, then the dependency recovers.
 *   yield* Effect.flip(quote.pipe(breaker.execute({ key: "quotes" })))
 *   yield* Ref.set(healthy, true)
 *
 *   // Rejected while open, then retried once the circuit lets a probe through.
 *   return yield* quote.pipe(
 *     breaker.execute({ key: "quotes" }),
 *     Effect.retry({ schedule: retryRejections, while: isRejection, times: 5 })
 *   )
 * }).pipe(Effect.scoped, Effect.provide(CircuitBreaker.layerStoreMemory()))
 *
 * await Effect.runPromise(program) // => 42
 * ```
 *
 * **Example** (Recording calls that must always run)
 *
 * The write runs even while the circuit is open, and its failures still open
 * the circuit for the reads that share the key.
 *
 * ```ts import.meta.vitest
 * import { Data, Effect } from "effect"
 * import { CircuitBreaker } from "effect/persistence"
 *
 * class LedgerError extends Data.TaggedError("LedgerError") {}
 *
 * const program = Effect.gen(function*() {
 *   const breaker = yield* CircuitBreaker.make({
 *     tripPolicy: CircuitBreaker.consecutive(1),
 *     openDuration: "30 seconds"
 *   })
 *   const write = Effect.fail(new LedgerError()).pipe(
 *     breaker.execute({ key: "ledger", onRejection: "allow" })
 *   )
 *
 *   // The first failed write opens the circuit, and the second still runs.
 *   yield* Effect.flip(write)
 *   const error = yield* Effect.flip(write)
 *   const state = yield* breaker.state("ledger")
 *   return [error._tag, state._tag]
 * }).pipe(Effect.scoped, Effect.provide(CircuitBreaker.layerStoreMemory()))
 *
 * await Effect.runPromise(program) // => ["LedgerError", "Open"]
 * ```
 *
 * @stability experimental
 * @since 4.0.7
 */
import * as Cause from "../Cause.ts"
import * as Clock from "../Clock.ts"
import * as Config from "../Config.ts"
import * as Context from "../Context.ts"
import * as Duration from "../Duration.ts"
import * as Effect from "../Effect.ts"
import * as Exit from "../Exit.ts"
import { dual } from "../Function.ts"
import { findRecoverableError } from "../internal/effect.ts"
import * as Layer from "../Layer.ts"
import * as PubSub from "../PubSub.ts"
import { UnhandledLogLevel } from "../References.ts"
import * as Schedule from "../Schedule.ts"
import * as Schema from "../Schema.ts"
import * as Scope from "../Scope.ts"
import * as Stream from "../Stream.ts"
import type * as Take from "../Take.ts"
import * as Redis from "./Redis.ts"

/**
 * Runtime type identifier for `CircuitBreaker` values.
 *
 * @stability experimental
 * @category type IDs
 * @since 4.0.7
 */
export const TypeId: TypeId = "~effect/persistence/CircuitBreaker"

/**
 * Type-level identifier used to brand `CircuitBreaker` values.
 *
 * @stability experimental
 * @category type IDs
 * @since 4.0.7
 */
export type TypeId = "~effect/persistence/CircuitBreaker"

/**
 * Service that runs effects through keyed circuits and reports their state.
 *
 * **Details**
 *
 * - `execute` runs the call through the circuit for `key` and records its
 *   outcome. `classify` maps the call's `Exit` to an `Outcome`, directly or as
 *   an effect. By default a success is a `Success` and any failure, defects
 *   included, is a `Failure`, since a rejected `Effect.promise` only surfaces
 *   as a defect. An exit that is only interruption is always `Ignored`.
 *   `classify` also receives `{ probe }`, which is `true` when the call is the
 *   HalfOpen probe, so an outcome it would otherwise ignore can reopen the
 *   circuit.
 *   `onRejection` decides what a call does when the circuit refuses it:
 *   `"fail"` (the default) fails it with `CircuitOpen` or `CircuitHalfOpen`,
 *   `"allow"` runs it unrecorded. An admitted call, probe included, is
 *   recorded as usual.
 * - `state` reads the shared state of a circuit.
 * - `transitions` emits this breaker's transitions and ends when its scope
 *   closes.
 *
 * **Gotchas**
 *
 * - If `classify` throws or dies, the outcome is `Ignored` and the call dies.
 * - Bound an effectful `classify` with `Effect.timeoutOrElse` or
 *   `Effect.timeoutOption`, since `Effect.timeout` adds a typed error. A call
 *   to the same key from inside `classify` is rejected while its call is the
 *   probe.
 *
 * **Example** (Timing out calls inside the breaker)
 *
 * A timeout inside the breaker counts as a `Failure`. Outside, it interrupts
 * the call, which is `Ignored`.
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 * import { CircuitBreaker } from "effect/persistence"
 *
 * const program = Effect.gen(function*() {
 *   const breaker = yield* CircuitBreaker.make({
 *     tripPolicy: CircuitBreaker.consecutive(1),
 *     openDuration: "1 minute"
 *   })
 *
 *   yield* Effect.never.pipe(
 *     Effect.timeout("10 millis"),
 *     breaker.execute({ key: "inside" }),
 *     Effect.ignore
 *   )
 *   yield* Effect.never.pipe(
 *     breaker.execute({ key: "outside" }),
 *     Effect.timeout("10 millis"),
 *     Effect.ignore
 *   )
 *
 *   const inside = yield* breaker.state("inside")
 *   const outside = yield* breaker.state("outside")
 *   return [inside._tag, outside._tag]
 * }).pipe(Effect.scoped, Effect.provide(CircuitBreaker.layerStoreMemory()))
 *
 * await Effect.runPromise(program) // => ["Open", "Closed"]
 * ```
 *
 * **Example** (Retrying inside the breaker)
 *
 * The breaker sees one outcome per call, so a call a retry rescued counts as
 * one `Success`.
 *
 * ```ts import.meta.vitest
 * import { Data, Effect, Ref, Schedule } from "effect"
 * import { CircuitBreaker } from "effect/persistence"
 *
 * class InventoryError extends Data.TaggedError("InventoryError") {}
 *
 * const program = Effect.gen(function*() {
 *   const breaker = yield* CircuitBreaker.make({
 *     tripPolicy: CircuitBreaker.consecutive(1),
 *     openDuration: "1 minute"
 *   })
 *   const attempts = yield* Ref.make(0)
 *   // Fails twice, then succeeds.
 *   const stock = Effect.flatMap(
 *     Ref.updateAndGet(attempts, (n) => n + 1),
 *     (n) => n <= 2 ? Effect.fail(new InventoryError()) : Effect.succeed(7)
 *   )
 *
 *   const result = yield* stock.pipe(
 *     Effect.retry({ schedule: Schedule.exponential("1 millis"), times: 3 }),
 *     breaker.execute({ key: "inventory" })
 *   )
 *   const state = yield* breaker.state("inventory")
 *   return [result, state._tag]
 * }).pipe(Effect.scoped, Effect.provide(CircuitBreaker.layerStoreMemory()))
 *
 * await Effect.runPromise(program) // => [7, "Closed"]
 * ```
 *
 * **Example** (Falling back to another provider with ExecutionPlan)
 *
 * Each provider guards its calls under its own key, so once the primary's
 * circuit opens its step fails fast and the plan moves to the fallback.
 *
 * ```ts import.meta.vitest
 * import { Context, Data, Effect, ExecutionPlan, Layer } from "effect"
 * import { CircuitBreaker } from "effect/persistence"
 *
 * class GeocoderError extends Data.TaggedError("GeocoderError") {}
 *
 * class Geocoder extends Context.Service<Geocoder, {
 *   readonly lookup: (address: string) => Effect.Effect<string, GeocoderError | CircuitBreaker.CircuitBreakerError>
 * }>()("app/Geocoder") {}
 *
 * const provider = (name: string, lookup: (address: string) => Effect.Effect<string, GeocoderError>) =>
 *   Layer.effect(
 *     Geocoder,
 *     Effect.gen(function*() {
 *       const breaker = yield* CircuitBreaker.CircuitBreaker
 *       return Geocoder.of({
 *         lookup: (address) => lookup(address).pipe(breaker.execute({ key: `geocoder:${name}` }))
 *       })
 *     })
 *   )
 *
 * const Primary = provider("primary", () => Effect.fail(new GeocoderError()))
 * const Fallback = provider("fallback", (address) => Effect.succeed(`${address} (fallback)`))
 *
 * const plan = ExecutionPlan.make({ provide: Primary }, { provide: Fallback })
 *
 * const program = Effect.gen(function*() {
 *   const geocoder = yield* Geocoder
 *   return yield* geocoder.lookup("1 Main St")
 * }).pipe(
 *   Effect.withExecutionPlan(plan),
 *   Effect.provide(
 *     CircuitBreaker.layer({ tripPolicy: CircuitBreaker.consecutive(3), openDuration: "30 seconds" }).pipe(
 *       Layer.provide(CircuitBreaker.layerStoreMemory())
 *     )
 *   )
 * )
 *
 * await Effect.runPromise(program) // => "1 Main St (fallback)"
 * ```
 *
 * **Example** (Counting transitions)
 *
 * Label by `from` and `to`, not `key`, to keep the number of series fixed.
 *
 * ```ts import.meta.vitest
 * import { Effect, Metric, Stream } from "effect"
 * import { CircuitBreaker } from "effect/persistence"
 *
 * const transitionsTotal = Metric.counter("circuit_breaker_transitions_total", { incremental: true })
 *
 * const countTransitions = (breaker: CircuitBreaker.CircuitBreaker) =>
 *   breaker.transitions.pipe(
 *     Stream.runForEach((transition) =>
 *       Metric.update(Metric.withAttributes(transitionsTotal, { from: transition.from, to: transition.to }), 1)
 *     ),
 *     Effect.forkScoped({ startImmediately: true })
 *   )
 *
 * const program = Effect.gen(function*() {
 *   const breaker = yield* CircuitBreaker.make({
 *     tripPolicy: CircuitBreaker.consecutive(1),
 *     openDuration: "1 minute"
 *   })
 *   yield* countTransitions(breaker)
 *
 *   yield* Effect.fail("unavailable").pipe(breaker.execute({ key: "a" }), Effect.ignore)
 *   yield* Effect.fail("unavailable").pipe(breaker.execute({ key: "b" }), Effect.ignore)
 *   yield* Effect.yieldNow
 *
 *   const opened = yield* Metric.value(Metric.withAttributes(transitionsTotal, { from: "Closed", to: "Open" }))
 *   return opened.count
 * }).pipe(
 *   Effect.scoped,
 *   Effect.provide(CircuitBreaker.layerStoreMemory()),
 *   Effect.provideService(Metric.MetricRegistry, new Map())
 * )
 *
 * await Effect.runPromise(program) // => 2
 * ```
 *
 * @stability experimental
 * @category models
 * @since 4.0.7
 */
export interface CircuitBreaker {
  readonly [TypeId]: TypeId

  readonly execute: {
    <A, E, R2 = never>(options: {
      readonly key: string
      readonly classify?: Classifier<A, E, R2> | undefined
      readonly onRejection?: "fail" | "allow" | undefined
    }): <R>(self: Effect.Effect<A, E, R>) => Effect.Effect<A, E | CircuitBreakerError, R | R2>
    <A, E, R, R2 = never>(
      self: Effect.Effect<A, E, R>,
      options: {
        readonly key: string
        readonly classify?: Classifier<A, E, R2> | undefined
        readonly onRejection?: "fail" | "allow" | undefined
      }
    ): Effect.Effect<A, E | CircuitBreakerError, R | R2>
  }

  readonly state: (key: string) => Effect.Effect<State, CircuitBreakerError>

  readonly transitions: Stream.Stream<Transition>
}

/**
 * Service tag for the default `CircuitBreaker`.
 *
 * **When to use**
 *
 * Use when one breaker policy serves the whole context. For several policies,
 * use a `LayerMap` keyed by policy, with every entry sharing one store, or
 * define your own tags.
 *
 * **Example** (Several breaker policies with LayerMap)
 *
 * ```ts import.meta.vitest
 * import { Effect, LayerMap, Schedule } from "effect"
 * import { CircuitBreaker } from "effect/persistence"
 *
 * class Breakers extends LayerMap.Service<Breakers>()("app/Breakers", {
 *   lookup: (dependency: "payments" | "search") =>
 *     dependency === "payments"
 *       ? CircuitBreaker.layer({ tripPolicy: CircuitBreaker.consecutive(5), openDuration: "30 seconds" })
 *       : CircuitBreaker.layer({
 *         tripPolicy: CircuitBreaker.rate({ threshold: 0.5, size: 20 }),
 *         openDuration: Schedule.exponential("1 second")
 *       }),
 *   // One store shared by every entry.
 *   dependencies: [CircuitBreaker.layerStoreMemory()],
 *   idleTimeToLive: "10 minutes"
 * }) {}
 *
 * const search = Effect.gen(function*() {
 *   const breaker = yield* CircuitBreaker.CircuitBreaker
 *   return yield* Effect.succeed(["result"]).pipe(breaker.execute({ key: "search:eu" }))
 * }).pipe(Effect.provide(Breakers.get("search")))
 *
 * await Effect.runPromise(search.pipe(Effect.provide(Breakers.layer))) // => ["result"]
 * ```
 *
 * @stability experimental
 * @category services
 * @since 4.0.7
 */
export const CircuitBreaker: Context.Service<CircuitBreaker, CircuitBreaker> = Context.Service<CircuitBreaker>(
  TypeId
)

/**
 * Creates a `CircuitBreaker` from the current `CircuitBreakerStore`.
 *
 * **Details**
 *
 * - `tripPolicy` decides when a Closed circuit opens.
 * - `openDuration` is a duration or a `Schedule`. The n-th consecutive opening
 *   lasts the schedule's n-th delay, and the last delay repeats once the
 *   schedule ends. Elapsed-time combinators such as `upTo` and `during`
 *   measure the time spent open, not wall time. Schedules that read the
 *   current date, such as `cron`, are not supported.
 * - `maxOpenDuration` (default one hour) caps a `Retry-After` hint. It never
 *   caps `openDuration`.
 * - `onStoreError` decides what a call does when the store cannot admit it:
 *   `"allow"` (the default) runs it unrecorded, `"fail"` fails it with
 *   `CircuitBreakerStoreError`.
 *
 * The backoff count resets once the circuit has stayed closed as long as its
 * last opening, `Retry-After` hint included.
 *
 * **Example** (Capping backoff growth by time spent open)
 *
 * ```ts import.meta.vitest
 * import { Effect, Schedule } from "effect"
 * import { CircuitBreaker } from "effect/persistence"
 *
 * // Openings last 1, 2, 4, 8, 16 and 32 seconds. By then 63 seconds have been
 * // spent open, past the one-minute cap, so later openings stay at 32 seconds.
 * const program = Effect.gen(function*() {
 *   const breaker = yield* CircuitBreaker.make({
 *     tripPolicy: CircuitBreaker.consecutive(5),
 *     openDuration: Schedule.exponential("1 second").pipe(
 *       Schedule.upTo({ duration: "1 minute" })
 *     )
 *   })
 *   return yield* Effect.succeed("ok").pipe(breaker.execute({ key: "payments" }))
 * }).pipe(Effect.scoped, Effect.provide(CircuitBreaker.layerStoreMemory()))
 *
 * await Effect.runPromise(program) // => "ok"
 * ```
 *
 * @stability experimental
 * @category constructors
 * @since 4.0.7
 */
export const make: (options: {
  readonly tripPolicy: TripPolicy
  readonly openDuration: Duration.Input | Schedule.Schedule<unknown, number, never, never>
  readonly maxOpenDuration?: Duration.Input | undefined
  readonly onStoreError?: "allow" | "fail" | undefined
}) => Effect.Effect<CircuitBreaker, never, CircuitBreakerStore | Scope.Scope> = Effect.fnUntraced(
  function*(options: Parameters<typeof make>[0]) {
    const store = yield* CircuitBreakerStore
    const scope = yield* Effect.scope
    const pubsub = yield* PubSub.sliding<Take.Take<Transition>>(128)
    yield* Scope.addFinalizer(scope, PubSub.end(pubsub, Exit.void))

    const maxOpenDuration = Duration.fromInputUnsafe(options.maxOpenDuration ?? "1 hour")
    const onStoreError = options.onStoreError ?? "allow"
    const openDurationFor = makeOpenDuration(options.openDuration)

    const publish = (transition: Transition | undefined) =>
      transition === undefined ? Effect.void : PubSub.publish(pubsub, [transition])

    // Only an outcome that can open the circuit needs the schedule replayed.
    // An Ignored outcome never opens it, and neither does a Success unless it
    // can trip a rate policy: a probe's Success closes the circuit. Only a
    // Failure carries a hint.
    const openFor = (outcome: Outcome, admission: Admission): Effect.Effect<Duration.Duration> =>
      outcome._tag === "Ignored" ||
        (outcome._tag === "Success" && (admission.probe || options.tripPolicy._tag === "Consecutive"))
        ? Effect.succeed(Duration.zero)
        : Effect.map(
          openDurationFor(admission.consecutiveOpenings + 1),
          (delay) =>
            outcome._tag === "Failure" && outcome.retryAfter !== undefined
              ? Duration.max(delay, Duration.min(outcome.retryAfter, maxOpenDuration))
              : delay
        )

    const execute = <A, E, R, R2>(
      self: Effect.Effect<A, E, R>,
      { classify, key, onRejection }: {
        readonly key: string
        readonly classify?: Classifier<A, E, R2> | undefined
        readonly onRejection?: "fail" | "allow" | undefined
      }
    ): Effect.Effect<A, E | CircuitBreakerError, R | R2> =>
      Effect.uninterruptibleMask((restore) =>
        Effect.scopedWith(Effect.fnUntraced(function*(admitScope) {
          const admitted = yield* Effect.exit(Scope.provide(store.admit(key), admitScope))
          if (Exit.isFailure(admitted)) {
            const error = Cause.findErrorOption(admitted.cause)
            if (error._tag === "None") return yield* Effect.failCause(admitted.cause)
            if (error.value.reason._tag !== "CircuitBreakerStoreError") {
              return onRejection === "allow" && !Cause.hasDies(admitted.cause)
                ? yield* restore(self)
                : yield* Effect.failCause(admitted.cause)
            }
            if (onStoreError === "fail") return yield* Effect.failCause(admitted.cause)
            yield* reportUnhandled("CircuitBreaker store unavailable, running the call unrecorded", admitted.cause)
            return yield* restore(self)
          }
          const admission = admitted.value
          yield* publish(admission.transition)
          const exit = yield* Effect.exit(restore(self))
          const classified = yield* classifyExit(exit, admission.probe, classify, restore)
          const outcome = Exit.isSuccess(classified) ? classified.value : ignored
          yield* store.record({
            key,
            generation: admission.generation,
            outcome: outcome._tag,
            tripPolicy: options.tripPolicy,
            openFor: yield* openFor(outcome, admission)
          }).pipe(
            Effect.flatMap(publish),
            Effect.catchCauseFilter(
              findRecoverableError,
              (_, cause) => reportUnhandled("CircuitBreaker failed to record an outcome", cause)
            )
          )
          if (Exit.isSuccess(classified)) return yield* exit
          return yield* Effect.failCause(
            Exit.isFailure(exit) ? Cause.combine(exit.cause, classified.cause) : classified.cause
          )
        }))
      )

    return CircuitBreaker.of({
      [TypeId]: TypeId,
      execute: dual(2, execute),
      state: store.state,
      transitions: Stream.fromPubSubTake(pubsub)
    })
  }
)

/**
 * Provides `CircuitBreaker` using the current `CircuitBreakerStore`.
 *
 * **Details**
 *
 * Takes the same options as `make`.
 *
 * @stability experimental
 * @category layers
 * @since 4.0.7
 */
export const layer = (options: {
  readonly tripPolicy: TripPolicy
  readonly openDuration: Duration.Input | Schedule.Schedule<unknown, number, never, never>
  readonly maxOpenDuration?: Duration.Input | undefined
  readonly onStoreError?: "allow" | "fail" | undefined
}): Layer.Layer<CircuitBreaker, never, CircuitBreakerStore> => Layer.effect(CircuitBreaker, make(options))

// Reports an error that has no caller to receive it at `UnhandledLogLevel`, as
// `Pool` and `ScopedCache` do. An undefined level silences it. Callers recover
// with `findRecoverableError`, as `Effect.catch` does, so a cause that holds a
// defect still propagates.
const reportUnhandled = (message: string, cause: Cause.Cause<unknown>): Effect.Effect<void> =>
  Effect.withFiber((fiber) => {
    const level = fiber.getRef(UnhandledLogLevel)
    return level === undefined ? Effect.void : Effect.logWithLevel(level)(message, cause)
  })

const classifyExit = <A, E, R2>(
  exit: Exit.Exit<A, E>,
  probe: boolean,
  classify: Classifier<A, E, R2> | undefined,
  restore: <AX, EX, RX>(effect: Effect.Effect<AX, EX, RX>) => Effect.Effect<AX, EX, RX>
): Effect.Effect<Exit.Exit<Outcome>, never, R2> => {
  if (Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)) {
    return Effect.succeed(Exit.succeed(ignored))
  }
  if (classify === undefined) {
    return Effect.succeed(Exit.succeed(Exit.isSuccess(exit) ? success : failure()))
  }
  return Effect.exit(restore(Effect.suspend(() => {
    const outcome = classify(exit, { probe })
    return Effect.isEffect(outcome) ? outcome : Effect.succeed(outcome)
  })))
}

const makeOpenDuration = (
  openDuration: Duration.Input | Schedule.Schedule<unknown, number, never, never>
): (consecutiveOpenings: number) => Effect.Effect<Duration.Duration> => {
  if (!Schedule.isSchedule(openDuration)) {
    const duration = Effect.succeed(Duration.fromInputUnsafe(openDuration))
    return () => duration
  }
  // Replays the schedule against a simulated clock, so `upTo` and `during`
  // measure the time spent open rather than wall time.
  return (consecutiveOpenings) =>
    Effect.gen(function*() {
      const step = yield* Schedule.toStep(openDuration)
      let now = yield* Clock.currentTimeMillis
      let delay = Duration.zero
      for (let attempt = 1; attempt <= consecutiveOpenings; attempt++) {
        const result = yield* Effect.exit(step(now, attempt))
        if (Exit.isFailure(result)) break
        delay = result.value[1]
        now += Duration.toMillis(delay)
      }
      return delay
    })
}

/**
 * Policy that decides when a Closed circuit opens.
 *
 * **Details**
 *
 * - `Consecutive` opens after `failures` failures in a row, in order of
 *   completion. Only a `Success` resets the streak.
 * - `Rate` keeps the last `size` recorded outcomes and opens when the
 *   fraction of failures reaches `threshold`, once at least `minimumCalls`
 *   outcomes are recorded.
 *
 * `Ignored` outcomes never count towards either policy.
 *
 * @stability experimental
 * @category models
 * @since 4.0.7
 */
export type TripPolicy =
  | { readonly _tag: "Consecutive"; readonly failures: number }
  | { readonly _tag: "Rate"; readonly threshold: number; readonly minimumCalls: number; readonly size: number }

/**
 * Creates a trip policy that opens after `failures` consecutive failures.
 *
 * **Gotchas**
 *
 * Throws a `RangeError` when `failures` is not an integer of at least 1.
 *
 * @stability experimental
 * @category constructors
 * @since 4.0.7
 */
export const consecutive = (failures: number): TripPolicy => {
  if (!Number.isInteger(failures) || failures < 1) {
    throw new RangeError(`CircuitBreaker.consecutive: failures must be an integer >= 1, got ${failures}`)
  }
  return { _tag: "Consecutive", failures }
}

/**
 * Creates a trip policy that opens when the failure rate over the last
 * recorded calls reaches a threshold.
 *
 * **Details**
 *
 * `threshold` is a fraction in `[0, 1]` and defaults to `0.5`. `size` is the
 * number of recorded calls kept and defaults to `100`. `minimumCalls`
 * defaults to `size`. A ring with no failures never opens the circuit.
 *
 * **Gotchas**
 *
 * Throws a `RangeError` when `threshold` is outside `[0, 1]`, when `size` is
 * not an integer of at least 1, or when `minimumCalls` is not an integer
 * between 1 and `size`.
 *
 * @stability experimental
 * @category constructors
 * @since 4.0.7
 */
export const rate = (options: {
  readonly threshold?: number | undefined
  readonly size?: number | undefined
  readonly minimumCalls?: number | undefined
}): TripPolicy => {
  const threshold = options.threshold ?? 0.5
  const size = options.size ?? 100
  const minimumCalls = options.minimumCalls ?? size
  if (!(threshold >= 0 && threshold <= 1)) {
    throw new RangeError(`CircuitBreaker.rate: threshold must be in [0, 1], got ${threshold}`)
  }
  if (!Number.isInteger(size) || size < 1) {
    throw new RangeError(`CircuitBreaker.rate: size must be an integer >= 1, got ${size}`)
  }
  if (!Number.isInteger(minimumCalls) || minimumCalls < 1 || minimumCalls > size) {
    throw new RangeError(`CircuitBreaker.rate: minimumCalls must be an integer in [1, size], got ${minimumCalls}`)
  }
  return { _tag: "Rate", threshold, minimumCalls, size }
}

/**
 * Function that classifies the `Exit` of an admitted call, passed as the
 * `classify` option of `execute`.
 *
 * **Details**
 *
 * - `context.probe` is `true` when the call is the HalfOpen probe, so an
 *   outcome the classifier ignores when the circuit is closed, such as a
 *   rate-limited response, can count as a failure that reopens the circuit.
 * - The result may be an `Outcome` or an effect producing one.
 *
 * @stability experimental
 * @category models
 * @since 4.1.1
 */
export type Classifier<A, E, R2 = never> = (
  exit: Exit.Exit<A, E>,
  context: { readonly probe: boolean }
) => Outcome | Effect.Effect<Outcome, never, R2>

/**
 * Classification of a call's exit, as returned by a `classify` function.
 *
 * @stability experimental
 * @category models
 * @since 4.0.7
 */
export type Outcome = Outcome.Success | Outcome.Ignored | Outcome.Failure

/**
 * Members of the `Outcome` union.
 *
 * @stability experimental
 * @category models
 * @since 4.0.7
 */
export declare namespace Outcome {
  /**
   * Outcome for a call that shows the dependency is healthy.
   *
   * @stability experimental
   * @category models
   * @since 4.0.7
   */
  export interface Success {
    readonly _tag: "Success"
  }

  /**
   * Outcome for a call that says nothing about the dependency's health.
   *
   * @stability experimental
   * @category models
   * @since 4.0.7
   */
  export interface Ignored {
    readonly _tag: "Ignored"
  }

  /**
   * Outcome for a call that counts against the dependency, with an optional
   * hint for how long to stay open.
   *
   * @stability experimental
   * @category models
   * @since 4.0.7
   */
  export interface Failure {
    readonly _tag: "Failure"
    readonly retryAfter?: Duration.Duration | undefined
  }
}

/**
 * Outcome that records a success and resets a consecutive failure streak.
 *
 * @stability experimental
 * @category constructors
 * @since 4.0.7
 */
export const success: Outcome = { _tag: "Success" }

/**
 * Outcome that records nothing.
 *
 * @stability experimental
 * @category constructors
 * @since 4.0.7
 */
export const ignored: Outcome = { _tag: "Ignored" }

/**
 * Creates an outcome that records a failure.
 *
 * **Details**
 *
 * `retryAfter` is a hint, such as an HTTP `Retry-After` header. It is used
 * only when this failure opens the circuit, can only lengthen the opening,
 * and is capped at `maxOpenDuration`.
 *
 * @stability experimental
 * @category constructors
 * @since 4.0.7
 */
export const failure = (options?: { readonly retryAfter?: Duration.Input | undefined }): Outcome => ({
  _tag: "Failure",
  retryAfter: options?.retryAfter === undefined ? undefined : Duration.fromInputUnsafe(options.retryAfter)
})

/**
 * State of one circuit, as read from the store.
 *
 * **Details**
 *
 * - `Open.retryAfter` is the remaining open time, clamped to zero. A circuit
 *   past its open time reads as Open until the next call moves it to
 *   HalfOpen.
 * - `HalfOpen.probing` is `false` when no probe currently holds the slot.
 * - `consecutiveOpenings` on Open and HalfOpen counts the openings since the
 *   backoff last reset, not since the circuit last closed.
 *
 * @stability experimental
 * @category models
 * @since 4.0.7
 */
export type State =
  | { readonly _tag: "Closed"; readonly key: string }
  | {
    readonly _tag: "Open"
    readonly key: string
    readonly retryAfter: Duration.Duration
    readonly consecutiveOpenings: number
  }
  | { readonly _tag: "HalfOpen"; readonly key: string; readonly probing: boolean; readonly consecutiveOpenings: number }

/**
 * Transition between circuit states made by a breaker.
 *
 * **Details**
 *
 * Only the legal edges appear. `from` tells a failed probe (`"HalfOpen"`)
 * apart from a fresh trip (`"Closed"`). On an opening, `consecutiveOpenings`
 * counts the openings since the backoff last reset, including this one.
 *
 * @stability experimental
 * @category models
 * @since 4.0.7
 */
export type Transition =
  | {
    readonly key: string
    readonly from: "Closed" | "HalfOpen"
    readonly to: "Open"
    readonly retryAfter: Duration.Duration
    readonly consecutiveOpenings: number
  }
  | { readonly key: string; readonly from: "Open"; readonly to: "HalfOpen" }
  | { readonly key: string; readonly from: "HalfOpen"; readonly to: "Closed" }

/**
 * Error reason for a call rejected by an Open circuit.
 *
 * @stability experimental
 * @category errors
 * @since 4.0.7
 */
export class CircuitOpen extends Schema.Error<CircuitOpen>("effect/persistence/CircuitBreaker/CircuitOpen")({
  _tag: Schema.tag("CircuitOpen"),
  key: Schema.String,
  retryAfter: Schema.DurationFromMillis
}) {
  /**
   * Public message used when an Open circuit rejects a call.
   *
   * @stability experimental
   * @since 4.0.7
   */
  override get message(): string {
    return `Circuit open`
  }
}

/**
 * Error reason for a call rejected while a HalfOpen circuit's probe runs.
 *
 * @stability experimental
 * @category errors
 * @since 4.0.7
 */
export class CircuitHalfOpen extends Schema.Error<CircuitHalfOpen>(
  "effect/persistence/CircuitBreaker/CircuitHalfOpen"
)({
  _tag: Schema.tag("CircuitHalfOpen"),
  key: Schema.String
}) {
  /**
   * Public message used when a HalfOpen circuit rejects a call.
   *
   * @stability experimental
   * @since 4.0.7
   */
  override get message(): string {
    return `Circuit half-open`
  }
}

/**
 * Error reason for failures in the backing `CircuitBreakerStore`.
 *
 * @stability experimental
 * @category errors
 * @since 4.0.7
 */
export class CircuitBreakerStoreError extends Schema.Error<CircuitBreakerStoreError>(
  "effect/persistence/CircuitBreaker/CircuitBreakerStoreError"
)({
  _tag: Schema.tag("CircuitBreakerStoreError"),
  message: Schema.String,
  cause: Schema.optional(Schema.Defect())
}) {}

/**
 * Union of reasons carried by `CircuitBreakerError`.
 *
 * @stability experimental
 * @category errors
 * @since 4.0.7
 */
export type CircuitBreakerErrorReason = CircuitOpen | CircuitHalfOpen | CircuitBreakerStoreError

/**
 * Schema for all reasons that can be carried by `CircuitBreakerError`.
 *
 * @stability experimental
 * @category errors
 * @since 4.0.7
 */
export const CircuitBreakerErrorReason: Schema.Union<[
  typeof CircuitOpen,
  typeof CircuitHalfOpen,
  typeof CircuitBreakerStoreError
]> = Schema.Union([CircuitOpen, CircuitHalfOpen, CircuitBreakerStoreError])

/**
 * Runtime type identifier for `CircuitBreakerError`.
 *
 * @stability experimental
 * @category type IDs
 * @since 4.0.7
 */
export const ErrorTypeId: ErrorTypeId = "~effect/persistence/CircuitBreaker/CircuitBreakerError"

/**
 * Type-level identifier used to brand `CircuitBreakerError` values.
 *
 * @stability experimental
 * @category type IDs
 * @since 4.0.7
 */
export type ErrorTypeId = "~effect/persistence/CircuitBreaker/CircuitBreakerError"

/**
 * Error raised by circuit breaker operations, wrapping a concrete failure
 * `reason`.
 *
 * @stability experimental
 * @category errors
 * @since 4.0.7
 */
export class CircuitBreakerError extends Schema.Error<CircuitBreakerError>(ErrorTypeId)({
  _tag: Schema.tag("CircuitBreakerError"),
  reason: CircuitBreakerErrorReason
}) {
  // @effect-diagnostics-next-line overriddenSchemaConstructor:off
  constructor(props: {
    readonly reason: CircuitBreakerErrorReason
  }) {
    if ("cause" in props.reason) {
      super({
        ...props,
        cause: props.reason.cause
      } as any)
    } else {
      super(props)
    }
  }

  /**
   * Marks this value as a circuit breaker error for runtime guards.
   *
   * @stability experimental
   * @since 4.0.7
   */
  readonly [ErrorTypeId]: ErrorTypeId = ErrorTypeId

  override get message(): string {
    return this.reason.message
  }
}

/**
 * Store that holds circuit state for a `CircuitBreaker`.
 *
 * **Details**
 *
 * - `admit` returns an `Admission`, or fails with `CircuitOpen` or
 *   `CircuitHalfOpen`. Its scope stays open while the call runs.
 * - `record` applies an outcome atomically and opens the circuit for
 *   `openFor` if it trips. An outcome stamped with an older generation
 *   changes nothing.
 * - `state` reads a key without changing it.
 *
 * Each operation reads the current time inside the store. A close keeps
 * `consecutiveOpenings` and sets a reset deadline of the close time plus the
 * last `openFor`. The first `admit` at or after the deadline resets the count
 * to 0. `record` never reads the deadline, so a call admitted before a reset
 * still opens with the `openFor` it computed.
 *
 * @stability experimental
 * @category services
 * @since 4.0.7
 */
export class CircuitBreakerStore extends Context.Service<CircuitBreakerStore, {
  readonly admit: (key: string) => Effect.Effect<Admission, CircuitBreakerError, Scope.Scope>
  readonly record: (options: {
    readonly key: string
    readonly generation: number
    readonly outcome: "Success" | "Failure" | "Ignored"
    readonly tripPolicy: TripPolicy
    readonly openFor: Duration.Duration
  }) => Effect.Effect<Transition | undefined, CircuitBreakerError>
  readonly state: (key: string) => Effect.Effect<State, CircuitBreakerError>
}>()("effect/persistence/CircuitBreaker/CircuitBreakerStore") {}

/**
 * Permit returned by `CircuitBreakerStore.admit`.
 *
 * **Details**
 *
 * - `generation` is an opaque fencing token to pass back to `record`.
 * - `probe` is `true` when this call is the HalfOpen probe.
 * - `consecutiveOpenings` counts the openings since the backoff last reset.
 * - `transition` is the Open to HalfOpen transition this admission made, if
 *   any.
 *
 * @stability experimental
 * @category models
 * @since 4.0.7
 */
export interface Admission {
  readonly generation: number
  readonly probe: boolean
  readonly consecutiveOpenings: number
  readonly transition: Transition | undefined
}

interface MemoryEntry {
  state: "Closed" | "Open" | "HalfOpen"
  generation: number
  lastActivity: number
  streak: number
  ring: Array<boolean>
  ringFailures: number
  openUntil: number
  consecutiveOpenings: number
  lastOpenFor: number
  resetAt: number
  probing: boolean
}

/**
 * Creates an in-memory `CircuitBreakerStore` layer.
 *
 * **Details**
 *
 * State is local to the layer and uses `Clock`. `idleTimeToLive` (default
 * one hour) drops a key once it has been idle that long. An Open key is kept
 * that long past its open time, and a key whose probe is running is never
 * dropped. A dropped key starts again as Closed with a backoff count of 0.
 *
 * @stability experimental
 * @category layers
 * @since 4.0.7
 */
export const layerStoreMemory = (options?: {
  readonly idleTimeToLive?: Duration.Input | undefined
}): Layer.Layer<CircuitBreakerStore> =>
  Layer.sync(CircuitBreakerStore, () => {
    const idleTimeToLive = Duration.toMillis(Duration.fromInputUnsafe(options?.idleTimeToLive ?? "1 hour"))
    const entries = new Map<string, MemoryEntry>()
    let nextGeneration = 0
    let lastSweep = 0

    const isExpired = (entry: MemoryEntry, now: number) => {
      switch (entry.state) {
        case "Closed":
          return now - entry.lastActivity >= idleTimeToLive
        case "Open":
          return now - Math.max(entry.lastActivity, entry.openUntil) >= idleTimeToLive
        case "HalfOpen":
          return !entry.probing && now - entry.lastActivity >= idleTimeToLive
      }
    }

    const sweep = (now: number) => {
      if (now - lastSweep < idleTimeToLive) return
      lastSweep = now
      for (const [key, entry] of entries) {
        if (isExpired(entry, now)) entries.delete(key)
      }
    }

    const lookup = (key: string, now: number): MemoryEntry | undefined => {
      const entry = entries.get(key)
      return entry !== undefined && !isExpired(entry, now) ? entry : undefined
    }

    const resetCounters = (entry: MemoryEntry) => {
      entry.streak = 0
      entry.ring = []
      entry.ringFailures = 0
    }

    const open = (
      key: string,
      entry: MemoryEntry,
      from: "Closed" | "HalfOpen",
      openFor: Duration.Duration,
      now: number
    ): Transition => {
      entry.state = "Open"
      entry.generation = nextGeneration++
      entry.lastOpenFor = Duration.toMillis(openFor)
      entry.openUntil = now + entry.lastOpenFor
      entry.consecutiveOpenings++
      entry.probing = false
      resetCounters(entry)
      return { key, from, to: "Open", retryAfter: openFor, consecutiveOpenings: entry.consecutiveOpenings }
    }

    const trips = (entry: MemoryEntry, policy: TripPolicy) => {
      if (policy._tag === "Consecutive") return entry.streak >= policy.failures
      return entry.ring.length >= policy.minimumCalls && entry.ringFailures > 0 &&
        entry.ringFailures / entry.ring.length >= policy.threshold
    }

    return CircuitBreakerStore.of({
      admit: (key) =>
        Effect.flatMap(Clock.currentTimeMillis, (now) => {
          sweep(now)
          let entry = lookup(key, now)
          if (entry === undefined) {
            entry = {
              state: "Closed",
              generation: nextGeneration++,
              lastActivity: now,
              streak: 0,
              ring: [],
              ringFailures: 0,
              openUntil: 0,
              consecutiveOpenings: 0,
              lastOpenFor: 0,
              resetAt: 0,
              probing: false
            }
            entries.set(key, entry)
          }
          let transition: Transition | undefined
          switch (entry.state) {
            case "Closed": {
              // A call admitted before this reset can still trip the circuit.
              // It opens with the openFor it computed from its older count,
              // and the stored count restarts at 1.
              if (entry.consecutiveOpenings > 0 && now >= entry.resetAt) {
                entry.consecutiveOpenings = 0
              }
              break
            }
            case "Open": {
              if (now < entry.openUntil) {
                return Effect.fail(
                  new CircuitBreakerError({
                    reason: new CircuitOpen({ key, retryAfter: Duration.millis(entry.openUntil - now) })
                  })
                )
              }
              entry.state = "HalfOpen"
              transition = { key, from: "Open", to: "HalfOpen" }
              break
            }
            case "HalfOpen": {
              if (entry.probing) {
                return Effect.fail(new CircuitBreakerError({ reason: new CircuitHalfOpen({ key }) }))
              }
              break
            }
          }
          entry.lastActivity = now
          if (entry.state === "HalfOpen") {
            entry.probing = true
            entry.generation = nextGeneration++
          }
          return Effect.succeed<Admission>({
            generation: entry.generation,
            probe: entry.state === "HalfOpen",
            consecutiveOpenings: entry.consecutiveOpenings,
            transition
          })
        }),
      record: ({ generation, key, openFor, outcome, tripPolicy }) =>
        Effect.map(Clock.currentTimeMillis, (now): Transition | undefined => {
          const entry = lookup(key, now)
          if (entry === undefined || entry.generation !== generation) return undefined
          entry.lastActivity = now
          if (entry.state === "HalfOpen") {
            switch (outcome) {
              case "Ignored": {
                entry.probing = false
                return undefined
              }
              case "Failure":
                return open(key, entry, "HalfOpen", openFor, now)
              case "Success": {
                entry.state = "Closed"
                entry.generation = nextGeneration++
                entry.resetAt = now + entry.lastOpenFor
                entry.probing = false
                resetCounters(entry)
                return { key, from: "HalfOpen", to: "Closed" }
              }
            }
          }
          if (entry.state !== "Closed" || outcome === "Ignored") return undefined
          const failed = outcome === "Failure"
          entry.streak = failed ? entry.streak + 1 : 0
          if (tripPolicy._tag === "Rate") {
            entry.ring.push(failed)
            if (failed) entry.ringFailures++
            while (entry.ring.length > tripPolicy.size) {
              if (entry.ring.shift()) entry.ringFailures--
            }
          }
          return trips(entry, tripPolicy) ? open(key, entry, "Closed", openFor, now) : undefined
        }),
      state: (key) =>
        Effect.map(Clock.currentTimeMillis, (now): State => {
          const entry = lookup(key, now)
          if (entry === undefined) return { _tag: "Closed", key }
          switch (entry.state) {
            case "Closed":
              return { _tag: "Closed", key }
            case "Open":
              return {
                _tag: "Open",
                key,
                retryAfter: Duration.millis(Math.max(0, entry.openUntil - now)),
                consecutiveOpenings: entry.consecutiveOpenings
              }
            case "HalfOpen":
              return { _tag: "HalfOpen", key, probing: entry.probing, consecutiveOpenings: entry.consecutiveOpenings }
          }
        })
    })
  })

/**
 * Creates a Redis-backed `CircuitBreakerStore` layer.
 *
 * **Details**
 *
 * - Each circuit is one hash at `${prefix}${key}`, and `prefix` defaults to
 *   `"circuitbreaker:"`. Times come from Redis `TIME`, so client clock skew
 *   never matters. Requires Redis 5 or later.
 * - The probe holds a lease of `probeLease` (default 10 seconds), renewed
 *   while it runs. If the lease lapses, another caller takes over and the old
 *   probe's outcome is discarded.
 * - `idleTimeToLive` (default one hour) expires idle keys. An Open key, or one
 *   whose probe holds the lease, is kept that long past its open time or
 *   lease, so expiry never cuts a probe short or resets the backoff early. An
 *   expired key starts again as Closed with a backoff count of 0.
 *
 * **Gotchas**
 *
 * - If renewals cannot reach Redis, the lease lapses and a second probe can
 *   start.
 * - Durations above 2^50 milliseconds cannot be stored. An operation that
 *   needs one fails with `CircuitBreakerStoreError`.
 *
 * @stability experimental
 * @category layers
 * @since 4.0.7
 */
export const layerStoreRedis = (options?: {
  readonly prefix?: string | undefined
  readonly probeLease?: Duration.Input | undefined
  readonly idleTimeToLive?: Duration.Input | undefined
}): Layer.Layer<CircuitBreakerStore, never, Redis.Redis> => Layer.effect(CircuitBreakerStore, makeStoreRedis(options))

/**
 * Creates a Redis-backed `CircuitBreakerStore` layer from wrapped
 * configuration options.
 *
 * **Details**
 *
 * Takes the same options as `layerStoreRedis`.
 *
 * @stability experimental
 * @category layers
 * @since 4.0.7
 */
export const layerStoreRedisConfig = (
  options: Config.Wrap<{
    readonly prefix?: string | undefined
    readonly probeLease?: Duration.Input | undefined
    readonly idleTimeToLive?: Duration.Input | undefined
  }>
): Layer.Layer<CircuitBreakerStore, Config.ConfigError, Redis.Redis> =>
  Layer.effect(CircuitBreakerStore, Effect.flatMap(Config.unwrap(options), makeStoreRedis))

const makeStoreRedis = Effect.fnUntraced(function*(options?: {
  readonly prefix?: string | undefined
  readonly probeLease?: Duration.Input | undefined
  readonly idleTimeToLive?: Duration.Input | undefined
}) {
  const redis = yield* Redis.Redis
  const prefix = options?.prefix ?? "circuitbreaker:"
  const leaseMillis = toRedisMillis(options?.probeLease ?? "10 seconds")
  const idleMillis = toRedisMillis(options?.idleTimeToLive ?? "1 hour")
  const renewInterval = Duration.millis(leaseMillis / 3)

  const admitRedis = redis.eval(admitScript)
  const recordRedis = redis.eval(recordScript)
  const stateRedis = redis.eval(stateScript)
  const renewRedis = redis.eval(renewScript)

  const storeError = (message: string) => (error: Redis.RedisError) =>
    new CircuitBreakerError({ reason: new CircuitBreakerStoreError({ message, cause: error.cause }) })

  // Stops once the lease is gone, because a renewal can never win it back.
  const renew = Effect.fnUntraced(function*(redisKey: string, generation: string) {
    while (true) {
      yield* Effect.sleep(renewInterval)
      const renewed = yield* renewRedis(redisKey, generation, leaseMillis, idleMillis).pipe(
        Effect.catchCauseFilter(
          findRecoverableError,
          (_, cause) => Effect.as(reportUnhandled("CircuitBreaker failed to renew a probe lease, retrying", cause), 1)
        )
      )
      if (renewed !== 1) return
    }
  })

  return CircuitBreakerStore.of({
    admit: Effect.fnUntraced(function*(key) {
      const redisKey = `${prefix}${key}`
      const result = yield* admitRedis(redisKey, leaseMillis, idleMillis).pipe(
        Effect.mapError(storeError("Failed to admit a call through the circuit"))
      )
      switch (result[0]) {
        case "open":
          return yield* new CircuitBreakerError({
            reason: new CircuitOpen({ key, retryAfter: Duration.millis(Math.max(0, Number(result[1]))) })
          })
        case "halfopen":
          return yield* new CircuitBreakerError({ reason: new CircuitHalfOpen({ key }) })
      }
      const [, generation, probe, consecutiveOpenings, moved] = result
      if (probe === 1) {
        yield* renew(redisKey, generation).pipe(Effect.interruptible, Effect.forkScoped)
      }
      return {
        generation: Number(generation),
        probe: probe === 1,
        consecutiveOpenings: Number(consecutiveOpenings),
        transition: moved === 1 ? { key, from: "Open", to: "HalfOpen" } : undefined
      } satisfies Admission
    }),
    record: ({ generation, key, openFor, outcome, tripPolicy }) =>
      recordRedis(
        `${prefix}${key}`,
        String(generation),
        outcome,
        tripPolicy,
        Math.max(0, Math.ceil(Duration.toMillis(openFor))),
        idleMillis
      ).pipe(
        Effect.mapError(storeError("Failed to record an outcome")),
        Effect.map(([moved, consecutiveOpenings]): Transition | undefined => {
          switch (moved) {
            case "closed-open":
            case "halfopen-open":
              return {
                key,
                from: moved === "closed-open" ? "Closed" : "HalfOpen",
                to: "Open",
                retryAfter: openFor,
                consecutiveOpenings: Number(consecutiveOpenings)
              }
            case "halfopen-closed":
              return { key, from: "HalfOpen", to: "Closed" }
            default:
              return undefined
          }
        })
      ),
    state: (key) =>
      stateRedis(`${prefix}${key}`).pipe(
        Effect.mapError(storeError("Failed to read the circuit state")),
        Effect.map(([state, remaining, consecutiveOpenings, probing]): State => {
          switch (state) {
            case "Open":
              return {
                _tag: "Open",
                key,
                retryAfter: Duration.millis(Math.max(0, Number(remaining))),
                consecutiveOpenings: Number(consecutiveOpenings)
              }
            case "HalfOpen":
              return { _tag: "HalfOpen", key, probing: probing === 1, consecutiveOpenings: Number(consecutiveOpenings) }
            default:
              return { _tag: "Closed", key }
          }
        })
      )
  })
})

const toRedisMillis = (input: Duration.Input) =>
  Math.max(1, Math.ceil(Duration.toMillis(Duration.fromInputUnsafe(input))))

// Shared Lua prelude.
//
// Numeric arguments are capped at 2^50 (about 35,000 years in milliseconds),
// so every TTL and timestamp derived from them stays an exact integer. Redis
// formats a Lua number above 1e17 with an exponent, which PEXPIRE rejects
// after earlier writes have already happened. `int` formats every number
// written to Redis without one.
//
// Generations are the larger of the previous generation plus one and the
// current Redis time in microseconds, so a key that expired and was recreated
// never reissues a generation an old permit still holds. They are kept as
// integer strings so they never pass through a float format.
const luaPrelude = `
local maxValue = 1125899906842624
local function bounded(value, min)
  local n = tonumber(value)
  if n == nil or n ~= n or n < min or n > maxValue then return nil end
  return n
end
local function positive(value) return bounded(value, 1) end
local function nonNegative(value) return bounded(value, 0) end
local function int(n) return string.format("%.0f", n) end
local time = redis.call("TIME")
local nowMicros = tonumber(time[1]) * 1000000 + tonumber(time[2])
local now = math.floor(nowMicros / 1000)
local function nextGeneration(current)
  return int(math.max((tonumber(current) or 0) + 1, nowMicros))
end
`

// Returns { "ok", generation, probe, consecutiveOpenings, movedToHalfOpen },
// { "open", remainingMillis } or { "halfopen" }.
const admitScript = Redis.script(
  (key: string, leaseMillis: number, idleMillis: number) => [key, leaseMillis, idleMillis],
  {
    numberOfKeys: 1,
    lua: `${luaPrelude}
local key = KEYS[1]
local lease = positive(ARGV[1])
local idle = positive(ARGV[2])
if not lease or not idle then
  return redis.error_reply("CircuitBreaker admit: invalid arguments")
end

local fields = redis.call("HMGET", key, "state", "generation", "openUntil", "openings", "leaseUntil", "resetAt")
local state = fields[1]
local generation = fields[2]
local openings = tonumber(fields[4]) or 0

if not state then
  generation = nextGeneration(0)
  redis.call("HSET", key, "state", "Closed", "generation", generation)
  redis.call("PEXPIRE", key, int(idle))
  return { "ok", generation, 0, 0, 0 }
end

if state == "Closed" then
  -- A call admitted before this reset can still trip the circuit. It opens
  -- with the openFor it computed from its older count, and the stored count
  -- restarts at 1.
  if openings > 0 and now >= (tonumber(fields[6]) or 0) then
    openings = 0
    redis.call("HSET", key, "openings", 0)
  end
  redis.call("PEXPIRE", key, int(idle))
  return { "ok", generation, 0, openings, 0 }
end

local moved = 0
if state == "Open" then
  local openUntil = tonumber(fields[3]) or 0
  if now < openUntil then
    return { "open", openUntil - now }
  end
  moved = 1
elseif (tonumber(fields[5]) or 0) > now then
  return { "halfopen" }
end

-- Every probe admission, including a takeover of a lapsed lease, starts a
-- new generation.
generation = nextGeneration(generation)
redis.call("HSET", key, "state", "HalfOpen", "generation", generation, "leaseUntil", int(now + lease))
redis.call("PEXPIRE", key, int(lease + idle))
return { "ok", generation, 1, openings, moved }
`
  }
).withReturnType<
  | readonly [tag: "ok", generation: string, probe: number, consecutiveOpenings: number, moved: number]
  | readonly [tag: "open", remainingMillis: number]
  | readonly [tag: "halfopen"]
>()

// Returns { transition, consecutiveOpenings }, where transition is "none",
// "closed-open", "halfopen-open" or "halfopen-closed".
//
// ARGV holds the generation, the outcome, the policy tag, the policy's
// failures (Consecutive) or threshold (Rate), minimumCalls and size (0 under
// Consecutive), then the open time and idle time in milliseconds.
const recordScript = Redis.script(
  (
    key: string,
    generation: string,
    outcome: "Success" | "Failure" | "Ignored",
    tripPolicy: TripPolicy,
    openForMillis: number,
    idleMillis: number
  ) => [
    key,
    generation,
    outcome,
    tripPolicy._tag,
    ...(tripPolicy._tag === "Consecutive"
      ? [tripPolicy.failures, 0, 0]
      : [tripPolicy.threshold, tripPolicy.minimumCalls, tripPolicy.size]),
    openForMillis,
    idleMillis
  ],
  {
    numberOfKeys: 1,
    lua: `${luaPrelude}
local key = KEYS[1]
local expected = ARGV[1]
local outcome = ARGV[2]
local policy = ARGV[3]
local openFor = nonNegative(ARGV[7])
local idle = positive(ARGV[8])
local valid = openFor ~= nil and idle ~= nil and
  (outcome == "Success" or outcome == "Failure" or outcome == "Ignored")
local failuresNeeded, threshold, minimumCalls, size
if policy == "Consecutive" then
  failuresNeeded = positive(ARGV[4])
  valid = valid and failuresNeeded ~= nil
elseif policy == "Rate" then
  threshold = nonNegative(ARGV[4])
  minimumCalls = positive(ARGV[5])
  size = positive(ARGV[6])
  valid = valid and threshold ~= nil and threshold <= 1 and minimumCalls ~= nil and size ~= nil and
    minimumCalls <= size
else
  valid = false
end
if not valid then
  return redis.error_reply("CircuitBreaker record: invalid arguments")
end

local fields = redis.call("HMGET", key, "state", "generation", "streak", "ring", "failures", "openings", "lastOpenFor")
local state = fields[1]
if not state or fields[2] ~= expected then
  return { "none", 0 }
end
local openings = tonumber(fields[6]) or 0

local function open()
  openings = openings + 1
  redis.call(
    "HSET", key,
    "state", "Open",
    "generation", nextGeneration(fields[2]),
    "openUntil", int(now + openFor),
    "openings", openings,
    "lastOpenFor", int(openFor),
    "streak", 0,
    "ring", "",
    "failures", 0,
    "leaseUntil", 0
  )
  redis.call("PEXPIRE", key, int(openFor + idle))
end

if state == "HalfOpen" then
  if outcome == "Ignored" then
    -- A new generation fences a renewal already on its way, so the freed slot
    -- stays free.
    redis.call("HSET", key, "generation", nextGeneration(fields[2]), "leaseUntil", 0)
    redis.call("PEXPIRE", key, int(idle))
    return { "none", openings }
  end
  if outcome == "Failure" then
    open()
    return { "halfopen-open", openings }
  end
  redis.call(
    "HSET", key,
    "state", "Closed",
    "generation", nextGeneration(fields[2]),
    "resetAt", int(now + (tonumber(fields[7]) or 0)),
    "streak", 0,
    "ring", "",
    "failures", 0,
    "leaseUntil", 0
  )
  redis.call("PEXPIRE", key, int(idle))
  return { "halfopen-closed", openings }
end

if state ~= "Closed" then
  return { "none", openings }
end
if outcome == "Ignored" then
  redis.call("PEXPIRE", key, int(idle))
  return { "none", openings }
end

local failed = outcome == "Failure"
local streak = failed and (tonumber(fields[3]) or 0) + 1 or 0
local trips
local ring = fields[4] or ""
local failures = tonumber(fields[5]) or 0
if policy == "Consecutive" then
  trips = streak >= failuresNeeded
else
  ring = ring .. (failed and "1" or "0")
  if failed then failures = failures + 1 end
  if #ring > size then
    local _, dropped = string.gsub(string.sub(ring, 1, #ring - size), "1", "")
    failures = failures - dropped
    ring = string.sub(ring, #ring - size + 1)
  end
  trips = #ring >= minimumCalls and failures > 0 and failures / #ring >= threshold
end

if trips then
  open()
  return { "closed-open", openings }
end
redis.call("HSET", key, "streak", streak, "ring", ring, "failures", failures)
redis.call("PEXPIRE", key, int(idle))
return { "none", openings }
`
  }
).withReturnType<readonly [transition: string, consecutiveOpenings: number]>()

// Read-only. Returns { state, remainingOpenMillis, consecutiveOpenings, probing }.
const stateScript = Redis.script(
  (key: string) => [key],
  {
    numberOfKeys: 1,
    lua: `${luaPrelude}
local fields = redis.call("HMGET", KEYS[1], "state", "openUntil", "openings", "leaseUntil")
local state = fields[1]
if not state then
  return { "Closed", 0, 0, 0 }
end
local remaining = math.max(0, (tonumber(fields[2]) or 0) - now)
local probing = (tonumber(fields[4]) or 0) > now and 1 or 0
return { state, remaining, tonumber(fields[3]) or 0, probing }
`
  }
).withReturnType<readonly [state: string, remainingMillis: number, consecutiveOpenings: number, probing: number]>()

// Extends the probe lease only while the generation still holds it. Returns 1
// when renewed, 0 when the lease is gone.
const renewScript = Redis.script(
  (key: string, generation: string, leaseMillis: number, idleMillis: number) => [
    key,
    generation,
    leaseMillis,
    idleMillis
  ],
  {
    numberOfKeys: 1,
    lua: `${luaPrelude}
local key = KEYS[1]
local lease = positive(ARGV[2])
local idle = positive(ARGV[3])
if not lease or not idle then
  return redis.error_reply("CircuitBreaker renew: invalid arguments")
end
local fields = redis.call("HMGET", key, "state", "generation")
if fields[1] ~= "HalfOpen" or fields[2] ~= ARGV[1] then
  return 0
end
redis.call("HSET", key, "leaseUntil", int(now + lease))
redis.call("PEXPIRE", key, int(lease + idle))
return 1
`
  }
).withReturnType<number>()
