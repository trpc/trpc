/**
 * Describes effectful sources that emit values over time.
 *
 * A `Stream<A, E, R>` can emit many `A` values, fail with `E`, and require
 * services `R` while it is being consumed. Streams are useful for data that is
 * pulled in steps, such as values from collections, queues, pubsubs, schedules,
 * callbacks, async iterables, or platform streams. The APIs here cover the full
 * stream lifecycle: create a stream, transform or combine it, control buffering
 * and timing, handle failures, and finally consume it.
 *
 * @since 2.0.0
 */
// @effect-diagnostics returnEffectInGen:off
import * as Arr from "./Array.ts"
import * as ByteSize from "./ByteSize.ts"
import * as Cause from "./Cause.ts"
import * as Channel from "./Channel.ts"
import { Clock } from "./Clock.ts"
import * as Context from "./Context.ts"
import * as Duration from "./Duration.ts"
import * as Effect from "./Effect.ts"
import * as Equal from "./Equal.ts"
import * as ExecutionPlan from "./ExecutionPlan.ts"
import * as Exit from "./Exit.ts"
import * as Fiber from "./Fiber.ts"
import type * as Filter from "./Filter.ts"
import type { LazyArg } from "./Function.ts"
import { constant, constTrue, constVoid, dual, identity } from "./Function.ts"
import type { TypeLambda } from "./HKT.ts"
import * as Count from "./internal/count.ts"
import * as internalExecutionPlan from "./internal/executionPlan.ts"
import * as internal from "./internal/stream.ts"
import { addSpanStackTrace } from "./internal/tracer.ts"
import * as Iterable from "./Iterable.ts"
import * as Latch from "./Latch.ts"
import type * as Layer from "./Layer.ts"
import type { Severity } from "./LogLevel.ts"
import * as MutableHashMap from "./MutableHashMap.ts"
import * as MutableList from "./MutableList.ts"
import * as Option from "./Option.ts"
import type { Pipeable } from "./Pipeable.ts"
import type { Predicate, Refinement } from "./Predicate.ts"
import { hasProperty, isNotUndefined, isTagged } from "./Predicate.ts"
import * as PubSub from "./PubSub.ts"
import * as Pull from "./Pull.ts"
import * as Queue from "./Queue.ts"
import * as RcMap from "./RcMap.ts"
import * as RcRef from "./RcRef.ts"
import * as Result from "./Result.ts"
import * as Schedule from "./Schedule.ts"
import * as Scope from "./Scope.ts"
import * as Sink from "./Sink.ts"
import { isString } from "./String.ts"
import type * as Take from "./Take.ts"
import type { ParentSpan, SpanOptions } from "./Tracer.ts"
import type {
  Concurrency,
  Covariant,
  ExcludeReason,
  ExcludeTag,
  ExtractReason,
  ExtractTag,
  NarrowReason,
  NoInfer,
  OmitReason,
  ReasonOf,
  ReasonTags,
  Simplify,
  Tags,
  TupleOf,
  unassigned
} from "./Types.ts"
import type * as Unify from "./Unify.ts"

/**
 * String literal type used as the unique brand for `Stream` values.
 *
 * @category type IDs
 * @since 4.0.0
 */
export type TypeId = "~effect/Stream"

/**
 * Runtime identifier stored on `Stream` values and used by `isStream` to
 * recognize them.
 *
 * **Details**
 *
 * This marker is part of the runtime representation of `Stream` values. Prefer
 * `isStream` when narrowing unknown values.
 *
 * @see {@link isStream} for the public guard that checks this identifier
 *
 * @category type IDs
 * @since 4.0.0
 */
export const TypeId: TypeId = "~effect/Stream"

/**
 * A `Stream<A, E, R>` describes a program that can emit many `A` values, fail
 * with `E`, and require `R`.
 *
 * **Details**
 *
 * Streams are pull-based with backpressure and emit chunks to amortize effect
 * evaluation. They support monadic composition and error handling similar to
 * `Effect`, adapted for multiple values.
 *
 * **Example** (Creating and consuming streams)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const values = await Effect.runPromise(
 *   Stream.make(1, 2, 3).pipe(
 *     Stream.map((n) => n * 2),
 *     Stream.runCollect
 *   )
 * )
 * values // => [2, 4, 6]
 * ```
 *
 * @category models
 * @since 2.0.0
 */
export interface Stream<out A, out E = never, out R = never> extends Variance<A, E, R>, Pipeable {
  readonly channel: Channel.Channel<Arr.NonEmptyReadonlyArray<A>, E, void, unknown, unknown, unknown, R>
  [Unify.typeSymbol]?: unknown
  [Unify.unifySymbol]?: StreamUnify<this>
  [Unify.ignoreSymbol]?: StreamUnifyIgnore
}

/**
 * Type-level unification hook for Stream within the Effect type system.
 *
 * @category models
 * @since 2.0.0
 */
export interface StreamUnify<A extends { [Unify.typeSymbol]?: any }> extends Effect.EffectUnify<A> {
  Stream?: () => A[Unify.typeSymbol] extends Stream<infer A0, infer E0, infer R0> | infer _ ? Stream<A0, E0, R0> : never
}

/**
 * Type-level marker that excludes Stream from unification.
 *
 * @category models
 * @since 2.0.0
 */
export interface StreamUnifyIgnore {
  Effect?: true
}

/**
 * Type lambda for Stream used in higher-kinded type operations.
 *
 * **Example** (Using the stream type lambda)
 *
 * ```ts import.meta.vitest
 * import { Effect, HKT, Stream } from "effect"
 *
 * // Create a Stream type using the type lambda
 * type NumberStream = HKT.Kind<Stream.StreamTypeLambda, never, never, string, number>
 * // Equivalent to: Stream<number, string, never>
 * const stream: NumberStream = Stream.make(1, 2, 3)
 * await Effect.runPromise(Stream.runCollect(stream)) // => [1, 2, 3]
 * ```
 *
 * @category utility types
 * @since 2.0.0
 */
export interface StreamTypeLambda extends TypeLambda {
  readonly type: Stream<this["Target"], this["Out1"], this["Out2"]>
}

/**
 * Type-level variance marker for `Stream`.
 *
 * **Details**
 *
 * The emitted value `A`, error `E`, and service requirement `R` type
 * parameters are covariant.
 *
 * @category models
 * @since 2.0.0
 */
export interface Variance<out A, out E, out R> {
  readonly [TypeId]: VarianceStruct<A, E, R>
}

/**
 * Structural encoding used by `Variance` to record each `Stream` type
 * parameter's variance.
 *
 * **Details**
 *
 * `_A`, `_E`, and `_R` are covariant markers.
 *
 * @category models
 * @since 3.4.0
 */
export interface VarianceStruct<out A, out E, out R> {
  readonly _A: Covariant<A>
  readonly _E: Covariant<E>
  readonly _R: Covariant<R>
}

/**
 * Extract the success type from a Stream type.
 *
 * **Example** (Extracting the success type from a Stream type)
 *
 * ```ts import.meta.vitest
 * import { Stream } from "effect"
 *
 * type NumberStream = Stream.Stream<number, string, never>
 * type SuccessType = Stream.Success<NumberStream>
 * const value: SuccessType = 42
 * ```
 *
 * @category utility types
 * @since 3.4.0
 */
export type Success<T> = T extends Stream<infer _A, infer _E, infer _R> ? _A : never

/**
 * Extract the error type from a Stream type.
 *
 * **Example** (Extracting the error type from a Stream type)
 *
 * ```ts import.meta.vitest
 * import { Stream } from "effect"
 *
 * type NumberStream = Stream.Stream<number, string, never>
 * type ErrorType = Stream.Error<NumberStream>
 * const error: ErrorType = "boom"
 * ```
 *
 * @category utility types
 * @since 3.4.0
 */
export type Error<T> = T extends Stream<infer _A, infer _E, infer _R> ? _E : never

/**
 * Extract the services type from a Stream type.
 *
 * **Example** (Extracting the services type from a Stream type)
 *
 * ```ts import.meta.vitest
 * import { Stream } from "effect"
 *
 * interface Database {
 *   query: (sql: string) => unknown
 * }
 * type NumberStream = Stream.Stream<number, string, { db: Database }>
 * type RequiredServices = Stream.Services<NumberStream>
 * const services: RequiredServices = { db: { query: (sql) => sql } }
 * services.db.query("SELECT 1") // => "SELECT 1"
 * ```
 *
 * @category utility types
 * @since 4.0.0
 */
export type Services<T> = T extends Stream<infer _A, infer _E, infer _R> ? _R : never

/**
 * Checks whether a value is a Stream.
 *
 * **Example** (Checking whether a value is a Stream)
 *
 * ```ts import.meta.vitest
 * import { Stream } from "effect"
 *
 * Stream.isStream(Stream.make(1, 2, 3)) // => true
 * Stream.isStream({ data: [1, 2, 3] }) // => false
 * ```
 *
 * @category guards
 * @since 4.0.0
 */
export const isStream = (u: unknown): u is Stream<unknown, unknown, unknown> => hasProperty(u, TypeId)

/**
 * The default chunk size used by Stream constructors and combinators.
 *
 * **Example** (Reading the default chunk size)
 *
 * ```ts import.meta.vitest
 * import { Stream } from "effect"
 *
 * Stream.DefaultChunkSize // => 4096
 * ```
 *
 * @category constants
 * @since 2.0.0
 */
export const DefaultChunkSize: number = Channel.DefaultChunkSize

/**
 * Describes how merged streams decide when to halt.
 *
 * @category models
 * @since 4.0.0
 */
export type HaltStrategy = Channel.HaltStrategy

/**
 * Creates a stream from a array-emitting `Channel`.
 *
 * **Example** (Creating a stream from an array-emitting channel)
 *
 * ```ts import.meta.vitest
 * import { Channel, Effect, Stream } from "effect"
 *
 * const channel = Channel.succeed([1, 2, 3] as const)
 * const stream = Stream.fromChannel(channel)
 * await Effect.runPromise(Stream.runCollect(stream)) // => [1, 2, 3]
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const fromChannel: <Arr extends Arr.NonEmptyReadonlyArray<any>, E, R>(
  channel: Channel.Channel<Arr, E, void, unknown, unknown, unknown, R>
) => Stream<Arr extends Arr.NonEmptyReadonlyArray<infer A> ? A : never, E, R> = internal.fromChannel

/**
 * Creates a stream from an effect.
 *
 * **Example** (Creating a stream from an effect)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const stream = Stream.fromEffect(Effect.succeed(42))
 * await Effect.runPromise(Stream.runCollect(stream)) // => [42]
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const fromEffect = <A, E, R>(effect: Effect.Effect<A, E, R>): Stream<A, E, R> =>
  fromChannel(Channel.fromEffect(Effect.map(effect, Arr.of)))

/**
 * Accesses a service from the context and emits it as a single element.
 *
 * **Example** (Accessing a service as a stream)
 *
 * ```ts import.meta.vitest
 * import { Context, Effect, Stream } from "effect"
 *
 * class Greeter extends Context.Service<Greeter, {
 *   readonly greet: (name: string) => string
 * }>()("Greeter") {}
 *
 * const stream = Stream.service(Greeter).pipe(
 *   Stream.map((greeter) => greeter.greet("World"))
 * )
 *
 * await Effect.runPromise(
 *   stream.pipe(
 *     Stream.provideService(Greeter, {
 *       greet: (name) => `Hello, ${name}!`
 *     }),
 *     Stream.runCollect
 *   )
 * ) // => ["Hello, World!"]
 * ```
 *
 * @category accessors
 * @since 4.0.0
 */
export const service = <I, S>(service: Context.Key<I, S>): Stream<S, never, I> => fromEffect(Effect.service(service))

/**
 * Optionally accesses a service from the context and emits the result as a
 * single element.
 *
 * **When to use**
 *
 * Use when you need a stream that emits an optional service from the context
 * without requiring that service to be present.
 *
 * **Example** (Accessing an optional service as a stream)
 *
 * ```ts import.meta.vitest
 * import { Context, Effect, Option, Stream } from "effect"
 *
 * class Greeter extends Context.Service<Greeter, {
 *   readonly greet: (name: string) => string
 * }>()("Greeter") {}
 *
 * const stream = Stream.serviceOption(Greeter).pipe(
 *   Stream.map((maybeGreeter) =>
 *     Option.match(maybeGreeter, {
 *       onNone: () => "No greeter",
 *       onSome: (greeter) => greeter.greet("World")
 *     })
 *   )
 * )
 *
 * await Effect.runPromise(
 *   stream.pipe(
 *     Stream.provideService(Greeter, {
 *       greet: (name) => `Hello, ${name}!`
 *     }),
 *     Stream.runCollect
 *   )
 * ) // => ["Hello, World!"]
 * ```
 *
 * @category accessors
 * @since 4.0.0
 */
export const serviceOption = <I, S>(service: Context.Key<I, S>): Stream<Option.Option<S>> =>
  fromEffect(Effect.serviceOption(service))

/**
 * Creates a stream that runs the effect and emits no elements.
 *
 * **Example** (Draining an effect into a stream)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * let drained = false
 * await Effect.runPromise(
 *   Stream.fromEffectDrain(Effect.sync(() => {
 *     drained = true
 *   })).pipe(Stream.runDrain)
 * )
 * drained // => true
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export const fromEffectDrain = <A, E, R>(effect: Effect.Effect<A, E, R>): Stream<never, E, R> =>
  fromPull(Effect.succeed(Effect.flatMap(effect, () => Cause.done())))

/**
 * Creates a stream from an effect producing a value of type `A` which repeats forever.
 *
 * **Example** (Repeating an effect forever)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * let n = 0
 * const stream = Stream.fromEffectRepeat(Effect.sync(() => ++n)).pipe(Stream.take(5))
 * await Effect.runPromise(Stream.runCollect(stream)) // => [1, 2, 3, 4, 5]
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export const fromEffectRepeat = <A, E, R>(effect: Effect.Effect<A, E, R>): Stream<A, Pull.ExcludeDone<E>, R> =>
  fromPull(Effect.succeed(Effect.map(effect, Arr.of)))

/**
 * Creates a stream from an effect producing a value of type `A`, which is
 * repeated using the specified schedule.
 *
 * **Example** (Repeating an effect with a schedule)
 *
 * ```ts import.meta.vitest
 * import { Effect, Schedule, Stream } from "effect"
 *
 * const stream = Stream.fromEffectSchedule(Effect.succeed("ping"), Schedule.recurs(2))
 * await Effect.runPromise(Stream.runCollect(stream)) // => ["ping", "ping", "ping"]
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export const fromEffectSchedule = <A, E, R, X, AS extends A, ES, RS>(
  effect: Effect.Effect<A, E, R>,
  schedule: Schedule.Schedule<X, AS, ES, RS>
): Stream<A, E | ES, R | RS> =>
  fromPull(Effect.gen(function*() {
    const step = yield* Schedule.toStepWithMetadata(schedule)
    let s = yield* Effect.provideService(effect, Schedule.CurrentMetadata, Schedule.CurrentMetadata.defaultValue())
    let initial = true
    const pull = Effect.suspend(() => step(s as AS)).pipe(
      Effect.flatMap((meta) => Effect.provideService(effect, Schedule.CurrentMetadata, meta)),
      Effect.map((next) => {
        s = next
        return Arr.of(next)
      })
    ) as Pull.Pull<Arr.NonEmptyReadonlyArray<A>, E | ES, void, R | RS>
    return Effect.suspend(() => {
      if (initial) {
        initial = false
        return Effect.succeed(Arr.of(s))
      }
      return pull
    })
  }))

/**
 * Creates a stream that emits `void` immediately once, then emits another
 * `void` after each specified interval.
 *
 * **Example** (Emitting ticks on an interval)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * await Effect.runPromise(Stream.tick(0).pipe(Stream.take(3), Stream.runCollect)) // => [undefined, undefined, undefined]
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const tick = (interval: Duration.Input): Stream<void> =>
  fromPull(Effect.sync(() => {
    let first = true
    const effect = Effect.succeed(Arr.of<void>(undefined))
    const delayed = Effect.delay(effect, interval)
    return Effect.suspend(() => {
      if (first) {
        first = false
        return effect
      }
      return delayed
    })
  }))

/**
 * Creates a stream from a pull effect, such as one produced by `Stream.toPull`.
 *
 * **Details**
 *
 * A pull effect yields chunks on demand and completes when the upstream stream ends.
 * See `Stream.toPull` for a matching producer.
 *
 * **Example** (Creating a stream from a pull effect)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const program = Effect.scoped(
 *   Effect.gen(function*() {
 *     const source = Stream.make(1, 2, 3)
 *     const pull = yield* Stream.toPull(source)
 *     const stream = Stream.fromPull(Effect.succeed(pull))
 *     return yield* Stream.runCollect(stream)
 *   })
 * )
 *
 * await Effect.runPromise(program) // => [1, 2, 3]
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const fromPull = <A, E, R, EX, RX>(
  pull: Effect.Effect<Pull.Pull<Arr.NonEmptyReadonlyArray<A>, E, void, R>, EX, RX>
): Stream<A, Pull.ExcludeDone<E> | EX, R | RX> => fromChannel(Channel.fromPull(pull))

/**
 * Derives a stream by transforming its pull effect.
 *
 * **Example** (Transforming a pull effect)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const stream = Stream.make(1, 2, 3)
 *
 * const transformed = Stream.transformPull(stream, (pull) => Effect.succeed(pull))
 *
 * await Effect.runPromise(Stream.runCollect(transformed)) // => [1, 2, 3]
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export const transformPull = <A, E, R, B, E2, R2, EX, RX>(
  self: Stream<A, E, R>,
  f: (pull: Pull.Pull<Arr.NonEmptyReadonlyArray<A>, E, void>, scope: Scope.Scope) => Effect.Effect<
    Pull.Pull<Arr.NonEmptyReadonlyArray<B>, E2, void, R2>,
    EX,
    RX
  >
): Stream<B, EX | Pull.ExcludeDone<E2>, R | R2 | RX> =>
  fromChannel(
    Channel.fromTransform((_, scope) =>
      Effect.flatMap(Channel.toPullScoped(self.channel, scope), (pull) => f(pull as any, scope))
    )
  )

/**
 * Transforms a stream by effectfully transforming its pull effect.
 *
 * **Details**
 *
 * A forked scope is also provided to the transformation function, which is
 * closed once the resulting stream has finished processing.
 *
 * **Example** (Transforming a stream by effectfully transforming its pull effect)
 *
 * ```ts import.meta.vitest
 * import { Effect, Scope, Stream } from "effect"
 *
 * const finalized: Array<boolean> = []
 * const stream = Stream.make(1, 2, 3)
 *
 * const transformed = Stream.transformPullBracket(
 *   stream,
 *   (pull, _scope, forkedScope) =>
 *     Effect.gen(function*() {
 *       yield* Scope.addFinalizer(forkedScope, Effect.sync(() => finalized.push(true)))
 *       return pull
 *     })
 * )
 *
 * await Effect.runPromise(Stream.runCollect(transformed)) // => [1, 2, 3]
 * finalized // => [true]
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export const transformPullBracket = <A, E, R, B, E2, R2, EX, RX>(
  self: Stream<A, E, R>,
  f: (
    pull: Pull.Pull<Arr.NonEmptyReadonlyArray<A>, E, void, R>,
    scope: Scope.Scope,
    forkedScope: Scope.Scope
  ) => Effect.Effect<
    Pull.Pull<Arr.NonEmptyReadonlyArray<B>, E2, void, R2>,
    EX,
    RX
  >
): Stream<B, EX | Pull.ExcludeDone<E2>, R | R2 | RX> =>
  fromChannel(
    Channel.fromTransformBracket((_, scope, forkedScope) =>
      Effect.flatMap(Channel.toPullScoped(self.channel, scope), (pull) => f(pull, scope, forkedScope))
    )
  )

/**
 * Creates a channel from a stream.
 *
 * **Example** (Converting a stream to a channel)
 *
 * ```ts import.meta.vitest
 * import { Channel, Effect, Stream } from "effect"
 *
 * const channel = Stream.toChannel(Stream.make(1, 2, 3))
 * const values = await Effect.runPromise(Channel.runCollect(channel))
 * values.flat() // => [1, 2, 3]
 * ```
 *
 * @category destructors
 * @since 2.0.0
 */
export const toChannel = <A, E, R>(
  stream: Stream<A, E, R>
): Channel.Channel<Arr.NonEmptyReadonlyArray<A>, E, void, unknown, unknown, unknown, R> => stream.channel

/**
 * Creates a stream from a callback that can emit values into a queue.
 *
 * **When to use**
 *
 * Use when you need callback-based code to emit stream values by offering to a
 * `Queue`, or signal stream completion through the `Queue` module APIs.
 *
 * By default it uses an "unbounded" buffer size.
 * You can customize the buffer size and strategy by passing an object as the
 * second argument with the `bufferSize` and `strategy` fields.
 *
 * **Example** (Creating a stream from a callback that can emit values into a queue)
 *
 * ```ts import.meta.vitest
 * import { Effect, Queue, Stream } from "effect"
 *
 * const stream = Stream.callback<number>((queue) =>
 *   Effect.sync(() => {
 *     // Emit values to the stream
 *     Queue.offerUnsafe(queue, 1)
 *     Queue.offerUnsafe(queue, 2)
 *     Queue.offerUnsafe(queue, 3)
 *     // Signal completion
 *     Queue.endUnsafe(queue)
 *   })
 * )
 *
 * await Effect.runPromise(Stream.runCollect(stream)) // => [1, 2, 3]
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export const callback = <A, E = never, R = never>(
  f: (queue: Queue.Queue<A, E | Cause.Done>) => Effect.Effect<unknown, E, R | Scope.Scope>,
  options?: {
    readonly bufferSize?: number | undefined
    readonly strategy?: "sliding" | "dropping" | "suspend" | undefined
  }
): Stream<A, E, Exclude<R, Scope.Scope>> => fromChannel(Channel.callbackArray(f, options))

/**
 * Creates an empty stream.
 *
 * **Example** (Creating an empty stream)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * await Effect.runPromise(Stream.runCollect(Stream.empty)) // => []
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const empty: Stream<never> = fromChannel(Channel.empty)

/**
 * Creates a single-valued pure stream.
 *
 * **Example** (Creating a single-valued pure stream)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * await Effect.runPromise(Stream.runCollect(Stream.succeed(3))) // => [3]
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const succeed = <A>(value: A): Stream<A> => fromChannel(Channel.succeed(Arr.of(value)))

/**
 * Creates a stream from a sequence of values.
 *
 * **Example** (Creating a stream from a sequence of values)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const stream = Stream.make(1, 2, 3)
 *
 * await Effect.runPromise(Stream.runCollect(stream)) // => [1, 2, 3]
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const make = <const As extends ReadonlyArray<any>>(...values: As): Stream<As[number]> => fromArray(values)

/**
 * Creates a stream that synchronously evaluates a function and emits the result as a single value.
 *
 * **Details**
 *
 * The function is evaluated each time the stream is run.
 *
 * **Example** (Evaluating a value synchronously)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * await Effect.runPromise(Stream.sync(() => 2 + 1).pipe(Stream.runCollect)) // => [3]
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const sync = <A>(evaluate: LazyArg<A>): Stream<A> => fromChannel(Channel.sync(() => Arr.of(evaluate())))

/**
 * Creates a lazily constructed stream.
 *
 * **Details**
 *
 * The stream factory is evaluated each time the stream is run.
 *
 * **Example** (Creating a lazily constructed stream)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * await Effect.runPromise(Stream.suspend(() => Stream.make(1, 2, 3)).pipe(Stream.runCollect)) // => [1, 2, 3]
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const suspend = <A, E, R>(stream: LazyArg<Stream<A, E, R>>): Stream<A, E, R> =>
  fromChannel(Channel.suspend(() => stream().channel))

/**
 * Terminates with the specified error.
 *
 * **Example** (Failing a stream)
 *
 * ```ts import.meta.vitest
 * import { Effect, Exit, Stream } from "effect"
 *
 * await Effect.runPromise(Effect.exit(Stream.runCollect(Stream.fail("Uh oh!")))) // => Exit.fail("Uh oh!")
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const fail = <E>(error: E): Stream<never, E> => fromChannel(Channel.fail(error))

/**
 * Terminates with the specified lazily evaluated error.
 *
 * **Example** (Failing a stream lazily)
 *
 * ```ts import.meta.vitest
 * import { Effect, Exit, Stream } from "effect"
 *
 * const stream = Stream.failSync(() => "Uh oh!")
 *
 * await Effect.runPromise(Stream.runCollect(stream).pipe(Effect.exit)) // => Exit.fail("Uh oh!")
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const failSync = <E>(evaluate: LazyArg<E>): Stream<never, E> => fromChannel(Channel.failSync(evaluate))

/**
 * Creates a stream that fails with the specified `Cause`.
 *
 * **Example** (Failing with a cause)
 *
 * ```ts import.meta.vitest
 * import { Cause, Effect, Stream } from "effect"
 *
 * const stream = Stream.failCause(Cause.fail("Database connection failed")).pipe(
 *   Stream.catchCause(() => Stream.succeed("recovered"))
 * )
 *
 * await Effect.runPromise(Stream.runCollect(stream)) // => ["recovered"]
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const failCause = <E>(cause: Cause.Cause<E>): Stream<never, E> => fromChannel(Channel.failCause(cause))

/**
 * The stream that dies with the specified defect.
 *
 * **Example** (Dying with a defect)
 *
 * ```ts import.meta.vitest
 * import { Cause, Effect, Exit, Stream } from "effect"
 *
 * const defect = new Error("Boom")
 * const stream = Stream.die(defect)
 *
 * await Effect.runPromise(Effect.exit(Stream.runCollect(stream))) // => Exit.failCause(Cause.die(defect))
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const die = (defect: unknown): Stream<never> => fromChannel(Channel.die(defect))

/**
 * The stream that always fails with the specified lazily evaluated `Cause`.
 *
 * **Example** (Failing with a lazy cause)
 *
 * ```ts import.meta.vitest
 * import { Cause, Effect, Exit, Stream } from "effect"
 *
 * const stream = Stream.failCauseSync(() =>
 *   Cause.fail("Connection timeout after retries")
 * )
 *
 * await Effect.runPromise(Stream.runCollect(stream).pipe(Effect.exit)) // => Exit.fail("Connection timeout after retries")
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const failCauseSync = <E>(evaluate: LazyArg<Cause.Cause<E>>): Stream<never, E> =>
  fromChannel(Channel.failCauseSync(evaluate))

/**
 * Creates a stream that consumes values from an iterator.
 *
 * **Details**
 *
 * The `maxChunkSize` parameter controls how many values are pulled per chunk.
 * Finite fractional values are rounded down, while `NaN` and non-positive
 * values are treated as `1`.
 *
 * **Example** (Consuming values from an iterator)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * function* numbers() {
 *   yield 1
 *   yield 2
 *   yield 3
 * }
 *
 * const stream = Stream.fromIteratorSucceed(numbers())
 *
 * const program = Effect.gen(function* () {
 *   const values = yield* Stream.runCollect(stream)
 *   values // => [1, 2, 3]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const fromIteratorSucceed = <A>(iterator: IterableIterator<A>, maxChunkSize?: number): Stream<A> =>
  fromChannel(Channel.fromIteratorArray(() => iterator, maxChunkSize))

/**
 * Creates a new `Stream` from an iterable collection of values.
 *
 * **Details**
 *
 * - `chunkSize`: Maximum number of values emitted per chunk. Finite fractional
 *   values are rounded down, while `NaN` and non-positive values are treated as
 *   `1`.
 *
 * **Example** (Creating a stream from an iterable)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const numbers = [1, 2, 3]
 *
 * const program = Effect.gen(function*() {
 *   const stream = Stream.fromIterable(numbers)
 *   const values = yield* Stream.runCollect(stream)
 *   values // => [1, 2, 3]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const fromIterable = <A>(
  iterable: Iterable<A>,
  options?: {
    readonly chunkSize?: number | undefined
  }
): Stream<A> =>
  Array.isArray(iterable) && options?.chunkSize === undefined
    ? fromArray(iterable)
    : fromChannel(Channel.fromIterableArray(iterable, options?.chunkSize))

/**
 * Creates a stream from an effect producing an iterable of values.
 *
 * **When to use**
 *
 * Use when the iterable must be acquired from an Effect before the stream emits,
 * and acquisition services or failures should be part of the stream.
 *
 * **Example** (Creating a stream from an iterable effect)
 *
 * ```ts import.meta.vitest
 * import { Context, Effect, Stream } from "effect"
 *
 * class UserRepo extends Context.Service<UserRepo, {
 *   readonly list: Effect.Effect<ReadonlyArray<string>>
 * }>()("UserRepo") {}
 *
 * const listUsers = Effect.service(UserRepo).pipe(
 *   Effect.andThen((repo) => repo.list)
 * )
 *
 * const stream = Stream.fromIterableEffect(listUsers)
 *
 * const program = Effect.gen(function*() {
 *   const users = yield* stream.pipe(
 *     Stream.provideService(UserRepo, {
 *       list: Effect.succeed(["user1", "user2"])
 *     }),
 *     Stream.runCollect
 *   )
 *   users // => ["user1", "user2"]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const fromIterableEffect = <A, E, R>(iterable: Effect.Effect<Iterable<A>, E, R>): Stream<A, E, R> =>
  unwrap(Effect.map(iterable, fromIterable))

/**
 * Creates a stream by repeatedly running an effect that yields an iterable of values.
 *
 * **Example** (Repeating an iterable effect)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const stream = Stream.fromIterableEffectRepeat(Effect.succeed([1, 2])).pipe(
 *     Stream.take(5)
 *   )
 *   const values = yield* Stream.runCollect(stream)
 *   values // => [1, 2, 1, 2, 1]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export const fromIterableEffectRepeat = <A, E, R>(
  iterable: Effect.Effect<Iterable<A>, E, R>
): Stream<A, Pull.ExcludeDone<E>, R> => flatMap(fromEffectRepeat(iterable), fromIterable)

/**
 * Creates a stream from an array of values.
 *
 * **Example** (Creating a stream from an array of values)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const stream = Stream.fromArray([1, 2, 3])
 *   const values = yield* Stream.runCollect(stream)
 *   values // => [1, 2, 3]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export const fromArray = <A>(array: ReadonlyArray<A>): Stream<A> =>
  Arr.isReadonlyArrayNonEmpty(array) ? fromChannel(Channel.succeed(array)) : empty

/**
 * Creates a stream from an effect that produces an array of values.
 *
 * **When to use**
 *
 * Use when the array must be acquired from an Effect before the stream emits,
 * and acquisition services or failures should be part of the stream.
 *
 * **Example** (Creating a stream from an effect that produces an array of values)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const stream = Stream.fromArrayEffect(Effect.succeed(["Ada", "Grace"]))
 *   const values = yield* Stream.runCollect(stream)
 *   values // => ["Ada", "Grace"]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export const fromArrayEffect = <A, E, R>(
  effect: Effect.Effect<ReadonlyArray<A>, E, R>
): Stream<A, Pull.ExcludeDone<E>, R> => unwrap(Effect.map(effect, fromArray)) as any

/**
 * Creates a stream from an arbitrary number of arrays.
 *
 * **Example** (Creating a stream from an arbitrary number of arrays)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const stream = Stream.fromArrays([1, 2], [3, 4])
 *   const values = yield* Stream.runCollect(stream)
 *   values // => [1, 2, 3, 4]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export const fromArrays = <Arr extends ReadonlyArray<ReadonlyArray<any>>>(
  ...arrays: Arr
): Stream<Arr[number][number]> => fromChannel(Channel.fromArray(Arr.filter(arrays, Arr.isReadonlyArrayNonEmpty)))

/**
 * Creates a stream that pulls values from a `Queue.Dequeue`.
 *
 * **Details**
 *
 * The stream emits non-empty batches of queued values and ends when the queue
 * fails with `Cause.Done`; other queue failures are propagated.
 *
 * **Example** (Creating a stream from a queue of values)
 *
 * ```ts import.meta.vitest
 * import { Cause, Effect, Queue, Stream } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const queue = yield* Queue.unbounded<number, Cause.Done>()
 *   yield* Queue.offer(queue, 1)
 *   yield* Queue.offer(queue, 2)
 *   yield* Queue.offer(queue, 3)
 *   yield* Queue.end(queue)
 *
 *   const stream = Stream.fromQueue(queue)
 *   const values = yield* Stream.runCollect(stream)
 *   values // => [1, 2, 3]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const fromQueue = <A, E>(queue: Queue.Dequeue<A, E>): Stream<A, Exclude<E, Cause.Done>> =>
  fromChannel(Channel.fromQueueArray(queue))

/**
 * Creates a stream from a subscription to a `PubSub`.
 *
 * **Example** (Creating a stream from a subscription to a PubSub)
 *
 * ```ts import.meta.vitest
 * import { Effect, Fiber, PubSub, Stream } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const pubsub = yield* PubSub.unbounded<number>({ replay: 3 })
 *
 *   const fiber = yield* Stream.fromPubSub(pubsub).pipe(
 *     Stream.take(3),
 *     Stream.runCollect,
 *     Effect.forkChild
 *   )
 *
 *   yield* PubSub.publish(pubsub, 1)
 *   yield* PubSub.publish(pubsub, 2)
 *   yield* PubSub.publish(pubsub, 3)
 *
 *   const values = yield* Fiber.join(fiber)
 *   values // => [1, 2, 3]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const fromPubSub = <A>(pubsub: PubSub.PubSub<A>): Stream<A> => fromChannel(Channel.fromPubSubArray(pubsub))

/**
 * Creates a stream from a PubSub of `Take` values.
 *
 * **Details**
 *
 * `Take` values include end and failure signals.
 *
 * **Example** (Creating a stream from PubSub takes)
 *
 * ```ts import.meta.vitest
 * import { Effect, Exit, PubSub, Stream, Take } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const pubsub = yield* PubSub.unbounded<Take.Take<number, string>>({
 *     replay: 3
 *   })
 *
 *   yield* PubSub.publish(pubsub, [1])
 *   yield* PubSub.publish(pubsub, [2])
 *   yield* PubSub.publish(pubsub, Exit.succeed<void>(undefined))
 *
 *   const values = yield* Stream.fromPubSubTake(pubsub).pipe(Stream.runCollect)
 *   values // => [1, 2]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export const fromPubSubTake = <A, E>(pubsub: PubSub.PubSub<Take.Take<A, E>>): Stream<A, E> =>
  fromChannel(Channel.fromPubSubTake(pubsub))

/**
 * Creates a stream from a lazily supplied Web `ReadableStream`.
 *
 * **Details**
 *
 * The stream reads from a `ReadableStreamDefaultReader`, maps read failures
 * with `onError`, and closes the reader when the stream finalizes. By default
 * the reader is canceled; set `releaseLockOnEnd` to release the lock instead.
 *
 * **Example** (Creating a stream from a ReadableStream)
 *
 * ```ts import.meta.vitest
 * import { Data, Effect, Stream } from "effect"
 *
 * class StreamError extends Data.TaggedError("StreamError")<{ readonly cause: unknown }> {}
 *
 * const readableStream = new ReadableStream({
 *   start(controller) {
 *     controller.enqueue(1)
 *     controller.enqueue(2)
 *     controller.enqueue(3)
 *     controller.close()
 *   }
 * })
 *
 * const program = Effect.gen(function*() {
 *   const stream = Stream.fromReadableStream({
 *     evaluate: () => readableStream,
 *     onError: (cause) => new StreamError({ cause })
 *   })
 *   const values = yield* Stream.runCollect(stream)
 *   values // => [1, 2, 3]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const fromReadableStream = <A, E>(
  options: {
    readonly evaluate: LazyArg<ReadableStream<A>>
    readonly onError: (error: unknown) => E
    readonly releaseLockOnEnd?: boolean | undefined
  }
): Stream<A, E> => fromChannel(Channel.fromReadableStream(options))

/**
 * Creates a stream from an AsyncIterable.
 *
 * **Example** (Creating a stream from an AsyncIterable)
 *
 * ```ts import.meta.vitest
 * import { Data, Effect, Stream } from "effect"
 *
 * class StreamError extends Data.TaggedError("StreamError")<{ readonly cause: unknown }> {}
 *
 * const iterable = (async function*() {
 *   yield 1
 *   yield 2
 *   yield 3
 * })()
 *
 * await Effect.runPromise(Effect.gen(function*() {
 *   const stream = Stream.fromAsyncIterable(iterable, (cause) => new StreamError({ cause }))
 *   const values = yield* Stream.runCollect(stream)
 *   values // => [1, 2, 3]
 * }))
 *
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const fromAsyncIterable = <A, E>(
  iterable: AsyncIterable<A>,
  onError: (error: unknown) => E
): Stream<A, E> => fromChannel(Channel.fromAsyncIterableArray(iterable, onError))

/**
 * Creates a stream that emits each output of a schedule that does not require input,
 * for as long as the schedule continues.
 *
 * **Example** (Creating a stream from a schedule)
 *
 * ```ts import.meta.vitest
 * import { Effect, Schedule, Stream } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const schedule = Schedule.recurs(3)
 *   const stream = Stream.fromSchedule(schedule)
 *   const values = yield* Stream.runCollect(stream)
 *   values // => [0, 1, 2]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const fromSchedule = <O, E, R>(schedule: Schedule.Schedule<O, unknown, E, R>): Stream<O, E, R> =>
  fromPull(
    Effect.map(
      Schedule.toStepWithSleep(schedule),
      (step) => Pull.catchDone(Effect.map(step(void 0), Arr.of), () => Cause.done())
    )
  )

/**
 * Creates a stream from a PubSub subscription.
 *
 * **When to use**
 *
 * Use when you already have a `PubSub.Subscription` and want to expose its
 * messages as a `Stream`, with `Stream.take` or cancellation controlling how
 * many values are consumed.
 *
 * **Example** (Creating a stream from a PubSub subscription)
 *
 * ```ts import.meta.vitest
 * import { Effect, PubSub, Stream } from "effect"
 *
 * const program = Effect.scoped(Effect.gen(function*() {
 *   const pubsub = yield* PubSub.unbounded<number>()
 *   const subscription = yield* PubSub.subscribe(pubsub)
 *
 *   yield* PubSub.publish(pubsub, 1)
 *   yield* PubSub.publish(pubsub, 2)
 *
 *   const stream = Stream.fromSubscription(subscription)
 *   const values = yield* stream.pipe(Stream.take(2), Stream.runCollect)
 *   values // => [1, 2]
 * }))
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export const fromSubscription = <A>(pubsub: PubSub.Subscription<A>): Stream<A> =>
  fromChannel(Channel.fromSubscriptionArray(pubsub))

/**
 * Interface representing an event listener target.
 *
 * @category models
 * @since 3.4.0
 */
export interface EventListener<A = unknown> {
  addEventListener(
    event: string,
    f: (event: A) => void,
    options?: {
      readonly capture?: boolean
      readonly passive?: boolean
      readonly once?: boolean
      readonly signal?: AbortSignal
    } | boolean
  ): void
  removeEventListener(
    event: string,
    f: (event: A) => void,
    options?: {
      readonly capture?: boolean
    } | boolean
  ): void
}

/**
 * Creates a stream from an event listener.
 *
 * **Example** (Creating a stream from an event listener)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * class NumberTarget implements Stream.EventListener<number> {
 *   addEventListener(event: string, f: (event: number) => void) {
 *     if (event === "data") {
 *       f(1)
 *       f(2)
 *       f(3)
 *     }
 *   }
 *   removeEventListener(_event: string, _f: (event: number) => void) {}
 * }
 *
 * await Effect.runPromise(Effect.gen(function*() {
 *   const stream = Stream.fromEventListener(new NumberTarget(), "data").pipe(
 *     Stream.take(3)
 *   )
 *   const values = yield* Stream.runCollect(stream)
 *   values // => [1, 2, 3]
 * }))
 *
 * ```
 *
 * @category constructors
 * @since 3.1.0
 */
export const fromEventListener = <A = unknown>(
  target: EventListener,
  type: string,
  options?: boolean | {
    readonly capture?: boolean
    readonly passive?: boolean
    readonly once?: boolean
    readonly bufferSize?: number | undefined
  } | undefined
): Stream<A> =>
  callback<A>((queue) => {
    const once = typeof options === "object" && options.once

    function emit(event: any) {
      Queue.offerUnsafe(queue, event)
      if (once) Queue.endUnsafe(queue)
    }
    return Effect.acquireRelease(
      Effect.sync(() => target.addEventListener(type, emit, options)),
      () => Effect.sync(() => target.removeEventListener(type, emit, options))
    )
  }, { bufferSize: typeof options === "object" ? options.bufferSize : undefined })

/**
 * Creates a stream by repeatedly applying an effectful step function to a
 * state.
 *
 * **Details**
 *
 * Each `readonly [value, nextState]` result emits `value` and continues with
 * `nextState`; returning `undefined` ends the stream.
 *
 * **Example** (Unfolding stream state)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const stream = Stream.unfold(1, (n) => Effect.succeed([n, n + 1] as const))
 *   const values = yield* Stream.runCollect(stream.pipe(Stream.take(5)))
 *   values // => [ 1, 2, 3, 4, 5 ]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const unfold = <S, A, E, R>(
  s: S,
  f: (s: S) => Effect.Effect<readonly [A, S] | undefined, E, R>
): Stream<A, E, R> =>
  fromPull(Effect.sync(() => {
    let state = s
    return Effect.flatMap(Effect.suspend(() => f(state)), (next) => {
      if (next === undefined) return Cause.done()
      state = next[1]
      return Effect.succeed(Arr.of(next[0]))
    })
  }))

/**
 * Creates a stream by repeatedly evaluating an effectful page function.
 *
 * **When to use**
 *
 * Use to consume paginated APIs where each step returns a batch of values
 * together with an optional next state.
 *
 * **Details**
 *
 * This is similar to {@link unfold}, but each step can emit zero or more values
 * and independently decide whether another state should be requested.
 *
 * **Example** (Paginating stream state)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option, Stream } from "effect"
 *
 * const stream = Stream.paginate(0, (n: number) =>
 *   Effect.succeed(
 *     [
 *       [n],
 *       n < 3 ? Option.some(n + 1) : Option.none<number>()
 *     ] as const
 *   ))
 *
 * await Effect.runPromise(Stream.runCollect(stream)) // => [0, 1, 2, 3]
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const paginate = <S, A, E = never, R = never>(
  s: S,
  f: (
    s: S
  ) => Effect.Effect<readonly [ReadonlyArray<A>, Option.Option<S>], E, R>
): Stream<A, E, R> =>
  fromPull(Effect.sync(() => {
    let state = s
    let done = false
    return Effect.suspend(function loop(): Pull.Pull<Arr.NonEmptyReadonlyArray<A>, E, void, R> {
      if (done) return Cause.done()
      return Effect.flatMap(f(state), ([a, s]) => {
        if (Option.isNone(s)) {
          done = true
        } else {
          state = s.value
        }
        if (!Arr.isReadonlyArrayNonEmpty(a)) return loop()
        return Effect.succeed(a)
      })
    })
  }))

/**
 * Creates an infinite stream by repeatedly applying a function to a seed value.
 *
 * **Example** (Iterating from a seed value)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const stream = Stream.iterate(1, (n) => n + 1).pipe(Stream.take(3))
 *
 * const program = Effect.gen(function* () {
 *   const values = yield* Stream.runCollect(stream)
 *   values // => [ 1, 2, 3 ]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const iterate = <A>(value: A, next: (value: A) => A): Stream<A> =>
  unfold(value, (a) => Effect.succeed([a, next(a)]))

/**
 * Constructs a stream from a range of integers, including both endpoints.
 *
 * **Details**
 *
 * If the provided `min` is greater than `max`, the stream will not emit any
 * values. Finite fractional `chunkSize` values are rounded down, while `NaN`
 * and non-positive values are treated as `1`.
 *
 * **Example** (Creating a numeric range)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const values = yield* Stream.range(1, 5).pipe(Stream.runCollect)
 *   values // => [ 1, 2, 3, 4, 5 ]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const range = (
  min: number,
  max: number,
  chunkSize = Channel.DefaultChunkSize
): Stream<number> =>
  min > max ? empty : fromPull(Effect.sync(() => {
    const size = Count.normalizeNonEmpty(chunkSize)
    let start = min
    let done = false
    return Effect.suspend(() => {
      if (done) return Cause.done()
      const remaining = max - start + 1
      if (remaining > size) {
        const chunk = Arr.range(start, start + size - 1)
        start += size
        return Effect.succeed(chunk)
      }
      const chunk = Arr.range(start, start + remaining - 1)
      done = true
      return Effect.succeed(chunk)
    })
  }))

/**
 * The stream that never produces any value or fails with any error.
 *
 * **Example** (Creating a never-ending stream)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const program = Stream.never.pipe(
 *   Stream.take(0),
 *   Stream.runCollect
 * )
 *
 * await Effect.runPromise(program) // => []
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const never: Stream<never> = fromChannel(Channel.never)

/**
 * Creates a stream produced from an `Effect`.
 *
 * **Example** (Unwrapping a stream effect)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const effect = Effect.succeed(Stream.make(1, 2, 3))
 *
 * const stream = Stream.unwrap(effect)
 *
 * const program = Effect.gen(function*() {
 *   const chunk = yield* Stream.runCollect(stream)
 *   chunk // => [ 1, 2, 3 ]
 * })
 * await Effect.runPromise(program)
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const unwrap = <A, E2, R2, E, R>(
  effect: Effect.Effect<Stream<A, E2, R2>, E, R>
): Stream<A, E | E2, R2 | Exclude<R, Scope.Scope>> => fromChannel(Channel.unwrap(Effect.map(effect, toChannel)))

/**
 * Runs a stream that requires `Scope` in a managed scope, ensuring its
 * finalizers are run when the stream completes.
 *
 * **Example** (Scoping a stream)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const events: Array<string> = []
 * const stream = Stream.scoped(
 *   Stream.fromEffect(
 *     Effect.acquireRelease(
 *       Effect.sync(() => {
 *         events.push("acquire")
 *         return "resource"
 *       }),
 *       () => Effect.sync(() => events.push("release"))
 *     )
 *   )
 * )
 *
 * await Effect.runPromise(Stream.runCollect(stream)) // => ["resource"]
 * events // => ["acquire", "release"]
 * ```
 *
 * @category resource management
 * @since 2.0.0
 */
export const scoped = <A, E, R>(
  self: Stream<A, E, R>
): Stream<A, E, Exclude<R, Scope.Scope>> => fromChannel(Channel.scoped(self.channel))

/**
 * Transforms the elements of this stream using the supplied function.
 *
 * **Example** (Mapping stream values)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option, Stream } from "effect"
 *
 * const stream = Stream.fromArray([1, 2, 3]).pipe(Stream.map((n, i) => n + i))
 * await Effect.runPromise(Stream.runCollect(stream)) // => [1, 3, 5]
 * ```
 *
 * @category mapping
 * @since 2.0.0
 */
export const map: {
  <A, B>(f: (a: A, i: number) => B): <E, R>(self: Stream<A, E, R>) => Stream<B, E, R>
  <A, E, R, B>(self: Stream<A, E, R>, f: (a: A, i: number) => B): Stream<B, E, R>
} = dual(2, <A, E, R, B>(self: Stream<A, E, R>, f: (a: A, i: number) => B): Stream<B, E, R> =>
  suspend(() => {
    let i = 0
    return fromChannel(Channel.map(
      self.channel,
      Arr.map((o) => f(o, i++))
    ))
  }))

/**
 * Replaces every element of the stream with the provided constant value.
 *
 * **Example** (Replacing stream elements)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const values = yield* Stream.make(1, 2, 3).pipe(
 *     Stream.as("x"),
 *     Stream.runCollect
 *   )
 *   values // => [ 'x', 'x', 'x' ]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @see {@link map} for deriving the replacement value from each element
 *
 * @category mapping
 * @since 4.0.0
 */
export const as: {
  <B>(value: B): <A, E, R>(self: Stream<A, E, R>) => Stream<B, E, R>
  <A, E, R, B>(self: Stream<A, E, R>, value: B): Stream<B, E, R>
} = dual(2, <A, E, R, B>(self: Stream<A, E, R>, value: B): Stream<B, E, R> => map(self, () => value))

/**
 * Maps both the failure and success channels of a stream.
 *
 * **Example** (Mapping both the failure and success channels of a stream)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const mapper = {
 *   onElement: (value: number) => value * 2,
 *   onError: (error: string) => `error: ${error}`
 * }
 *
 * const program = Effect.gen(function*() {
 *   const success = yield* Stream.make(1, 2).pipe(
 *     Stream.mapBoth(mapper),
 *     Stream.runCollect
 *   )
 *   success // => [ 2, 4 ]
 *
 *   const failure = yield* Stream.fail("boom").pipe(
 *     Stream.mapBoth(mapper),
 *     Stream.catch((error: string) => Stream.succeed(error)),
 *     Stream.runCollect
 *   )
 *   failure // => [ 'error: boom' ]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category mapping
 * @since 2.0.0
 */
export const mapBoth: {
  <A, A2, E, E2>(
    options: { readonly onElement: (a: A) => A2; readonly onError: (e: E) => E2 }
  ): <R>(self: Stream<A, E, R>) => Stream<A2, E2, R>
  <A, E, R, A2, E2>(
    self: Stream<A, E, R>,
    options: { readonly onElement: (a: A) => A2; readonly onError: (e: E) => E2 }
  ): Stream<A2, E2, R>
} = dual(2, <A, E, R, A2, E2>(
  self: Stream<A, E, R>,
  options: { readonly onElement: (a: A) => A2; readonly onError: (e: E) => E2 }
): Stream<A2, E2, R> =>
  self.pipe(
    map(options.onElement),
    mapError(options.onError)
  ))

/**
 * Transforms each emitted chunk using the provided function, which receives the chunk and its index.
 *
 * **Example** (Mapping stream chunks)
 *
 * ```ts import.meta.vitest
 * import { Array, Effect, Stream } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const result = yield* Stream.make(1, 2, 3, 4).pipe(
 *     Stream.rechunk(2),
 *     Stream.mapArray((chunk, index) => Array.map(chunk, (n) => n + index)),
 *     Stream.runCollect
 *   )
 *   result // => [ 1, 2, 4, 5 ]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category mapping
 * @since 4.0.0
 */
export const mapArray: {
  <A, B>(
    f: (a: Arr.NonEmptyReadonlyArray<A>, i: number) => Arr.NonEmptyReadonlyArray<B>
  ): <E, R>(self: Stream<A, E, R>) => Stream<B, E, R>
  <A, E, R, B>(
    self: Stream<A, E, R>,
    f: (a: Arr.NonEmptyReadonlyArray<A>, i: number) => Arr.NonEmptyReadonlyArray<B>
  ): Stream<B, E, R>
} = dual(2, <A, E, R, B>(
  self: Stream<A, E, R>,
  f: (a: Arr.NonEmptyReadonlyArray<A>, i: number) => Arr.NonEmptyReadonlyArray<B>
): Stream<B, E, R> => fromChannel(Channel.map(self.channel, f)))

/**
 * Maps over elements of the stream with the specified effectful function.
 *
 * **When to use**
 *
 * Use when each stream element transformation needs an Effect, service
 * dependency, failure channel, or configured concurrency.
 *
 * **Example** (Effectfully mapping stream values)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const events: Array<string> = []
 * const stream = Stream.make(1, 2, 3)
 *
 * const mappedStream = stream.pipe(
 *   Stream.mapEffect((n) =>
 *     Effect.sync(() => {
 *       events.push(`Processing: ${n}`)
 *       return n * 2
 *     })
 *   )
 * )
 *
 * const program = Effect.gen(function*() {
 *   const result = yield* Stream.runCollect(mappedStream)
 *   result // => [2, 4, 6]
 * })
 *
 * await Effect.runPromise(program)
 * events // => ["Processing: 1", "Processing: 2", "Processing: 3"]
 * ```
 *
 * @category mapping
 * @since 2.0.0
 */
export const mapEffect: {
  <A, A2, E2, R2>(
    f: (a: A, i: number) => Effect.Effect<A2, E2, R2>,
    options?: {
      readonly concurrency?: Concurrency | undefined
      readonly unordered?: boolean | undefined
    } | undefined
  ): <E, R>(self: Stream<A, E, R>) => Stream<A2, E2 | E, R2 | R>
  <A, E, R, A2, E2, R2>(
    self: Stream<A, E, R>,
    f: (a: A, i: number) => Effect.Effect<A2, E2, R2>,
    options?: {
      readonly concurrency?: Concurrency | undefined
      readonly unordered?: boolean | undefined
    } | undefined
  ): Stream<A2, E | E2, R | R2>
} = dual((args) => isStream(args[0]), <A, E, R, A2, E2, R2>(
  self: Stream<A, E, R>,
  f: (a: A, i: number) => Effect.Effect<A2, E2, R2>,
  options?: {
    readonly concurrency?: Concurrency | undefined
    readonly unordered?: boolean | undefined
  } | undefined
): Stream<A2, E | E2, R | R2> =>
  self.channel.pipe(
    Channel.flattenArray,
    Channel.mapEffect(f, options),
    Channel.map(Arr.of),
    fromChannel
  ))

/**
 * Flattens a stream of `Effect` values into a stream of their results.
 *
 * **When to use**
 *
 * Use when stream elements already are effects and their successes should become
 * stream elements while their failures enter the stream error channel.
 *
 * **Example** (Flattening a stream of Effect values into a stream of their results)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const stream = Stream.make(Effect.succeed(1), Effect.succeed(2), Effect.succeed(3))
 *
 * const program = Effect.gen(function*() {
 *   const result = yield* Stream.runCollect(stream.pipe(Stream.flattenEffect()))
 *   result // => [ 1, 2, 3 ]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category sequencing
 * @since 2.0.0
 */
export const flattenEffect: <
  Arg extends Stream<Effect.Effect<any, any, any>, any, any> | {
    readonly concurrency?: Concurrency | undefined
    readonly unordered?: boolean | undefined
  } | undefined = {
    readonly concurrency?: Concurrency | undefined
    readonly unordered?: boolean | undefined
  }
>(
  selfOrOptions?: Arg,
  options?: {
    readonly concurrency?: Concurrency | undefined
    readonly unordered?: boolean | undefined
  } | undefined
) => [Arg] extends [Stream<Effect.Effect<infer _A, infer _EX, infer _RX>, infer _E, infer _R>] ?
  Stream<_A, _EX | _E, _RX | _R>
  : <A, EX, RX, E, R>(self: Stream<Effect.Effect<A, EX, RX>, E, R>) => Stream<A, EX | E, RX | R> = dual(
    (args) => isStream(args[0]),
    <A, E, R, EX, RX>(
      self: Stream<Effect.Effect<A, EX, RX>, E, R>,
      options?: {
        readonly concurrency?: Concurrency | undefined
        readonly unordered?: boolean | undefined
      } | undefined
    ): Stream<A, EX | E, RX | R> => mapEffect(self, identity, options)
  )

/**
 * Maps over non-empty array chunks emitted by the stream effectfully.
 *
 * **When to use**
 *
 * Use when transformation needs to see and replace each non-empty emitted chunk
 * effectfully instead of mapping individual stream elements.
 *
 * **Example** (Effectfully mapping stream chunks)
 *
 * ```ts import.meta.vitest
 * import { Array, Effect, Stream } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const result = yield* Stream.fromArray([1, 2, 3, 4]).pipe(
 *     Stream.rechunk(2),
 *     Stream.mapArrayEffect((chunk, index) =>
 *       Effect.succeed(Array.map(chunk, (n) => n + index * 10))
 *     ),
 *     Stream.runCollect
 *   )
 *   result // => [ 1, 2, 13, 14 ]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category mapping
 * @since 4.0.0
 */
export const mapArrayEffect: {
  <A, B, E2, R2>(
    f: (a: Arr.NonEmptyReadonlyArray<A>, i: number) => Effect.Effect<Arr.NonEmptyReadonlyArray<B>, E2, R2>
  ): <E, R>(self: Stream<A, E, R>) => Stream<B, E | E2, R | R2>
  <A, E, R, B, E2, R2>(
    self: Stream<A, E, R>,
    f: (a: Arr.NonEmptyReadonlyArray<A>, i: number) => Effect.Effect<Arr.NonEmptyReadonlyArray<B>, E2, R2>
  ): Stream<B, E | E2, R | R2>
} = dual(2, <A, E, R, B, E2, R2>(
  self: Stream<A, E, R>,
  f: (a: Arr.NonEmptyReadonlyArray<A>, i: number) => Effect.Effect<Arr.NonEmptyReadonlyArray<B>, E2, R2>
): Stream<B, E | E2, R | R2> => fromChannel(Channel.mapEffect(self.channel, f)))

/**
 * Lifts failures and successes into a `Result`, yielding a stream that cannot fail.
 *
 * **Details**
 *
 * The stream ends after the first failure, emitting a `Result.fail` value.
 *
 * **Example** (Converting failures to results)
 *
 * ```ts import.meta.vitest
 * import { Effect, Result, Stream } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const results = yield* Stream.make(1, 2).pipe(
 *     Stream.concat(Stream.fail("boom")),
 *     Stream.result,
 *     Stream.map(Result.match({
 *       onFailure: (error) => `failure: ${error}`,
 *       onSuccess: (value) => `success: ${value}`
 *     })),
 *     Stream.runCollect
 *   )
 *   results // => [ 'success: 1', 'success: 2', 'failure: boom' ]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category error handling
 * @since 4.0.0
 */
export const result = <A, E, R>(self: Stream<A, E, R>): Stream<Result.Result<A, E>, never, R> =>
  self.pipe(
    map(Result.succeed),
    catch_((e) => succeed(Result.fail(e)))
  )

/**
 * Runs the provided effect for each element while preserving the elements.
 *
 * **Example** (Tapping stream values)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const events: Array<string> = []
 * const program = Effect.gen(function*() {
 *   const result = yield* Stream.fromArray([1, 2, 3]).pipe(
 *     Stream.tap((n) => Effect.sync(() => events.push(`before mapping: ${n}`))),
 *     Stream.map((n) => n * 2),
 *     Stream.tap((n) => Effect.sync(() => events.push(`after mapping: ${n}`))),
 *     Stream.runCollect
 *   )
 *
 *   result // => [2, 4, 6]
 * })
 *
 * await Effect.runPromise(program)
 * events // => ["before mapping: 1", "after mapping: 2", "before mapping: 2", "after mapping: 4", "before mapping: 3", "after mapping: 6"]
 * ```
 *
 * @category sequencing
 * @since 2.0.0
 */
export const tap: {
  <A, X, E2, R2>(
    f: (a: NoInfer<A>) => Effect.Effect<X, E2, R2>,
    options?: {
      readonly concurrency?: Concurrency | undefined
    } | undefined
  ): <E, R>(self: Stream<A, E, R>) => Stream<A, E2 | E, R2 | R>
  <A, E, R, X, E2, R2>(
    self: Stream<A, E, R>,
    f: (a: NoInfer<A>) => Effect.Effect<X, E2, R2>,
    options?: {
      readonly concurrency?: Concurrency | undefined
    } | undefined
  ): Stream<A, E | E2, R | R2>
} = dual((args) => isStream(args[0]), <A, E, R, X, E2, R2>(
  self: Stream<A, E, R>,
  f: (a: NoInfer<A>) => Effect.Effect<X, E2, R2>,
  options?: {
    readonly concurrency?: Concurrency | undefined
  } | undefined
): Stream<A, E | E2, R | R2> =>
  mapEffect(
    self,
    (a) => Effect.as(f(a), a),
    options
  ))

/**
 * Returns a stream that effectfully "peeks" at elements and failures.
 *
 * **Example** (Tapping values and errors)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const events: Array<string> = []
 * const program = Effect.gen(function*() {
 *   const stream = Stream.make(1, 2).pipe(
 *     Stream.concat(Stream.fail("boom")),
 *     Stream.tapBoth({
 *       onElement: (value) => Effect.sync(() => events.push(`seen: ${value}`)),
 *       onError: (error) => Effect.sync(() => events.push(`error: ${error}`))
 *     }),
 *     Stream.catch(() => Stream.make(3))
 *   )
 *   const result = yield* Stream.runCollect(stream)
 *   result // => [1, 2, 3]
 * })
 *
 * await Effect.runPromise(program)
 * events // => ["seen: 1", "seen: 2", "error: boom"]
 * ```
 *
 * @category sequencing
 * @since 2.0.0
 */
export const tapBoth: {
  <A, E, X, E2, R2, Y, E3, R3>(
    options: {
      readonly onElement: (a: NoInfer<A>) => Effect.Effect<X, E2, R2>
      readonly onError: (a: NoInfer<E>) => Effect.Effect<Y, E3, R3>
      readonly concurrency?: Concurrency | undefined
    }
  ): <R>(self: Stream<A, E, R>) => Stream<A, E | E2 | E3, R | R2 | R3>
  <A, E, R, X, E2, R2, Y, E3, R3>(
    self: Stream<A, E, R>,
    options: {
      readonly onElement: (a: NoInfer<A>) => Effect.Effect<X, E2, R2>
      readonly onError: (a: NoInfer<E>) => Effect.Effect<Y, E3, R3>
      readonly concurrency?: Concurrency | undefined
    }
  ): Stream<A, E | E2 | E3, R | R2 | R3>
} = dual(2, <A, E, R, X, E2, R2, Y, E3, R3>(
  self: Stream<A, E, R>,
  options: {
    readonly onElement: (a: NoInfer<A>) => Effect.Effect<X, E2, R2>
    readonly onError: (a: NoInfer<E>) => Effect.Effect<Y, E3, R3>
    readonly concurrency?: Concurrency | undefined
  }
): Stream<A, E | E2 | E3, R | R2 | R3> =>
  self.pipe(
    tapError(options.onError),
    tap(options.onElement, { concurrency: options.concurrency })
  ))

/**
 * Runs a sink for all stream elements while still emitting them downstream.
 *
 * **Example** (Tapping values with a sink)
 *
 * ```ts import.meta.vitest
 * import { Effect, Ref, Sink, Stream } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const seen = yield* Ref.make<Array<number>>([])
 *   const sink = Sink.forEach((value: number) =>
 *     Ref.update(seen, (items) => [...items, value])
 *   )
 *   const result = yield* Stream.make(1, 2, 3).pipe(
 *     Stream.tapSink(sink),
 *     Stream.runCollect
 *   )
 *   const tapped = yield* Ref.get(seen)
 *   tapped // => [ 1, 2, 3 ]
 *   result // => [ 1, 2, 3 ]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category sequencing
 * @since 2.0.0
 */
export const tapSink: {
  <A, E2, R2>(sink: Sink.Sink<unknown, A, unknown, E2, R2>): <E, R>(self: Stream<A, E, R>) => Stream<A, E2 | E, R2 | R>
  <A, E, R, E2, R2>(self: Stream<A, E, R>, sink: Sink.Sink<unknown, A, unknown, E2, R2>): Stream<A, E | E2, R | R2>
} = dual(
  2,
  <A, E, R, E2, R2>(
    self: Stream<A, E, R>,
    sink: Sink.Sink<unknown, A, unknown, E2, R2>
  ): Stream<A, E | E2, R | R2> =>
    transformPullBracket(
      self,
      Effect.fnUntraced(function*(pull, _, scope) {
        const upstreamLatch = Latch.makeUnsafe()
        const sinkLatch = Latch.makeUnsafe()
        let chunk: Arr.NonEmptyReadonlyArray<A> | undefined = undefined
        let causeSink: Cause.Cause<E2> | undefined = undefined
        let sinkDone = false
        let streamDone = false

        const sinkUpstream = upstreamLatch.whenOpen(Effect.suspend(() => {
          if (chunk) {
            const arr = chunk!
            chunk = undefined
            if (!streamDone) upstreamLatch.closeUnsafe()
            return Effect.as(sinkLatch.open, arr)
          }
          return Cause.done()
        }))

        yield* Effect.suspend(() => sink.transform(sinkUpstream, scope)).pipe(
          (eff) =>
            Effect.onExitPrimitive(eff, (exit) => {
              sinkDone = true
              if (Exit.isFailure(exit)) {
                causeSink = exit.cause
              }
              return sinkLatch.open
            }, true),
          Effect.forkIn(scope)
        )

        const pullAndOffer = pull.pipe(
          Effect.flatMap((chunk_) => {
            chunk = chunk_
            sinkLatch.closeUnsafe()
            upstreamLatch.openUnsafe()
            return Effect.as(sinkLatch.await, chunk_)
          }),
          Pull.catchDone(() => {
            streamDone = true
            sinkLatch.closeUnsafe()
            upstreamLatch.openUnsafe()
            return Effect.flatMap(sinkLatch.await, () => Cause.done())
          })
        )

        return Effect.suspend((): Pull.Pull<Arr.NonEmptyReadonlyArray<A>, E | E2, void, R> => {
          if (causeSink) {
            return Effect.failCause(causeSink)
          } else if (sinkDone) {
            return pull
          }
          return pullAndOffer
        })
      })
    )
)

/**
 * Maps each element to a stream and flattens the resulting streams.
 *
 * **Details**
 *
 * With the default sequential concurrency, inner streams are concatenated in
 * input order. When `concurrency` is greater than `1` or `"unbounded"`,
 * multiple inner streams may run at the same time and their outputs are merged
 * as they arrive.
 *
 * **Example** (Flat mapping stream values)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const values = yield* Stream.make(1, 2, 3).pipe(
 *     Stream.flatMap((n) => Stream.make(n, n * 2)),
 *     Stream.runCollect
 *   )
 *   values // => [ 1, 2, 2, 4, 3, 6 ]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category sequencing
 * @since 2.0.0
 */
export const flatMap: {
  <A, A2, E2, R2>(
    f: (a: A) => Stream<A2, E2, R2>,
    options?: {
      readonly concurrency?: Concurrency | undefined
      readonly bufferSize?: number | undefined
    } | undefined
  ): <E, R>(self: Stream<A, E, R>) => Stream<A2, E2 | E, R2 | R>
  <A, E, R, A2, E2, R2>(
    self: Stream<A, E, R>,
    f: (a: A) => Stream<A2, E2, R2>,
    options?: {
      readonly concurrency?: Concurrency | undefined
      readonly bufferSize?: number | undefined
    } | undefined
  ): Stream<A2, E | E2, R | R2>
} = dual((args) => isStream(args[0]), <A, E, R, A2, E2, R2>(
  self: Stream<A, E, R>,
  f: (a: A) => Stream<A2, E2, R2>,
  options?: {
    readonly concurrency?: Concurrency | undefined
    readonly bufferSize?: number | undefined
  } | undefined
): Stream<A2, E | E2, R | R2> =>
  self.channel.pipe(
    Channel.flattenArray,
    Channel.flatMap((a) => f(a).channel, options),
    fromChannel
  ))

/**
 * Switches to the latest stream produced by the mapping function, interrupting
 * the previous stream when a new element arrives.
 *
 * **Example** (Switching to the latest stream)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const program = Stream.make(1, 2, 3).pipe(
 *   Stream.switchMap((n) => (n === 3 ? Stream.make(n) : Stream.never)),
 *   Stream.runCollect
 * )
 *
 * await Effect.runPromise(Effect.gen(function*() {
 *   const result = yield* program
 *   result // => [ 3 ]
 * }))
 * ```
 *
 * @category sequencing
 * @since 4.0.0
 */
export const switchMap: {
  <A, A2, E2, R2>(
    f: (a: A) => Stream<A2, E2, R2>,
    options?: {
      readonly concurrency?: Concurrency | undefined
      readonly bufferSize?: number | undefined
    } | undefined
  ): <E, R>(self: Stream<A, E, R>) => Stream<A2, E2 | E, R2 | R>
  <A, E, R, A2, E2, R2>(
    self: Stream<A, E, R>,
    f: (a: A) => Stream<A2, E2, R2>,
    options?: {
      readonly concurrency?: Concurrency | undefined
      readonly bufferSize?: number | undefined
    } | undefined
  ): Stream<A2, E | E2, R | R2>
} = dual((args) => isStream(args[0]), <A, E, R, A2, E2, R2>(
  self: Stream<A, E, R>,
  f: (a: A) => Stream<A2, E2, R2>,
  options?: {
    readonly concurrency?: Concurrency | undefined
    readonly bufferSize?: number | undefined
  } | undefined
): Stream<A2, E | E2, R | R2> =>
  self.channel.pipe(
    Channel.flattenArray,
    Channel.switchMap((a) => f(a).channel, options),
    fromChannel
  ))

/**
 * Flattens a stream of streams into a single stream.
 *
 * **Details**
 *
 * With the default sequential concurrency, inner streams are concatenated in
 * strict order. When `concurrency` is greater than `1` or `"unbounded"`,
 * multiple inner streams may run at the same time and their outputs are merged
 * as they arrive.
 *
 * **Example** (Flattening nested streams)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const streamOfStreams = Stream.make(
 *   Stream.make(1, 2),
 *   Stream.make(3, 4),
 *   Stream.make(5, 6)
 * )
 *
 * const program = Effect.gen(function*() {
 *   const values = yield* Stream.runCollect(Stream.flatten(streamOfStreams))
 *   values // => [ 1, 2, 3, 4, 5, 6 ]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category sequencing
 * @since 2.0.0
 */
export const flatten: <
  Arg extends Stream<Stream<any, any, any>, any, any> | {
    readonly concurrency?: Concurrency | undefined
    readonly bufferSize?: number | undefined
  } | undefined = {
    readonly concurrency?: Concurrency | undefined
    readonly bufferSize?: number | undefined
  }
>(
  selfOrOptions?: Arg,
  options?: {
    readonly concurrency?: Concurrency | undefined
    readonly bufferSize?: number | undefined
  } | undefined
) => [Arg] extends [Stream<Stream<infer _A, infer _E, infer _R>, infer _E2, infer _R2>] ? Stream<_A, _E | _E2, _R | _R2>
  : <A, E, R, E2, R2>(self: Stream<Stream<A, E, R>, E2, R2>) => Stream<A, E | E2, R | R2> = dual(
    (args) => isStream(args[0]),
    <A, E, R, E2, R2>(
      self: Stream<Stream<A, E, R>, E2, R2>,
      options?: {
        readonly concurrency?: Concurrency | undefined
        readonly bufferSize?: number | undefined
      } | undefined
    ): Stream<A, E | E2, R | R2> => flatMap(self, identity, options)
  )

/**
 * Flattens a stream of non-empty arrays into a stream of elements.
 *
 * **Example** (Flattening a stream of non-empty arrays into a stream of elements)
 *
 * ```ts import.meta.vitest
 * import { Array, Effect, Stream } from "effect"
 *
 * const stream = Stream.make(Array.make(1, 2), Array.make(3))
 *
 * const program = Effect.gen(function* () {
 *   const result = yield* Stream.runCollect(Stream.flattenArray(stream))
 *   result // => [ 1, 2, 3 ]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category sequencing
 * @since 4.0.0
 */
export const flattenArray = <A, E, R>(self: Stream<Arr.NonEmptyReadonlyArray<A>, E, R>): Stream<A, E, R> =>
  fromChannel(Channel.flattenArray(self.channel))

/**
 * Converts this stream to one that runs its effects but emits no elements.
 *
 * **Example** (Draining stream values)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const result = yield* Stream.range(1, 6).pipe(Stream.drain, Stream.runCollect)
 *   result // => []
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category sequencing
 * @since 2.0.0
 */
export const drain = <A, E, R>(self: Stream<A, E, R>): Stream<never, E, R> => fromChannel(Channel.drain(self.channel))

/**
 * Runs the provided stream in the background while this stream runs, interrupting it
 * when this stream completes and failing if the background stream fails or defects.
 *
 * **Example** (Draining a stream in the background)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const events: Array<string> = []
 * const foreground = Stream.make(1, 2)
 * const background = Stream.fromEffect(Effect.sync(() => events.push("background task")))
 *
 * const program = Effect.gen(function*() {
 *   const values = yield* foreground.pipe(
 *     Stream.drainFork(background),
 *     Stream.runCollect
 *   )
 *   values // => [1, 2]
 * })
 *
 * await Effect.runPromise(program)
 * events // => ["background task"]
 * ```
 *
 * @category sequencing
 * @since 2.0.0
 */
export const drainFork: {
  <A2, E2, R2>(that: Stream<A2, E2, R2>): <A, E, R>(self: Stream<A, E, R>) => Stream<A, E2 | E, R2 | R>
  <A, E, R, A2, E2, R2>(self: Stream<A, E, R>, that: Stream<A2, E2, R2>): Stream<A, E | E2, R | R2>
} = dual(
  2,
  <A, E, R, A2, E2, R2>(self: Stream<A, E, R>, that: Stream<A2, E2, R2>): Stream<A, E | E2, R | R2> =>
    mergeEffect(self, runDrain(that))
)

/**
 * Repeats the entire stream according to the provided schedule.
 *
 * **Example** (Repeating a stream on a schedule)
 *
 * ```ts import.meta.vitest
 * import { Effect, Schedule, Stream } from "effect"
 *
 * const program = Effect.gen(function* () {
 *   const result = yield* Stream.make(1).pipe(
 *     Stream.repeat(Schedule.recurs(4)),
 *     Stream.runCollect
 *   )
 *
 *   result // => [ 1, 1, 1, 1, 1 ]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category repetition
 * @since 2.0.0
 */
export const repeat: {
  <B, E2, R2>(
    schedule:
      | Schedule.Schedule<B, void, E2, R2>
      | ((
        $: <SO, SE, SR>(_: Schedule.Schedule<SO, void, SE, SR>) => Schedule.Schedule<SO, void, SE, SR>
      ) => Schedule.Schedule<B, void, E2, R2>)
  ): <A, E, R>(self: Stream<A, E, R>) => Stream<A, E | E2, R2 | R>
  <A, E, R, B, E2, R2>(
    self: Stream<A, E, R>,
    schedule:
      | Schedule.Schedule<B, void, E2, R2>
      | ((
        $: <SO, SE, SR>(_: Schedule.Schedule<SO, void, SE, SR>) => Schedule.Schedule<SO, void, SE, SR>
      ) => Schedule.Schedule<B, void, E2, R2>)
  ): Stream<A, E | E2, R | R2>
} = dual(2, <A, E, R, B, E2, R2>(
  self: Stream<A, E, R>,
  schedule:
    | Schedule.Schedule<B, void, E2, R2>
    | ((
      $: <SO, SE, SR>(_: Schedule.Schedule<SO, void, SE, SR>) => Schedule.Schedule<SO, void, SE, SR>
    ) => Schedule.Schedule<B, void, E2, R2>)
): Stream<A, E | E2, R | R2> => fromChannel(Channel.repeat(self.channel, schedule)))

/**
 * Schedules the stream's elements according to the provided schedule.
 *
 * **Example** (Scheduling stream elements)
 *
 * ```ts import.meta.vitest
 * import { Effect, Schedule, Stream } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const result = yield* Stream.make(1, 2, 3).pipe(
 *     Stream.schedule(Schedule.recurs(3)),
 *     Stream.runCollect
 *   )
 *
 *   result // => [ 1, 2, 3 ]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category rate limiting
 * @since 2.0.0
 */
export const schedule: {
  <X, E2, R2, A>(
    schedule: Schedule.Schedule<X, NoInfer<A>, E2, R2>
  ): <E, R>(self: Stream<A, E, R>) => Stream<A, E | E2, R2 | R>
  <A, E, R, X, E2, R2>(
    self: Stream<A, E, R>,
    schedule: Schedule.Schedule<X, NoInfer<A>, E2, R2>
  ): Stream<A, E | E2, R | R2>
} = dual(2, <A, E, R, X, E2, R2>(
  self: Stream<A, E, R>,
  schedule: Schedule.Schedule<X, NoInfer<A>, E2, R2>
): Stream<A, E | E2, R | R2> =>
  self.channel.pipe(
    Channel.flattenArray,
    Channel.schedule(schedule),
    Channel.map(Arr.of),
    fromChannel
  ))

/**
 * Ends the stream if it does not produce a value within the specified duration.
 *
 * **Example** (Timing out a stream)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const values = yield* Stream.make(1).pipe(
 *     Stream.concat(Stream.never),
 *     Stream.timeout("1 second"),
 *     Stream.runCollect
 *   )
 *   values // => [ 1 ]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category delays & timeouts
 * @since 2.0.0
 */
export const timeout: {
  (duration: Duration.Input): <A, E, R>(self: Stream<A, E, R>) => Stream<A, E, R>
  <A, E, R>(self: Stream<A, E, R>, duration: Duration.Input): Stream<A, E, R>
} = dual(
  2,
  <A, E, R>(self: Stream<A, E, R>, duration: Duration.Input): Stream<A, E, R> =>
    timeoutOrElse(self, {
      duration,
      orElse: () => empty
    })
)

/**
 * Switches to a fallback stream if this stream does not emit a value within
 * the specified duration.
 *
 * **When to use**
 *
 * Use when a stream should continue with another stream if an upstream pull
 * waits longer than the allowed duration.
 *
 * **Details**
 *
 * The timeout is checked for each pull. A zero duration uses `orElse`
 * immediately, while an infinite duration leaves the original stream
 * unchanged.
 *
 * **Gotchas**
 *
 * The fallback stream is not timed after the switch.
 *
 * @see {@link timeout} for ending the stream instead of switching to a fallback stream
 *
 * @category delays & timeouts
 * @since 4.0.0
 */
export const timeoutOrElse: {
  <B, E2, R2>(options: {
    readonly duration: Duration.Input
    readonly orElse: () => Stream<B, E2, R2>
  }): <A, E, R>(self: Stream<A, E, R>) => Stream<A | B, E | E2, R | R2>
  <A, E, R, B, E2, R2>(
    self: Stream<A, E, R>,
    options: {
      readonly duration: Duration.Input
      readonly orElse: () => Stream<B, E2, R2>
    }
  ): Stream<A | B, E | E2, R | R2>
} = dual(
  2,
  <A, E, R, B, E2, R2>(
    self: Stream<A, E, R>,
    options: {
      readonly duration: Duration.Input
      readonly orElse: () => Stream<B, E2, R2>
    }
  ): Stream<A | B, E | E2, R | R2> => {
    const duration = Duration.fromInputUnsafe(options.duration)
    if (!Duration.isFinite(duration)) return self
    if (Duration.isZero(duration)) return suspend(options.orElse)
    const timeoutSymbol = Symbol()
    return catchCause(
      suspend(() => {
        const parent = Fiber.getCurrent()!
        const clock = parent.getRef(Clock)
        const durationMs = Duration.toMillis(duration)
        let deadline: number | undefined = undefined
        const latch = Latch.makeUnsafe(false)
        return merge(
          transformPull(self, (pull, _scope) =>
            Effect.suspend(() => {
              deadline = clock.currentTimeMillisUnsafe() + durationMs
              latch.openUnsafe()
              return pull
            }).pipe(
              Effect.map((arr) => {
                latch.closeUnsafe()
                deadline = undefined
                return arr
              }),
              Effect.succeed
            )),
          fromEffectDrain(Effect.gen(function*() {
            while (true) {
              yield* latch.await
              if (deadline === undefined) continue
              yield* Effect.sleep(deadline - clock.currentTimeMillisUnsafe())
              if (deadline === undefined) continue
              const remaining = deadline - clock.currentTimeMillisUnsafe()
              if (remaining > 0) continue
              return yield* Effect.die(timeoutSymbol)
            }
          })),
          { haltStrategy: "left" }
        )
      }),
      (cause): Stream<B, E | E2, R2> => {
        const isTimeout = cause.reasons.find((r) => r._tag === "Die" && r.defect === timeoutSymbol)
        if (isTimeout) return options.orElse()
        return failCause(cause as Cause.Cause<E>)
      }
    )
  }
)

/**
 * Repeats each element of the stream according to the provided schedule,
 * including the original emission.
 *
 * **Example** (Repeating stream elements)
 *
 * ```ts import.meta.vitest
 * import { Effect, Schedule, Stream } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const values = yield* Stream.make("A", "B", "C").pipe(
 *     Stream.repeatElements(Schedule.recurs(1)),
 *     Stream.runCollect
 *   )
 *   values // => [ 'A', 'A', 'B', 'B', 'C', 'C' ]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category repetition
 * @since 2.0.0
 */
export const repeatElements: {
  <B, E2, R2>(
    schedule: Schedule.Schedule<B, unknown, E2, R2>
  ): <A, E, R>(self: Stream<A, E, R>) => Stream<A, E | E2, R2 | R>
  <A, E, R, B, E2, R2>(
    self: Stream<A, E, R>,
    schedule: Schedule.Schedule<B, unknown, E2, R2>
  ): Stream<A, E | E2, R | R2>
} = dual(
  2,
  <A, E, R, B, E2, R2>(
    self: Stream<A, E, R>,
    schedule: Schedule.Schedule<B, unknown, E2, R2>
  ): Stream<A, E | E2, R | R2> =>
    fromChannel(Channel.fromTransform((upstream, scope) =>
      Effect.map(
        Channel.toTransform(Channel.flattenArray(self.channel))(upstream, scope),
        (pullElement) => {
          let pullRepeat: Pull.Pull<Arr.NonEmptyReadonlyArray<A>, E | E2, void, R | R2> | undefined = undefined

          const pull: Pull.Pull<
            Arr.NonEmptyReadonlyArray<A>,
            E,
            void,
            R | R2
          > = Effect.gen(function*() {
            const element = yield* pullElement
            const chunk = Arr.of(element)
            const step = yield* Schedule.toStepWithSleep(schedule)
            pullRepeat = step(element).pipe(
              Effect.as(chunk),
              Pull.catchDone((_) => {
                pullRepeat = undefined
                return pull
              })
            )
            return chunk
          })

          return Effect.suspend(() => pullRepeat ?? pull)
        }
      )
    ))
)

/**
 * Repeats this stream forever.
 *
 * **Example** (Repeating a stream forever)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const stream = Stream.make("A", "B").pipe(
 *   Stream.forever,
 *   Stream.take(5)
 * )
 *
 * const program = Effect.gen(function*() {
 *   const output = yield* Stream.runCollect(stream)
 *   output // => [ 'A', 'B', 'A', 'B', 'A' ]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category repetition
 * @since 2.0.0
 */
export const forever = <A, E, R>(self: Stream<A, E, R>): Stream<A, E, R> => fromChannel(Channel.forever(self.channel))

/**
 * Flattens the iterables emitted by this stream into the stream's structure.
 *
 * **Example** (Flattening iterable values)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const stream = Stream.make([1, 2], [3, 4]).pipe(Stream.flattenIterable)
 *   const values = yield* Stream.runCollect(stream)
 *   values // => [ 1, 2, 3, 4 ]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category sequencing
 * @since 4.0.0
 */
export const flattenIterable = <A, E, R>(self: Stream<Iterable<A>, E, R>): Stream<A, E, R> =>
  flatMap(self, fromIterable)

/**
 * Unwraps `Take` values, emitting elements from non-empty arrays and ending or
 * failing when the `Exit` signals completion.
 *
 * **Example** (Flattening Take values)
 *
 * ```ts import.meta.vitest
 * import { Array, Effect, Exit, Stream } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const takes = Stream.make(
 *     Array.make(1, 2),
 *     Array.make(3),
 *     Exit.succeed<void>(undefined)
 *   )
 *
 *   const values = yield* Stream.flattenTake(takes).pipe(Stream.runCollect)
 *   values // => [ 1, 2, 3 ]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category sequencing
 * @since 2.0.0
 */
export const flattenTake = <A, E, E2, R>(self: Stream<Take.Take<A, E>, E2, R>): Stream<A, E | E2, R> =>
  self.channel.pipe(
    Channel.flattenArray,
    Channel.flattenTake,
    fromChannel
  )

/**
 * Concatenates two streams, emitting all elements from the first stream
 * followed by all elements from the second stream.
 *
 * **Example** (Concatenating streams)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const stream = Stream.concat(Stream.make(1, 2, 3), Stream.make(4, 5, 6))
 *
 * await Effect.runPromise(Effect.gen(function*() {
 *   const values = yield* Stream.runCollect(stream)
 *   values // => [ 1, 2, 3, 4, 5, 6 ]
 * }))
 * ```
 *
 * @category sequencing
 * @since 2.0.0
 */
export const concat: {
  <A2, E2, R2>(that: Stream<A2, E2, R2>): <A, E, R>(self: Stream<A, E, R>) => Stream<A | A2, E | E2, R | R2>
  <A, E, R, A2, E2, R2>(self: Stream<A, E, R>, that: Stream<A2, E2, R2>): Stream<A | A2, E | E2, R | R2>
} = dual(
  2,
  <A, E, R, A2, E2, R2>(self: Stream<A, E, R>, that: Stream<A2, E2, R2>): Stream<A | A2, E | E2, R | R2> => {
    const stream = fromChannel(
      Channel.flatten(Channel.fromIterator(() => concatChannels<A | A2, E | E2, R | R2>(self, that)))
    )
    concatParts.set(stream, [self, that])
    return stream
  }
)

// The operands of each `concat` result, so a chain of `concat` calls can run as
// a single layer instead of one layer per call
const concatParts = new WeakMap<Stream<any, any, any>, readonly [Stream<any, any, any>, Stream<any, any, any>]>()

// Yields the channel of each non-`concat` stream in a chain, in order
function* concatChannels<A, E, R>(self: Stream<A, E, R>, that: Stream<A, E, R>) {
  const stack = [that, self]
  while (stack.length > 0) {
    const stream = stack.pop()!
    const parts = concatParts.get(stream)
    if (parts === undefined) yield stream.channel
    else stack.push(parts[1], parts[0])
  }
}

/**
 * Prepends the values from the provided iterable before the stream's elements.
 *
 * **Example** (Prepending values)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const values = yield* Stream.make(3, 4).pipe(
 *     Stream.prepend([1, 2]),
 *     Stream.runCollect
 *   )
 *
 *   values // => [ 1, 2, 3, 4 ]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category sequencing
 * @since 2.0.0
 */
export const prepend: {
  <B>(values: Iterable<B>): <A, E, R>(self: Stream<A, E, R>) => Stream<B | A, E, R>
  <A, E, R, B>(self: Stream<A, E, R>, values: Iterable<B>): Stream<A | B, E, R>
} = dual(2, <A, E, R, B>(
  self: Stream<A, E, R>,
  values: Iterable<B>
): Stream<A | B, E, R> => concat(fromIterable(values), self))

/**
 * Merges two streams, emitting elements from both as they arrive.
 *
 * **Details**
 *
 * By default, the merged stream ends when both streams end. Use
 * `haltStrategy` to change the termination behavior.
 *
 * **Example** (Merging stream values)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const fast = Stream.make(1, 2, 3)
 * const slow = Stream.fromEffect(Effect.delay(Effect.succeed(4), "50 millis"))
 *
 * const program = Effect.gen(function*() {
 *   const result = yield* Stream.runCollect(Stream.merge(fast, slow))
 *   result // => [ 1, 2, 3, 4 ]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category merging
 * @since 2.0.0
 */
export const merge: {
  <A2, E2, R2>(
    that: Stream<A2, E2, R2>,
    options?: {
      readonly haltStrategy?: HaltStrategy | undefined
    } | undefined
  ): <A, E, R>(self: Stream<A, E, R>) => Stream<A | A2, E | E2, R | R2>
  <A, E, R, A2, E2, R2>(
    self: Stream<A, E, R>,
    that: Stream<A2, E2, R2>,
    options?: {
      readonly haltStrategy?: HaltStrategy | undefined
    } | undefined
  ): Stream<A | A2, E | E2, R | R2>
} = dual(
  (args) => isStream(args[0]) && isStream(args[1]),
  <A, E, R, A2, E2, R2>(
    self: Stream<A, E, R>,
    that: Stream<A2, E2, R2>,
    options?: {
      readonly haltStrategy?: HaltStrategy | undefined
    } | undefined
  ): Stream<A | A2, E | E2, R | R2> => fromChannel(Channel.merge(toChannel(self), toChannel(that), options))
)

/**
 * Merges this stream with a background effect, keeping the stream's elements.
 *
 * **When to use**
 *
 * Use when an effect should run concurrently for the lifetime of a stream while
 * only the stream's elements remain in the output.
 *
 * **Details**
 *
 * The effect runs concurrently, fails the stream if it fails, and is interrupted
 * when the stream completes.
 *
 * **Example** (Merging with a background effect)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const events: Array<string> = []
 * const program = Effect.gen(function*() {
 *   const values = yield* Stream.make(1, 2, 3).pipe(
 *     Stream.mergeEffect(Effect.sync(() => events.push("side task"))),
 *     Stream.runCollect
 *   )
 *
 *   values // => [1, 2, 3]
 * })
 *
 * await Effect.runPromise(program)
 * events // => ["side task"]
 * ```
 *
 * @category merging
 * @since 4.0.0
 */
export const mergeEffect: {
  <A2, E2, R2>(effect: Effect.Effect<A2, E2, R2>): <A, E, R>(self: Stream<A, E, R>) => Stream<A, E2 | E, R2 | R>
  <A, E, R, A2, E2, R2>(self: Stream<A, E, R>, effect: Effect.Effect<A2, E2, R2>): Stream<A, E | E2, R | R2>
} = dual(
  2,
  <A, E, R, A2, E2, R2>(self: Stream<A, E, R>, effect: Effect.Effect<A2, E2, R2>): Stream<A, E | E2, R | R2> =>
    self.channel.pipe(
      Channel.mergeEffect(effect),
      fromChannel
    )
)

/**
 * Merges this stream and the specified stream together, tagging values from the
 * left stream as `Result.succeed` and values from the right stream as `Result.fail`.
 *
 * **When to use**
 *
 * Use when values from both streams should be emitted and downstream code needs
 * left values wrapped as successful `Result` values and right values wrapped as
 * failed `Result` values.
 *
 * **Example** (Merging streams into results)
 *
 * ```ts import.meta.vitest
 * import { Effect, Result, Stream } from "effect"
 *
 * const left = Stream.fromEffect(Effect.succeed("left"))
 * const right = Stream.fromEffect(Effect.delay(Effect.succeed("right"), "10 millis"))
 *
 * const merged = left.pipe(
 *   Stream.mergeResult(right),
 *   Stream.map(
 *     Result.match({
 *       onFailure: (value) => `right:${value}`,
 *       onSuccess: (value) => `left:${value}`
 *     })
 *   )
 * )
 *
 * const program = Effect.gen(function*() {
 *   const result = yield* Stream.runCollect(merged)
 *   result // => [ 'left:left', 'right:right' ]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category merging
 * @since 4.0.0
 */
export const mergeResult: {
  <A2, E2, R2>(
    that: Stream<A2, E2, R2>
  ): <A, E, R>(self: Stream<A, E, R>) => Stream<Result.Result<A, A2>, E2 | E, R2 | R>
  <A, E, R, A2, E2, R2>(self: Stream<A, E, R>, that: Stream<A2, E2, R2>): Stream<Result.Result<A, A2>, E | E2, R | R2>
} = dual(
  2,
  <A, E, R, A2, E2, R2>(
    self: Stream<A, E, R>,
    that: Stream<A2, E2, R2>
  ): Stream<Result.Result<A, A2>, E | E2, R | R2> =>
    merge(
      map(self, Result.succeed),
      map(that, Result.fail)
    )
)

/**
 * Merges two streams while emitting only the values from the left stream.
 *
 * **When to use**
 *
 * Use when the right stream is needed for its effects or failures, but downstream
 * consumers should only receive values from the left stream.
 *
 * **Details**
 *
 * The right stream still runs for its effects, and any failures from the right
 * stream are propagated. The merged stream completes when the left stream
 * completes, interrupting the right stream.
 *
 * **Example** (Merging streams while keeping left values)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const left = Stream.make(1, 2)
 *   const right = Stream.make("a", "b")
 *   const values = yield* left.pipe(Stream.mergeLeft(right), Stream.runCollect)
 *   values // => [ 1, 2 ]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category merging
 * @since 2.0.0
 */
export const mergeLeft: {
  <AR, ER, RR>(right: Stream<AR, ER, RR>): <AL, EL, RL>(left: Stream<AL, EL, RL>) => Stream<AL, ER | EL, RR | RL>
  <AL, EL, RL, AR, ER, RR>(left: Stream<AL, EL, RL>, right: Stream<AR, ER, RR>): Stream<AL, EL | ER, RL | RR>
} = dual(
  2,
  <AL, EL, RL, AR, ER, RR>(left: Stream<AL, EL, RL>, right: Stream<AR, ER, RR>): Stream<AL, EL | ER, RL | RR> =>
    mergeEffect(left, runDrain(right))
)

/**
 * Merges this stream and the specified stream together, emitting only the
 * values from the right stream while the left stream runs for its effects.
 *
 * **When to use**
 *
 * Use when the left stream is needed for its effects or failures, but downstream
 * consumers should only receive values from the right stream.
 *
 * **Details**
 *
 * The merged stream ends when the right stream completes, interrupting the
 * left stream. Failures from the left stream still fail the merged stream.
 *
 * **Example** (Merging streams while keeping right values)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const left = Stream.make("left-1", "left-2").pipe(
 *   Stream.tap(() => Effect.sync(() => undefined))
 * )
 * const right = Stream.make(1, 2)
 *
 * const merged = Stream.mergeRight(left, right)
 *
 * const program = Effect.gen(function*() {
 *   const result = yield* Stream.runCollect(merged)
 *   result // => [ 1, 2 ]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category merging
 * @since 2.0.0
 */
export const mergeRight: {
  <AR, ER, RR>(right: Stream<AR, ER, RR>): <AL, EL, RL>(left: Stream<AL, EL, RL>) => Stream<AR, ER | EL, RR | RL>
  <AL, EL, RL, AR, ER, RR>(left: Stream<AL, EL, RL>, right: Stream<AR, ER, RR>): Stream<AR, EL | ER, RL | RR>
} = dual(
  2,
  <AL, EL, RL, AR, ER, RR>(left: Stream<AL, EL, RL>, right: Stream<AR, ER, RR>): Stream<AR, EL | ER, RL | RR> =>
    mergeEffect(right, runDrain(left))
)

/**
 * Merges a collection of streams, running up to the specified number concurrently.
 *
 * **When to use**
 *
 * Use to merge an iterable of already-created streams while bounding how many
 * inner streams may run at the same time.
 *
 * **Details**
 *
 * The `concurrency` option is required and may be a number or `"unbounded"`.
 * `bufferSize` controls buffering between inner streams, and outputs are
 * emitted as they arrive under concurrent merging.
 *
 * **Example** (Merging streams with bounded concurrency)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const streams = [
 *   Stream.fromEffect(Effect.delay(Effect.succeed("A"), "20 millis")),
 *   Stream.fromEffect(Effect.delay(Effect.succeed("B"), "10 millis"))
 * ]
 *
 * const program = Effect.gen(function*() {
 *   const values = yield* Stream.mergeAll(streams, { concurrency: 2 }).pipe(
 *     Stream.runCollect
 *   )
 *   values // => [ 'B', 'A' ]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @see {@link merge} for merging exactly two streams and choosing a halt strategy
 * @see {@link flatten} for flattening a stream that already emits streams
 *
 * @category merging
 * @since 2.0.0
 */
export const mergeAll: {
  (
    options: {
      readonly concurrency: Concurrency
      readonly bufferSize?: number | undefined
    }
  ): <A, E, R>(streams: Iterable<Stream<A, E, R>>) => Stream<A, E, R>
  <A, E, R>(
    streams: Iterable<Stream<A, E, R>>,
    options: {
      readonly concurrency: Concurrency
      readonly bufferSize?: number | undefined
    }
  ): Stream<A, E, R>
} = dual(2, <A, E, R>(
  streams: Iterable<Stream<A, E, R>>,
  options: {
    readonly concurrency: Concurrency
    readonly bufferSize?: number | undefined
  }
): Stream<A, E, R> => flatten(fromIterable(streams), options))

/**
 * Creates the cartesian product of two streams, running the `right` stream for
 * each element in the `left` stream.
 *
 * **Details**
 *
 * See also `Stream.zip` for the more common point-wise variant.
 *
 * **Example** (Computing cartesian products)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const left = Stream.make(1, 2)
 *   const right = Stream.make("a", "b")
 *   const values = yield* Stream.runCollect(Stream.cross(left, right))
 *   values // => [ [ 1, 'a' ], [ 1, 'b' ], [ 2, 'a' ], [ 2, 'b' ] ]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category zipping
 * @since 2.0.0
 */
export const cross: {
  <AR, ER, RR>(right: Stream<AR, ER, RR>): <AL, EL, RL>(left: Stream<AL, EL, RL>) => Stream<[AL, AR], EL | ER, RL | RR>
  <AL, EL, RL, AR, ER, RR>(left: Stream<AL, EL, RL>, right: Stream<AR, ER, RR>): Stream<[AL, AR], EL | ER, RL | RR>
} = dual(2, <AL, EL, RL, AR, ER, RR>(
  left: Stream<AL, EL, RL>,
  right: Stream<AR, ER, RR>
): Stream<[AL, AR], EL | ER, RL | RR> => crossWith(left, right, (l, r) => [l, r]))

/**
 * Creates a cartesian product of elements from two streams using a function.
 *
 * **Details**
 *
 * The `right` stream is rerun for every element in the `left` stream.
 *
 * See also `Stream.zipWith` for the more common point-wise variant.
 *
 * **Example** (Combining cartesian products)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const left = Stream.make(1, 2)
 *   const right = Stream.make("a", "b")
 *   const combined = Stream.crossWith(left, right, (n, s) => `${n}-${s}`)
 *   const result = yield* Stream.runCollect(combined)
 *   result // => [ '1-a', '1-b', '2-a', '2-b' ]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category zipping
 * @since 2.0.0
 */
export const crossWith: {
  <AR, ER, RR, AL, A>(
    right: Stream<AR, ER, RR>,
    f: (left: AL, right: AR) => A
  ): <EL, RL>(left: Stream<AL, EL, RL>) => Stream<A, EL | ER, RL | RR>
  <AL, EL, RL, AR, ER, RR, A>(
    left: Stream<AL, EL, RL>,
    right: Stream<AR, ER, RR>,
    f: (left: AL, right: AR) => A
  ): Stream<A, EL | ER, RL | RR>
} = dual(3, <AL, EL, RL, AR, ER, RR, A>(
  left: Stream<AL, EL, RL>,
  right: Stream<AR, ER, RR>,
  f: (left: AL, right: AR) => A
): Stream<A, EL | ER, RL | RR> => flatMap(left, (l) => map(right, (r) => f(l, r))))

/**
 * Zips two streams point-wise with a combining function, ending when either stream ends.
 *
 * **Example** (Zipping streams with a function)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const stream1 = Stream.make(1, 2, 3, 4, 5, 6)
 * const stream2 = Stream.make("a", "b", "c")
 *
 * const zipped = Stream.zipWith(stream1, stream2, (n, s) => `${n}-${s}`)
 *
 * const program = Effect.gen(function*() {
 *   const result = yield* Stream.runCollect(zipped)
 *   result // => [ '1-a', '2-b', '3-c' ]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category zipping
 * @since 2.0.0
 */
export const zipWith: {
  <AR, ER, RR, AL, A>(
    right: Stream<AR, ER, RR>,
    f: (left: AL, right: AR) => A
  ): <EL, RL>(left: Stream<AL, EL, RL>) => Stream<A, EL | ER, RL | RR>
  <AL, EL, RL, AR, ER, RR, A>(
    left: Stream<AL, EL, RL>,
    right: Stream<AR, ER, RR>,
    f: (left: AL, right: AR) => A
  ): Stream<A, EL | ER, RL | RR>
} = dual(3, <AL, EL, RL, AR, ER, RR, A>(
  left: Stream<AL, EL, RL>,
  right: Stream<AR, ER, RR>,
  f: (left: AL, right: AR) => A
): Stream<A, EL | ER, RL | RR> => zipWithArray(left, right, zipArrays(f)))

const zipArrays = <AL, AR, A>(
  f: (left: AL, right: AR) => A
) =>
(
  leftArr: Arr.NonEmptyReadonlyArray<AL>,
  rightArr: Arr.NonEmptyReadonlyArray<AR>
) => {
  const minLength = Math.min(leftArr.length, rightArr.length)
  const result: Arr.NonEmptyArray<A> = [] as any

  for (let i = 0; i < minLength; i++) {
    result.push(f(leftArr[i], rightArr[i]))
  }

  return [result, leftArr.slice(minLength), rightArr.slice(minLength)] as const
}

/**
 * Zips two streams by applying a function to non-empty arrays of elements.
 *
 * **Details**
 *
 * The function returns output plus leftover arrays that carry into the next pull.
 *
 * **Example** (Zipping stream chunks)
 *
 * ```ts import.meta.vitest
 * import { Array, Effect, Stream } from "effect"
 *
 * const left = Stream.fromArrays([1, 2, 3], [4, 5])
 * const right = Stream.fromArrays(["a", "b"], ["c", "d", "e"])
 *
 * const zipped = Stream.zipWithArray(left, right, (leftChunk, rightChunk) => {
 *   const minLength = Math.min(leftChunk.length, rightChunk.length)
 *   const output = Array.makeBy(minLength, (i) => [leftChunk[i], rightChunk[i]] as const)
 *
 *   return [output, leftChunk.slice(minLength), rightChunk.slice(minLength)]
 * })
 *
 * const program = Effect.gen(function*() {
 *   const result = yield* Stream.runCollect(zipped)
 *   result // => [ [ 1, 'a' ], [ 2, 'b' ], [ 3, 'c' ], [ 4, 'd' ], [ 5, 'e' ] ]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category zipping
 * @since 4.0.0
 */
export const zipWithArray: {
  <AR, ER, RR, AL, A>(
    right: Stream<AR, ER, RR>,
    f: (
      left: Arr.NonEmptyReadonlyArray<AL>,
      right: Arr.NonEmptyReadonlyArray<AR>
    ) => readonly [
      output: Arr.NonEmptyReadonlyArray<A>,
      leftoverLeft: ReadonlyArray<AL>,
      leftoverRight: ReadonlyArray<AR>
    ]
  ): <EL, RL>(left: Stream<AL, EL, RL>) => Stream<A, EL | ER, RL | RR>
  <AL, EL, RL, AR, ER, RR, A>(
    left: Stream<AL, EL, RL>,
    right: Stream<AR, ER, RR>,
    f: (
      left: Arr.NonEmptyReadonlyArray<AL>,
      right: Arr.NonEmptyReadonlyArray<AR>
    ) => readonly [
      output: Arr.NonEmptyReadonlyArray<A>,
      leftoverLeft: ReadonlyArray<AL>,
      leftoverRight: ReadonlyArray<AR>
    ]
  ): Stream<A, EL | ER, RL | RR>
} = dual(3, <AL, EL, RL, AR, ER, RR, A>(
  left: Stream<AL, EL, RL>,
  right: Stream<AR, ER, RR>,
  f: (
    left: Arr.NonEmptyReadonlyArray<AL>,
    right: Arr.NonEmptyReadonlyArray<AR>
  ) => readonly [
    output: Arr.NonEmptyReadonlyArray<A>,
    leftoverLeft: ReadonlyArray<AL>,
    leftoverRight: ReadonlyArray<AR>
  ]
): Stream<A, EL | ER, RL | RR> =>
  fromChannel(Channel.fromTransformBracket(Effect.fnUntraced(function*(_, scope) {
    const pullLeft = yield* Channel.toPullScoped(left.channel, scope)
    const pullRight = yield* Channel.toPullScoped(right.channel, scope)
    const pullBoth = Effect.gen(function*() {
      const fiberLeft = yield* Effect.forkIn(pullLeft, scope)
      const fiberRight = yield* Effect.forkIn(pullRight, scope)
      return (yield* Fiber.joinAll([fiberLeft, fiberRight])) as [
        Arr.NonEmptyReadonlyArray<AL>,
        Arr.NonEmptyReadonlyArray<AR>
      ]
    })

    type State =
      | { _tag: "PullBoth" }
      | { _tag: "PullLeft"; rightArray: Arr.NonEmptyReadonlyArray<AR> }
      | { _tag: "PullRight"; leftArray: Arr.NonEmptyReadonlyArray<AL> }
    let state: State = { _tag: "PullBoth" }

    const pull: Effect.Effect<
      Arr.NonEmptyReadonlyArray<A>,
      EL | ER | Cause.Done,
      RL | RR
    > = Effect.gen(function*() {
      const [left, right] = state._tag === "PullBoth"
        ? yield* pullBoth
        : state._tag === "PullLeft"
        ? [yield* pullLeft, state.rightArray]
        : [state.leftArray, yield* pullRight]
      const result = f(left, right)
      if (Arr.isReadonlyArrayNonEmpty(result[1])) {
        state = { _tag: "PullRight", leftArray: result[1] }
      } else if (Arr.isReadonlyArrayNonEmpty(result[2])) {
        state = { _tag: "PullLeft", rightArray: result[2] }
      } else {
        state = { _tag: "PullBoth" }
      }
      return result[0]
    })

    return pull
  }))))

/**
 * Zips this stream with another point-wise and emits tuples of elements from
 * both streams. The new stream ends when either stream ends.
 *
 * **Example** (Zipping streams)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const stream1 = Stream.make(1, 2, 3)
 * const stream2 = Stream.make("a", "b", "c")
 *
 * const zipped = Stream.zip(stream1, stream2)
 *
 * const program = Effect.gen(function*() {
 *   const result = yield* Stream.runCollect(zipped)
 *   result // => [ [ 1, 'a' ], [ 2, 'b' ], [ 3, 'c' ] ]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category zipping
 * @since 2.0.0
 */
export const zip: {
  <A2, E2, R2>(that: Stream<A2, E2, R2>): <A, E, R>(self: Stream<A, E, R>) => Stream<[A, A2], E2 | E, R2 | R>
  <A, E, R, A2, E2, R2>(self: Stream<A, E, R>, that: Stream<A2, E2, R2>): Stream<[A, A2], E | E2, R | R2>
} = dual(
  2,
  <A, E, R, A2, E2, R2>(
    self: Stream<A, E, R>,
    that: Stream<A2, E2, R2>
  ): Stream<[A, A2], E | E2, R | R2> => zipWith(self, that, (a, a2) => [a, a2])
)

/**
 * Zips this stream with another point-wise and keeps only the values from
 * the left stream.
 *
 * **Details**
 *
 * The resulting stream ends when either side ends.
 *
 * **Example** (Zipping streams while keeping left values)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const stream1 = Stream.make(1, 2, 3, 4)
 * const stream2 = Stream.make("a", "b")
 *
 * const program = Effect.gen(function*() {
 *   const result = yield* Stream.zipLeft(stream1, stream2).pipe(Stream.runCollect)
 *   result // => [ 1, 2 ]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category zipping
 * @since 2.0.0
 */
export const zipLeft: {
  <AR, ER, RR>(right: Stream<AR, ER, RR>): <AL, EL, RL>(left: Stream<AL, EL, RL>) => Stream<AL, ER | EL, RR | RL>
  <AL, EL, RL, AR, ER, RR>(left: Stream<AL, EL, RL>, right: Stream<AR, ER, RR>): Stream<AL, EL | ER, RL | RR>
} = dual(
  2,
  <AL, EL, RL, AR, ER, RR>(
    left: Stream<AL, EL, RL>,
    right: Stream<AR, ER, RR>
  ): Stream<AL, EL | ER, RL | RR> =>
    zipWithArray(left, right, (leftArr, rightArr) => {
      const minLength = Math.min(leftArr.length, rightArr.length)
      const output = leftArr.slice(0, minLength) as Arr.NonEmptyArray<AL>
      const leftoverLeft = leftArr.slice(minLength)
      const leftoverRight = rightArr.slice(minLength)

      return [output, leftoverLeft, leftoverRight] as const
    })
)

/**
 * Zips this stream with another point-wise, keeping only right values and ending when either stream ends.
 *
 * **Example** (Zipping streams while keeping right values)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const stream1 = Stream.make(1, 2)
 * const stream2 = Stream.make("a", "b", "c", "d")
 *
 * const program = Effect.gen(function*() {
 *   const result = yield* Stream.zipRight(stream1, stream2).pipe(Stream.runCollect)
 *   result // => [ 'a', 'b' ]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category zipping
 * @since 2.0.0
 */
export const zipRight: {
  <AR, ER, RR>(right: Stream<AR, ER, RR>): <AL, EL, RL>(left: Stream<AL, EL, RL>) => Stream<AR, ER | EL, RR | RL>
  <AL, EL, RL, AR, ER, RR>(left: Stream<AL, EL, RL>, right: Stream<AR, ER, RR>): Stream<AR, EL | ER, RL | RR>
} = dual(
  2,
  <AL, EL, RL, AR, ER, RR>(
    left: Stream<AL, EL, RL>,
    right: Stream<AR, ER, RR>
  ): Stream<AR, EL | ER, RL | RR> =>
    zipWithArray(left, right, (leftArr, rightArr) => {
      const minLength = Math.min(leftArr.length, rightArr.length)
      const output = rightArr.slice(0, minLength) as Arr.NonEmptyArray<AR>
      const leftoverLeft = leftArr.slice(minLength)
      const leftoverRight = rightArr.slice(minLength)

      return [output, leftoverLeft, leftoverRight] as const
    })
)

/**
 * Zips this stream with another point-wise and emits tuples of elements from
 * both streams, flattening the left tuple.
 *
 * **Details**
 *
 * The new stream will end when one of the sides ends.
 *
 * **Example** (Zipping and flattening tuples)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const stream1 = Stream.make(
 *     [1, "a"] as const,
 *     [2, "b"] as const,
 *     [3, "c"] as const
 *   )
 *   const stream2 = Stream.make("x", "y", "z")
 *   const result = yield* Stream.zipFlatten(stream1, stream2).pipe(Stream.runCollect)
 *
 *   result // => [ [ 1, 'a', 'x' ], [ 2, 'b', 'y' ], [ 3, 'c', 'z' ] ]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category zipping
 * @since 2.0.0
 */
export const zipFlatten: {
  <A2, E2, R2>(
    that: Stream<A2, E2, R2>
  ): <A extends ReadonlyArray<any>, E, R>(self: Stream<A, E, R>) => Stream<[...A, A2], E2 | E, R2 | R>
  <A extends ReadonlyArray<any>, E, R, A2, E2, R2>(
    self: Stream<A, E, R>,
    that: Stream<A2, E2, R2>
  ): Stream<[...A, A2], E | E2, R | R2>
} = dual(
  2,
  <A extends ReadonlyArray<any>, E, R, A2, E2, R2>(
    self: Stream<A, E, R>,
    that: Stream<A2, E2, R2>
  ): Stream<[...A, A2], E | E2, R | R2> => zipWith(self, that, (a, a2) => [...a, a2])
)

/**
 * Zips this stream together with the index of elements.
 *
 * **Example** (Zipping elements with indices)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const indexed = yield* Stream.make("a", "b", "c", "d").pipe(
 *     Stream.zipWithIndex,
 *     Stream.runCollect
 *   )
 *   indexed // => [ [ 'a', 0 ], [ 'b', 1 ], [ 'c', 2 ], [ 'd', 3 ] ]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category zipping
 * @since 2.0.0
 */
export const zipWithIndex = <A, E, R>(self: Stream<A, E, R>): Stream<[A, number], E, R> => map(self, (a, i) => [a, i])

/**
 * Zips each element with the next element, pairing the final element with
 * `Option.none()`.
 *
 * **Example** (Zipping elements with next values)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option, Stream } from "effect"
 *
 * const stream = Stream.zipWithNext(Stream.make(1, 2, 3, 4))
 *
 * await Effect.runPromise(Effect.gen(function*() {
 *   const values = yield* Stream.runCollect(stream)
 *   values // => [[1, Option.some(2)], [2, Option.some(3)], [3, Option.some(4)], [4, Option.none()]]
 * }))
 * ```
 *
 * @category zipping
 * @since 2.0.0
 */
export const zipWithNext = <A, E, R>(self: Stream<A, E, R>): Stream<[A, Option.Option<A>], E, R> =>
  mapAccumArray(self, Option.none<A>, (acc, arr) => {
    let i = 0
    if (acc._tag === "None") {
      i = 1
      acc = Option.some(arr[0]) as Option.Some<A>
    }
    const pairs = Arr.empty<[A, Option.Option<A>]>()
    for (; i < arr.length; i++) {
      const value = acc.value
      acc = Option.some(arr[i]) as Option.Some<A>
      pairs.push([value, acc])
    }
    return [acc, pairs]
  }, {
    onHalt(state) {
      return state._tag === "Some" ? [[state.value, Option.none<A>()]] : []
    }
  })

/**
 * Zips each element with its previous element, starting with `None`.
 *
 * **Example** (Zipping elements with previous values)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option, Stream } from "effect"
 *
 * const stream = Stream.zipWithPrevious(Stream.make(1, 2, 3, 4))
 *
 * const program = Effect.gen(function*() {
 *   const result = yield* Stream.runCollect(stream)
 *   result // => [[Option.none(), 1], [Option.some(1), 2], [Option.some(2), 3], [Option.some(3), 4]]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category zipping
 * @since 2.0.0
 */
export const zipWithPrevious = <A, E, R>(self: Stream<A, E, R>): Stream<[Option.Option<A>, A], E, R> =>
  mapAccumArray(self, Option.none<A>, (acc, arr) => {
    const pairs = Arr.empty<[Option.Option<A>, A]>()
    for (let i = 0; i < arr.length; i++) {
      const value = arr[i]
      pairs.push([acc, value])
      acc = Option.some(arr[i])
    }
    return [acc, pairs]
  })

/**
 * Zips each element with its previous and next values.
 *
 * **Example** (Zipping elements with neighbors)
 *
 * ```ts import.meta.vitest
 * import { Console, Effect, Option, Stream } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const values = yield* Stream.make(1, 2, 3).pipe(
 *     Stream.zipWithPreviousAndNext,
 *     Stream.runCollect
 *   )
 *   values // => [[Option.none(), 1, Option.some(2)], [Option.some(1), 2, Option.some(3)], [Option.some(2), 3, Option.none()]]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category zipping
 * @since 2.0.0
 */
export const zipWithPreviousAndNext = <A, E, R>(
  self: Stream<A, E, R>
): Stream<[Option.Option<A>, A, Option.Option<A>], E, R> =>
  mapAccumArray(self, () => ({
    prev: Option.none<A>(),
    current: Option.none<A>()
  }), (acc, arr) => {
    let i = 0
    let current: A
    if (acc.current._tag === "None") {
      i = 1
      current = arr[0]
      acc.current = Option.some(current)
    } else {
      current = acc.current.value
    }
    const pairs = Arr.empty<[Option.Option<A>, A, Option.Option<A>]>()
    for (; i < arr.length; i++) {
      const element = arr[i]
      acc.current = Option.some(element) as Option.Some<A>
      pairs.push([acc.prev, current, acc.current])
      acc.prev = Option.some(current)
      current = element
    }
    return [acc, pairs]
  }, {
    onHalt(acc) {
      return acc.current._tag === "Some" ? [[acc.prev, acc.current.value, Option.none<A>()]] : []
    }
  })

/**
 * Zips multiple streams so that when a value is emitted by any stream, it is
 * combined with the latest values from the other streams to produce a result.
 *
 * **When to use**
 *
 * Use when each stream should contribute its latest value after all streams have
 * emitted at least once.
 *
 * **Gotchas**
 *
 * Note: tracking the latest value is done on a per-array basis. That means
 * that emitted elements that are not the last value in arrays will never be
 * used for zipping.
 *
 * **Example** (Zipping latest values from many streams)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const stream = Stream.zipLatestAll(
 *   Stream.make(1, 2, 3).pipe(Stream.rechunk(1)),
 *   Stream.make("a", "b", "c").pipe(Stream.rechunk(1)),
 *   Stream.make(true, false, true).pipe(Stream.rechunk(1))
 * )
 *
 * const program = Effect.gen(function*() {
 *   const result = yield* Stream.runCollect(stream)
 *   result // => [[1, "a", true], [2, "a", true], [2, "b", true], [2, "b", false], [3, "b", false], [3, "c", false], [3, "c", true]]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category zipping
 * @since 3.3.0
 */
export const zipLatestAll = <T extends ReadonlyArray<Stream<any, any, any>>>(
  ...streams: T
): Stream<
  [T[number]] extends [never] ? never
    : { [K in keyof T]: T[K] extends Stream<infer A, infer _E, infer _R> ? A : never },
  [T[number]] extends [never] ? never : T[number] extends Stream<infer _A, infer _E, infer _R> ? _E : never,
  [T[number]] extends [never] ? never : T[number] extends Stream<infer _A, infer _E, infer _R> ? _R : never
> =>
  fromChannel(Channel.suspend(() => {
    const latest: Array<any> = []
    const emitted = new Set<number>()
    const readyLatch = Latch.makeUnsafe()
    return Channel.mergeAll(
      Channel.fromArray(
        streams.map((s, i) =>
          s.channel.pipe(
            Channel.flattenArray,
            Channel.mapEffect((a) => {
              latest[i] = a
              if (!emitted.has(i)) {
                emitted.add(i)
                if (emitted.size < streams.length) {
                  return readyLatch.await as Effect.Effect<undefined>
                }
                return Effect.as(readyLatch.open, Arr.of(latest.slice()))
              }
              return Effect.succeed(Arr.of(latest.slice()))
            }),
            Channel.filter(isNotUndefined)
          )
        )
      ),
      {
        concurrency: "unbounded",
        bufferSize: 0
      }
    )
  })) as any

/**
 * Combines two streams by emitting each new element with the latest value from the other stream.
 *
 * **When to use**
 *
 * Use when two streams should start emitting combined pairs after both have
 * produced at least one value.
 *
 * **Gotchas**
 *
 * Note: tracking the latest value is done on a per-array basis. That means
 * that emitted elements that are not the last value in arrays will never be
 * used for zipping.
 *
 * **Example** (Zipping latest values)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const result = yield* Stream.zipLatest(
 *     Stream.make(1),
 *     Stream.make("a")
 *   ).pipe(Stream.runCollect)
 *
 *   result // => [ [ 1, 'a' ] ]
 * })
 * await Effect.runPromise(program)
 * ```
 *
 * @category zipping
 * @since 2.0.0
 */
export const zipLatest: {
  <AR, ER, RR>(
    right: Stream<AR, ER, RR>
  ): <AL, EL, RL>(left: Stream<AL, EL, RL>) => Stream<[AL, AR], EL | ER, RL | RR>
  <AL, EL, RL, AR, ER, RR>(
    left: Stream<AL, EL, RL>,
    right: Stream<AR, ER, RR>
  ): Stream<[AL, AR], EL | ER, RL | RR>
} = dual(
  2,
  <AL, EL, RL, AR, ER, RR>(
    left: Stream<AL, EL, RL>,
    right: Stream<AR, ER, RR>
  ): Stream<[AL, AR], EL | ER, RL | RR> => zipLatestAll(left, right)
)

/**
 * Combines the latest values from both streams whenever either emits, using
 * the provided function.
 *
 * **When to use**
 *
 * Use when two streams should start emitting custom combined values after both
 * have produced at least one value.
 *
 * **Gotchas**
 *
 * Note: tracking the latest value is done on a per-array basis. That means
 * that emitted elements that are not the last value in arrays will never be
 * used for zipping.
 *
 * **Example** (Zipping latest values with a function)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * await Effect.runPromise(Effect.gen(function*() {
 *   const result = yield* Stream.make(1, 2, 3).pipe(
 *     Stream.rechunk(1),
 *     Stream.zipLatestWith(
 *       Stream.make(10, 20).pipe(Stream.rechunk(1)),
 *       (n, m) => n + m
 *     ),
 *     Stream.runCollect
 *   )
 *
 *   result // => [ 11, 12, 22, 23 ]
 * }))
 * ```
 *
 * @category zipping
 * @since 2.0.0
 */
export const zipLatestWith: {
  <AR, ER, RR, AL, A>(
    right: Stream<AR, ER, RR>,
    f: (left: AL, right: AR) => A
  ): <EL, RL>(left: Stream<AL, EL, RL>) => Stream<A, EL | ER, RL | RR>
  <AL, EL, RL, AR, ER, RR, A>(
    left: Stream<AL, EL, RL>,
    right: Stream<AR, ER, RR>,
    f: (left: AL, right: AR) => A
  ): Stream<A, EL | ER, RL | RR>
} = dual(
  3,
  <AL, EL, RL, AR, ER, RR, A>(
    left: Stream<AL, EL, RL>,
    right: Stream<AR, ER, RR>,
    f: (left: AL, right: AR) => A
  ): Stream<A, EL | ER, RL | RR> => map(zipLatestAll(left, right), ([a, a2]) => f(a, a2))
)

/**
 * Runs all streams concurrently until one stream emits its first value, then
 * mirrors that winning stream and interrupts the rest.
 *
 * **Details**
 *
 * Failures or completion from losing streams before a winner is chosen are
 * ignored unless every stream fails or completes before emitting. After a
 * winner is chosen, that stream's later failures are propagated.
 *
 * **Example** (Racing multiple streams)
 *
 * ```ts import.meta.vitest
 * import { Effect, Schedule, Stream } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const result = yield* Stream.raceAll(
 *     Stream.empty,
 *     Stream.make(0, 1, 2)
 *   ).pipe(Stream.runCollect)
 *   result // => [ 0, 1, 2 ]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category racing
 * @since 3.5.0
 */
export const raceAll = <S extends ReadonlyArray<Stream<any, any, any>>>(
  ...streams: S
): Stream<Success<S[number]>, Error<S[number]>, Services<S[number]>> =>
  fromChannel(Channel.fromTransform((_, scope) =>
    Effect.sync(() => {
      let winner:
        | Pull.Pull<Arr.NonEmptyReadonlyArray<Success<S[number]>>, Error<S[number]>, void, Services<S[number]>>
        | undefined
      const race = Effect.raceAll(streams.map((stream) => {
        const childScope = Scope.forkUnsafe(scope)
        return Channel.toPullScoped(stream.channel, childScope).pipe(
          Effect.flatMap((pull) => Effect.zip(Effect.succeed(pull), pull)),
          Effect.onExit((exit) => {
            if (exit._tag === "Success") {
              if (winner) {
                return Scope.close(childScope, exit)
              }
              winner = exit.value[0]
              return Effect.void
            }
            return Scope.close(childScope, exit)
          }),
          Effect.map(([, chunk]) => chunk)
        )
      }))
      return Effect.suspend(() => winner ?? race)
    })
  ))

/**
 * Runs both streams concurrently until one stream emits its first value, then
 * mirrors that winning stream and interrupts the other.
 *
 * **Details**
 *
 * A failure or completion from one side before the other side emits does not
 * win the race unless both sides fail or complete before emitting. After a
 * winner is chosen, that stream's later failures are propagated.
 *
 * **Example** (Racing two streams)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const stream = Stream.race(
 *   Stream.empty,
 *   Stream.make(0, 1, 2)
 * )
 *
 * const program = Effect.gen(function*() {
 *   const result = yield* Stream.runCollect(stream)
 *   result // => [ 0, 1, 2 ]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category racing
 * @since 3.7.0
 */
export const race: {
  <AR, ER, RR>(
    right: Stream<AR, ER, RR>
  ): <AL, EL, RL>(left: Stream<AL, EL, RL>) => Stream<AL | AR, EL | ER, RL | RR>
  <AL, EL, RL, AR, ER, RR>(
    left: Stream<AL, EL, RL>,
    right: Stream<AR, ER, RR>
  ): Stream<AL | AR, EL | ER, RL | RR>
} = dual(2, <AL, EL, RL, AR, ER, RR>(
  left: Stream<AL, EL, RL>,
  right: Stream<AR, ER, RR>
): Stream<AL | AR, EL | ER, RL | RR> => raceAll(left, right))

/**
 * Filters a stream to the elements that satisfy a predicate.
 *
 * **Example** (Filtering stream values)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const stream = Stream.make(1, 2, 3, 4).pipe(
 *     Stream.filter((n) => n % 2 === 0)
 *   )
 *   const values = yield* Stream.runCollect(stream)
 *   values // => [ 2, 4 ]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category filtering
 * @since 2.0.0
 */
export const filter: {
  <A, B extends A>(refinement: Refinement<NoInfer<A>, B>): <E, R>(self: Stream<A, E, R>) => Stream<B, E, R>
  <A>(predicate: Predicate<NoInfer<A>>): <E, R>(self: Stream<A, E, R>) => Stream<A, E, R>
  <A, E, R, B extends A>(self: Stream<A, E, R>, refinement: Refinement<A, B>): Stream<B, E, R>
  <A, E, R>(
    self: Stream<A, E, R>,
    predicate: Predicate<A>
  ): Stream<A, E, R>
} = dual(
  2,
  <A, E, R>(
    self: Stream<A, E, R>,
    predicate: Predicate<A>
  ): Stream<A, E, R> => fromChannel(Channel.filterArray(toChannel(self), predicate))
)

/**
 * Filters and maps stream elements in one pass using a `Filter`.
 *
 * **When to use**
 *
 * Use to keep only stream elements accepted by a `Filter` and emit each filter
 * success value.
 *
 * **Details**
 *
 * `Result.succeed` values are emitted and `Result.fail` values are skipped.
 *
 * @see {@link filter} for keeping original elements with a boolean predicate or refinement
 * @see {@link filterMapEffect} for an effectful `Filter`
 * @see {@link partition} for consuming both filter success and failure values
 *
 * @category filtering
 * @since 2.0.0
 */
export const filterMap: {
  <A, B, X>(
    filter: Filter.Filter<NoInfer<A>, B, X>
  ): <E, R>(self: Stream<A, E, R>) => Stream<B, E, R>
  <A, E, R, B, X>(
    self: Stream<A, E, R>,
    filter: Filter.Filter<A, B, X>
  ): Stream<B, E, R>
} = dual(
  2,
  <A, E, R, B, X>(
    self: Stream<A, E, R>,
    filter: Filter.Filter<A, B, X>
  ): Stream<B, E, R> => fromChannel(Channel.filterMapArray(toChannel(self), filter))
)

/**
 * Filters elements in a single pass effectfully.
 *
 * **Example** (Effectfully filtering stream values)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const stream = Stream.make(1, 2, 3, 4).pipe(Stream.filterEffect((n) => Effect.succeed(n > 2)))
 *
 * const program = Effect.gen(function*() {
 *   const result = yield* Stream.runCollect(stream)
 *   result // => [ 3, 4 ]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category filtering
 * @since 2.0.0
 */
export const filterEffect: {
  <A, EX, RX>(
    predicate: (a: NoInfer<A>, i: number) => Effect.Effect<boolean, EX, RX>
  ): <E, R>(self: Stream<A, E, R>) => Stream<A, E | EX, R | RX>
  <A, E, R, EX, RX>(
    self: Stream<A, E, R>,
    predicate: (a: NoInfer<A>, i: number) => Effect.Effect<boolean, EX, RX>
  ): Stream<A, E | EX, R | RX>
} = dual(
  2,
  <A, E, R, EX, RX>(
    self: Stream<A, E, R>,
    predicate: (a: NoInfer<A>, i: number) => Effect.Effect<boolean, EX, RX>
  ): Stream<A, E | EX, R | RX> => fromChannel(Channel.filterArrayEffect(toChannel(self), predicate))
)

/**
 * Filters and maps elements in one pass effectfully using a `FilterEffect`.
 *
 * **When to use**
 *
 * Use to apply effectful logic that can reject stream elements or emit
 * transformed values before they continue downstream.
 *
 * **Details**
 *
 * `Result.succeed` values are emitted, `Result.fail` values are skipped, and
 * effect failures fail the stream.
 *
 * @see {@link filterMap} for the synchronous `Filter` variant
 * @see {@link filterEffect} for effectfully keeping original elements
 * @see {@link mapEffect} for effectfully transforming every element
 *
 * @category filtering
 * @since 2.0.0
 */
export const filterMapEffect: {
  <A, B, X, EX, RX>(
    filter: Filter.FilterEffect<NoInfer<A>, B, X, EX, RX>
  ): <E, R>(self: Stream<A, E, R>) => Stream<B, E | EX, R | RX>
  <A, E, R, B, X, EX, RX>(
    self: Stream<A, E, R>,
    filter: Filter.FilterEffect<A, B, X, EX, RX>
  ): Stream<B, E | EX, R | RX>
} = dual(
  2,
  <A, E, R, B, X, EX, RX>(
    self: Stream<A, E, R>,
    filter: Filter.FilterEffect<A, B, X, EX, RX>
  ): Stream<B, E | EX, R | RX> => fromChannel(Channel.filterMapArrayEffect(toChannel(self), filter))
)

/**
 * Partitions a stream using a `Filter` and exposes passing and failing values
 * as scoped queues.
 *
 * **Details**
 *
 * The queues are backed by a fiber in the current scope and should be consumed
 * while that scope remains open. Each queue fails with the stream error or
 * `Cause.Done` when the source ends.
 *
 * **Example** (Partitioning a stream into queues)
 *
 * ```ts import.meta.vitest
 * import { Effect, Result, Stream } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const [passes, fails] = yield* Stream.make(1, 2, 3, 4).pipe(
 *     Stream.partitionQueue((n) => n % 2 === 0 ? Result.succeed(n) : Result.fail(n))
 *   )
 *
 *   const passValues = yield* Stream.fromQueue(passes).pipe(Stream.runCollect)
 *   const failValues = yield* Stream.fromQueue(fails).pipe(Stream.runCollect)
 *
 *   passValues // => [ 2, 4 ]
 *   failValues // => [ 1, 3 ]
 * })
 *
 * await Effect.runPromise(Effect.scoped(program))
 * ```
 *
 * @category filtering
 * @since 4.0.0
 */
export const partitionQueue: {
  <A, Pass, Fail>(filter: Filter.Filter<NoInfer<A>, Pass, Fail>, options?: {
    readonly capacity?: number | "unbounded" | undefined
  }): <E, R>(self: Stream<A, E, R>) => Effect.Effect<
    [
      passes: Queue.Dequeue<Pass, E | Cause.Done>,
      fails: Queue.Dequeue<Fail, E | Cause.Done>
    ],
    never,
    R | Scope.Scope
  >
  <A, E, R, Pass, Fail>(
    self: Stream<A, E, R>,
    filter: Filter.Filter<NoInfer<A>, Pass, Fail>,
    options?: {
      readonly capacity?: number | "unbounded" | undefined
    }
  ): Effect.Effect<
    [
      passes: Queue.Dequeue<Pass, E | Cause.Done>,
      fails: Queue.Dequeue<Fail, E | Cause.Done>
    ],
    never,
    R | Scope.Scope
  >
} = dual(
  (args) => isStream(args[0]),
  Effect.fnUntraced(
    function*<A, E, R, Pass, Fail>(
      self: Stream<A, E, R>,
      filter: Filter.Filter<NoInfer<A>, Pass, Fail>,
      options?: {
        readonly capacity?: number | "unbounded" | undefined
      }
    ): Effect.fn.Return<
      [
        passes: Queue.Dequeue<Pass, E | Cause.Done>,
        fails: Queue.Dequeue<Fail, E | Cause.Done>
      ],
      never,
      R | Scope.Scope
    > {
      const scope = yield* Effect.scope
      const pull = yield* Channel.toPullScoped(self.channel, scope)
      const capacity = options?.capacity === "unbounded" ? undefined : options?.capacity ?? DefaultChunkSize
      const passes = yield* Queue.make<Pass, E | Cause.Done>({ capacity })
      const fails = yield* Queue.make<Fail, E | Cause.Done>({ capacity })

      yield* Effect.gen(function*() {
        while (true) {
          const chunk = yield* pull
          const excluded: Array<Fail> = []
          const satisfying: Array<Pass> = []
          for (let i = 0; i < chunk.length; i++) {
            const result = filter(chunk[i] as NoInfer<A>)
            if (Result.isFailure(result)) {
              excluded.push(result.failure)
            } else {
              satisfying.push(result.success)
            }
          }
          let passFiber: Fiber.Fiber<any> | undefined = undefined
          if (satisfying.length > 0) {
            const leftover = Queue.offerAllUnsafe(passes, satisfying)
            if (leftover.length > 0) {
              passFiber = yield* Effect.forkChild(Queue.offerAll(passes, leftover))
            }
          }
          if (excluded.length > 0) {
            const leftover = Queue.offerAllUnsafe(fails, excluded)
            if (leftover.length > 0) {
              yield* Queue.offerAll(fails, leftover)
            }
          }
          if (passFiber) yield* Fiber.join(passFiber)
        }
      }).pipe(
        Effect.onError((cause) => {
          Queue.failCauseUnsafe(passes, cause)
          Queue.failCauseUnsafe(fails, cause)
          return Effect.void
        }),
        Effect.forkIn(scope)
      )

      return [passes, fails]
    }
  )
)

/**
 * Splits a stream with an effectful `Filter`, returning scoped streams for
 * filter successes and failures.
 *
 * **When to use**
 *
 * Use when you need to classify each stream element with an effectful `Filter`
 * and consume both passing and failing mapped values as streams.
 *
 * **Details**
 *
 * The returned streams are backed by queues in the current scope and should be
 * consumed while that scope remains open. The first stream emits success values
 * from the filter, and the second emits failure values.
 *
 * @see {@link partition} for the pure `Filter` variant
 * @see {@link partitionQueue} for the lower-level queue result
 * @see {@link filterMapEffect} for effectful filtering that discards failed filter results
 *
 * @category filtering
 * @since 4.0.0
 */
export const partitionEffect: {
  <A, Pass, Fail, EX, RX>(filter: Filter.FilterEffect<NoInfer<A>, Pass, Fail, EX, RX>, options?: {
    readonly capacity?: number | "unbounded" | undefined
    readonly concurrency?: Concurrency | undefined
  }): <E, R>(self: Stream<A, E, R>) => Effect.Effect<
    [
      passes: Stream<Pass, E | EX>,
      fails: Stream<Fail, E | EX>
    ],
    never,
    R | RX | Scope.Scope
  >
  <A, E, R, Pass, Fail, EX, RX>(
    self: Stream<A, E, R>,
    filter: Filter.FilterEffect<NoInfer<A>, Pass, Fail, EX, RX>,
    options?: {
      readonly capacity?: number | "unbounded" | undefined
      readonly concurrency?: Concurrency | undefined
    }
  ): Effect.Effect<
    [
      passes: Stream<Pass, E | EX>,
      fails: Stream<Fail, E | EX>
    ],
    never,
    R | RX | Scope.Scope
  >
} = dual(
  (args) => isStream(args[0]),
  <A, E, R, Pass, Fail, EX, RX>(
    self: Stream<A, E, R>,
    filter: Filter.FilterEffect<NoInfer<A>, Pass, Fail, EX, RX>,
    options?: {
      readonly capacity?: number | "unbounded" | undefined
      readonly concurrency?: Concurrency | undefined
    }
  ): Effect.Effect<
    [
      passes: Stream<Pass, E | EX>,
      fails: Stream<Fail, E | EX>
    ],
    never,
    R | RX | Scope.Scope
  > =>
    Effect.map(
      partitionQueue<Result.Result<Pass, Fail>, E | EX, R | RX, Pass, Fail>(
        mapEffect(self, (a) => filter(a as NoInfer<A>), options),
        (result) => result,
        options
      ),
      ([passes, fails]) => [fromQueue(passes), fromQueue(fails)] as const
    )
)

/**
 * Splits a stream into scoped passing and failing substreams using a
 * `Filter`.
 *
 * **Details**
 *
 * The returned streams are backed by queues in the current scope and should be
 * consumed while that scope remains open. The faster stream may advance up to
 * `capacity` elements ahead of the slower one. The first stream emits the
 * filter successes and the second emits the filter failures. The default
 * capacity is 16.
 *
 * **Example** (Partitioning a stream)
 *
 * ```ts import.meta.vitest
 * import { Effect, Result, Stream } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const [passes, fails] = yield* Stream.partition(
 *     Stream.make(1, 2, 3, 4),
 *     (n) => n % 2 === 0 ? Result.succeed(n) : Result.fail(n)
 *   )
 *   const evens = yield* Stream.runCollect(passes)
 *   const odds = yield* Stream.runCollect(fails)
 *   evens // => [ 2, 4 ]
 *   odds // => [ 1, 3 ]
 * })
 * await Effect.runPromise(Effect.scoped(program))
 * ```
 *
 * @category filtering
 * @since 2.0.0
 */
export const partition: {
  <A, Pass, Fail>(
    filter: Filter.Filter<NoInfer<A>, Pass, Fail>,
    options?: {
      readonly capacity?: number | "unbounded" | undefined
    }
  ): <E, R>(
    self: Stream<A, E, R>
  ) => Effect.Effect<
    [passes: Stream<Pass, E>, fails: Stream<Fail, E>],
    never,
    R | Scope.Scope
  >
  <A, E, R, Pass, Fail>(
    self: Stream<A, E, R>,
    filter: Filter.Filter<NoInfer<A>, Pass, Fail>,
    options?: {
      readonly capacity?: number | "unbounded" | undefined
    }
  ): Effect.Effect<
    [passes: Stream<Pass, E>, fails: Stream<Fail, E>],
    never,
    R | Scope.Scope
  >
} = dual(
  (args) => isStream(args[0]),
  <A, E, R, Pass, Fail>(
    self: Stream<A, E, R>,
    filter: Filter.Filter<NoInfer<A>, Pass, Fail>,
    options?: {
      readonly capacity?: number | "unbounded" | undefined
    }
  ): Effect.Effect<
    [passes: Stream<Pass, E>, fails: Stream<Fail, E>],
    never,
    R | Scope.Scope
  > =>
    Effect.map(
      partitionQueue(self, filter, { capacity: options?.capacity ?? 16 }),
      ([passes, fails]) => [fromQueue(passes), fromQueue(fails)] as const
    )
)

/**
 * Returns the specified stream if the given condition is satisfied, otherwise
 * returns an empty stream.
 *
 * **Example** (Conditionally keeping a stream)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const result = yield* Stream.runCollect(
 *     Stream.when(Stream.make(1, 2, 3), Effect.succeed(false))
 *   )
 *   result // => []
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category filtering
 * @since 2.0.0
 */
export const when: {
  <EX = never, RX = never>(
    test: Effect.Effect<boolean, EX, RX>
  ): <A, E, R>(self: Stream<A, E, R>) => Stream<A, E | EX, R | RX>
  <A, E, R, EX = never, RX = never>(
    self: Stream<A, E, R>,
    test: Effect.Effect<boolean, EX, RX>
  ): Stream<A, E | EX, R | RX>
} = dual(2, <A, E, R, EX = never, RX = never>(
  self: Stream<A, E, R>,
  test: Effect.Effect<boolean, EX, RX>
): Stream<A, E | EX, R | RX> =>
  test.pipe(
    Effect.map((pass) => pass ? self : empty),
    unwrap
  ))

/**
 * Runs a sink to peel off enough elements to produce a value and returns that
 * value with the remaining stream in a scope.
 *
 * **Details**
 *
 * The returned stream is only valid within the scope.
 *
 * **Example** (Peeling a stream with a sink)
 *
 * ```ts import.meta.vitest
 * import { Effect, Sink, Stream } from "effect"
 *
 * const stream = Stream.fromArrays([1, 2, 3], [4, 5, 6])
 * const sink = Sink.take<number>(3)
 *
 * const program = Effect.scoped(
 *   Effect.gen(function*() {
 *     const [peeled, rest] = yield* Stream.peel(stream, sink)
 *     const remaining = yield* Stream.runCollect(rest)
 *     const result = [peeled, remaining] // => [[1, 2, 3], [4, 5, 6]]
 *   })
 * )
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category destructors
 * @since 2.0.0
 */
export const peel: {
  <A2, A, E2, R2>(
    sink: Sink.Sink<A2, A, A, E2, R2>
  ): <E, R>(self: Stream<A, E, R>) => Effect.Effect<[A2, Stream<A, E, never>], E2 | E, Scope.Scope | R2 | R>
  <A, E, R, A2, E2, R2>(
    self: Stream<A, E, R>,
    sink: Sink.Sink<A2, A, A, E2, R2>
  ): Effect.Effect<[A2, Stream<A, E, never>], E | E2, Scope.Scope | R | R2>
} = dual(
  2,
  Effect.fnUntraced(function*<A, E, R, A2, E2, R2>(
    self: Stream<A, E, R>,
    sink: Sink.Sink<A2, A, A, E2, R2>
  ): Effect.fn.Return<[A2, Stream<A, E, never>], E | E2, Scope.Scope | R | R2> {
    let cause: Cause.Cause<E | Cause.Done<void>> | undefined = undefined
    const originalPull = yield* Channel.toPull(self.channel)
    const pull: Pull.Pull<
      Arr.NonEmptyReadonlyArray<A>,
      E
    > = Effect.catchCause(originalPull, (cause_) => {
      cause = cause_
      return Effect.failCause(cause_)
    })

    let stream = fromPull(Effect.succeed(pull)) as Stream<A, E>
    const leftover = yield* run(stream, sink)
    if (cause) return [leftover, empty]

    stream = fromPull(Effect.succeed(originalPull))
    return [leftover, stream]
  })
)

/**
 * Buffers up to `capacity` elements so a faster producer can progress
 * independently of a slower consumer.
 *
 * **Details**
 *
 * Finite buffers use the configured queue strategy: `"suspend"` applies
 * backpressure, while `"dropping"` and `"sliding"` may discard elements when
 * the buffer is full. This combinator destroys chunking; use `Stream.rechunk`
 * afterward if you need fixed chunk sizes.
 *
 * **Example** (Buffering stream elements)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const values = yield* Stream.make(1, 2, 3).pipe(
 *     Stream.buffer({ capacity: 1 }),
 *     Stream.runCollect
 *   )
 *   values // => [ 1, 2, 3 ]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category buffering
 * @since 2.0.0
 */
export const buffer: {
  (
    options: { readonly capacity: "unbounded" } | {
      readonly capacity: number
      readonly strategy?: "dropping" | "sliding" | "suspend" | undefined
    }
  ): <A, E, R>(self: Stream<A, E, R>) => Stream<A, E, R>
  <A, E, R>(
    self: Stream<A, E, R>,
    options: { readonly capacity: "unbounded" } | {
      readonly capacity: number
      readonly strategy?: "dropping" | "sliding" | "suspend" | undefined
    }
  ): Stream<A, E, R>
} = dual(2, <A, E, R>(
  self: Stream<A, E, R>,
  options: { readonly capacity: "unbounded" } | {
    readonly capacity: number
    readonly strategy?: "dropping" | "sliding" | "suspend" | undefined
  }
): Stream<A, E, R> => fromChannel(Channel.bufferArray(self.channel, options)))

/**
 * Allows a faster producer to progress independently of a slower consumer by
 * buffering up to `capacity` chunks in a queue.
 *
 * **Details**
 *
 * Finite buffers use the configured queue strategy: `"suspend"` applies
 * backpressure, while `"dropping"` and `"sliding"` may discard chunks when the
 * buffer is full. This combinator preserves chunking and is best with
 * power-of-2 capacities.
 *
 * **Example** (Buffering stream chunks)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const result = yield* Stream.fromArrays([1, 2], [3, 4]).pipe(
 *     Stream.bufferArray({ capacity: 2 }),
 *     Stream.runCollect
 *   )
 *   result // => [ 1, 2, 3, 4 ]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category buffering
 * @since 4.0.0
 */
export const bufferArray: {
  (
    options: { readonly capacity: "unbounded" } | {
      readonly capacity: number
      readonly strategy?: "dropping" | "sliding" | "suspend" | undefined
    }
  ): <A, E, R>(self: Stream<A, E, R>) => Stream<A, E, R>
  <A, E, R>(
    self: Stream<A, E, R>,
    options: { readonly capacity: "unbounded" } | {
      readonly capacity: number
      readonly strategy?: "dropping" | "sliding" | "suspend" | undefined
    }
  ): Stream<A, E, R>
} = dual(2, <A, E, R>(
  self: Stream<A, E, R>,
  options: { readonly capacity: "unbounded" } | {
    readonly capacity: number
    readonly strategy?: "dropping" | "sliding" | "suspend" | undefined
  }
): Stream<A, E, R> => fromChannel(Channel.buffer(self.channel, options)))

/**
 * Switches over to the stream produced by the provided function in case this
 * one fails. Allows recovery from all causes of failure, including
 * interruption if the stream is uninterruptible.
 *
 * **Example** (Catching stream causes)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const stream = Stream.make(1, 2).pipe(
 *   Stream.concat(Stream.fail("Oops!")),
 *   Stream.concat(Stream.make(3, 4))
 * )
 *
 * const recovered = stream.pipe(
 *   Stream.catchCause(() => Stream.make(999))
 * )
 *
 * const program = Effect.gen(function*() {
 *   const values = yield* Stream.runCollect(recovered)
 *   values // => [ 1, 2, 999 ]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category error handling
 * @since 2.0.0
 */
export const catchCause: {
  <E, A2, E2, R2>(
    f: (cause: Cause.Cause<E>) => Stream<A2, E2, R2>
  ): <A, R>(self: Stream<A, E, R>) => Stream<A | A2, E2, R2 | R>
  <A, E, R, A2, E2, R2>(
    self: Stream<A, E, R>,
    f: (cause: Cause.Cause<E>) => Stream<A2, E2, R2>
  ): Stream<A | A2, E2, R | R2>
} = dual(2, <A, E, R, A2, E2, R2>(
  self: Stream<A, E, R>,
  f: (cause: Cause.Cause<E>) => Stream<A2, E2, R2>
): Stream<A | A2, E2, R | R2> =>
  self.channel.pipe(
    Channel.catchCause((cause) => f(cause).channel),
    fromChannel
  ))

/**
 * Recovers from defects using the provided function.
 *
 * **Details**
 *
 * Typed failures and interruptions are not caught.
 *
 * **Example** (Recovering from a defect)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const stream = Stream.die("boom").pipe(
 *   Stream.catchDefect((defect) => Stream.succeed(`recovered: ${defect}`))
 * )
 *
 * const result = Effect.runSync(Stream.runCollect(stream))
 * result // => ["recovered: boom"]
 * ```
 *
 * @category error handling
 * @since 4.0.0
 */
export const catchDefect: {
  <A2, E2, R2>(
    f: (defect: unknown) => Stream<A2, E2, R2>
  ): <A, E, R>(self: Stream<A, E, R>) => Stream<A | A2, E | E2, R | R2>
  <A, E, R, A2, E2, R2>(
    self: Stream<A, E, R>,
    f: (defect: unknown) => Stream<A2, E2, R2>
  ): Stream<A | A2, E | E2, R | R2>
} = dual(2, <A, E, R, A2, E2, R2>(
  self: Stream<A, E, R>,
  f: (defect: unknown) => Stream<A2, E2, R2>
): Stream<A | A2, E | E2, R | R2> =>
  self.channel.pipe(
    Channel.catchDefect((defect) => f(defect).channel),
    fromChannel
  ))

/**
 * Runs an effect when the stream fails without changing its values or error,
 * unless the tap effect itself fails.
 *
 * **Example** (Tapping stream causes)
 *
 * ```ts import.meta.vitest
 * import { Cause, Effect, Stream } from "effect"
 *
 * const observations: Array<boolean> = []
 * const stream = Stream.make(1, 2).pipe(
 *   Stream.concat(Stream.fail("boom")),
 *   Stream.tapCause((cause) => Effect.sync(() => observations.push(Cause.isReason(cause)))),
 *   Stream.catch(() => Stream.succeed(0))
 * )
 *
 * const program = Effect.gen(function* () {
 *   const result = yield* Stream.runCollect(stream)
 *   result // => [1, 2, 0]
 * })
 *
 * await Effect.runPromise(program)
 * observations // => [false]
 * ```
 *
 * @category error handling
 * @since 2.0.0
 */
export const tapCause: {
  <E, A2, E2, R2>(
    f: (cause: Cause.Cause<E>) => Effect.Effect<A2, E2, R2>
  ): <A, R>(self: Stream<A, E, R>) => Stream<A, E | E2, R2 | R>
  <A, E, R, A2, E2, R2>(
    self: Stream<A, E, R>,
    f: (cause: Cause.Cause<E>) => Effect.Effect<A2, E2, R2>
  ): Stream<A, E | E2, R | R2>
} = dual(2, <A, E, R, A2, E2, R2>(
  self: Stream<A, E, R>,
  f: (cause: Cause.Cause<E>) => Effect.Effect<A2, E2, R2>
): Stream<A, E | E2, R | R2> =>
  self.channel.pipe(
    Channel.tapCause(f),
    fromChannel
  ))

const catch_: {
  <E, A2, E2, R2>(
    f: (error: E) => Stream<A2, E2, R2>
  ): <A, R>(self: Stream<A, E, R>) => Stream<A | A2, E2, R2 | R>
  <A, E, R, A2, E2, R2>(
    self: Stream<A, E, R>,
    f: (error: E) => Stream<A2, E2, R2>
  ): Stream<A | A2, E2, R | R2>
} = dual(2, <A, E, R, A2, E2, R2>(
  self: Stream<A, E, R>,
  f: (error: E) => Stream<A2, E2, R2>
): Stream<A | A2, E2, R | R2> => fromChannel(Channel.catch(self.channel, (error) => f(error).channel)))

export {
  /**
   * Switches over to the stream produced by the provided function if this one fails.
   *
   * **Example** (Catching stream failures)
   *
   * ```ts import.meta.vitest
   * import { Effect, Stream } from "effect"
   *
   * const stream = Stream.make(1, 2).pipe(
   *   Stream.concat(Stream.fail("Oops!")),
   *   Stream.catch(() => Stream.make(999))
   * )
   *
   * const program = Effect.gen(function*() {
   *   const values = yield* Stream.runCollect(stream)
   *   values // => [ 1, 2, 999 ]
   * })
   *
   * await Effect.runPromise(program)
   * ```
   *
   * @category error handling
   * @since 4.0.0
   */
  catch_ as catch
}

/**
 * Peeks at errors effectfully without changing the stream unless the tap fails.
 *
 * **Example** (Effectfully peeking at errors)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const errors: Array<string> = []
 * const stream = Stream.make(1, 2).pipe(
 *   Stream.concat(Stream.fail("boom")),
 *   Stream.tapError((error) => Effect.sync(() => errors.push(error))),
 *   Stream.catch(() => Stream.make(999))
 * )
 *
 * const program = Effect.gen(function*() {
 *   const values = yield* Stream.runCollect(stream)
 *   values // => [1, 2, 999]
 * })
 *
 * await Effect.runPromise(program)
 * errors // => ["boom"]
 * ```
 *
 * @category error handling
 * @since 2.0.0
 */
export const tapError: {
  <E, A2, E2, R2>(
    f: (error: E) => Effect.Effect<A2, E2, R2>
  ): <A, R>(self: Stream<A, E, R>) => Stream<A, E | E2, R2 | R>
  <A, E, R, A2, E2, R2>(
    self: Stream<A, E, R>,
    f: (error: E) => Effect.Effect<A2, E2, R2>
  ): Stream<A, E | E2, R | R2>
} = dual(2, <A, E, R, A2, E2, R2>(
  self: Stream<A, E, R>,
  f: (error: E) => Effect.Effect<A2, E2, R2>
): Stream<A, E | E2, R | R2> =>
  self.channel.pipe(
    Channel.tapError(f),
    fromChannel
  ))

/**
 * Peeks at errors with a matching `_tag` effectfully without changing the
 * stream unless the tap fails.
 *
 * **Example** (Effectfully peeking at a tagged error)
 *
 * ```ts import.meta.vitest
 * import { Data, Effect, Stream } from "effect"
 *
 * class NetworkError extends Data.TaggedError("NetworkError")<{
 *   statusCode: number
 * }> {}
 *
 * class ValidationError extends Data.TaggedError("ValidationError")<{
 *   field: string
 * }> {}
 *
 * const seen: Array<number> = []
 * const stream: Stream.Stream<number, NetworkError | ValidationError> = Stream.fail(
 *   new NetworkError({ statusCode: 504 })
 * )
 *
 * const program = stream.pipe(
 *   Stream.tapErrorTag("NetworkError", (error) => Effect.sync(() => seen.push(error.statusCode))),
 *   Stream.catch(() => Stream.make(0)),
 *   Stream.runCollect
 * )
 *
 * await Effect.runPromise(program) // => [ 0 ]
 * seen // => [ 504 ]
 * ```
 *
 * @see {@link tapError} for peeking at every typed error
 * @see {@link catchTag} for recovering from a tagged error
 *
 * @category error handling
 * @since 4.0.0
 */
export const tapErrorTag: {
  <const K extends Tags<E> | Arr.NonEmptyReadonlyArray<Tags<E>>, E, A1, E1, R1>(
    k: K,
    f: (
      e: ExtractTag<NoInfer<E>, K extends Arr.NonEmptyReadonlyArray<string> ? K[number] : K>
    ) => Effect.Effect<A1, E1, R1>
  ): <A, R>(self: Stream<A, E, R>) => Stream<A, E | E1, R1 | R>
  <
    A,
    E,
    R,
    const K extends Tags<E> | Arr.NonEmptyReadonlyArray<Tags<E>>,
    R1,
    E1,
    A1
  >(
    self: Stream<A, E, R>,
    k: K,
    f: (e: ExtractTag<E, K extends Arr.NonEmptyReadonlyArray<string> ? K[number] : K>) => Effect.Effect<A1, E1, R1>
  ): Stream<A, E | E1, R | R1>
} = dual(
  3,
  <
    A,
    E,
    R,
    const K extends Tags<E> | Arr.NonEmptyReadonlyArray<Tags<E>>,
    R1,
    E1,
    A1
  >(
    self: Stream<A, E, R>,
    k: K,
    f: (e: ExtractTag<E, K extends Arr.NonEmptyReadonlyArray<string> ? K[number] : K>) => Effect.Effect<A1, E1, R1>
  ): Stream<A, E | E1, R | R1> => {
    const predicate = Array.isArray(k)
      ? ((e: E): e is ExtractTag<E, K extends Arr.NonEmptyReadonlyArray<string> ? K[number] : K> =>
        hasProperty(e, "_tag") && k.includes(e._tag))
      : isTagged(k as string)
    return tapError(
      self,
      (error) =>
        predicate(error)
          ? f(error as ExtractTag<E, K extends Arr.NonEmptyReadonlyArray<string> ? K[number] : K>)
          : Effect.void
    )
  }
)

/**
 * Peeks at defects effectfully without changing the stream unless the tap
 * fails.
 *
 * **Example** (Effectfully peeking at defects)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const defects: Array<unknown> = []
 * const stream = Stream.make(1, 2).pipe(
 *   Stream.concat(Stream.die("boom")),
 *   Stream.tapDefect((defect) => Effect.sync(() => defects.push(defect))),
 *   Stream.catchCause(() => Stream.make(3))
 * )
 *
 * const program = Effect.gen(function*() {
 *   const values = yield* Stream.runCollect(stream)
 *   values // => [ 1, 2, 3 ]
 * })
 *
 * await Effect.runPromise(program)
 * defects // => [ 'boom' ]
 * ```
 *
 * @see {@link tapCause} for peeking at the full failure cause
 * @see {@link catchDefect} for recovering from defects
 *
 * @category error handling
 * @since 4.0.0
 */
export const tapDefect: {
  <B, E2, R2>(
    f: (defect: unknown) => Effect.Effect<B, E2, R2>
  ): <A, E, R>(self: Stream<A, E, R>) => Stream<A, E | E2, R | R2>
  <A, E, R, B, E2, R2>(
    self: Stream<A, E, R>,
    f: (defect: unknown) => Effect.Effect<B, E2, R2>
  ): Stream<A, E | E2, R | R2>
} = dual(2, <A, E, R, B, E2, R2>(
  self: Stream<A, E, R>,
  f: (defect: unknown) => Effect.Effect<B, E2, R2>
): Stream<A, E | E2, R | R2> =>
  tapCause(self, (cause) => {
    const defect = Cause.findDefect(cause)
    return Result.isSuccess(defect) ? f(defect.success) : Effect.void
  }))

/**
 * Recovers from errors that match a predicate by switching to a recovery stream.
 *
 * **Details**
 *
 * When a failure matches the filter, the stream switches to the recovery
 * stream. Non-matching failures propagate downstream, so the error type is
 * preserved unless the filter narrows it.
 *
 * **Example** (Catching matching failures)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const stream = Stream.make(1, 2).pipe(
 *   Stream.concat(Stream.fail(42)),
 *   Stream.catchIf(
 *     (error): error is 42 => error === 42,
 *     () => Stream.make(999)
 *   )
 * )
 *
 * const program = Effect.gen(function*() {
 *   const values = yield* Stream.runCollect(stream)
 *   values // => [ 1, 2, 999 ]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category error handling
 * @since 4.0.0
 */
export const catchIf: {
  <E, EB extends E, A2, E2, R2, A3 = unassigned, E3 = never, R3 = never>(
    refinement: Refinement<NoInfer<E>, EB>,
    f: (e: EB) => Stream<A2, E2, R2>,
    orElse?: ((e: Exclude<E, EB>) => Stream<A3, E3, R3>) | undefined
  ): <A, R>(
    self: Stream<A, E, R>
  ) => Stream<A | A2 | Exclude<A3, unassigned>, E2 | E3 | (A3 extends unassigned ? Exclude<E, EB> : never), R | R2 | R3>
  <E, A2, E2, R2, A3 = unassigned, E3 = never, R3 = never>(
    predicate: Predicate<NoInfer<E>>,
    f: (e: NoInfer<E>) => Stream<A2, E2, R2>,
    orElse?: ((e: NoInfer<E>) => Stream<A3, E3, R3>) | undefined
  ): <A, R>(
    self: Stream<A, E, R>
  ) => Stream<A | A2 | Exclude<A3, unassigned>, E2 | E3 | (A3 extends unassigned ? E : never), R | R2 | R3>
  <A, E, R, EB extends E, A2, E2, R2, A3 = unassigned, E3 = never, R3 = never>(
    self: Stream<A, E, R>,
    refinement: Refinement<E, EB>,
    f: (e: EB) => Stream<A2, E2, R2>,
    orElse?: ((e: Exclude<E, EB>) => Stream<A3, E3, R3>) | undefined
  ): Stream<A | A2 | Exclude<A3, unassigned>, E2 | E3 | (A3 extends unassigned ? Exclude<E, EB> : never), R | R2 | R3>
  <A, E, R, A2, E2, R2, A3 = unassigned, E3 = never, R3 = never>(
    self: Stream<A, E, R>,
    predicate: Predicate<E>,
    f: (e: E) => Stream<A2, E2, R2>,
    orElse?: ((e: E) => Stream<A3, E3, R3>) | undefined
  ): Stream<A | A2 | Exclude<A3, unassigned>, E2 | E3 | (A3 extends unassigned ? E : never), R | R2 | R3>
} = dual((args) => isStream(args[0]), <
  A,
  E,
  R,
  A2,
  E2,
  R2,
  A3 = never,
  E3 = E,
  R3 = never
>(
  self: Stream<A, E, R>,
  predicate: Predicate<E>,
  f: (failure: E) => Stream<A2, E2, R2>,
  orElse?: ((failure: E) => Stream<A3, E3, R3>) | undefined
): Stream<A | A2 | A3, E2 | E3, R | R2 | R3> =>
  fromChannel(
    Channel.catchIf(
      toChannel(self),
      predicate,
      (e) => f(e).channel,
      orElse && ((e) => orElse(e).channel)
    )
  ))

/**
 * Recovers from errors that match a `Filter` by switching to a recovery
 * stream.
 *
 * **When to use**
 *
 * Use to recover from stream errors with a reusable `Filter` when matching can
 * also narrow or transform the error before choosing the recovery stream.
 *
 * **Details**
 *
 * Successful filter results are passed to `f`. Failed filter results go to
 * `orElse` when provided; otherwise the filter failure is re-failed.
 *
 * @see {@link catchIf} for predicate or refinement based recovery
 * @see {@link catchTag} for `_tag` based recovery from one tagged error
 * @see {@link catchTags} for `_tag` based recovery from multiple tagged errors
 * @see {@link catchCauseFilter} for filtering full causes
 *
 * @category error handling
 * @since 4.0.0
 */
export const catchFilter: {
  <E, EB, A2, E2, R2, X, A3 = unassigned, E3 = never, R3 = never>(
    filter: Filter.Filter<NoInfer<E>, EB, X>,
    f: (failure: EB) => Stream<A2, E2, R2>,
    orElse?: ((failure: X) => Stream<A3, E3, R3>) | undefined
  ): <A, R>(
    self: Stream<A, E, R>
  ) => Stream<A | A2 | Exclude<A3, unassigned>, E2 | E3 | (A3 extends unassigned ? X : never), R | R2 | R3>
  <A, E, R, EB, A2, E2, R2, X, A3 = unassigned, E3 = never, R3 = never>(
    self: Stream<A, E, R>,
    filter: Filter.Filter<NoInfer<E>, EB, X>,
    f: (failure: EB) => Stream<A2, E2, R2>,
    orElse?: ((failure: X) => Stream<A3, E3, R3>) | undefined
  ): Stream<A | A2 | Exclude<A3, unassigned>, E2 | E3 | (A3 extends unassigned ? X : never), R | R2 | R3>
} = dual((args) => isStream(args[0]), <
  A,
  E,
  R,
  EB,
  A2,
  E2,
  R2,
  X,
  A3 = never,
  E3 = X,
  R3 = never
>(
  self: Stream<A, E, R>,
  filter: Filter.Filter<NoInfer<E>, EB, X>,
  f: (failure: EB) => Stream<A2, E2, R2>,
  orElse?: ((failure: X) => Stream<A3, E3, R3>) | undefined
): Stream<A | A2 | A3, E2 | E3, R | R2 | R3> =>
  fromChannel(
    Channel.catchFilter(
      toChannel(self),
      filter,
      (e) => f(e).channel,
      orElse && ((e) => orElse(e).channel)
    )
  ))

/**
 * Recovers from failures whose `_tag` matches the provided value by switching to
 * the stream returned by `f`.
 *
 * **When to use**
 *
 * Use when you need to handle a specific error case from a stream whose error
 * type is a tagged union with a readonly `_tag` field.
 *
 * **Example** (Catching tagged failures)
 *
 * ```ts import.meta.vitest
 * import { Data, Effect, Stream } from "effect"
 *
 * class HttpError extends Data.TaggedError("HttpError")<{ message: string }> {}
 *
 * const stream = Stream.fail(new HttpError({ message: "timeout" }))
 *
 * const recovered = Stream.catchTag(stream, "HttpError", (error) =>
 *   Stream.make(`Recovered: ${error.message}`)
 * )
 *
 * const program = Effect.gen(function*() {
 *   const values = yield* Stream.runCollect(recovered)
 *   values // => [ 'Recovered: timeout' ]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category error handling
 * @since 2.0.0
 */
export const catchTag: {
  <
    const K extends Tags<E> | Arr.NonEmptyReadonlyArray<Tags<E>>,
    E,
    A1,
    E1,
    R1,
    A2 = unassigned,
    E2 = never,
    R2 = never
  >(
    k: K,
    f: (
      e: ExtractTag<NoInfer<E>, K extends Arr.NonEmptyReadonlyArray<string> ? K[number] : K>
    ) => Stream<A1, E1, R1>,
    orElse?:
      | ((e: ExcludeTag<E, K extends Arr.NonEmptyReadonlyArray<string> ? K[number] : K>) => Stream<A2, E2, R2>)
      | undefined
  ): <A, R>(
    self: Stream<A, E, R>
  ) => Stream<
    A | A1 | Exclude<A2, unassigned>,
    | E1
    | E2
    | (A2 extends unassigned ? ExcludeTag<E, K extends Arr.NonEmptyReadonlyArray<string> ? K[number] : K> : never),
    R | R1 | R2
  >
  <
    A,
    E,
    R,
    const K extends Tags<E> | Arr.NonEmptyReadonlyArray<Tags<E>>,
    R1,
    E1,
    A1,
    A2 = unassigned,
    E2 = never,
    R2 = never
  >(
    self: Stream<A, E, R>,
    k: K,
    f: (e: ExtractTag<E, K extends Arr.NonEmptyReadonlyArray<string> ? K[number] : K>) => Stream<A1, E1, R1>,
    orElse?:
      | ((e: ExcludeTag<E, K extends Arr.NonEmptyReadonlyArray<string> ? K[number] : K>) => Stream<A2, E2, R2>)
      | undefined
  ): Stream<
    A | A1 | Exclude<A2, unassigned>,
    | E1
    | E2
    | (A2 extends unassigned ? ExcludeTag<E, K extends Arr.NonEmptyReadonlyArray<string> ? K[number] : K> : never),
    R | R1 | R2
  >
} = dual(
  (args) => isStream(args[0]),
  <
    A,
    E,
    R,
    const K extends Tags<E> | Arr.NonEmptyReadonlyArray<Tags<E>>,
    R1,
    E1,
    A1,
    A2 = never,
    E2 = ExcludeTag<E, K extends Arr.NonEmptyReadonlyArray<string> ? K[number] : K>,
    R2 = never
  >(
    self: Stream<A, E, R>,
    k: K,
    f: (e: ExtractTag<E, K extends Arr.NonEmptyReadonlyArray<string> ? K[number] : K>) => Stream<A1, E1, R1>,
    orElse?:
      | ((e: ExcludeTag<E, K extends Arr.NonEmptyReadonlyArray<string> ? K[number] : K>) => Stream<A2, E2, R2>)
      | undefined
  ): Stream<A1 | A | A2, E1 | E2, R1 | R | R2> => {
    const pred = Array.isArray(k)
      ? ((e: E): e is any => hasProperty(e, "_tag") && k.includes(e._tag))
      : isTagged(k as string)
    return catchIf(self, pred, f, orElse as any) as any
  }
)

/**
 * Switches to a recovery stream based on matching `_tag` handlers.
 *
 * **Example** (Catching tagged failures with handlers)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * class NotFound {
 *   readonly _tag = "NotFound"
 *   constructor(readonly resource: string) {}
 * }
 *
 * class Unauthorized {
 *   readonly _tag = "Unauthorized"
 *   constructor(readonly user: string) {}
 * }
 *
 * const stream = Stream.fail(new NotFound("profile"))
 *
 * const program = Effect.gen(function* () {
 *   const result = yield* stream.pipe(
 *     Stream.catchTags({
 *       NotFound: () => Stream.succeed("fallback"),
 *       Unauthorized: () => Stream.succeed("login")
 *     }),
 *     Stream.runCollect
 *   )
 *   result // => [ 'fallback' ]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category error handling
 * @since 2.0.0
 */
export const catchTags: {
  <
    E,
    Cases extends
      & { [K in Extract<E, { _tag: string }>["_tag"]]+?: ((error: Extract<E, { _tag: K }>) => Stream<any, any, any>) }
      & (unknown extends E ? {} : { [K in Exclude<keyof Cases, Extract<E, { _tag: string }>["_tag"]>]: never }),
    A2 = unassigned,
    E2 = never,
    R2 = never
  >(
    cases: Cases,
    orElse?: ((e: Exclude<E, { _tag: keyof Cases }>) => Stream<A2, E2, R2>) | undefined
  ): <A, R>(self: Stream<A, E, R>) => Stream<
    | A
    | Exclude<A2, unassigned>
    | {
      [K in keyof Cases]: Cases[K] extends ((...args: Array<any>) => Stream<infer A, any, any>) ? A : never
    }[keyof Cases],
    | E2
    | (A2 extends unassigned ? Exclude<E, { _tag: keyof Cases }> : never)
    | {
      [K in keyof Cases]: Cases[K] extends ((...args: Array<any>) => Stream<any, infer E, any>) ? E : never
    }[keyof Cases],
    | R
    | R2
    | {
      [K in keyof Cases]: Cases[K] extends ((...args: Array<any>) => Stream<any, any, infer R>) ? R : never
    }[keyof Cases]
  >
  <
    R,
    E,
    A,
    Cases extends
      & { [K in Extract<E, { _tag: string }>["_tag"]]+?: ((error: Extract<E, { _tag: K }>) => Stream<any, any, any>) }
      & (unknown extends E ? {} : { [K in Exclude<keyof Cases, Extract<E, { _tag: string }>["_tag"]>]: never }),
    A2 = unassigned,
    E2 = never,
    R2 = never
  >(
    self: Stream<A, E, R>,
    cases: Cases,
    orElse?: ((e: Exclude<E, { _tag: keyof Cases }>) => Stream<A2, E2, R2>) | undefined
  ): Stream<
    | A
    | Exclude<A2, unassigned>
    | {
      [K in keyof Cases]: Cases[K] extends ((...args: Array<any>) => Stream<infer A, any, any>) ? A : never
    }[keyof Cases],
    | E2
    | (A2 extends unassigned ? Exclude<E, { _tag: keyof Cases }> : never)
    | {
      [K in keyof Cases]: Cases[K] extends ((...args: Array<any>) => Stream<any, infer E, any>) ? E : never
    }[keyof Cases],
    | R
    | R2
    | {
      [K in keyof Cases]: Cases[K] extends ((...args: Array<any>) => Stream<any, any, infer R>) ? R : never
    }[keyof Cases]
  >
} = dual((args) => isStream(args[0]), (self, cases, orElse) => {
  let keys: Array<string>
  return catchFilter(
    self,
    (e: any) => {
      keys ??= Object.keys(cases)
      return hasProperty(e, "_tag") && isString(e["_tag"]) && keys.includes(e["_tag"])
        ? Result.succeed(e)
        : Result.fail(e)
    },
    (e: any) => cases[e["_tag"] as string](e),
    orElse
  )
})

/**
 * Catches a specific reason within a tagged error.
 *
 * **When to use**
 *
 * Use to handle nested error causes without removing the parent error
 * from the error channel.
 *
 * **Details**
 *
 * The handler receives the unwrapped reason.
 *
 * **Example** (Catching a tagged error reason)
 *
 * ```ts import.meta.vitest
 * import { Data, Effect, Stream } from "effect"
 *
 * class RateLimitError extends Data.TaggedError("RateLimitError")<{
 *   retryAfter: number
 * }> {}
 *
 * class QuotaExceededError extends Data.TaggedError("QuotaExceededError")<{
 *   limit: number
 * }> {}
 *
 * class AiError extends Data.TaggedError("AiError")<{
 *   reason: RateLimitError | QuotaExceededError
 * }> {}
 *
 * const stream = Stream.fail(
 *   new AiError({ reason: new RateLimitError({ retryAfter: 60 }) })
 * )
 *
 * const program = Effect.gen(function*() {
 *   const values = yield* stream.pipe(
 *     Stream.catchReason("AiError", "RateLimitError", (reason) =>
 *       Stream.succeed(`retry: ${reason.retryAfter}`)
 *     ),
 *     Stream.runCollect
 *   )
 *   values // => [ 'retry: 60' ]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category error handling
 * @since 4.0.0
 */
export const catchReason: {
  <
    K extends Tags<E>,
    E,
    RK extends ReasonTags<ExtractTag<NoInfer<E>, K>>,
    A2,
    E2,
    R2,
    A3 = unassigned,
    E3 = never,
    R3 = never
  >(
    errorTag: K,
    reasonTag: RK,
    f: (
      reason: ExtractReason<ExtractTag<NoInfer<E>, K>, RK>,
      error: NarrowReason<ExtractTag<NoInfer<E>, K>, RK>
    ) => Stream<A2, E2, R2>,
    orElse?:
      | ((
        reason: ExcludeReason<ExtractTag<NoInfer<E>, K>, RK>,
        error: OmitReason<ExtractTag<NoInfer<E>, K>, RK>
      ) => Stream<A3, E3, R3>)
      | undefined
  ): <A, R>(
    self: Stream<A, E, R>
  ) => Stream<
    A | A2 | Exclude<A3, unassigned>,
    ExcludeTag<E, K> | E2 | E3 | (A3 extends unassigned ? ExtractTag<E, K> : never),
    R | R2 | R3
  >
  <
    A,
    E,
    R,
    K extends Tags<E>,
    RK extends ReasonTags<ExtractTag<E, K>>,
    A2,
    E2,
    R2,
    A3 = unassigned,
    E3 = never,
    R3 = never
  >(
    self: Stream<A, E, R>,
    errorTag: K,
    reasonTag: RK,
    f: (reason: ExtractReason<ExtractTag<E, K>, RK>, error: NarrowReason<ExtractTag<E, K>, RK>) => Stream<A2, E2, R2>,
    orElse?:
      | ((reason: ExcludeReason<ExtractTag<E, K>, RK>, error: OmitReason<ExtractTag<E, K>, RK>) => Stream<A3, E3, R3>)
      | undefined
  ): Stream<
    A | A2 | Exclude<A3, unassigned>,
    ExcludeTag<E, K> | E2 | E3 | (A3 extends unassigned ? ExtractTag<E, K> : never),
    R | R2 | R3
  >
} = dual(
  (args) => isStream(args[0]),
  <
    A,
    E,
    R,
    K extends Tags<E>,
    RK extends ReasonTags<ExtractTag<E, K>>,
    A2,
    E2,
    R2,
    A3 = unassigned,
    E3 = never,
    R3 = never
  >(
    self: Stream<A, E, R>,
    errorTag: K,
    reasonTag: RK,
    f: (reason: ExtractReason<ExtractTag<E, K>, RK>, error: NarrowReason<ExtractTag<E, K>, RK>) => Stream<A2, E2, R2>,
    orElse?:
      | ((reason: ExcludeReason<ExtractTag<E, K>, RK>, error: OmitReason<ExtractTag<E, K>, RK>) => Stream<A3, E3, R3>)
      | undefined
  ): Stream<
    A | A2 | Exclude<A3, unassigned>,
    ExcludeTag<E, K> | E2 | E3 | (A3 extends unassigned ? ExtractTag<E, K> : never),
    R | R2 | R3
  > =>
    fromChannel(
      Channel.catchReason(
        toChannel(self),
        errorTag,
        reasonTag,
        (reason, error) => f(reason, error).channel,
        orElse && ((reason, error) => orElse(reason, error).channel)
      )
    ) as any
)

/**
 * Catches multiple reasons within a tagged error using an object of handlers.
 *
 * **Example** (Catching tagged error reasons)
 *
 * ```ts import.meta.vitest
 * import { Data, Effect, Stream } from "effect"
 *
 * class RateLimitError extends Data.TaggedError("RateLimitError")<{
 *   retryAfter: number
 * }> {}
 *
 * class QuotaExceededError extends Data.TaggedError("QuotaExceededError")<{
 *   limit: number
 * }> {}
 *
 * class AiError extends Data.TaggedError("AiError")<{
 *   reason: RateLimitError | QuotaExceededError
 * }> {}
 *
 * const stream = Stream.fail(
 *   new AiError({ reason: new RateLimitError({ retryAfter: 60 }) })
 * )
 *
 * const program = Effect.gen(function*() {
 *   const values = yield* stream.pipe(
 *     Stream.catchReasons("AiError", {
 *       RateLimitError: (reason) => Stream.succeed(`retry: ${reason.retryAfter}`),
 *       QuotaExceededError: (reason) => Stream.succeed(`quota: ${reason.limit}`)
 *     }),
 *     Stream.runCollect
 *   )
 *   values // => [ 'retry: 60' ]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category error handling
 * @since 4.0.0
 */
export const catchReasons: {
  <
    K extends Tags<E>,
    E,
    Cases extends {
      [RK in ReasonTags<ExtractTag<NoInfer<E>, K>>]+?: (
        reason: ExtractReason<ExtractTag<NoInfer<E>, K>, RK>,
        error: NarrowReason<ExtractTag<NoInfer<E>, K>, RK>
      ) => Stream<any, any, any>
    },
    A2 = unassigned,
    E2 = never,
    R2 = never
  >(
    errorTag: K,
    cases: Cases,
    orElse?:
      | ((
        reason: ExcludeReason<ExtractTag<NoInfer<E>, K>, Extract<keyof Cases, string>>,
        error: OmitReason<ExtractTag<NoInfer<E>, K>, Extract<keyof Cases, string>>
      ) => Stream<A2, E2, R2>)
      | undefined
  ): <A, R>(self: Stream<A, E, R>) => Stream<
    | A
    | Exclude<A2, unassigned>
    | {
      [RK in keyof Cases]: Cases[RK] extends (...args: Array<any>) => Stream<infer A, any, any> ? A : never
    }[keyof Cases],
    | ExcludeTag<E, K>
    | E2
    | (A2 extends unassigned ? ExtractTag<E, K> : never)
    | {
      [RK in keyof Cases]: Cases[RK] extends (...args: Array<any>) => Stream<any, infer E, any> ? E : never
    }[keyof Cases],
    | R
    | R2
    | {
      [RK in keyof Cases]: Cases[RK] extends (...args: Array<any>) => Stream<any, any, infer R> ? R : never
    }[keyof Cases]
  >
  <
    A,
    E,
    R,
    K extends Tags<E>,
    Cases extends {
      [RK in ReasonTags<ExtractTag<E, K>>]+?: (
        reason: ExtractReason<ExtractTag<E, K>, RK>,
        error: NarrowReason<ExtractTag<E, K>, RK>
      ) => Stream<any, any, any>
    },
    A2 = unassigned,
    E2 = never,
    R2 = never
  >(
    self: Stream<A, E, R>,
    errorTag: K,
    cases: Cases,
    orElse?:
      | ((
        reason: ExcludeReason<ExtractTag<NoInfer<E>, K>, Extract<keyof Cases, string>>,
        error: OmitReason<ExtractTag<NoInfer<E>, K>, Extract<keyof Cases, string>>
      ) => Stream<A2, E2, R2>)
      | undefined
  ): Stream<
    | A
    | Exclude<A2, unassigned>
    | {
      [RK in keyof Cases]: Cases[RK] extends (...args: Array<any>) => Stream<infer A, any, any> ? A : never
    }[keyof Cases],
    | ExcludeTag<E, K>
    | E2
    | (A2 extends unassigned ? ExtractTag<E, K> : never)
    | {
      [RK in keyof Cases]: Cases[RK] extends (...args: Array<any>) => Stream<any, infer E, any> ? E : never
    }[keyof Cases],
    | R
    | R2
    | {
      [RK in keyof Cases]: Cases[RK] extends (...args: Array<any>) => Stream<any, any, infer R> ? R : never
    }[keyof Cases]
  >
} = dual((args) => isStream(args[0]), (self, errorTag, cases, orElse) => {
  const handlers: Record<string, (reason: any, error: any) => Channel.Channel<any, any, any, any, any, any, any>> =
    Object.create(null)
  for (const key of Object.keys(cases)) {
    const handler = (cases as any)[key]
    handlers[key] = (reason, error) => handler(reason, error).channel
  }
  const orElseHandler = orElse && ((reason: any, error: any) => orElse(reason, error).channel)
  return fromChannel(
    Channel.catchReasons(self.channel, errorTag as any, handlers as any, orElseHandler as any) as Channel.Channel<
      Arr.NonEmptyReadonlyArray<any>,
      any,
      void,
      unknown,
      unknown,
      unknown,
      any
    >
  ) as any
})

/**
 * Promotes nested reason errors into the stream error channel, replacing the
 * parent error.
 *
 * **Example** (Extracting the reason from a tagged error)
 *
 * ```ts import.meta.vitest
 * import { Data, Effect, Stream } from "effect"
 *
 * class RateLimitError extends Data.TaggedError("RateLimitError")<{
 *   retryAfter: number
 * }> {}
 *
 * class QuotaExceededError extends Data.TaggedError("QuotaExceededError")<{
 *   limit: number
 * }> {}
 *
 * class AiError extends Data.TaggedError("AiError")<{
 *   reason: RateLimitError | QuotaExceededError
 * }> {}
 *
 * const stream: Stream.Stream<string, AiError> = Stream.fail(
 *   new AiError({ reason: new RateLimitError({ retryAfter: 30 }) })
 * )
 *
 * // Before: Stream<string, AiError>
 * // After:  Stream<string, RateLimitError | QuotaExceededError>
 * const unwrapped = stream.pipe(Stream.unwrapReason("AiError"))
 *
 * const program = Effect.gen(function*() {
 *   const error = yield* Effect.flip(Stream.runCollect(unwrapped))
 *   error._tag // => "RateLimitError"
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @see {@link catchReason} for recovering from a specific reason
 * @see {@link catchReasons} for handling several reasons at once
 *
 * @category error handling
 * @since 4.0.0
 */
export const unwrapReason: {
  <
    K extends Effect.TagsWithReason<E>,
    E
  >(
    errorTag: K
  ): <A, R>(self: Stream<A, E, R>) => Stream<A, ExcludeTag<E, K> | ReasonOf<ExtractTag<E, K>>, R>
  <
    A,
    E,
    R,
    K extends Effect.TagsWithReason<E>
  >(
    self: Stream<A, E, R>,
    errorTag: K
  ): Stream<A, ExcludeTag<E, K> | ReasonOf<ExtractTag<E, K>>, R>
} = dual(
  2,
  <
    A,
    E,
    R,
    K extends Effect.TagsWithReason<E>
  >(
    self: Stream<A, E, R>,
    errorTag: K
  ): Stream<A, ExcludeTag<E, K> | ReasonOf<ExtractTag<E, K>>, R> =>
    catchFilter(
      self,
      (e: any) => {
        if (isTagged(e, errorTag) && hasProperty(e, "reason")) {
          return Result.succeed(e.reason)
        }
        return Result.fail(e)
      },
      fail as any
    ) as any
)

/**
 * Transforms the errors emitted by this stream using `f`.
 *
 * **Example** (Mapping stream errors)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const result = yield* Stream.fail("bad").pipe(
 *     Stream.mapError((error) => `mapped: ${error}`),
 *     Stream.catch((error) => Stream.make(`recovered from ${error}`)),
 *     Stream.runCollect
 *   )
 *   result // => [ 'recovered from mapped: bad' ]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category error handling
 * @since 2.0.0
 */
export const mapError: {
  <E, E2>(f: (error: E) => E2): <A, R>(self: Stream<A, E, R>) => Stream<A, E2, R>
  <A, E, R, E2>(self: Stream<A, E, R>, f: (error: E) => E2): Stream<A, E2, R>
} = dual(2, <A, E, R, E2>(
  self: Stream<A, E, R>,
  f: (error: E) => E2
): Stream<A, E2, R> => fromChannel(Channel.mapError(self.channel, f)))

/**
 * Recovers from stream failures by filtering the `Cause` and switching to a recovery stream.
 * Non-matching causes are re-emitted as failures.
 *
 * **Example** (Catching matching causes)
 *
 * ```ts import.meta.vitest
 * import { Cause, Effect, Stream } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const failingStream = Stream.fail("NetworkError")
 *   const recovered = Stream.catchCauseIf(
 *     failingStream,
 *     (cause) => Cause.hasFails(cause),
 *     (cause) => Stream.make(`Recovered: ${Cause.squash(cause)}`)
 *   )
 *
 *   const output = yield* Stream.runCollect(recovered)
 *   output // => [ 'Recovered: NetworkError' ]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category error handling
 * @since 4.0.0
 */
export const catchCauseIf: {
  <E, A2, E2, R2>(
    predicate: Predicate<Cause.Cause<E>>,
    f: (cause: Cause.Cause<E>) => Stream<A2, E2, R2>
  ): <A, R>(
    self: Stream<A, E, R>
  ) => Stream<A | A2, E | E2, R2 | R>
  <A, E, R, A2, E2, R2>(
    self: Stream<A, E, R>,
    predicate: Predicate<Cause.Cause<E>>,
    f: (cause: Cause.Cause<E>) => Stream<A2, E2, R2>
  ): Stream<A | A2, E | E2, R | R2>
} = dual(3, <A, E, R, A2, E2, R2>(
  self: Stream<A, E, R>,
  predicate: Predicate<Cause.Cause<E>>,
  f: (cause: Cause.Cause<E>) => Stream<A2, E2, R2>
): Stream<A | A2, E | E2, R | R2> =>
  fromChannel(
    Channel.catchCauseIf(
      self.channel,
      predicate,
      (cause) => f(cause).channel
    )
  ))

/**
 * Recovers from stream failures by filtering the `Cause` and switching to a
 * recovery stream.
 *
 * **When to use**
 *
 * Use when you need to recover a stream only from causes selected by a
 * `Filter`, while giving the recovery both the selected value and the original
 * `Cause`.
 *
 * **Details**
 *
 * The filter is applied to the full `Cause`. A successful filter result is
 * passed to `f` together with the original cause; a failed filter result
 * re-fails with the residual cause.
 *
 * @see {@link catchCauseIf} for predicate-based cause selection
 * @see {@link catchFilter} for filtering typed error values instead of full causes
 * @see {@link catchCause} for recovering from every cause without filtering
 *
 * @category error handling
 * @since 4.0.0
 */
export const catchCauseFilter: {
  <E, EB, A2, E2, R2, X extends Cause.Cause<any>>(
    filter: Filter.Filter<Cause.Cause<E>, EB, X>,
    f: (failure: EB, cause: Cause.Cause<E>) => Stream<A2, E2, R2>
  ): <A, R>(
    self: Stream<A, E, R>
  ) => Stream<A | A2, Cause.Cause.Error<X> | E2, R2 | R>
  <A, E, R, EB, A2, E2, R2, X extends Cause.Cause<any>>(
    self: Stream<A, E, R>,
    filter: Filter.Filter<Cause.Cause<E>, EB, X>,
    f: (failure: EB, cause: Cause.Cause<E>) => Stream<A2, E2, R2>
  ): Stream<A | A2, Cause.Cause.Error<X> | E2, R | R2>
} = dual(3, <A, E, R, EB, A2, E2, R2, X extends Cause.Cause<any>>(
  self: Stream<A, E, R>,
  filter: Filter.Filter<Cause.Cause<E>, EB, X>,
  f: (failure: EB, cause: Cause.Cause<E>) => Stream<A2, E2, R2>
): Stream<A | A2, Cause.Cause.Error<X> | E2, R | R2> =>
  fromChannel(
    Channel.catchCauseFilter(
      self.channel,
      filter,
      (failure, cause) => f(failure, cause).channel
    )
  ))

/**
 * Switches to a fallback stream if this stream is empty.
 *
 * **Example** (Switching on empty streams)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const values = yield* Stream.empty.pipe(
 *     Stream.orElseIfEmpty(() => Stream.make(1, 2)),
 *     Stream.runCollect
 *   )
 *   values // => [ 1, 2 ]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category error handling
 * @since 2.0.0
 */
export const orElseIfEmpty: {
  <E, A2, E2, R2>(
    orElse: LazyArg<Stream<A2, E2, R2>>
  ): <A, R>(self: Stream<A, E, R>) => Stream<A | A2, E | E2, R | R2>
  <A, E, R, A2, E2, R2>(
    self: Stream<A, E, R>,
    orElse: LazyArg<Stream<A2, E2, R2>>
  ): Stream<A | A2, E | E2, R | R2>
} = dual(2, <A, E, R, A2, E2, R2>(
  self: Stream<A, E, R>,
  orElse: LazyArg<Stream<A2, E2, R2>>
): Stream<A | A2, E | E2, R | R2> =>
  fromChannel(Channel.orElseIfEmpty(
    self.channel,
    (_) => toChannel(orElse())
  )))

/**
 * Returns a stream that emits a fallback value when this stream fails.
 *
 * **Example** (Recovering with a fallback value)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const stream = Stream.fail("NetworkError").pipe(
 *     Stream.orElseSucceed((error) => `Recovered: ${error}`)
 *   )
 *
 *   const values = yield* Stream.runCollect(stream)
 *   values // => [ 'Recovered: NetworkError' ]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category error handling
 * @since 2.0.0
 */
export const orElseSucceed: {
  <E, A2>(
    f: (error: E) => A2
  ): <A, R>(self: Stream<A, E, R>) => Stream<A | A2, never, R>
  <A, E, R, A2>(
    self: Stream<A, E, R>,
    f: (error: E) => A2
  ): Stream<A | A2, never, R>
} = dual(2, <A, E, R, A2>(
  self: Stream<A, E, R>,
  f: (error: E) => A2
): Stream<A | A2, never, R> => catch_(self, (e) => succeed(f(e))))

/**
 * Turns typed failures into defects, making the stream infallible.
 *
 * **Example** (Turning failures into defects)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const values = yield* Stream.make(1, 2, 3).pipe(
 *     Stream.orDie,
 *     Stream.runCollect
 *   )
 *
 *   values // => [ 1, 2, 3 ]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category error handling
 * @since 2.0.0
 */
export const orDie = <A, E, R>(self: Stream<A, E, R>): Stream<A, never, R> => fromChannel(Channel.orDie(self.channel))

/**
 * Ignores failures and ends the stream on error.
 *
 * **When to use**
 *
 * Use when you want a failing stream to end gracefully rather than propagate
 * the error.
 *
 * **Details**
 *
 * The `log` option controls whether the failure is logged before the stream
 * terminates.
 *
 * **Example** (Ignoring stream failures)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const values = yield* Stream.make(1, 2, 3).pipe(
 *     Stream.concat(Stream.fail("boom")),
 *     Stream.ignore,
 *     Stream.runCollect
 *   )
 *   values // => [ 1, 2, 3 ]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * **Example** (Configuring ignore logging)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * await Effect.runPromise(Effect.gen(function*() {
 *   const values = yield* Stream.fail("boom").pipe(
 *     Stream.ignore({ log: false }),
 *     Stream.runCollect
 *   )
 *   values // => []
 * }))
 *
 * ```
 *
 * @see {@link ignoreCause} for a variant that also ignores defects, not just typed failures
 *
 * @category error handling
 * @since 4.0.0
 */
export const ignore: <
  Arg extends Stream<any, any, any> | {
    readonly log?: boolean | Severity | undefined
  } | undefined
>(
  selfOrOptions: Arg,
  options?: {
    readonly log?: boolean | Severity | undefined
  } | undefined
) => [Arg] extends [Stream<infer A, infer _E, infer R>] ? Stream<A, never, R>
  : <A, E, R>(self: Stream<A, E, R>) => Stream<A, never, R> = dual(
    (args) => isStream(args[0]),
    <A, E, R>(
      self: Stream<A, E, R>,
      options?: {
        readonly log?: boolean | Severity | undefined
      } | undefined
    ): Stream<A, never, R> => fromChannel(Channel.ignore(self.channel, options))
  )

/**
 * Ignores the stream's failure cause, including defects, and ends the stream.
 *
 * **When to use**
 *
 * Use when you need to silently suppress a stream's entire failure cause,
 * including both typed errors and defects, rather than propagate it downstream.
 *
 * **Example** (Ignoring stream failure causes)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * await Effect.runPromise(Effect.gen(function*() {
 *   const values = yield* Stream.make(1, 2).pipe(
 *     Stream.concat(Stream.die("boom")),
 *     Stream.ignoreCause({ log: false }),
 *     Stream.runCollect
 *   )
 *   values // => [1, 2]
 * }))
 *
 * ```
 *
 * @see {@link ignore} to ignore only typed failures without suppressing defects
 *
 * @category error handling
 * @since 4.0.0
 */
export const ignoreCause: <
  Arg extends Stream<any, any, any> | {
    readonly log?: boolean | Severity | undefined
  } | undefined
>(
  streamOrOptions: Arg,
  options?: {
    readonly log?: boolean | Severity | undefined
  } | undefined
) => [Arg] extends [Stream<infer A, infer _E, infer R>] ? Stream<A, never, R>
  : <A, E, R>(self: Stream<A, E, R>) => Stream<A, never, R> = dual(
    (args) => isStream(args[0]),
    <A, E, R>(
      self: Stream<A, E, R>,
      options?: { readonly log?: boolean | Severity | undefined } | undefined
    ): Stream<A, never, R> => fromChannel(Channel.ignoreCause(self.channel, options))
  )

/**
 * Retries the stream according to the given schedule when it fails.
 *
 * **Details**
 *
 * This retries the entire stream, so will re-execute all of the stream's
 * acquire operations.
 *
 * The schedule is reset as soon as the first element passes through the
 * stream again.
 *
 * **Example** (Retrying stream failures)
 *
 * ```ts import.meta.vitest
 * import { Effect, Schedule, Stream } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const values = yield* Stream.make(1).pipe(
 *     Stream.concat(Stream.fail("boom")),
 *     Stream.retry(Schedule.recurs(1)),
 *     Stream.take(2),
 *     Stream.runCollect
 *   )
 *
 *   values // => [ 1, 1 ]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category error handling
 * @since 2.0.0
 */
export const retry: {
  <E, X, E2, R2>(
    policy:
      | Schedule.Schedule<X, NoInfer<E>, E2, R2>
      | ((
        $: <SO, SE, SR>(_: Schedule.Schedule<SO, NoInfer<E>, SE, SR>) => Schedule.Schedule<SO, E, SE, SR>
      ) => Schedule.Schedule<X, NoInfer<E>, E2, R2>)
  ): <A, R>(self: Stream<A, E, R>) => Stream<A, E | E2, R2 | R>
  <A, E, R, X, E2, R2>(
    self: Stream<A, E, R>,
    policy:
      | Schedule.Schedule<X, NoInfer<E>, E2, R2>
      | ((
        $: <SO, SE, SR>(_: Schedule.Schedule<SO, NoInfer<E>, SE, SR>) => Schedule.Schedule<SO, E, SE, SR>
      ) => Schedule.Schedule<X, NoInfer<E>, E2, R2>)
  ): Stream<A, E | E2, R2 | R>
} = dual(
  2,
  <A, E, R, X, E2, R2>(
    self: Stream<A, E, R>,
    policy:
      | Schedule.Schedule<X, NoInfer<E>, E2, R2>
      | ((
        $: <SO, SE, SR>(_: Schedule.Schedule<SO, NoInfer<E>, SE, SR>) => Schedule.Schedule<SO, E, SE, SR>
      ) => Schedule.Schedule<X, NoInfer<E>, E2, R2>)
  ): Stream<A, E | E2, R2 | R> => fromChannel(Channel.retry(self.channel, policy))
)

const retryWithoutReset = <A, E, R, X, E2, R2>(
  self: Stream<A, E, R>,
  schedule: Schedule.Schedule<X, E, E2, R2>
): Stream<A, E | E2, R | R2> =>
  unwrap(Effect.map(Schedule.toStepWithMetadata(schedule), (step) => {
    let meta = Schedule.CurrentMetadata.defaultValue()
    const loop = (): Stream<A, E | E2, R | R2> =>
      catch_(
        provideServiceEffect(self, Schedule.CurrentMetadata, Effect.sync(() => meta)),
        (error) =>
          unwrap(Pull.catchDone(
            Effect.map(step(error), (meta_) => {
              meta = meta_
              return unwrap(Effect.as(Effect.yieldNow, loop()))
            }),
            () => Effect.succeed(fail(error))
          ))
      )
    return loop()
  }))

/**
 * Applies an `ExecutionPlan` to a stream, retrying with step-provided resources
 * until it succeeds or the plan is exhausted.
 *
 * **Details**
 *
 * By default, a failing step can fallback even after emitting elements; set
 * `preventFallbackOnPartialStream` to fail instead of mixing partial output with
 * a later fallback.
 *
 * Attempts can be observed from outside the stream by passing
 * `options.onEvent`, which receives an `ExecutionPlan.Event` before each
 * attempt and after it settles; see `Effect.withExecutionPlan` for the handler
 * semantics. When a downstream consumer stops pulling early (for example
 * `Stream.take` outside the plan), the truncated attempt reports
 * `AttemptSuccess`: the consumer stopped, not the source.
 *
 * **Example** (Applying an execution plan)
 *
 * ```ts import.meta.vitest
 * import { Context, Effect, ExecutionPlan, Layer, Stream } from "effect"
 *
 * class Service extends Context.Service<Service>()("Service", {
 *   make: Effect.succeed({
 *     stream: Stream.fail("A") as Stream.Stream<number, string>
 *   })
 * }) {
 *   static Bad = Layer.succeed(Service, Service.of({ stream: Stream.fail("A") }))
 *   static Good = Layer.succeed(Service, Service.of({ stream: Stream.make(1, 2, 3) }))
 * }
 *
 * const plan = ExecutionPlan.make(
 *   { provide: Service.Bad },
 *   { provide: Service.Good }
 * )
 *
 * const stream = Stream.unwrap(Effect.map(Service, (_) => _.stream))
 *
 * const program = Effect.gen(function*() {
 *   const items = yield* stream.pipe(Stream.withExecutionPlan(plan), Stream.runCollect)
 *   items // => [ 1, 2, 3 ]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category error handling
 * @since 3.16.0
 */
export const withExecutionPlan: {
  <Input, R2, Provides, PolicyE, RX = never>(
    policy: ExecutionPlan.ExecutionPlan<{ provides: Provides; input: Input; error: PolicyE; requirements: R2 }>,
    options?: {
      readonly preventFallbackOnPartialStream?: boolean | undefined
      readonly onEvent?: ((event: ExecutionPlan.Event<Input | PolicyE>) => Effect.Effect<void, never, RX>) | undefined
    }
  ): <A, E extends Input, R>(self: Stream<A, E, R>) => Stream<A, E | PolicyE, R2 | Exclude<R, Provides> | RX>
  <A, E extends Input, R, R2, Input, Provides, PolicyE, RX = never>(
    self: Stream<A, E, R>,
    policy: ExecutionPlan.ExecutionPlan<{ provides: Provides; input: Input; error: PolicyE; requirements: R2 }>,
    options?: {
      readonly preventFallbackOnPartialStream?: boolean | undefined
      readonly onEvent?: ((event: ExecutionPlan.Event<E | PolicyE>) => Effect.Effect<void, never, RX>) | undefined
    }
  ): Stream<A, E | PolicyE, R2 | Exclude<R, Provides> | RX>
} = dual((args) => isStream(args[0]), <A, E extends Input, R, R2, Input, Provides, PolicyE, RX>(
  self: Stream<A, E, R>,
  policy: ExecutionPlan.ExecutionPlan<{
    provides: Provides
    input: Input
    error: PolicyE
    requirements: R2
  }>,
  options?: {
    readonly preventFallbackOnPartialStream?: boolean | undefined
    readonly onEvent?: ((event: ExecutionPlan.Event<E | PolicyE>) => Effect.Effect<void, never, RX>) | undefined
  }
): Stream<A, E | PolicyE, R2 | Exclude<R, Provides> | RX> =>
  suspend(() => {
    const preventFallbackOnPartialStream = options?.preventFallbackOnPartialStream ?? false
    let i = 0
    let meta: ExecutionPlan.Metadata = {
      attempt: 0,
      stepIndex: 0
    }
    const provideMeta = provideServiceEffect(
      ExecutionPlan.CurrentMetadata,
      Effect.sync(() => {
        meta = {
          attempt: meta.attempt + 1,
          stepIndex: i
        }
        return meta
      })
    )
    const emitter = options?.onEvent === undefined
      ? undefined
      : internalExecutionPlan.makeEventEmitter(options.onEvent, () => meta)
    let attemptState: internalExecutionPlan.AttemptState | undefined
    const instrument: (attempt: Stream<A, E | PolicyE, any>) => Stream<A, E | PolicyE, any> = emitter === undefined
      ? identity
      : (attempt) =>
        onExit(
          onStart(
            attempt,
            Effect.map(emitter.begin, (state) => {
              attemptState = state
            })
          ),
          (exit) =>
            Effect.suspend(() => {
              if (attemptState === undefined) return Effect.void
              const state = attemptState
              attemptState = undefined
              return emitter.end(state, exit)
            })
        )
    let lastError = Option.none<E | PolicyE>()
    const loop: Stream<
      A,
      E | PolicyE,
      R2 | Exclude<R, Provides>
    > = suspend(() => {
      const step = policy.steps[i]
      if (!step) {
        return fail(Option.getOrThrow(lastError))
      }

      let nextStream: Stream<A, E | PolicyE, R2 | Exclude<R, Provides>> = provideMeta(
        instrument(provide(self, step.provide))
      )
      let receivedElements = false

      if (Option.isSome(lastError)) {
        const error = lastError.value
        let attempted = false
        const wrapped = nextStream
        // ensure the schedule is applied at least once
        nextStream = suspend(() => {
          if (attempted) return wrapped
          attempted = true
          return fail(error)
        })
        nextStream = retryWithoutReset(nextStream, internalExecutionPlan.scheduleFromStep(step, false) as any)
      } else {
        const schedule = internalExecutionPlan.scheduleFromStep(step, true)
        nextStream = schedule ? retryWithoutReset(nextStream, schedule as any) : nextStream
      }

      return catch_(
        preventFallbackOnPartialStream ?
          onFirst(nextStream, (_) => {
            receivedElements = true
            return Effect.void
          }) :
          nextStream,
        (error) => {
          i++
          if (preventFallbackOnPartialStream && receivedElements) {
            return fail(error)
          }
          lastError = Option.some(error)
          return loop
        }
      )
    })
    return loop
  }))

/**
 * Takes the first `n` elements from this stream.
 *
 * **Details**
 *
 * Finite fractional values of `n` are rounded down. `NaN` and non-positive
 * values return `Stream.empty` without evaluating the source stream.
 *
 * **Example** (Taking values from the left)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const values = yield* Stream.make(1, 2, 3, 4, 5).pipe(
 *     Stream.take(3),
 *     Stream.runCollect
 *   )
 *   values // => [ 1, 2, 3 ]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category filtering
 * @since 2.0.0
 */
export const take: {
  (n: number): <A, E, R>(self: Stream<A, E, R>) => Stream<A, E, R>
  <A, E, R>(self: Stream<A, E, R>, n: number): Stream<A, E, R>
} = dual(
  2,
  <A, E, R>(self: Stream<A, E, R>, n: number): Stream<A, E, R> => {
    const count = Count.normalize(n)
    return count === 0 ? empty : takeUntil(self, (_, i) => i === (count - 1))
  }
)

/**
 * Emits byte chunks until the configured limit would be exceeded, then drops
 * the crossing chunk and switches to a fallback stream.
 *
 * **Example** (Truncating at a byte limit)
 *
 * ```ts import.meta.vitest
 * import { ByteSize, Effect, Stream } from "effect"
 *
 * const program = Stream.make(
 *   new Uint8Array([1, 2]),
 *   new Uint8Array([3, 4, 5])
 * ).pipe(
 *   Stream.limitBytes(ByteSize.bytes(4), () => Stream.empty),
 *   Stream.runCollect,
 *   Effect.map((chunks) => chunks.map((chunk) => [...chunk]))
 * )
 *
 * await Effect.runPromise(program) // => [[1, 2]]
 * ```
 *
 * @category filtering
 * @since 4.0.0
 */
export const limitBytes: {
  <E, R>(
    bytes: ByteSize.Input,
    onLimitReached: LazyArg<Stream<Uint8Array, E, R>>
  ): (self: Stream<Uint8Array, E, R>) => Stream<Uint8Array, E, R>
  <E, R>(
    self: Stream<Uint8Array, E, R>,
    bytes: ByteSize.Input,
    onLimitReached: LazyArg<Stream<Uint8Array, E, R>>
  ): Stream<Uint8Array, E, R>
} = dual(3, <E, R>(
  self: Stream<Uint8Array, E, R>,
  bytes: ByteSize.Input,
  onLimitReached: LazyArg<Stream<Uint8Array, E, R>>
): Stream<Uint8Array, E, R> =>
  suspend(() => {
    const limit = ByteSize.fromInputUnsafe(bytes)
    let size = BigInt(0)
    let limitReached = false
    return concat(
      takeWhile(self, (chunk) => {
        const nextSize = size + BigInt(chunk.length)
        if (nextSize > limit) {
          limitReached = true
          return false
        }
        size = nextSize
        return true
      }),
      suspend(() => limitReached ? onLimitReached() : empty)
    )
  }))

/**
 * Keeps the last `n` elements from this stream.
 *
 * **Details**
 *
 * Finite fractional values of `n` are rounded down. `NaN` and non-positive
 * values return `Stream.empty` without evaluating the source stream.
 *
 * **Example** (Taking elements from the right)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const values = yield* Stream.range(1, 6).pipe(
 *     Stream.takeRight(3),
 *     Stream.runCollect
 *   )
 *   values // => [ 4, 5, 6 ]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category filtering
 * @since 2.0.0
 */
export const takeRight: {
  (n: number): <A, E, R>(self: Stream<A, E, R>) => Stream<A, E, R>
  <A, E, R>(self: Stream<A, E, R>, n: number): Stream<A, E, R>
} = dual(
  2,
  <A, E, R>(self: Stream<A, E, R>, n: number): Stream<A, E, R> => {
    const count = Count.normalize(n)
    if (count === 0) return empty
    return mapAccumArray(self, MutableList.make<A>, (list, arr) => {
      MutableList.appendAll(list, arr)
      if (list.length > count) {
        MutableList.takeNVoid(list, list.length - count)
      }
      return [list, emptyArr]
    }, {
      onHalt(list) {
        return MutableList.takeAll(list)
      }
    })
  }
)

/**
 * Takes elements until the predicate matches.
 *
 * **Details**
 *
 * When `excludeLast` is `true`, the matching element is dropped.
 *
 * **Example** (Taking until a predicate matches)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const stream = Stream.range(1, 5)
 *
 * const program = Effect.gen(function*() {
 *   const inclusive = yield* stream.pipe(
 *     Stream.takeUntil((n) => n % 3 === 0),
 *     Stream.runCollect
 *   )
 *   inclusive // => [ 1, 2, 3 ]
 *
 *   const exclusive = yield* stream.pipe(
 *     Stream.takeUntil((n) => n % 3 === 0, { excludeLast: true }),
 *     Stream.runCollect
 *   )
 *   exclusive // => [ 1, 2 ]
 * })
 * await Effect.runPromise(program)
 * ```
 *
 * @category filtering
 * @since 2.0.0
 */
export const takeUntil: {
  <A>(predicate: (a: NoInfer<A>, n: number) => boolean, options?: {
    readonly excludeLast?: boolean | undefined
  }): <E, R>(self: Stream<A, E, R>) => Stream<A, E, R>
  <A, E, R>(self: Stream<A, E, R>, predicate: (a: A, n: number) => boolean, options?: {
    readonly excludeLast?: boolean | undefined
  }): Stream<A, E, R>
} = dual(
  (args) => isStream(args[0]),
  <A, E, R>(self: Stream<A, E, R>, predicate: (a: A, n: number) => boolean, options?: {
    readonly excludeLast?: boolean | undefined
  }): Stream<A, E, R> =>
    transformPull(self, (pull, _scope) =>
      Effect.sync(() => {
        let i = 0
        let done = false
        const pump: Pull.Pull<Arr.NonEmptyReadonlyArray<A>, E, void, R> = Effect.flatMap(
          Effect.suspend(() => done ? Cause.done() : pull),
          (chunk) => {
            const index = chunk.findIndex((a) => predicate(a, i++))
            if (index >= 0) {
              done = true
              const arr = chunk.slice(0, options?.excludeLast ? index : index + 1)
              return Arr.isReadonlyArrayNonEmpty(arr) ? Effect.succeed(arr) : Cause.done()
            }
            return Effect.succeed(chunk)
          }
        )
        return pump
      }))
)

/**
 * Takes stream elements until an effectful predicate returns `true`.
 *
 * **When to use**
 *
 * Use when the stopping condition needs an Effect or service and predicate
 * failure should fail the stream.
 *
 * **Example** (Taking until an effectful predicate matches)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const result = yield* Stream.range(1, 5).pipe(
 *     Stream.takeUntilEffect((n) => Effect.succeed(n % 3 === 0)),
 *     Stream.runCollect
 *   )
 *   result // => [ 1, 2, 3 ]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category filtering
 * @since 2.0.0
 */
export const takeUntilEffect: {
  <A, E2, R2>(
    predicate: (a: NoInfer<A>, n: number) => Effect.Effect<boolean, E2, R2>,
    options?: {
      readonly excludeLast?: boolean | undefined
    }
  ): <E, R>(self: Stream<A, E, R>) => Stream<A, E2 | E, R2 | R>
  <A, E, R, E2, R2>(
    self: Stream<A, E, R>,
    predicate: (a: A, n: number) => Effect.Effect<boolean, E2, R2>,
    options?: {
      readonly excludeLast?: boolean | undefined
    }
  ): Stream<A, E | E2, R | R2>
} = dual((args) => isStream(args[0]), <A, E, R, E2, R2>(
  self: Stream<A, E, R>,
  predicate: (a: A, n: number) => Effect.Effect<boolean, E2, R2>,
  options?: {
    readonly excludeLast?: boolean | undefined
  }
): Stream<A, E | E2, R | R2> =>
  transformPull(self, (pull, _scope) =>
    Effect.sync(() => {
      let i = 0
      let done = false
      return Effect.gen(function*() {
        if (done) return yield* Cause.done()
        const chunk = yield* pull
        for (let j = 0; j < chunk.length; j++) {
          if (yield* predicate(chunk[j], i++)) {
            done = true
            const arr = chunk.slice(0, options?.excludeLast ? j : j + 1)
            return Arr.isReadonlyArrayNonEmpty(arr) ? arr : yield* Cause.done()
          }
        }
        return chunk
      })
    })))

/**
 * Takes the longest initial prefix of elements that satisfy the predicate.
 *
 * **Example** (Taking while a predicate holds)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const stream = Stream.range(1, 5).pipe(
 *   Stream.takeWhile((n) => n % 3 !== 0)
 * )
 *
 * const program = Effect.gen(function*() {
 *   const result = yield* Stream.runCollect(stream)
 *   result // => [ 1, 2 ]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category filtering
 * @since 2.0.0
 */
export const takeWhile: {
  <A, B extends A>(refinement: (a: NoInfer<A>, n: number) => a is B): <E, R>(self: Stream<A, E, R>) => Stream<B, E, R>
  <A>(predicate: (a: NoInfer<A>, n: number) => boolean): <E, R>(self: Stream<A, E, R>) => Stream<A, E, R>
  <A, E, R, B extends A>(self: Stream<A, E, R>, refinement: (a: NoInfer<A>, n: number) => a is B): Stream<B, E, R>
  <A, E, R>(self: Stream<A, E, R>, predicate: (a: NoInfer<A>, n: number) => boolean): Stream<A, E, R>
} = dual(
  2,
  <A, E, R>(
    self: Stream<A, E, R>,
    predicate: (a: A, n: number) => boolean
  ): Stream<A, E, R> =>
    transformPull(self, (pull, _scope) =>
      Effect.sync(() => {
        let i = 0
        let done = false
        const pump: Pull.Pull<Arr.NonEmptyReadonlyArray<A>, E, void, R> = Effect.flatMap(
          Effect.suspend(() => done ? Cause.done() : pull),
          (chunk) => {
            const out: Array<A> = []
            for (let j = 0; j < chunk.length; j++) {
              if (!predicate(chunk[j], i++)) {
                done = true
                break
              }
              out.push(chunk[j])
            }
            return Arr.isReadonlyArrayNonEmpty(out) ? Effect.succeed(out) : done ? Cause.done() : pump
          }
        )
        return pump
      }))
)

/**
 * Takes the longest initial prefix accepted by a `Filter` and emits the
 * filter's success values.
 *
 * **When to use**
 *
 * Use to keep the leading stream elements that a `Filter` accepts, emit the
 * filter's success values, and stop at the first filter failure.
 *
 * **Details**
 *
 * The stream stops at the first `Result.fail` returned by the filter.
 *
 * @see {@link takeWhile} for keeping original elements with a boolean predicate or refinement
 * @see {@link filterMap} for filtering across the whole stream instead of only the leading prefix
 * @see {@link dropWhileFilter} for dropping the accepted prefix and keeping the remaining original elements
 *
 * @category filtering
 * @since 4.0.0
 */
export const takeWhileFilter: {
  <A, B, X>(f: Filter.Filter<NoInfer<A>, B, X>): <E, R>(self: Stream<A, E, R>) => Stream<B, E, R>
  <A, E, R, B, X>(self: Stream<A, E, R>, f: Filter.Filter<NoInfer<A>, B, X>): Stream<B, E, R>
} = dual(
  2,
  <A, E, R, B, X>(
    self: Stream<A, E, R>,
    filter: Filter.Filter<NoInfer<A>, B, X>
  ): Stream<B, E, R> =>
    transformPull(self, (pull, _scope) =>
      Effect.sync(() => {
        let done = false
        const pump: Pull.Pull<Arr.NonEmptyReadonlyArray<B>, E, void, R> = Effect.flatMap(
          Effect.suspend(() => done ? Cause.done() : pull),
          (chunk) => {
            const out: Array<B> = []
            for (let j = 0; j < chunk.length; j++) {
              const result = filter(chunk[j])
              if (Result.isFailure(result)) {
                done = true
                break
              }
              out.push(result.success)
            }
            return Arr.isReadonlyArrayNonEmpty(out) ? Effect.succeed(out) : done ? Cause.done() : pump
          }
        )
        return pump
      }))
)

/**
 * Takes elements from the stream while the effectful predicate is `true`.
 *
 * **When to use**
 *
 * Use when the leading-prefix predicate needs an Effect or service and the
 * stream should stop before the first false result.
 *
 * **Example** (Effectfully taking while a predicate holds)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const result = yield* Stream.range(1, 5).pipe(
 *     Stream.takeWhileEffect((n) => Effect.succeed(n % 3 !== 0)),
 *     Stream.runCollect
 *   )
 *   result // => [ 1, 2 ]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category filtering
 * @since 4.0.0
 */
export const takeWhileEffect: {
  <A, E2, R2>(
    predicate: (a: NoInfer<A>, n: number) => Effect.Effect<boolean, E2, R2>
  ): <E, R>(self: Stream<A, E, R>) => Stream<A, E | E2, R | R2>
  <A, E, R, E2, R2>(
    self: Stream<A, E, R>,
    predicate: (a: NoInfer<A>, n: number) => Effect.Effect<boolean, E2, R2>
  ): Stream<A, E | E2, R | R2>
} = dual(2, <A, E, R, E2, R2>(
  self: Stream<A, E, R>,
  predicate: (a: NoInfer<A>, n: number) => Effect.Effect<boolean, E2, R2>
) =>
  takeUntilEffect(self, (a, n) =>
    Effect.map(
      predicate(a, n),
      (b) => !b
    ), { excludeLast: true }))

/**
 * Drops the first `n` elements from this stream.
 *
 * **Details**
 *
 * Finite fractional values of `n` are rounded down. `NaN` and non-positive
 * values return the source stream unchanged.
 *
 * **Example** (Dropping values from the left)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const stream = Stream.make(1, 2, 3, 4, 5)
 * const result = Stream.drop(stream, 2)
 *
 * const program = Effect.gen(function*() {
 *   const items = yield* Stream.runCollect(result)
 *   items // => [ 3, 4, 5 ]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category filtering
 * @since 2.0.0
 */
export const drop: {
  (n: number): <A, E, R>(self: Stream<A, E, R>) => Stream<A, E, R>
  <A, E, R>(self: Stream<A, E, R>, n: number): Stream<A, E, R>
} = dual(
  2,
  <A, E, R>(self: Stream<A, E, R>, n: number): Stream<A, E, R> => {
    const count = Count.normalize(n)
    if (count === 0) return self
    return transformPull(self, (pull, _scope) =>
      Effect.sync(() => {
        let dropped = 0
        const pump: Pull.Pull<Arr.NonEmptyReadonlyArray<A>, E, void, R> = pull.pipe(
          Effect.flatMap((chunk) => {
            if (dropped >= count) return Effect.succeed(chunk)
            dropped += chunk.length
            if (dropped <= count) return pump
            return Effect.succeed(chunk.slice(count - dropped) as Arr.NonEmptyArray<A>)
          })
        )
        return pump
      }))
  }
)

/**
 * Drops elements until the specified predicate evaluates to `true`, then drops
 * that matching element.
 *
 * **Example** (Dropping until a predicate matches)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const stream = Stream.make(1, 2, 3, 4, 5)
 * const result = Stream.dropUntil(stream, (n) => n >= 3)
 *
 * await Effect.runPromise(Effect.gen(function*() {
 *   const output = yield* Stream.runCollect(result)
 *   output // => [ 4, 5 ]
 * }))
 * ```
 *
 * @category filtering
 * @since 2.0.0
 */
export const dropUntil: {
  <A>(predicate: (a: NoInfer<A>, index: number) => boolean): <E, R>(self: Stream<A, E, R>) => Stream<A, E, R>
  <A, E, R>(self: Stream<A, E, R>, predicate: (a: NoInfer<A>, index: number) => boolean): Stream<A, E, R>
} = dual(2, <A, E, R>(
  self: Stream<A, E, R>,
  predicate: (a: NoInfer<A>, index: number) => boolean
): Stream<A, E, R> => drop(dropWhile(self, (a, i) => !predicate(a, i)), 1))

/**
 * Drops all elements of the stream until the specified effectful predicate
 * evaluates to `true`.
 *
 * **When to use**
 *
 * Use when dropping the leading prefix requires an Effect or service and the
 * first matching element should also be dropped.
 *
 * **Example** (Dropping until an effectful predicate matches)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const result = yield* Stream.range(1, 5).pipe(
 *     Stream.dropUntilEffect((n) => Effect.succeed(n % 3 === 0)),
 *     Stream.runCollect
 *   )
 *   result // => [ 4, 5 ]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category filtering
 * @since 2.0.0
 */
export const dropUntilEffect: {
  <A, E2, R2>(
    predicate: (a: NoInfer<A>, index: number) => Effect.Effect<boolean, E2, R2>
  ): <E, R>(self: Stream<A, E, R>) => Stream<A, E2 | E, R2 | R>
  <A, E, R, E2, R2>(
    self: Stream<A, E, R>,
    predicate: (a: NoInfer<A>, index: number) => Effect.Effect<boolean, E2, R2>
  ): Stream<A, E | E2, R | R2>
} = dual(2, <A, E, R, E2, R2>(
  self: Stream<A, E, R>,
  predicate: (a: NoInfer<A>, index: number) => Effect.Effect<boolean, E2, R2>
): Stream<A, E | E2, R | R2> =>
  drop(
    dropWhileEffect(
      self,
      (a, i) => Effect.map(predicate(a, i), (b) => !b)
    ),
    1
  ))

/**
 * Drops elements from the stream while the specified predicate evaluates to `true`.
 *
 * **Example** (Dropping while a predicate holds)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const values = yield* Stream.make(1, 2, 3, 4, 5).pipe(
 *     Stream.dropWhile((n) => n < 3),
 *     Stream.runCollect
 *   )
 *   values // => [ 3, 4, 5 ]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category filtering
 * @since 2.0.0
 */
export const dropWhile: {
  <A>(predicate: (a: NoInfer<A>, index: number) => boolean): <E, R>(self: Stream<A, E, R>) => Stream<A, E, R>
  <A, E, R>(self: Stream<A, E, R>, predicate: (a: NoInfer<A>, index: number) => boolean): Stream<A, E, R>
} = dual(2, <A, E, R>(
  self: Stream<A, E, R>,
  predicate: (a: A, index: number) => boolean
): Stream<A, E, R> =>
  transformPull(self, (pull, _scope) =>
    Effect.sync(() => {
      let dropping = true
      let index = 0
      const filtered: Pull.Pull<Arr.NonEmptyReadonlyArray<A>, E> = Effect.flatMap(pull, (arr) => {
        const found = arr.findIndex((a) => !predicate(a, index++))
        if (found === -1) return filtered
        dropping = false
        return Effect.succeed(arr.slice(found) as Arr.NonEmptyArray<A>)
      })
      return Effect.suspend(() => dropping ? filtered : pull)
    })))

/**
 * Drops elements while the filter succeeds.
 *
 * **When to use**
 *
 * Use when you need to remove a leading stream prefix based on a synchronous
 * `Filter` result while preserving the remaining original stream elements.
 *
 * **Details**
 *
 * `Result.succeed` drops the current element. The first `Result.fail` stops
 * dropping, emits that original element, and the rest of the source stream is
 * emitted without further filtering.
 *
 * @see {@link dropWhile} for boolean predicate prefix dropping
 * @see {@link takeWhileFilter} for keeping the accepted prefix as filter success values
 * @see {@link dropWhileEffect} for effectful predicate prefix dropping
 *
 * @category filtering
 * @since 4.0.0
 */
export const dropWhileFilter: {
  <A, B, X>(filter: Filter.Filter<NoInfer<A>, B, X>): <E, R>(self: Stream<A, E, R>) => Stream<A, E, R>
  <A, E, R, B, X>(self: Stream<A, E, R>, filter: Filter.Filter<NoInfer<A>, B, X>): Stream<A, E, R>
} = dual(2, <A, E, R, B, X>(
  self: Stream<A, E, R>,
  filter: Filter.Filter<NoInfer<A>, B, X>
): Stream<A, E, R> =>
  transformPull(self, (pull, _scope) =>
    Effect.sync(() => {
      let dropping = true
      const filtered: Pull.Pull<Arr.NonEmptyReadonlyArray<A>, E> = Effect.flatMap(pull, (arr) => {
        const found = arr.findIndex((a) => Result.isFailure(filter(a)))
        if (found === -1) return filtered
        dropping = false
        return Effect.succeed(arr.slice(found) as Arr.NonEmptyArray<A>)
      })
      return Effect.suspend(() => dropping ? filtered : pull)
    })))

/**
 * Drops elements while the specified effectful predicate evaluates to `true`.
 *
 * **Example** (Effectfully dropping while a predicate holds)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const result = yield* Stream.make(1, 2, 3, 4, 5).pipe(
 *     Stream.dropWhileEffect((n) => Effect.succeed(n < 3)),
 *     Stream.runCollect
 *   )
 *   result // => [ 3, 4, 5 ]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category filtering
 * @since 2.0.0
 */
export const dropWhileEffect: {
  <A, E2, R2>(
    predicate: (a: NoInfer<A>, index: number) => Effect.Effect<boolean, E2, R2>
  ): <E, R>(self: Stream<A, E, R>) => Stream<A, E2 | E, R2 | R>
  <A, E, R, E2, R2>(
    self: Stream<A, E, R>,
    predicate: (a: A, index: number) => Effect.Effect<boolean, E2, R2>
  ): Stream<A, E | E2, R | R2>
} = dual(2, <A, E, R, E2, R2>(
  self: Stream<A, E, R>,
  predicate: (a: NoInfer<A>, index: number) => Effect.Effect<boolean, E2, R2>
): Stream<A, E | E2, R | R2> =>
  transformPull(self, (pull, _scope) =>
    Effect.sync(() => {
      let dropping = true
      let index = 0
      const filtered: Pull.Pull<Arr.NonEmptyReadonlyArray<A>, E | E2, void, R2> = Effect.gen(function*() {
        while (true) {
          const arr = yield* pull
          for (let i = 0; i < arr.length; i++) {
            const drop = yield* predicate(arr[i], index++)
            if (drop) continue
            dropping = false
            return arr.slice(i) as Arr.NonEmptyArray<A>
          }
        }
      })
      return Effect.suspend((): Pull.Pull<Arr.NonEmptyReadonlyArray<A>, E | E2, void, R | R2> =>
        dropping ? filtered : pull
      )
    })))

/**
 * Drops the last specified number of elements from this stream.
 *
 * **Details**
 *
 * Keeps the last `n` elements in memory to drop them on completion. Finite
 * fractional values of `n` are rounded down. `NaN` and non-positive values
 * return the source stream unchanged.
 *
 * **Example** (Dropping values from the right)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const result = yield* Stream.make(1, 2, 3, 4, 5).pipe(
 *     Stream.dropRight(2),
 *     Stream.runCollect
 *   )
 *   result // => [ 1, 2, 3 ]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category filtering
 * @since 2.0.0
 */
export const dropRight: {
  (n: number): <A, E, R>(self: Stream<A, E, R>) => Stream<A, E, R>
  <A, E, R>(self: Stream<A, E, R>, n: number): Stream<A, E, R>
} = dual(
  2,
  <A, E, R>(self: Stream<A, E, R>, n: number): Stream<A, E, R> => {
    const count = Count.normalize(n)
    if (count === 0) return self
    return transformPull(self, (pull, _scope) =>
      Effect.sync(() => {
        const list = MutableList.make<A>()
        const emit: Pull.Pull<Arr.NonEmptyReadonlyArray<A>, E> = Effect.flatMap(pull, (arr) => {
          MutableList.appendAllUnsafe(list, arr)
          const toTake = list.length - count
          const items = MutableList.takeN(list, toTake)
          return Arr.isArrayNonEmpty(items) ? Effect.succeed(items) : emit
        })
        return emit
      }))
  }
)

/**
 * Exposes the underlying chunks as a stream of non-empty arrays.
 *
 * **Example** (Exposing stream chunks)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const chunks = yield* Stream.make(1, 2, 3, 4).pipe(
 *     Stream.rechunk(2),
 *     Stream.chunks,
 *     Stream.runCollect
 *   )
 *   chunks // => [ [ 1, 2 ], [ 3, 4 ] ]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category grouping
 * @since 2.0.0
 */
export const chunks = <A, E, R>(self: Stream<A, E, R>): Stream<Arr.NonEmptyReadonlyArray<A>, E, R> =>
  self.channel.pipe(
    Channel.map(Arr.of),
    fromChannel
  )

/**
 * Groups the stream into arrays of the specified size, preserving element order.
 *
 * **Details**
 *
 * Finite fractional sizes are rounded down. `NaN` and non-positive sizes are
 * treated as `1`.
 *
 * **Example** (Rechunking stream elements)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const result = yield* Stream.make(1, 2, 3, 4, 5).pipe(
 *     Stream.rechunk(2),
 *     Stream.chunks,
 *     Stream.runCollect
 *   )
 *   result // => [ [ 1, 2 ], [ 3, 4 ], [ 5 ] ]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category grouping
 * @since 2.0.0
 */
export const rechunk: {
  (size: number): <A, E, R>(self: Stream<A, E, R>) => Stream<A, E, R>
  <A, E, R>(self: Stream<A, E, R>, size: number): Stream<A, E, R>
} = dual(2, <A, E, R>(self: Stream<A, E, R>, target: number): Stream<A, E, R> => {
  target = Count.normalizeNonEmpty(target)
  return transformPull(self, (pull, _scope) =>
    Effect.sync(() => {
      let chunk = Arr.empty<A>() as Arr.NonEmptyArray<A>
      let index = 0
      let current: Arr.NonEmptyReadonlyArray<A> | undefined
      let done = false

      return Effect.suspend(function loop(): Pull.Pull<Arr.NonEmptyReadonlyArray<A>, E, void, R> {
        if (done) return Cause.done()
        else if (current === undefined) {
          return Effect.flatMap(pull, (arr) => {
            if (chunk.length === 0 && arr.length === target) {
              return Effect.succeed(arr)
            } else if (chunk.length + arr.length < target) {
              for (let i = 0; i < arr.length; i++) {
                chunk.push(arr[i])
              }
              return loop()
            }
            current = arr
            return loop()
          })
        }
        for (; index < current.length;) {
          chunk.push(current[index++])
          if (chunk.length === target) {
            const result = chunk
            chunk = [] as any
            return Effect.succeed(result)
          }
        }
        index = 0
        current = undefined
        return loop()
      }).pipe(
        Pull.catchDone(() => {
          if (chunk.length === 0) return Cause.done()
          const result = chunk
          done = true
          chunk = [] as any
          return Effect.succeed(result)
        })
      )
    }))
})

/**
 * Emits a sliding window of `n` elements.
 *
 * **Details**
 *
 * Finite fractional window sizes are rounded down. `NaN` and non-positive
 * sizes are treated as `1`.
 *
 * **Example** (Emitting sliding windows)
 *
 * ```ts import.meta.vitest
 * import { Effect, pipe, Stream } from "effect"
 *
 * await Effect.runPromise(Effect.gen(function*() {
 *   const result = yield* pipe(
 *     Stream.make(1, 2, 3, 4, 5),
 *     Stream.sliding(2),
 *     Stream.runCollect
 *   )
 *   result // => [ [ 1, 2 ], [ 2, 3 ], [ 3, 4 ], [ 4, 5 ] ]
 * }))
 * ```
 *
 * @category grouping
 * @since 2.0.0
 */
export const sliding: {
  (chunkSize: number): <A, E, R>(self: Stream<A, E, R>) => Stream<Arr.NonEmptyReadonlyArray<A>, E, R>
  <A, E, R>(self: Stream<A, E, R>, chunkSize: number): Stream<Arr.NonEmptyReadonlyArray<A>, E, R>
} = dual(
  2,
  <A, E, R>(self: Stream<A, E, R>, chunkSize: number): Stream<Arr.NonEmptyReadonlyArray<A>, E, R> =>
    slidingSize(self, chunkSize, 1)
)

/**
 * Emits sliding windows of `chunkSize` elements, advancing by `stepSize`.
 *
 * **Details**
 *
 * Finite fractional window and step sizes are rounded down. `NaN` and
 * non-positive sizes are treated as `1`.
 *
 * **Example** (Emitting sliding windows with a step size)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const chunks = yield* Stream.make(1, 2, 3, 4, 5).pipe(
 *     Stream.slidingSize(3, 2),
 *     Stream.runCollect
 *   )
 *   chunks // => [ [ 1, 2, 3 ], [ 3, 4, 5 ] ]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category grouping
 * @since 2.0.0
 */
export const slidingSize: {
  (chunkSize: number, stepSize: number): <A, E, R>(self: Stream<A, E, R>) => Stream<Arr.NonEmptyReadonlyArray<A>, E, R>
  <A, E, R>(self: Stream<A, E, R>, chunkSize: number, stepSize: number): Stream<Arr.NonEmptyReadonlyArray<A>, E, R>
} = dual(
  3,
  <A, E, R>(self: Stream<A, E, R>, chunkSize: number, stepSize: number): Stream<Arr.NonEmptyReadonlyArray<A>, E, R> => {
    const windowSize = Count.normalizeNonEmpty(chunkSize)
    const step = Count.normalizeNonEmpty(stepSize)
    return transformPull(self, (upstream, _scope) =>
      Effect.sync(() => {
        let cause: Cause.Cause<E | Cause.Done> | null = null
        const list = MutableList.make<A>()
        let emitted = false
        let skip = 0
        const pull: Pull.Pull<
          Arr.NonEmptyReadonlyArray<Arr.NonEmptyReadonlyArray<A>>,
          E | Cause.Done
        > = Effect.matchCauseEffect(upstream, {
          onSuccess(arr) {
            MutableList.appendAllUnsafe(list, arr)
            if (skip > 0) {
              const length = list.length
              MutableList.takeNVoid(list, skip)
              skip = Math.max(0, skip - length)
            }
            if (list.length < windowSize) return pull
            emitted = true
            const chunks = [] as any as Arr.NonEmptyArray<Arr.NonEmptyReadonlyArray<A>>
            while (list.length >= windowSize) {
              if (windowSize === step) {
                chunks.push(MutableList.takeN(list, windowSize) as any)
              } else {
                chunks.push(MutableList.toArrayN(list, windowSize) as any)
                const length = list.length
                MutableList.takeNVoid(list, step)
                skip = Math.max(0, step - length)
              }
            }
            return Effect.succeed(chunks)
          },
          onFailure(cause_) {
            if (emitted) MutableList.takeNVoid(list, windowSize - step)
            if (list.length === 0) return Effect.failCause(cause_)
            cause = cause_
            return Effect.succeed(Arr.of(MutableList.takeAll(list) as any))
          }
        })

        return Effect.suspend(() => cause ? Effect.failCause(cause) : pull)
      }))
  }
)

/**
 * Splits the stream into non-empty groups whenever the predicate matches.
 *
 * **Details**
 *
 * Matching elements act as delimiters and are not included in the output.
 *
 * **Example** (Splitting on matching values)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const result = yield* Stream.range(0, 9).pipe(
 *     Stream.split((n) => n % 4 === 0),
 *     Stream.runCollect
 *   )
 *   result // => [ [ 1, 2, 3 ], [ 5, 6, 7 ], [ 9 ] ]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category grouping
 * @since 2.0.0
 */
export const split: {
  <A, B extends A>(
    refinement: Refinement<NoInfer<A>, B>
  ): <E, R>(self: Stream<A, E, R>) => Stream<Arr.NonEmptyReadonlyArray<Exclude<A, B>>, E, R>
  <A>(predicate: Predicate<NoInfer<A>>): <E, R>(self: Stream<A, E, R>) => Stream<Arr.NonEmptyReadonlyArray<A>, E, R>
  <A, E, R, B extends A>(
    self: Stream<A, E, R>,
    refinement: Refinement<A, B>
  ): Stream<Arr.NonEmptyReadonlyArray<Exclude<A, B>>, E, R>
  <A, E, R>(self: Stream<A, E, R>, predicate: Predicate<A>): Stream<Arr.NonEmptyReadonlyArray<A>, E, R>
} = dual(2, <A, E, R>(
  self: Stream<A, E, R>,
  predicate: Predicate<NoInfer<A>>
): Stream<Arr.NonEmptyReadonlyArray<A>, E, R> =>
  mapAccumArray(self, Arr.empty<A>, (acc, arr) => {
    const out = Arr.empty<Arr.NonEmptyReadonlyArray<A>>()
    for (let i = 0; i < arr.length; i++) {
      if (predicate(arr[i])) {
        if (Arr.isArrayNonEmpty(acc)) {
          out.push(acc)
          acc = []
        }
      } else {
        acc.push(arr[i])
      }
    }
    return [acc, out]
  }, {
    onHalt(arr) {
      return Arr.isArrayNonEmpty(arr) ? Arr.of(arr) : emptyArr
    }
  }))

/**
 * Combines elements from this stream and the specified stream by repeatedly
 * applying a stateful function that can pull from either side.
 *
 * **Details**
 *
 * Where possible, prefer `Stream.combineArray` for a more efficient
 * implementation.
 *
 * **Example** (Combining streams with state)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const stream = Stream.combine(
 *   Stream.make("A", "B", "C"),
 *   Stream.make(1, 2, 3),
 *   () => true,
 *   (takeLeft, pullLeft, pullRight) =>
 *     takeLeft
 *       ? Effect.map(pullLeft, (value) => [`L:${value}`, false] as const)
 *       : Effect.map(pullRight, (value) => [`R:${value}`, true] as const)
 * )
 *
 * const program = Effect.gen(function*() {
 *   const output = yield* Stream.runCollect(stream)
 *   output // => [ 'L:A', 'R:1', 'L:B', 'R:2', 'L:C', 'R:3' ]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category merging
 * @since 2.0.0
 */
export const combine: {
  <A2, E2, R2, S, E, A, A3, E3, R3>(
    that: Stream<A2, E2, R2>,
    s: LazyArg<S>,
    f: (
      s: S,
      pullLeft: Pull.Pull<A, E, void>,
      pullRight: Pull.Pull<A2, E2, void>
    ) => Effect.Effect<readonly [A3, S], E3, R3>
  ): <R>(self: Stream<A, E, R>) => Stream<A3, E3, R2 | R3 | R>
  <A, E, R, A2, E2, R2, S, A3, E3, R3>(
    self: Stream<A, E, R>,
    that: Stream<A2, E2, R2>,
    s: LazyArg<S>,
    f: (
      s: S,
      pullLeft: Pull.Pull<A, E, void>,
      pullRight: Pull.Pull<A2, E2, void>
    ) => Effect.Effect<readonly [A3, S], E3, R3>
  ): Stream<A3, E3, R | R2 | R3>
} = dual(4, <A, E, R, A2, E2, R2, S, A3, E3, R3>(
  self: Stream<A, E, R>,
  that: Stream<A2, E2, R2>,
  s: LazyArg<S>,
  f: (
    s: S,
    pullLeft: Pull.Pull<A, E, void>,
    pullRight: Pull.Pull<A2, E2, void>
  ) => Effect.Effect<readonly [A3, S], E3, R3>
): Stream<A3, E3, R | R2 | R3> =>
  Channel.combine(
    Channel.flattenArray(self.channel),
    Channel.flattenArray(that.channel),
    s,
    f
  ).pipe(
    Channel.map(Arr.of),
    fromChannel
  ))

/**
 * Combines two streams chunk-by-chunk with a stateful pull function.
 *
 * **When to use**
 *
 * Use to coordinate pulling chunks from two streams when each emitted chunk
 * depends on both sides and local state.
 *
 * **Details**
 *
 * The combining function receives the current state and pull functions for the
 * left and right streams. It returns the next non-empty chunk together with the
 * next state.
 *
 * **Example** (Combining stream chunks with state)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const stream = Stream.make(1, 2).pipe(
 *   Stream.combineArray(
 *     Stream.make(10, 20),
 *     () => true,
 *     (useLeft, pullLeft, pullRight) =>
 *       Effect.gen(function*() {
 *         const array = useLeft ? yield* pullLeft : yield* pullRight
 *         return [array, !useLeft] as const
 *       })
 *   )
 * )
 *
 * const program = Effect.gen(function*() {
 *   const values = yield* Stream.runCollect(stream)
 *   values // => [ 1, 2, 10, 20 ]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category merging
 * @since 4.0.0
 */
export const combineArray: {
  <A2, E2, R2, S, E, A, A3, E3, R3>(
    that: Stream<A2, E2, R2>,
    s: LazyArg<S>,
    f: (
      s: S,
      pullLeft: Pull.Pull<Arr.NonEmptyReadonlyArray<A>, E, void>,
      pullRight: Pull.Pull<Arr.NonEmptyReadonlyArray<A2>, E2, void>
    ) => Effect.Effect<readonly [Arr.NonEmptyReadonlyArray<A3>, S], E3, R3>
  ): <R>(self: Stream<A, E, R>) => Stream<A3, Pull.ExcludeDone<E3>, R2 | R3 | R>
  <R, A2, E2, R2, S, E, A, A3, E3, R3>(
    self: Stream<A, E, R>,
    that: Stream<A2, E2, R2>,
    s: LazyArg<S>,
    f: (
      s: S,
      pullLeft: Pull.Pull<Arr.NonEmptyReadonlyArray<A>, E, void>,
      pullRight: Pull.Pull<Arr.NonEmptyReadonlyArray<A2>, E2, void>
    ) => Effect.Effect<readonly [Arr.NonEmptyReadonlyArray<A3>, S], E3, R3>
  ): Stream<A3, Pull.ExcludeDone<E3>, R | R2 | R3>
} = dual(4, <R, A2, E2, R2, S, E, A, A3, E3, R3>(
  self: Stream<A, E, R>,
  that: Stream<A2, E2, R2>,
  s: LazyArg<S>,
  f: (
    s: S,
    pullLeft: Pull.Pull<Arr.NonEmptyReadonlyArray<A>, E, void>,
    pullRight: Pull.Pull<Arr.NonEmptyReadonlyArray<A2>, E2, void>
  ) => Effect.Effect<readonly [Arr.NonEmptyReadonlyArray<A3>, S], E3, R3>
): Stream<A3, Pull.ExcludeDone<E3>, R | R2 | R3> =>
  fromChannel(Channel.combine(
    self.channel,
    that.channel,
    s,
    f
  )))

/**
 * Maps elements statefully, emitting zero or more outputs per input.
 *
 * **Example** (Statefully mapping stream values)
 *
 * ```ts import.meta.vitest
 * import { Console, Effect, Stream } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const totals = yield* Stream.make(0, 1, 2, 3, 4, 5, 6).pipe(
 *     Stream.mapAccum(() => 0, (total, n) => {
 *       const next = total + n
 *       return [next, [next]] as const
 *     }),
 *     Stream.runCollect
 *   )
 *
 *   totals // => [0, 1, 3, 6, 10, 15, 21]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category mapping
 * @since 2.0.0
 */
export const mapAccum: {
  <S, A, B>(
    initial: LazyArg<S>,
    f: (s: S, a: A) => readonly [state: S, values: ReadonlyArray<B>],
    options?: {
      readonly onHalt?: ((state: S) => ReadonlyArray<B>) | undefined
    }
  ): <E, R>(self: Stream<A, E, R>) => Stream<B, E, R>
  <A, E, R, S, B>(
    self: Stream<A, E, R>,
    initial: LazyArg<S>,
    f: (s: S, a: A) => readonly [state: S, values: ReadonlyArray<B>],
    options?: {
      readonly onHalt?: ((state: S) => ReadonlyArray<B>) | undefined
    }
  ): Stream<B, E, R>
} = dual((args) => isStream(args[0]), <A, E, R, S, B>(
  self: Stream<A, E, R>,
  initial: LazyArg<S>,
  f: (s: S, a: A) => readonly [state: S, values: ReadonlyArray<B>],
  options?: {
    readonly onHalt?: ((state: S) => ReadonlyArray<B>) | undefined
  }
): Stream<B, E, R> =>
  fromChannel(Channel.mapAccum(
    self.channel,
    initial,
    (state, arr) => {
      const acc = Arr.empty<B>()
      for (let index = 0; index < arr.length; index++) {
        const [newState, values] = f(state, arr[index])
        state = newState
        acc.push(...values)
      }
      return [state, Arr.isArrayNonEmpty(acc) ? Arr.of(acc) : emptyArr]
    },
    options?.onHalt ?
      {
        onHalt(state) {
          const arr = options.onHalt!(state)
          return Arr.isReadonlyArrayNonEmpty(arr) ? Arr.of(arr) : emptyArr
        }
      } :
      undefined
  )))

/**
 * Maps over non-empty chunk arrays statefully, emitting zero or more values per chunk.
 *
 * **Details**
 *
 * The mapping function runs once per chunk and the state is threaded across chunks.
 *
 * **Example** (Statefully mapping stream chunks)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const output = yield* Stream.make(1, 2, 3, 4, 5, 6).pipe(
 *     Stream.rechunk(2),
 *     Stream.mapAccumArray(() => 0, (sum: number, chunk) => {
 *       const next = chunk.reduce((acc, n) => acc + n, sum)
 *       return [next, [next]]
 *     }),
 *     Stream.runCollect
 *   )
 *   output // => [ 3, 10, 21 ]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category mapping
 * @since 4.0.0
 */
export const mapAccumArray: {
  <S, A, B>(
    initial: LazyArg<S>,
    f: (s: S, a: Arr.NonEmptyReadonlyArray<A>) => readonly [state: S, values: ReadonlyArray<B>],
    options?: {
      readonly onHalt?: ((state: S) => ReadonlyArray<B>) | undefined
    }
  ): <E, R>(self: Stream<A, E, R>) => Stream<B, E, R>
  <A, E, R, S, B>(
    self: Stream<A, E, R>,
    initial: LazyArg<S>,
    f: (s: S, a: Arr.NonEmptyReadonlyArray<A>) => readonly [state: S, values: ReadonlyArray<B>],
    options?: {
      readonly onHalt?: ((state: S) => ReadonlyArray<B>) | undefined
    }
  ): Stream<B, E, R>
} = dual((args) => isStream(args[0]), <A, E, R, S, B>(
  self: Stream<A, E, R>,
  initial: LazyArg<S>,
  f: (s: S, a: Arr.NonEmptyReadonlyArray<A>) => readonly [state: S, values: ReadonlyArray<B>],
  options?: {
    readonly onHalt?: ((state: S) => ReadonlyArray<B>) | undefined
  }
): Stream<B, E, R> =>
  fromChannel(Channel.mapAccum(
    self.channel,
    initial,
    (state, arr) => {
      const [newState, values] = f(state, arr)
      state = newState
      return [state, Arr.isReadonlyArrayNonEmpty(values) ? Arr.of(values) : emptyArr]
    },
    options?.onHalt ?
      {
        onHalt(state) {
          const arr = options.onHalt!(state)
          return Arr.isReadonlyArrayNonEmpty(arr) ? Arr.of(arr) : emptyArr
        }
      } :
      undefined
  )))

const emptyArr = Arr.empty<never>()

/**
 * Maps each element statefully and effectfully, emitting zero or more output
 * values per input.
 *
 * **When to use**
 *
 * Use when stateful element mapping needs Effects or can fail while emitting
 * zero or more values per input element.
 *
 * **Details**
 *
 * The mapping effect receives the current state and element, then returns the
 * next state plus the values to emit. The state is threaded through the
 * stream.
 *
 * **Example** (Effectfully mapping stream values with state)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const result = yield* Stream.make(1, 1, 1).pipe(
 *     Stream.mapAccumEffect(() => 0, (total, n) =>
 *       Effect.succeed([total + n, [total + n]])
 *     ),
 *     Stream.runCollect
 *   )
 *
 *   result // => [ 1, 2, 3 ]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category mapping
 * @since 2.0.0
 */
export const mapAccumEffect: {
  <S, A, B, E2, R2>(
    initial: LazyArg<S>,
    f: (s: S, a: A) => Effect.Effect<readonly [state: S, values: ReadonlyArray<B>], E2, R2>,
    options?: {
      readonly onHalt?: ((state: S) => ReadonlyArray<B>) | undefined
    }
  ): <E, R>(self: Stream<A, E, R>) => Stream<B, E | E2, R | R2>
  <A, E, R, S, B, E2, R2>(
    self: Stream<A, E, R>,
    initial: LazyArg<S>,
    f: (s: S, a: A) => Effect.Effect<readonly [state: S, values: ReadonlyArray<B>], E2, R2>,
    options?: {
      readonly onHalt?: ((state: S) => ReadonlyArray<B>) | undefined
    }
  ): Stream<B, E | E2, R | R2>
} = dual((args) => isStream(args[0]), <A, E, R, S, B, E2, R2>(
  self: Stream<A, E, R>,
  initial: LazyArg<S>,
  f: (s: S, a: A) => Effect.Effect<readonly [state: S, values: ReadonlyArray<B>], E2, R2>,
  options?: {
    readonly onHalt?: ((state: S) => ReadonlyArray<B>) | undefined
  }
): Stream<B, E | E2, R | R2> =>
  self.channel.pipe(
    Channel.flattenArray,
    Channel.mapAccum(
      initial,
      (state, a) =>
        Effect.map(
          f(state, a),
          ([state, values]) => [
            state,
            Arr.isReadonlyArrayNonEmpty(values) ? Arr.of(values) : Arr.empty<Arr.NonEmptyReadonlyArray<B>>()
          ]
        ),
      options?.onHalt ?
        {
          onHalt(state) {
            const arr = options.onHalt!(state)
            return Arr.isReadonlyArrayNonEmpty(arr) ? Arr.of(arr) : emptyArr
          }
        } :
        undefined
    ),
    fromChannel
  ))

/**
 * Maps each non-empty input chunk statefully and effectfully, emitting zero or
 * more output values per chunk.
 *
 * **When to use**
 *
 * Use when stateful mapping should process each emitted non-empty chunk with an
 * Effect instead of each element separately.
 *
 * **Details**
 *
 * The mapping effect receives the current state and chunk, then returns the
 * next state plus the values to emit. The state is threaded across chunks.
 *
 * **Example** (Effectfully mapping stream chunks with state)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const totals = yield* Stream.make(1, 2, 3, 4).pipe(
 *     Stream.rechunk(2),
 *     Stream.mapAccumArrayEffect(() => 0, (total, chunk) =>
 *       Effect.gen(function*() {
 *         const next = chunk.reduce((sum, value) => sum + value, total)
 *         return [next, [next]] as const
 *       })
 *     ),
 *     Stream.runCollect
 *   )
 *   totals // => [ 3, 10 ]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category mapping
 * @since 4.0.0
 */
export const mapAccumArrayEffect: {
  <S, A, B, E2, R2>(
    initial: LazyArg<S>,
    f: (s: S, a: Arr.NonEmptyReadonlyArray<A>) => Effect.Effect<readonly [state: S, values: ReadonlyArray<B>], E2, R2>,
    options?: {
      readonly onHalt?: ((state: S) => ReadonlyArray<B>) | undefined
    }
  ): <E, R>(self: Stream<A, E, R>) => Stream<B, E | E2, R | R2>
  <A, E, R, S, B, E2, R2>(
    self: Stream<A, E, R>,
    initial: LazyArg<S>,
    f: (s: S, a: Arr.NonEmptyReadonlyArray<A>) => Effect.Effect<readonly [state: S, values: ReadonlyArray<B>], E2, R2>,
    options?: {
      readonly onHalt?: ((state: S) => ReadonlyArray<B>) | undefined
    }
  ): Stream<B, E | E2, R | R2>
} = dual((args) => isStream(args[0]), <A, E, R, S, B, E2, R2>(
  self: Stream<A, E, R>,
  initial: LazyArg<S>,
  f: (s: S, a: Arr.NonEmptyReadonlyArray<A>) => Effect.Effect<readonly [state: S, values: ReadonlyArray<B>], E2, R2>,
  options?: {
    readonly onHalt?: ((state: S) => ReadonlyArray<B>) | undefined
  }
): Stream<B, E | E2, R | R2> =>
  self.channel.pipe(
    Channel.mapAccum(
      initial,
      (state, a) =>
        Effect.map(
          f(state, a),
          ([state, values]) => [
            state,
            Arr.isReadonlyArrayNonEmpty(values) ? Arr.of(values) : emptyArr
          ]
        ),
      options?.onHalt ?
        {
          onHalt(state) {
            const arr = options.onHalt!(state)
            return Arr.isReadonlyArrayNonEmpty(arr) ? Arr.of(arr) : emptyArr
          }
        } :
        undefined
    ),
    fromChannel
  ))

/**
 * Accumulates state across the stream, emitting the initial state and each updated state.
 *
 * **Example** (Scanning stream state)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const values = yield* Stream.make(1, 2, 3).pipe(
 *     Stream.scan(() => 0, (acc, n) => acc + n),
 *     Stream.runCollect
 *   )
 *   values // => [ 0, 1, 3, 6 ]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category accumulation
 * @since 2.0.0
 */
export const scan: {
  <S, A>(
    initial: LazyArg<S>,
    f: (s: S, a: A) => S
  ): <E, R>(self: Stream<A, E, R>) => Stream<S, E, R>
  <A, E, R, S>(
    self: Stream<A, E, R>,
    initial: LazyArg<S>,
    f: (s: S, a: A) => S
  ): Stream<S, E, R>
} = dual(3, <A, E, R, S>(
  self: Stream<A, E, R>,
  initial: LazyArg<S>,
  f: (s: S, a: A) => S
): Stream<S, E, R> =>
  suspend(() => {
    const seed = initial()
    return concat(
      succeed(seed),
      fromChannel(Channel.mapAccum(self.channel, () => seed, (state, arr) => {
        const states = Arr.empty<S>() as Arr.NonEmptyArray<S>
        for (let index = 0; index < arr.length; index++) {
          state = f(state, arr[index])
          states.push(state)
        }
        return [state, Arr.of(states)]
      }))
    )
  }))

/**
 * Accumulates state effectfully and emits the initial state plus each accumulated state.
 *
 * **Example** (Effectfully scanning stream state)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const states = yield* Stream.make(1, 2, 3).pipe(
 *     Stream.scanEffect(() => 0, (sum, n) => Effect.succeed(sum + n)),
 *     Stream.runCollect
 *   )
 *   states // => [ 0, 1, 3, 6 ]
 * })
 * await Effect.runPromise(program)
 * ```
 *
 * @category accumulation
 * @since 2.0.0
 */
export const scanEffect: {
  <S, A, E2, R2>(
    initial: LazyArg<S>,
    f: (s: S, a: A) => Effect.Effect<S, E2, R2>
  ): <E, R>(self: Stream<A, E, R>) => Stream<S, E | E2, R | R2>
  <A, E, R, S, E2, R2>(
    self: Stream<A, E, R>,
    initial: LazyArg<S>,
    f: (s: S, a: A) => Effect.Effect<S, E2, R2>
  ): Stream<S, E | E2, R | R2>
} = dual(3, <A, E, R, S, E2, R2>(
  self: Stream<A, E, R>,
  initial: LazyArg<S>,
  f: (s: S, a: A) => Effect.Effect<S, E2, R2>
): Stream<S, E | E2, R | R2> =>
  suspend(() =>
    self.channel.pipe(
      Channel.flattenArray,
      Channel.scanEffect(initial(), f),
      Channel.map(Arr.of),
      fromChannel
    )
  ))

/**
 * Drops earlier elements within the debounce window and emits only the latest element after the pause.
 *
 * **Example** (Debouncing stream elements)
 *
 * ```ts import.meta.vitest
 * import { Duration, Effect, Stream } from "effect"
 *
 * const stream = Stream.make(1, 2, 3).pipe(Stream.debounce(Duration.zero))
 *
 * const program = Effect.gen(function*() {
 *   const values = yield* Stream.runCollect(stream)
 *   values // => [ 3 ]
 * })
 * await Effect.runPromise(program)
 * ```
 *
 * @category rate limiting
 * @since 2.0.0
 */
export const debounce: {
  (duration: Duration.Input): <A, E, R>(self: Stream<A, E, R>) => Stream<A, E, R>
  <A, E, R>(self: Stream<A, E, R>, duration: Duration.Input): Stream<A, E, R>
} = dual(
  2,
  <A, E, R>(self: Stream<A, E, R>, duration: Duration.Input): Stream<A, E, R> =>
    transformPull(
      self,
      Effect.fnUntraced(function*(pull, scope) {
        const clock = yield* Clock
        const durationMs = Duration.toMillis(Duration.fromInputUnsafe(duration))
        let lastArr: Arr.NonEmptyReadonlyArray<A> | undefined
        let cause: Cause.Cause<Cause.Done | E> | undefined
        let emitAtMs = Infinity
        const pullLatch = Latch.makeUnsafe()
        const emitLatch = Latch.makeUnsafe()
        const endLatch = Latch.makeUnsafe()

        yield* pull.pipe(
          pullLatch.whenOpen,
          Effect.flatMap((arr) => {
            emitLatch.openUnsafe()
            lastArr = arr
            emitAtMs = clock.currentTimeMillisUnsafe() + durationMs
            return Effect.void
          }),
          Effect.forever({ disableYield: true }),
          Effect.onError((cause_) => {
            cause = cause_
            emitAtMs = clock.currentTimeMillisUnsafe()
            emitLatch.openUnsafe()
            endLatch.openUnsafe()
            return Effect.void
          }),
          Effect.forkIn(scope)
        )

        const sleepLoop = Effect.suspend(function loop(): Pull.Pull<Arr.NonEmptyReadonlyArray<A>, E, void, R> {
          const now = clock.currentTimeMillisUnsafe()
          const timeMs = emitAtMs < now ? durationMs : Math.min(durationMs, emitAtMs - now)
          return Effect.flatMap(Effect.raceFirst(Effect.sleep(timeMs), endLatch.await), () => {
            const now = clock.currentTimeMillisUnsafe()
            if (now < emitAtMs) {
              return loop()
            } else if (lastArr) {
              emitLatch.closeUnsafe()
              pullLatch.closeUnsafe()
              const eff = Effect.succeed(Arr.of(Arr.lastNonEmpty(lastArr)))
              lastArr = undefined
              return eff
            } else if (cause) {
              return Effect.failCause(cause!)
            }
            return loop()
          })
        })

        return Effect.suspend(() => {
          if (cause) {
            if (lastArr) {
              const eff = Effect.succeed(Arr.of(Arr.lastNonEmpty(lastArr)))
              lastArr = undefined
              return eff
            }
            return Effect.failCause(cause)
          }
          pullLatch.openUnsafe()
          return emitLatch.whenOpen(sleepLoop)
        })
      })
    )
)

/**
 * Rate-limits stream chunks with an effectful cost function.
 *
 * **When to use**
 *
 * Use to throttle chunks when computing each chunk's cost requires an effect.
 *
 * **Details**
 *
 * Uses a token bucket. The bucket can accumulate up to `units + burst` tokens,
 * and each chunk consumes the cost returned by the effectful `cost` function.
 *
 * If using the "enforce" strategy, arrays that do not meet the bandwidth
 * constraints are dropped. If using the "shape" strategy, arrays are delayed
 * until they can be emitted without exceeding the bandwidth constraints.
 *
 * Defaults to the "shape" strategy.
 *
 * **Example** (Throttling stream chunks effectfully)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const stream = Stream.range(0, 5).pipe(
 *   Stream.rechunk(1),
 *   Stream.throttleEffect({
 *     cost: (arr) => Effect.succeed(arr.length),
 *     units: 1,
 *     duration: 0,
 *     strategy: "shape"
 *   })
 * )
 *
 * await Effect.runPromise(Effect.gen(function*() {
 *   const result = yield* Stream.runCollect(stream)
 *   result // => [ 0, 1, 2, 3, 4, 5 ]
 * }))
 * ```
 *
 * @category rate limiting
 * @since 2.0.0
 */
export const throttleEffect: {
  <A, E2, R2>(options: {
    readonly cost: (arr: Arr.NonEmptyReadonlyArray<A>) => Effect.Effect<number, E2, R2>
    readonly units: number
    readonly duration: Duration.Input
    readonly burst?: number | undefined
    readonly strategy?: "enforce" | "shape" | undefined
  }): <E, R>(self: Stream<A, E, R>) => Stream<A, E2 | E, R2 | R>
  <A, E, R, E2, R2>(
    self: Stream<A, E, R>,
    options: {
      readonly cost: (arr: Arr.NonEmptyReadonlyArray<A>) => Effect.Effect<number, E2, R2>
      readonly units: number
      readonly duration: Duration.Input
      readonly burst?: number | undefined
      readonly strategy?: "enforce" | "shape" | undefined
    }
  ): Stream<A, E | E2, R | R2>
} = dual(
  2,
  <A, E, R, E2, R2>(
    self: Stream<A, E, R>,
    options: {
      readonly cost: (arr: Arr.NonEmptyReadonlyArray<A>) => Effect.Effect<number, E2, R2>
      readonly units: number
      readonly duration: Duration.Input
      readonly burst?: number | undefined
      readonly strategy?: "enforce" | "shape" | undefined
    }
  ): Stream<A, E | E2, R | R2> => {
    const burst = options.burst ?? 0
    if (options.strategy === "enforce") {
      return throttleEnforceEffect(self, options.cost, options.units, options.duration, burst)
    }
    return throttleShapeEffect(self, options.cost, options.units, options.duration, burst)
  }
)

const throttleEnforceEffect = <A, E, R, E2, R2>(
  self: Stream<A, E, R>,
  cost: (arr: Arr.NonEmptyReadonlyArray<A>) => Effect.Effect<number, E2, R2>,
  units: number,
  duration: Duration.Input,
  burst: number
): Stream<A, E | E2, R | R2> =>
  transformPull(self, (pull) =>
    Effect.clockWith((clock) => {
      const durationMs = Duration.toMillis(Duration.fromInputUnsafe(duration))
      const max = units + burst < 0 ? Number.POSITIVE_INFINITY : units + burst
      let tokens = units
      let timestampMs = clock.currentTimeMillisUnsafe()

      return Effect.succeed(
        Effect.flatMap(pull, function loop(arr): Pull.Pull<Arr.NonEmptyReadonlyArray<A>, E | E2, void, R | R2> {
          return Effect.flatMap(cost(arr), (weight) => {
            const currentMs = clock.currentTimeMillisUnsafe()
            const elapsed = currentMs - timestampMs
            const cycles = elapsed / durationMs
            const sum = tokens + (cycles * units)
            const available = sum < 0 ? max : Math.min(sum, max)

            if (weight <= available) {
              tokens = available - weight
              timestampMs = currentMs
              return Effect.succeed(arr)
            }

            // Drop the array and continue
            return Effect.flatMap(pull, loop)
          })
        })
      )
    }))

const throttleShapeEffect = <A, E, R, E2, R2>(
  self: Stream<A, E, R>,
  cost: (arr: Arr.NonEmptyReadonlyArray<A>) => Effect.Effect<number, E2, R2>,
  units: number,
  duration: Duration.Input,
  burst: number
): Stream<A, E | E2, R | R2> =>
  transformPull(self, (pull) =>
    Effect.clockWith((clock) => {
      const durationMs = Duration.toMillis(Duration.fromInputUnsafe(duration))
      const max = units + burst < 0 ? Number.POSITIVE_INFINITY : units + burst
      let tokens = units
      let timestampNanos = clock.monotonicTimeNanosUnsafe()

      return Effect.succeed(Effect.flatMap(pull, (arr) =>
        Effect.flatMap(cost(arr), (weight) => {
          const currentNanos = clock.monotonicTimeNanosUnsafe()
          const elapsed = Number(currentNanos - timestampNanos) / 1_000_000
          const cycles = elapsed / durationMs
          const sum = tokens + (cycles * units)
          const available = Math.min(sum, max)
          const remaining = available - weight

          if (remaining >= 0) {
            tokens = remaining
            timestampNanos = currentNanos
            return Effect.succeed(arr)
          }

          const waitCycles = -remaining / units
          const delayMs = Math.max(0, waitCycles * durationMs)

          if (delayMs > 0) {
            return Effect.flatMap(Effect.sleep(delayMs), () => {
              tokens = remaining
              timestampNanos = currentNanos
              return Effect.succeed(arr)
            })
          }

          tokens = remaining
          timestampNanos = currentNanos
          return Effect.succeed(arr)
        })))
    }))

/**
 * Rate-limits stream chunks with a synchronous cost function.
 *
 * **When to use**
 *
 * Use to throttle chunks when each chunk's cost can be computed synchronously.
 *
 * **Details**
 *
 * Uses a token bucket. The bucket can accumulate up to `units + burst` tokens,
 * and each chunk consumes the cost returned by `cost`.
 *
 * If using the "enforce" strategy, arrays that do not meet the bandwidth
 * constraints are dropped. If using the "shape" strategy, arrays are delayed
 * until they can be emitted without exceeding the bandwidth constraints.
 *
 * Defaults to the "shape" strategy.
 *
 * **Example** (Throttling stream chunks)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const stream = Stream.range(0, 5).pipe(
 *   Stream.rechunk(1),
 *   Stream.throttle({
 *     cost: (arr) => arr.length,
 *     units: 1,
 *     duration: 0,
 *     strategy: "shape"
 *   })
 * )
 *
 * const program = Effect.gen(function*() {
 *   const values = yield* Stream.runCollect(stream)
 *   values // => [ 0, 1, 2, 3, 4, 5 ]
 * })
 * await Effect.runPromise(program)
 * ```
 *
 * @category rate limiting
 * @since 2.0.0
 */
export const throttle: {
  <A>(options: {
    readonly cost: (arr: Arr.NonEmptyReadonlyArray<A>) => number
    readonly units: number
    readonly duration: Duration.Input
    readonly burst?: number | undefined
    readonly strategy?: "enforce" | "shape" | undefined
  }): <E, R>(self: Stream<A, E, R>) => Stream<A, E, R>
  <A, E, R>(
    self: Stream<A, E, R>,
    options: {
      readonly cost: (arr: Arr.NonEmptyReadonlyArray<A>) => number
      readonly units: number
      readonly duration: Duration.Input
      readonly burst?: number | undefined
      readonly strategy?: "enforce" | "shape" | undefined
    }
  ): Stream<A, E, R>
} = dual(
  2,
  <A, E, R>(
    self: Stream<A, E, R>,
    options: {
      readonly cost: (arr: Arr.NonEmptyReadonlyArray<A>) => number
      readonly units: number
      readonly duration: Duration.Input
      readonly burst?: number | undefined
      readonly strategy?: "enforce" | "shape" | undefined
    }
  ): Stream<A, E, R> =>
    throttleEffect(self, {
      ...options,
      cost: (arr) => Effect.succeed(options.cost(arr))
    })
)

/**
 * Partitions the stream into non-empty arrays of the specified size.
 *
 * **Details**
 *
 * The final array may be smaller if there are not enough elements to fill it.
 * Finite fractional sizes are rounded down. `NaN` and non-positive sizes are
 * treated as `1`.
 *
 * **Example** (Grouping elements by size)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const grouped = yield* Stream.range(1, 8).pipe(
 *     Stream.grouped(3),
 *     Stream.runCollect
 *   )
 *   grouped // => [ [ 1, 2, 3 ], [ 4, 5, 6 ], [ 7, 8 ] ]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category grouping
 * @since 2.0.0
 */
export const grouped: {
  (n: number): <A, E, R>(self: Stream<A, E, R>) => Stream<Arr.NonEmptyReadonlyArray<A>, E, R>
  <A, E, R>(self: Stream<A, E, R>, n: number): Stream<Arr.NonEmptyReadonlyArray<A>, E, R>
} = dual(
  2,
  <A, E, R>(self: Stream<A, E, R>, n: number): Stream<Arr.NonEmptyReadonlyArray<A>, E, R> => chunks(rechunk(self, n))
)

/**
 * Partitions the stream into arrays, emitting when the chunk size is reached
 * or the duration passes.
 *
 * **Details**
 *
 * The duration starts when the first element of a group arrives, so an idle
 * stream does not wake up. Finite fractional chunk sizes are rounded down.
 * `NaN` and non-positive sizes are treated as `1`.
 *
 * **Example** (Grouping elements by size or time)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const values = yield* Stream.make(1, 2, 3).pipe(
 *     Stream.groupedWithin(2, "5 seconds"),
 *     Stream.runCollect
 *   )
 *   values // => [ [ 1, 2 ], [ 3 ] ]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category grouping
 * @since 2.0.0
 */
export const groupedWithin: {
  (
    chunkSize: number,
    duration: Duration.Input
  ): <A, E, R>(self: Stream<A, E, R>) => Stream<Array<A>, E, R>
  <A, E, R>(self: Stream<A, E, R>, chunkSize: number, duration: Duration.Input): Stream<Array<A>, E, R>
} = dual(3, <A, E, R>(
  self: Stream<A, E, R>,
  chunkSize: number,
  duration: Duration.Input
): Stream<Array<A>, E, R> =>
  aggregateWithin(
    self,
    Sink.take(Count.normalizeNonEmpty(chunkSize)),
    Schedule.spaced(duration)
  ))

/**
 * Groups elements into keyed substreams using an effectful classifier.
 *
 * **Example** (Grouping elements into keyed substreams using an effectful classifier)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const grouped = yield* Stream.make(1, 2, 3, 4, 5).pipe(
 *     Stream.groupBy((n) =>
 *       Effect.succeed([n % 2 === 0 ? "even" : "odd", n] as const)
 *     ),
 *     Stream.mapEffect(
 *       Effect.fnUntraced(function*([key, stream]) {
 *         return [key, yield* Stream.runCollect(stream)] as const
 *       }),
 *       { concurrency: "unbounded" }
 *     ),
 *     Stream.runCollect
 *   )
 *
 *   grouped // => [ [ 'odd', [ 1, 3, 5 ] ], [ 'even', [ 2, 4 ] ] ]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category grouping
 * @since 2.0.0
 */
export const groupBy: {
  <A, K, V, E2, R2>(
    f: (a: NoInfer<A>) => Effect.Effect<readonly [K, V], E2, R2>,
    options?: {
      readonly bufferSize?: number | undefined
      readonly idleTimeToLive?: Duration.Input | undefined
    }
  ): <E, R>(self: Stream<A, E, R>) => Stream<readonly [K, Stream<V>], E | E2, R | R2>
  <A, E, R, K, V, E2, R2>(
    self: Stream<A, E, R>,
    f: (a: NoInfer<A>) => Effect.Effect<readonly [K, V], E2, R2>,
    options?: {
      readonly bufferSize?: number | undefined
      readonly idleTimeToLive?: Duration.Input | undefined
    }
  ): Stream<readonly [K, Stream<V>], E | E2, R | R2>
} = dual((args) => isStream(args[0]), <A, E, R, K, V, E2, R2>(
  self: Stream<A, E, R>,
  f: (a: NoInfer<A>) => Effect.Effect<readonly [K, V], E2, R2>,
  options?: {
    readonly bufferSize?: number | undefined
    readonly idleTimeToLive?: Duration.Input | undefined
  }
): Stream<readonly [K, Stream<V>], E | E2, R | R2> =>
  groupByImpl(
    self,
    Effect.fnUntraced(function*(arr, queues, queueMap) {
      for (let i = 0; i < arr.length; i++) {
        const [key, value] = yield* f(arr[i])
        const oentry = MutableHashMap.get(queueMap, key)
        const queue = Option.isSome(oentry)
          ? oentry.value
          : yield* Effect.scoped(RcMap.get(queues, key))
        yield* RcMap.touch(queues, key)
        yield* Queue.offer(queue, value)
      }
    }),
    options
  ))

/**
 * Groups elements by a key and emits a stream per key.
 *
 * **Example** (Grouping elements by key)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const grouped = yield* Stream.make(1, 2, 3, 4, 5).pipe(
 *     Stream.groupByKey((n) => n % 2 === 0 ? "even" : "odd"),
 *     Stream.mapEffect(
 *       ([key, stream]) =>
 *         Stream.runCollect(stream).pipe(
 *           Effect.map((values) => [key, values] as const)
 *         ),
 *       { concurrency: "unbounded" }
 *     ),
 *     Stream.runCollect
 *   )
 *   grouped // => [ [ 'odd', [ 1, 3, 5 ] ], [ 'even', [ 2, 4 ] ] ]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category grouping
 * @since 2.0.0
 */
export const groupByKey: {
  <A, K>(
    f: (a: NoInfer<A>) => K,
    options?: {
      readonly bufferSize?: number | undefined
      readonly idleTimeToLive?: Duration.Input | undefined
    }
  ): <E, R>(self: Stream<A, E, R>) => Stream<readonly [K, Stream<A>], E, R>
  <A, E, R, K>(
    self: Stream<A, E, R>,
    f: (a: NoInfer<A>) => K,
    options?: {
      readonly bufferSize?: number | undefined
      readonly idleTimeToLive?: Duration.Input | undefined
    }
  ): Stream<readonly [K, Stream<A>], E, R>
} = dual((args) => isStream(args[0]), <A, E, R, K>(
  self: Stream<A, E, R>,
  f: (a: NoInfer<A>) => K,
  options?: {
    readonly bufferSize?: number | undefined
    readonly idleTimeToLive?: Duration.Input | undefined
  }
): Stream<readonly [K, Stream<A>], E, R> =>
  suspend(() => {
    const batch = MutableHashMap.empty<K, Arr.NonEmptyArray<A>>()
    return groupByImpl(
      self,
      Effect.fnUntraced(function*(arr, queues, queueMap) {
        for (let i = 0; i < arr.length; i++) {
          const key = f(arr[i])
          const ovalues = MutableHashMap.get(batch, key)
          if (Option.isNone(ovalues)) {
            MutableHashMap.set(batch, key, [arr[i]])
          } else {
            ovalues.value.push(arr[i])
          }
        }
        for (const [key, values] of batch) {
          const oentry = MutableHashMap.get(queueMap, key)
          const queue = Option.isSome(oentry)
            ? oentry.value
            : yield* Effect.scoped(RcMap.get(queues, key))
          yield* RcMap.touch(queues, key)
          yield* Queue.offerAll(queue, values)
        }
        MutableHashMap.clear(batch)
      }),
      options
    )
  }))

const groupByImpl = <A, E, R, K, V, E2, R2>(
  self: Stream<A, E, R>,
  f: (
    arr: Arr.NonEmptyReadonlyArray<A>,
    queues: RcMap.RcMap<K, Queue.Queue<V, Cause.Done>>,
    queueMap: MutableHashMap.MutableHashMap<K, Queue.Queue<V, Cause.Done>>
  ) => Effect.Effect<void, E2, R2>,
  options?: {
    readonly bufferSize?: number | undefined
    readonly idleTimeToLive?: Duration.Input | undefined
  }
): Stream<readonly [K, Stream<V>], E | E2, R | R2> =>
  transformPullBracket(
    self,
    Effect.fnUntraced(function*(pull, scope, forkedScope) {
      const out = yield* Queue.unbounded<readonly [K, Stream<V>], E | E2 | Cause.Done<void>>()
      yield* Scope.addFinalizer(scope, Queue.shutdown(out))

      const queueMap = MutableHashMap.empty<K, Queue.Queue<V, Cause.Done>>()
      const queues = yield* RcMap.make({
        lookup: (key: K) =>
          Effect.acquireRelease(
            Queue.make<V, Cause.Done>({ capacity: options?.bufferSize ?? 4096 }).pipe(
              Effect.tap((queue) => {
                MutableHashMap.set(queueMap, key, queue)
                return Queue.offer(out, [key, fromQueue(queue)])
              })
            ),
            (queue) => {
              MutableHashMap.remove(queueMap, key)
              return Queue.end(queue)
            }
          ),
        idleTimeToLive: options?.idleTimeToLive ?? Duration.infinity
      }).pipe(Scope.provide(forkedScope))

      yield* Effect.whileLoop({
        while: constTrue,
        body: constant(Effect.flatMap(pull, (arr) => f(arr, queues, queueMap))),
        step: constVoid
      }).pipe(
        Effect.catchCause((cause) => Queue.failCause(out, cause)),
        Effect.forkIn(scope)
      )

      return Queue.takeAll(out)
    })
  )

/**
 * Groups consecutive elements that have equal keys into non-empty arrays.
 *
 * **When to use**
 *
 * Use when you already have a stream ordered by the grouping key and want to
 * emit each consecutive run as a non-empty array while keeping later
 * non-adjacent runs separate.
 *
 * **Details**
 *
 * The key is computed with `f`; adjacent elements whose keys are equal by
 * `Equal.equals` are emitted as one `[key, group]`. Later non-adjacent runs
 * with the same key are emitted separately.
 *
 * @see {@link groupByKey} for grouping all elements with the same key across the stream
 * @see {@link groupBy} for custom grouped stream construction
 *
 * @category grouping
 * @since 2.0.0
 */
export const groupAdjacentBy: {
  <A, K>(
    f: (a: NoInfer<A>) => K
  ): <E, R>(self: Stream<A, E, R>) => Stream<readonly [K, Arr.NonEmptyArray<A>], E, R>
  <A, E, R, K>(
    self: Stream<A, E, R>,
    f: (a: NoInfer<A>) => K
  ): Stream<readonly [K, Arr.NonEmptyArray<A>], E, R>
} = dual(2, <A, E, R, K>(
  self: Stream<A, E, R>,
  f: (a: NoInfer<A>) => K
): Stream<readonly [K, Arr.NonEmptyArray<A>], E, R> =>
  transformPull(self, (pull, _scope) =>
    Effect.sync(() => {
      let currentKey: K = undefined as any
      let group: Arr.NonEmptyArray<A> | undefined
      let toEmit = Arr.empty<readonly [K, Arr.NonEmptyArray<A>]>()
      const loop: Pull.Pull<
        Arr.NonEmptyReadonlyArray<readonly [K, Arr.NonEmptyArray<A>]>,
        E
      > = pull.pipe(
        Effect.flatMap((chunk) => {
          for (let i = 0; i < chunk.length; i++) {
            const item = chunk[i]
            const key = f(item)
            if (group === undefined) {
              currentKey = key
              group = [item]
              continue
            } else if (Equal.equals(key, currentKey)) {
              group.push(item)
              continue
            }
            toEmit.push([currentKey, group])
            currentKey = key
            group = [item]
          }
          if (Arr.isArrayNonEmpty(toEmit)) {
            const out = toEmit
            toEmit = []
            return Effect.succeed(out)
          }
          return loop
        })
      )
      let done = false
      return Pull.catchDone(Effect.suspend(() => done ? Cause.done() : loop), () => {
        done = true
        const out = group
        group = undefined
        return out && Arr.isArrayNonEmpty(out) ? Effect.succeed(Arr.of([currentKey, out])) : Cause.done()
      })
    })))

/**
 * Applies a sink transducer to the stream and emits each sink result.
 *
 * **Example** (Transducing with a sink)
 *
 * ```ts import.meta.vitest
 * import { Effect, Sink, Stream } from "effect"
 *
 * const program = Effect.gen(function* () {
 *   const result = yield* Stream.make(1, 2, 3, 4).pipe(
 *     Stream.transduce(Sink.take(2)),
 *     Stream.runCollect
 *   )
 *
 *   result // => [ [ 1, 2 ], [ 3, 4 ], [] ]
 * })
 * await Effect.runPromise(program)
 * ```
 *
 * @category aggregation
 * @since 2.0.0
 */
export const transduce: {
  <A2, A, E2, R2>(
    sink: Sink.Sink<A2, A, A, E2, R2>
  ): <E, R>(self: Stream<A, E, R>) => Stream<A2, E2 | E, R2 | R>
  <A, E, R, A2, E2, R2>(
    self: Stream<A, E, R>,
    sink: Sink.Sink<A2, A, A, E2, R2>
  ): Stream<A2, E2 | E, R2 | R>
} = dual(
  2,
  <A, E, R, A2, E2, R2>(
    self: Stream<A, E, R>,
    sink: Sink.Sink<A2, A, A, E2, R2>
  ): Stream<A2, E2 | E, R2 | R> =>
    transformPull(self, (upstream, scope) =>
      Effect.sync(() => {
        let done: Exit.Exit<never, Cause.Done<void> | E> | undefined
        let leftover: Arr.NonEmptyReadonlyArray<A> | undefined
        const upstreamWithLeftover = Effect.suspend(() => {
          if (leftover !== undefined) {
            const chunk = leftover
            leftover = undefined
            return Effect.succeed(chunk)
          }
          return upstream
        }).pipe(
          Effect.catch((error) => {
            done = Exit.fail(error)
            return Cause.done()
          })
        )
        const pull = Effect.map(
          Effect.suspend(() => sink.transform(upstreamWithLeftover, scope)),
          ([value, leftover_]) => {
            leftover = leftover_
            return Arr.of(value)
          }
        )
        return Effect.suspend((): Pull.Pull<
          Arr.NonEmptyReadonlyArray<A2>,
          E | E2,
          void,
          R2
        > => done ? done : pull)
      }))
)

/**
 * Aggregates elements using the provided sink and emits each sink result as a stream element.
 *
 * **Details**
 *
 * The stream runs the upstream and downstream in separate fibers, so the sink can keep
 * consuming input while downstream is busy processing the previous output.
 *
 * **Example** (Aggregating with a sink)
 *
 * ```ts import.meta.vitest
 * import { Effect, Sink, Stream } from "effect"
 *
 * await Effect.runPromise(Effect.gen(function* () {
 *   const aggregated = yield* Stream.runCollect(
 *     Stream.make(1, 2, 3, 4, 5, 6).pipe(
 *       Stream.aggregate(
 *         Sink.foldUntil(() => 0, 3, (sum, n) => Effect.succeed(sum + n))
 *       )
 *     )
 *   )
 *   aggregated // => [ 6, 15 ]
 * }))
 * ```
 *
 * @category aggregation
 * @since 2.0.0
 */
export const aggregate: {
  <B, A, A2, E2, R2>(
    sink: Sink.Sink<B, A | A2, A2, E2, R2>
  ): <E, R>(self: Stream<A, E, R>) => Stream<B, E2 | E, R2 | R>
  <A, E, R, B, A2, E2, R2>(
    self: Stream<A, E, R>,
    sink: Sink.Sink<B, A | A2, A2, E2, R2>
  ): Stream<B, E | E2, R | R2>
} = dual(2, <A, E, R, B, A2, E2, R2>(
  self: Stream<A, E, R>,
  sink: Sink.Sink<B, A | A2, A2, E2, R2>
): Stream<B, E | E2, R | R2> => aggregateWithin(self, sink, Schedule.forever))

/**
 * Aggregates elements with a sink, emitting each result when the sink completes or the schedule triggers.
 *
 * **Details**
 *
 * The schedule can flush the current aggregation even if the sink has not finished.
 * It is stepped at most once per aggregation, when the aggregation receives its
 * first element, with the previous aggregation's output as input. An aggregation
 * the sink completes immediately, such as one built from leftovers, may finish
 * without stepping the schedule.
 *
 * Time between aggregations is hidden from the schedule, so an idle stream does
 * not run it. Time-based schedules such as `Schedule.fixed` and
 * `Schedule.upTo({ duration })` only count time spent aggregating; use
 * `Schedule.spaced` for a flush timer.
 *
 * When the schedule ends, the stream emits the current aggregation and any sink
 * leftovers, then ends without pulling more from upstream.
 *
 * **Example** (Aggregating with a sink and schedule)
 *
 * ```ts import.meta.vitest
 * import { Effect, Schedule, Sink, Stream } from "effect"
 *
 * await Effect.runPromise(Effect.gen(function* () {
 *   const aggregated = yield* Stream.runCollect(
 *     Stream.make(1, 2, 3, 4, 5, 6).pipe(
 *       Stream.aggregateWithin(
 *         Sink.foldUntil(() => 0, 3, (sum, n) => Effect.succeed(sum + n)),
 *         Schedule.forever
 *       )
 *     )
 *   )
 *   aggregated // => [ 6, 15 ]
 * }))
 * ```
 *
 * @category aggregation
 * @since 2.0.0
 */
export const aggregateWithin: {
  <B, A, A2, E2, R2, C, E3, R3>(
    sink: Sink.Sink<B, A | A2, A2, E2, R2>,
    schedule: Schedule.Schedule<C, Option.Option<B>, E3, R3>
  ): <E, R>(self: Stream<A, E, R>) => Stream<B, E2 | E | E3, R2 | R3 | R>
  <A, E, R, B, A2, E2, R2, C, E3, R3>(
    self: Stream<A, E, R>,
    sink: Sink.Sink<B, A | A2, A2, E2, R2>,
    schedule: Schedule.Schedule<C, Option.Option<B>, E3, R3>
  ): Stream<B, E | E2 | E3, R | R2 | R3>
} = dual(3, <A, E, R, B, A2, E2, R2, C, E3, R3>(
  self: Stream<A, E, R>,
  sink: Sink.Sink<B, A | A2, A2, E2, R2>,
  schedule: Schedule.Schedule<C, Option.Option<B>, E3, R3>
): Stream<B, E | E2 | E3, R | R2 | R3> =>
  fromChannel(Channel.fromTransformBracket(Effect.fnUntraced(function*(_upstream, _, scope) {
    const pull = yield* Channel.toPullScoped(self.channel, _)

    const pullLatch = Latch.makeUnsafe(false)
    const scheduleStep = Symbol()
    const buffer = yield* Queue.make<Arr.NonEmptyReadonlyArray<A> | typeof scheduleStep, E | Cause.Done<void>>({
      capacity: 0
    })

    yield* pull.pipe(
      pullLatch.whenOpen,
      Effect.flatMap((arr) => {
        pullLatch.closeUnsafe()
        return Queue.offer(buffer, arr)
      }),
      Effect.forever, // Keep autoYield enabled so the schedule can run.
      Effect.catchCause((cause) => Queue.failCause(buffer, cause)),
      Effect.forkIn(scope)
    )

    // The schedule clock excludes time between aggregations.
    const clock = yield* Clock
    const step = yield* Schedule.toStep(schedule)
    const hasInput = Latch.makeUnsafe(false)
    let scheduleTime = clock.currentTimeMillisUnsafe()
    let openedAt = 0
    let lastOutput = Option.none<B>()
    let leftover: Arr.NonEmptyReadonlyArray<A2> | undefined
    const onInput = <X>(chunk: X): Effect.Effect<X> => {
      if (hasInput.openUnsafe()) {
        openedAt = clock.currentTimeMillisUnsafe()
      }
      return Effect.succeed(chunk)
    }
    const stepToBuffer: Pull.Pull<never, E3, void, R3> = hasInput.await.pipe(
      Effect.flatMap(() => step(scheduleTime, lastOutput)),
      Effect.flatMap(([, delay]) => Effect.sleep(delay)),
      Effect.flatMap(() => Queue.offer(buffer, scheduleStep)),
      // End input so the sink drains leftovers without further upstream pulls.
      Pull.catchDone(() => Queue.end(buffer)),
      Effect.flatMap(() => Effect.never)
    )

    const sinkUpstream = Effect.suspend((): Pull.Pull<Arr.NonEmptyReadonlyArray<A | A2>, E> => {
      if (leftover !== undefined) {
        const chunk = leftover
        leftover = undefined
        return onInput(chunk)
      }
      if (buffer.state._tag === "Open") {
        pullLatch.openUnsafe()
      }
      return Effect.flatMap(Queue.take(buffer), (arr) => arr === scheduleStep ? Cause.done() : onInput(arr))
    })
    const emit = Effect.flatMap(([value, leftover_]: Sink.End<B, A2>) => {
      if (hasInput.isOpen()) {
        scheduleTime += clock.currentTimeMillisUnsafe() - openedAt
      } else if (buffer.state._tag === "Done") {
        return Cause.done()
      }
      lastOutput = Option.some(value)
      leftover = leftover_
      return Effect.succeed(Arr.of(value))
    })

    return Effect.suspend((): Pull.Pull<Arr.NonEmptyReadonlyArray<B>, E | E2 | E3, void, R2 | R3> => {
      if (buffer.state._tag === "Done" && leftover === undefined) {
        return buffer.state.exit as Exit.Exit<never, Cause.Done<void> | E>
      }
      hasInput.closeUnsafe()
      const pull = emit(Effect.suspend(() => sink.transform(sinkUpstream as any, scope)))
      return buffer.state._tag === "Open" ? Effect.raceFirst(pull, stepToBuffer) : pull
    })
  }))))

/**
 * Creates a fixed-size tuple of streams that each emit
 * the same elements as the source stream.
 *
 * **Details**
 *
 * The source stream starts after all downstream streams have been subscribed.
 * With the default suspend strategy, the source can only advance `capacity`
 * chunks ahead of the slowest downstream stream. If a downstream stream is
 * interrupted, it unsubscribes from the broadcast so it no longer contributes
 * backpressure. Finite fractional values of `n` are rounded down. `NaN` and
 * non-positive values create no downstream streams.
 *
 * **Example** (Broadcasting to two consumers)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const program = Effect.scoped(
 *   Effect.gen(function*() {
 *     const [left, right] = yield* Stream.make(1, 2, 3).pipe(
 *       Stream.broadcastN({ n: 2, capacity: 8 })
 *     )
 *
 *     const values = yield* Effect.all([
 *       Stream.runCollect(left),
 *       Stream.runCollect(right)
 *     ], { concurrency: "unbounded" })
 *
 *     values // => [ [ 1, 2, 3 ], [ 1, 2, 3 ] ]
 *   })
 * )
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category broadcasting
 * @since 4.0.0
 */
export const broadcastN: {
  <const N extends number>(
    options: {
      readonly n: N
      readonly capacity: "unbounded"
      readonly replay?: number | undefined
    } | {
      readonly n: N
      readonly capacity: number
      readonly strategy?: "sliding" | "dropping" | "suspend" | undefined
      readonly replay?: number | undefined
    }
  ): <A, E, R>(self: Stream<A, E, R>) => Effect.Effect<TupleOf<N, Stream<A, E>>, never, Scope.Scope | R>
  <A, E, R, const N extends number>(
    self: Stream<A, E, R>,
    options: {
      readonly n: N
      readonly capacity: "unbounded"
      readonly replay?: number | undefined
    } | {
      readonly capacity: number
      readonly n: N
      readonly strategy?: "sliding" | "dropping" | "suspend" | undefined
      readonly replay?: number | undefined
    }
  ): Effect.Effect<TupleOf<N, Stream<A, E>>, never, Scope.Scope | R>
} = dual(
  2,
  Effect.fnUntraced(function*<A, E, R, const N extends number>(
    self: Stream<A, E, R>,
    options: {
      readonly n: N
      readonly capacity: "unbounded"
      readonly replay?: number | undefined
    } | {
      readonly n: N
      readonly capacity: number
      readonly strategy?: "sliding" | "dropping" | "suspend" | undefined
      readonly replay?: number | undefined
    }
  ) {
    const n = Count.normalize(options.n)
    const pubsub = yield* makePubSub<Take.Take<A, E>>(options)
    const streams = new Array(n)
    const parentScope = yield* Scope.Scope
    for (let i = 0; i < n; i++) {
      const scope = Scope.forkUnsafe(parentScope)
      const subscription = yield* PubSub.subscribe(pubsub).pipe(
        Effect.provideService(Scope.Scope, scope)
      )
      streams[i] = Channel.fromEffectTake(PubSub.take(subscription)).pipe(
        Channel.onExit((exit) => Scope.close(scope, exit)),
        fromChannel
      )
    }
    yield* Channel.runForEach(self.channel, (value) => PubSub.publish(pubsub, value)).pipe(
      Effect.onExit((exit) => PubSub.end(pubsub, exit)),
      Effect.forkScoped
    )
    return streams as TupleOf<N, Stream<A, E>>
  })
)

const makePubSub = <A>(
  options: {
    readonly capacity: "unbounded"
    readonly replay?: number | undefined
  } | {
    readonly capacity: number
    readonly strategy?: "dropping" | "sliding" | "suspend" | undefined
    readonly replay?: number | undefined
  }
) =>
  Effect.acquireRelease(
    options.capacity === "unbounded"
      ? PubSub.unbounded<A>(options)
      : options.strategy === "dropping"
      ? PubSub.dropping<A>(options)
      : options.strategy === "sliding"
      ? PubSub.sliding<A>(options)
      : PubSub.bounded<A>(options),
    PubSub.shutdown
  )

/**
 * Creates a PubSub-backed stream that multicasts the source to all subscribers.
 *
 * **Details**
 *
 * The returned stream is scoped and uses the provided PubSub capacity and replay settings.
 *
 * **Example** (Broadcasting a stream)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const program = Effect.scoped(
 *   Effect.gen(function* () {
 *     const broadcasted = yield* Stream.broadcast(Stream.fromArray([1, 2, 3]), {
 *       capacity: 8,
 *       replay: 3
 *     })
 *
 *     const [left, right] = yield* Effect.all([
 *       Stream.runCollect(broadcasted),
 *       Stream.runCollect(broadcasted)
 *     ], { concurrency: "unbounded" })
 *
 *     const result = [left, right] // => [[1, 2, 3], [1, 2, 3]]
 *   })
 * )
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category broadcasting
 * @since 2.0.0
 */
export const broadcast: {
  (
    options: {
      readonly capacity: "unbounded"
      readonly replay?: number | undefined
    } | {
      readonly capacity: number
      readonly strategy?: "sliding" | "dropping" | "suspend" | undefined
      readonly replay?: number | undefined
    }
  ): <A, E, R>(self: Stream<A, E, R>) => Effect.Effect<Stream<A, E>, never, Scope.Scope | R>
  <A, E, R>(
    self: Stream<A, E, R>,
    options: {
      readonly capacity: "unbounded"
      readonly replay?: number | undefined
    } | {
      readonly capacity: number
      readonly strategy?: "sliding" | "dropping" | "suspend" | undefined
      readonly replay?: number | undefined
    }
  ): Effect.Effect<Stream<A, E>, never, Scope.Scope | R>
} = dual(2, <A, E, R>(
  self: Stream<A, E, R>,
  options: {
    readonly capacity: "unbounded"
    readonly replay?: number | undefined
  } | {
    readonly capacity: number
    readonly strategy?: "sliding" | "dropping" | "suspend" | undefined
    readonly replay?: number | undefined
  }
): Effect.Effect<Stream<A, E>, never, Scope.Scope | R> => Effect.map(toPubSubTake(self, options), fromPubSubTake))

/**
 * Returns a new Stream that multicasts the original stream, subscribing when the first consumer starts.
 *
 * **Details**
 *
 * The upstream continues running while there is at least one consumer and is finalized after the last one exits.
 * If `idleTimeToLive` is set, the upstream is kept alive for that duration so a later subscriber can continue from
 * the next element instead of restarting.
 *
 * **Example** (Sharing a stream)
 *
 * ```ts import.meta.vitest
 * import { Deferred, Effect, Ref, Stream } from "effect"
 *
 * const result = await Effect.runPromise(
 *   Effect.scoped(
 *     Effect.gen(function*() {
 *       const firstReady = yield* Deferred.make<void>()
 *       const secondReady = yield* Deferred.make<void>()
 *       const acquisitions = yield* Ref.make(0)
 *       const source = Stream.fromEffect(Ref.update(acquisitions, (n) => n + 1)).pipe(
 *         Stream.drain,
 *         Stream.concat(Stream.make(0)),
 *         Stream.concat(
 *           Stream.fromEffect(Effect.all([Deferred.await(firstReady), Deferred.await(secondReady)])).pipe(Stream.drain)
 *         ),
 *         Stream.concat(Stream.make(1, 2, 3))
 *       )
 *       const shared = yield* Stream.share(source, { capacity: 16, replay: 1 })
 *       const consume = (ready: Deferred.Deferred<void>) =>
 *         shared.pipe(
 *           Stream.tap((value) => value === 0 ? Deferred.succeed(ready, void 0) : Effect.void),
 *           Stream.filter((value) => value !== 0),
 *           Stream.runCollect
 *         )
 *
 *       const values = yield* Effect.all([consume(firstReady), consume(secondReady)], { concurrency: "unbounded" })
 *       return { values, acquisitions: yield* Ref.get(acquisitions) }
 *     })
 *   )
 * )
 * result // => { values: [[1, 2, 3], [1, 2, 3]], acquisitions: 1 }
 * ```
 *
 * @category broadcasting
 * @since 3.8.0
 */
export const share: {
  (
    options: {
      readonly capacity: "unbounded"
      readonly replay?: number | undefined
      readonly idleTimeToLive?: Duration.Input | undefined
    } | {
      readonly capacity: number
      readonly strategy?: "sliding" | "dropping" | "suspend" | undefined
      readonly replay?: number | undefined
      readonly idleTimeToLive?: Duration.Input | undefined
    }
  ): <A, E, R>(self: Stream<A, E, R>) => Effect.Effect<Stream<A, E>, never, Scope.Scope | R>
  <A, E, R>(
    self: Stream<A, E, R>,
    options: {
      readonly capacity: "unbounded"
      readonly replay?: number | undefined
      readonly idleTimeToLive?: Duration.Input | undefined
    } | {
      readonly capacity: number
      readonly strategy?: "sliding" | "dropping" | "suspend" | undefined
      readonly replay?: number | undefined
      readonly idleTimeToLive?: Duration.Input | undefined
    }
  ): Effect.Effect<Stream<A, E>, never, Scope.Scope | R>
} = dual(2, <A, E, R>(
  self: Stream<A, E, R>,
  options: {
    readonly capacity: "unbounded"
    readonly replay?: number | undefined
    readonly idleTimeToLive?: Duration.Input | undefined
  } | {
    readonly capacity: number
    readonly strategy?: "sliding" | "dropping" | "suspend" | undefined
    readonly replay?: number | undefined
    readonly idleTimeToLive?: Duration.Input | undefined
  }
): Effect.Effect<Stream<A, E>, never, Scope.Scope | R> =>
  Effect.map(
    RcRef.make({
      acquire: broadcast(self, options),
      idleTimeToLive: options.idleTimeToLive
    }),
    (ref) => unwrap(RcRef.get(ref))
  ))

/**
 * Pipes this stream through a channel that consumes and emits chunked elements.
 *
 * **Details**
 *
 * The channel receives `NonEmptyReadonlyArray` chunks and can transform both the
 * output elements and error type.
 *
 * **Example** (Piping through a channel)
 *
 * ```ts import.meta.vitest
 * import { Array, Channel, Effect, Stream } from "effect"
 *
 * type NumberChunk = readonly [number, ...Array<number>]
 *
 * const doubleChunks = Channel.identity<NumberChunk, never, unknown>().pipe(
 *   Channel.map((chunk) => Array.map(chunk, (n) => n * 2))
 * )
 *
 * const program = Effect.gen(function*() {
 *   const result = yield* Stream.fromArray([1, 2, 3]).pipe(
 *     Stream.rechunk(2),
 *     Stream.pipeThroughChannel(doubleChunks),
 *     Stream.runCollect
 *   )
 *   result // => [ 2, 4, 6 ]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category sequencing
 * @since 2.0.0
 */
export const pipeThroughChannel: {
  <R2, E, E2, A, A2>(
    channel: Channel.Channel<Arr.NonEmptyReadonlyArray<A2>, E2, unknown, Arr.NonEmptyReadonlyArray<A>, E, unknown, R2>
  ): <R>(self: Stream<A, E, R>) => Stream<A2, E2, R2 | R>
  <R, R2, E, E2, A, A2>(
    self: Stream<A, E, R>,
    channel: Channel.Channel<Arr.NonEmptyReadonlyArray<A2>, E2, unknown, Arr.NonEmptyReadonlyArray<A>, E, unknown, R2>
  ): Stream<A2, E2, R | R2>
} = dual(2, <R, R2, E, E2, A, A2>(
  self: Stream<A, E, R>,
  channel: Channel.Channel<Arr.NonEmptyReadonlyArray<A2>, E2, unknown, Arr.NonEmptyReadonlyArray<A>, E, unknown, R2>
): Stream<A2, E2, R | R2> => fromChannel(Channel.pipeTo(self.channel, channel)))

/**
 * Pipes values through the provided channel while preserving this stream's
 * failures alongside any channel failures.
 *
 * **Details**
 *
 * Upstream failures are not passed to the channel, so the resulting stream can
 * fail with either the original stream error or the channel error.
 *
 * **Example** (Piping through a channel with failures)
 *
 * ```ts import.meta.vitest
 * import { Array, Channel, Effect, Stream } from "effect"
 *
 * type NumberChunk = readonly [number, ...Array<number>]
 *
 * const stringifyChunks = Channel.identity<NumberChunk, "StreamError", unknown>().pipe(
 *   Channel.map((chunk) => Array.map(chunk, String))
 * )
 *
 * await Effect.runPromise(Effect.gen(function*() {
 *   const result = yield* Stream.make(1, 2, 3).pipe(
 *     Stream.rechunk(2),
 *     Stream.pipeThroughChannelOrFail(stringifyChunks),
 *     Stream.runCollect
 *   )
 *
 *   result // => ["1", "2", "3"]
 * }))
 * ```
 *
 * @category sequencing
 * @since 2.0.0
 */
export const pipeThroughChannelOrFail: {
  <R2, E, E2, A, A2>(
    channel: Channel.Channel<Arr.NonEmptyReadonlyArray<A2>, E2, unknown, Arr.NonEmptyReadonlyArray<A>, E, unknown, R2>
  ): <R>(self: Stream<A, E, R>) => Stream<A2, E | E2, R2 | R>
  <R, R2, E, E2, A, A2>(
    self: Stream<A, E, R>,
    channel: Channel.Channel<Arr.NonEmptyReadonlyArray<A2>, E2, unknown, Arr.NonEmptyReadonlyArray<A>, E, unknown, R2>
  ): Stream<A2, E | E2, R | R2>
} = dual(2, <R, R2, E, E2, A, A2>(
  self: Stream<A, E, R>,
  channel: Channel.Channel<Arr.NonEmptyReadonlyArray<A2>, E2, unknown, Arr.NonEmptyReadonlyArray<A>, E, unknown, R2>
): Stream<A2, E | E2, R | R2> => fromChannel(Channel.pipeToOrFail(self.channel, channel)))

/**
 * Pipes the stream through `Sink.toChannel`, emitting only the sink leftovers.
 *
 * **Details**
 *
 * If the sink completes mid-chunk, the remaining elements become the output stream.
 *
 * **Example** (Piping through a sink)
 *
 * ```ts import.meta.vitest
 * import { Effect, Sink, Stream } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const leftovers = yield* Stream.make(1, 2, 3, 4).pipe(
 *     Stream.pipeThrough(Sink.take(2)),
 *     Stream.runCollect
 *   )
 *
 *   leftovers // => [ 3, 4 ]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category sequencing
 * @since 2.0.0
 */
export const pipeThrough: {
  <A2, A, L, E2, R2>(sink: Sink.Sink<A2, A, L, E2, R2>): <E, R>(self: Stream<A, E, R>) => Stream<L, E2 | E, R2 | R>
  <A, E, R, A2, L, E2, R2>(self: Stream<A, E, R>, sink: Sink.Sink<A2, A, L, E2, R2>): Stream<L, E | E2, R | R2>
} = dual(
  2,
  <A, E, R, A2, L, E2, R2>(self: Stream<A, E, R>, sink: Sink.Sink<A2, A, L, E2, R2>): Stream<L, E | E2, R | R2> =>
    self.channel.pipe(
      Channel.pipeToOrFail(Sink.toChannel(sink)),
      Channel.concatWith(([_, leftover]) => leftover ? Channel.succeed(leftover) : Channel.empty),
      fromChannel
    )
)

/**
 * Collects all elements into an array and emits it as a single element.
 *
 * **Example** (Collecting values into a stream element)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const stream = Stream.make(1, 2, 3)
 *
 * const program = Effect.gen(function*() {
 *   const collected = yield* stream.pipe(Stream.collect, Stream.runCollect)
 *   collected[0] // => [ 1, 2, 3 ]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category accumulation
 * @since 4.0.0
 */
export const collect = <A, E, R>(self: Stream<A, E, R>): Stream<Array<A>, E, R> => fromEffect(runCollect(self))

/**
 * Accumulates elements into a growing array, emitting the cumulative array for each input chunk.
 *
 * **Example** (Accumulating stream elements)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const accumulated = yield* Stream.runCollect(
 *     Stream.fromArray([1, 2, 3]).pipe(
 *       Stream.rechunk(1),
 *       Stream.accumulate
 *     )
 *   )
 *   accumulated // => [ [ 1 ], [ 1, 2 ], [ 1, 2, 3 ] ]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category accumulation
 * @since 2.0.0
 */
export const accumulate = <A, E, R>(self: Stream<A, E, R>): Stream<Arr.NonEmptyArray<A>, E, R> =>
  mapAccumArray(self, Arr.empty<A>, (acc, as) => {
    const combined = Arr.appendAll(acc, as)
    return [combined, [combined]]
  })

/**
 * Emits only elements that differ from the previous one.
 *
 * **Example** (Emitting changed values)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const values = yield* Stream.fromIterable([1, 1, 2, 2, 3]).pipe(
 *     Stream.changes,
 *     Stream.runCollect
 *   )
 *
 *   values // => [ 1, 2, 3 ]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category deduplication
 * @since 2.0.0
 */
export const changes = <A, E, R>(self: Stream<A, E, R>): Stream<A, E, R> => changesWith(self, Equal.equals)

/**
 * Returns a stream that only emits elements that are not equal to the previously emitted element, as determined by the specified predicate.
 *
 * **Example** (Emitting values that changed by equivalence)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const stream = Stream.make("A", "a", "B", "b", "b").pipe(
 *   Stream.changesWith((left, right) => left.toLowerCase() === right.toLowerCase())
 * )
 *
 * await Effect.runPromise(
 *   Effect.gen(function*() {
 *     const values = yield* Stream.runCollect(stream)
 *     values // => [ 'A', 'B' ]
 *   })
 * )
 * ```
 *
 * @category deduplication
 * @since 2.0.0
 */
export const changesWith: {
  <A>(f: (x: A, y: A) => boolean): <E, R>(self: Stream<A, E, R>) => Stream<A, E, R>
  <A, E, R>(self: Stream<A, E, R>, f: (x: A, y: A) => boolean): Stream<A, E, R>
} = dual(
  2,
  <A, E, R>(self: Stream<A, E, R>, f: (x: A, y: A) => boolean): Stream<A, E, R> =>
    transformPull(self, (pull, _scope) =>
      Effect.sync(() => {
        let first = true
        let last: A
        return Effect.flatMap(pull, function loop(arr): Pull.Pull<Arr.NonEmptyReadonlyArray<A>, E> {
          const out: Array<A> = []
          let i = 0
          if (first) {
            first = false
            last = arr[0]
            i = 1
            out.push(last)
          }
          for (; i < arr.length; i++) {
            const a = arr[i]
            if (f(a, last)) continue
            last = a
            out.push(a)
          }
          return Arr.isArrayNonEmpty(out) ? Effect.succeed(out) : Effect.flatMap(pull, loop)
        })
      }))
)

/**
 * Emits only elements that differ from the previous element, using an effectful equality check.
 *
 * **Details**
 *
 * The predicate runs for each element after the first; returning `true` treats it as equal and skips it.
 *
 * **Example** (Effectfully emitting changed values)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const stream = Stream.make(1, 1, 2, 2, 3, 3).pipe(
 *     Stream.changesWithEffect((a, b) => Effect.succeed(a === b))
 *   )
 *   const result = yield* Stream.runCollect(stream)
 *   result // => [ 1, 2, 3 ]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category deduplication
 * @since 2.0.0
 */
export const changesWithEffect: {
  <A, E2, R2>(
    f: (x: A, y: A) => Effect.Effect<boolean, E2, R2>
  ): <E, R>(self: Stream<A, E, R>) => Stream<A, E | E2, R | R2>
  <A, E, R, E2, R2>(
    self: Stream<A, E, R>,
    f: (x: A, y: A) => Effect.Effect<boolean, E2, R2>
  ): Stream<A, E | E2, R | R2>
} = dual(
  2,
  <A, E, R, E2, R2>(
    self: Stream<A, E, R>,
    f: (x: A, y: A) => Effect.Effect<boolean, E2, R2>
  ): Stream<A, E | E2, R | R2> =>
    transformPull(self, (pull, _scope) =>
      Effect.sync(() => {
        let first = true
        let last: A
        return Effect.flatMap(
          pull,
          Effect.fnUntraced(function* loop(arr): Generator<
            Pull.Pull<any, E | E2, void, R2>,
            Arr.NonEmptyReadonlyArray<A>,
            any
          > {
            const out: Array<A> = []
            let i = 0
            if (first) {
              first = false
              last = arr[0]
              i = 1
              out.push(last)
            }
            for (; i < arr.length; i++) {
              const a = arr[i]
              if (yield* f(a, last)) continue
              last = a
              out.push(a)
            }
            return Arr.isArrayNonEmpty(out) ? out : yield* Effect.flatMap(pull, Effect.fnUntraced(loop))
          })
        )
      }))
)

/**
 * Decodes Uint8Array chunks into strings using TextDecoder with an optional encoding.
 *
 * **Example** (Decoding Uint8Array chunks into strings using TextDecoder with an optional encoding)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const encoder = new TextEncoder()
 * const stream = Stream.make(
 *   encoder.encode("Hello"),
 *   encoder.encode(" World")
 * )
 *
 * const program = Effect.gen(function*() {
 *   const decoded = yield* stream.pipe(
 *     Stream.decodeText,
 *     Stream.runCollect
 *   )
 *   decoded // => [ 'Hello', ' World' ]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category text
 * @since 2.0.0
 */
export const decodeText: <
  Arg extends Stream<Uint8Array, any, any> | {
    readonly encoding?: string | undefined
  } | undefined = {
    readonly encoding?: string | undefined
  }
>(
  streamOrOptions?: Arg,
  options?: {
    readonly encoding?: string | undefined
  } | undefined
) => [Arg] extends [Stream<Uint8Array, infer _E, infer _R>] ? Stream<string, _E, _R>
  : <E, R>(self: Stream<Uint8Array, E, R>) => Stream<string, E, R> = dual(
    (args) => isStream(args[0]),
    <E, R>(self: Stream<Uint8Array, E, R>, options?: {
      readonly encoding?: string | undefined
    }): Stream<string, E, R> =>
      suspend(() => {
        const decoder = new TextDecoder(options?.encoding)
        return map(self, (chunk) => decoder.decode(chunk, { stream: true }))
      })
  )

/**
 * Encodes a stream of strings into UTF-8 `Uint8Array` chunks.
 *
 * **Example** (Encoding a stream of strings into UTF-8 Uint8Array chunks)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const stream = Stream.make("Hello", " ", "World")
 * const program = Effect.gen(function*() {
 *   const encoded = Stream.encodeText(stream)
 *   const chunks = yield* Stream.runCollect(encoded)
 *   const bytes = chunks.map((chunk) => [...chunk])
 *   bytes // => [ [ 72, 101, 108, 108, 111 ], [ 32 ], [ 87, 111, 114, 108, 100 ] ]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category text
 * @since 2.0.0
 */
export const encodeText = <E, R>(self: Stream<string, E, R>): Stream<Uint8Array, E, R> =>
  suspend(() => {
    const encoder = new TextEncoder()
    return map(self, (chunk) => encoder.encode(chunk))
  })

/**
 * Splits a stream of strings into lines, handling `\n`, `\r`, and `\r\n` delimiters across chunks.
 *
 * **Example** (Splitting streamed text into lines)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * await Effect.runPromise(Effect.gen(function* () {
 *   const lines = yield* Stream.runCollect(
 *     Stream.make("a\nb\r\n", "c\n").pipe(Stream.splitLines)
 *   )
 *   lines // => [ 'a', 'b', 'c' ]
 * }))
 * ```
 *
 * @category text
 * @since 2.0.0
 */
export const splitLines = <E, R>(self: Stream<string, E, R>): Stream<string, E, R> =>
  self.channel.pipe(
    Channel.pipeTo(Channel.splitLines()),
    fromChannel
  )

/**
 * Inserts the provided element between emitted elements.
 *
 * **Example** (Interspersing stream elements)
 *
 * ```ts import.meta.vitest
 * import { Console, Effect, Stream } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const stream = Stream.make(1, 2, 3, 4).pipe(Stream.intersperse(0))
 *   const result = yield* Stream.runCollect(stream)
 *   result // => [1, 0, 2, 0, 3, 0, 4]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category sequencing
 * @since 2.0.0
 */
export const intersperse: {
  <A2>(element: A2): <A, E, R>(self: Stream<A, E, R>) => Stream<A2 | A, E, R>
  <A, E, R, A2>(self: Stream<A, E, R>, element: A2): Stream<A | A2, E, R>
} = dual(2, <A, E, R, A2>(self: Stream<A, E, R>, element: A2): Stream<A | A2, E, R> =>
  mapArray(self, (arr, i) => {
    const out: Arr.NonEmptyArray<A | A2> = i === 0 ? [] as any : [element]
    const lastIndex = arr.length - 1
    for (let j = 0; j < arr.length; j++) {
      if (j === lastIndex) {
        out.push(arr[j])
      } else {
        out.push(arr[j], element)
      }
    }
    return out
  }))

/**
 * Adds a start value, middle value, and end value around stream elements.
 *
 * **Details**
 *
 * The start and end values are always emitted, even when the stream is empty.
 *
 * **Example** (Interspersing stream affixes)
 *
 * ```ts import.meta.vitest
 * import { Console, Effect, Stream } from "effect"
 *
 * const stream = Stream.make("a", "b", "c").pipe(
 *   Stream.intersperseAffixes({ start: "[", middle: ",", end: "]" })
 * )
 *
 * const program = Effect.gen(function*() {
 *   const result = yield* Stream.runCollect(stream)
 *   result // => ["[", "a", ",", "b", ",", "c", "]"]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category sequencing
 * @since 2.0.0
 */
export const intersperseAffixes: {
  <A2, A3, A4>(
    options: { readonly start: A2; readonly middle: A3; readonly end: A4 }
  ): <A, E, R>(self: Stream<A, E, R>) => Stream<A2 | A3 | A4 | A, E, R>
  <A, E, R, A2, A3, A4>(
    self: Stream<A, E, R>,
    options: { readonly start: A2; readonly middle: A3; readonly end: A4 }
  ): Stream<A | A2 | A3 | A4, E, R>
} = dual(2, <A, E, R, A2, A3, A4>(
  self: Stream<A, E, R>,
  options: { readonly start: A2; readonly middle: A3; readonly end: A4 }
): Stream<A | A2 | A3 | A4, E, R> =>
  succeed(options.start).pipe(
    concat(intersperse(self, options.middle)),
    concat(succeed(options.end))
  ))

/**
 * Interleaves this stream with the specified stream by alternating pulls from
 * each stream; when one ends, the remaining values from the other stream are
 * emitted.
 *
 * **Example** (Interleaving streams)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const stream = Stream.interleave(
 *   Stream.make(2, 3),
 *   Stream.make(5, 6, 7)
 * )
 *
 * const program = Effect.gen(function*() {
 *   const collected = yield* Stream.runCollect(stream)
 *   collected // => [ 2, 5, 3, 6, 7 ]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category merging
 * @since 2.0.0
 */
export const interleave: {
  <A2, E2, R2>(that: Stream<A2, E2, R2>): <A, E, R>(self: Stream<A, E, R>) => Stream<A2 | A, E2 | E, R2 | R>
  <A, E, R, A2, E2, R2>(self: Stream<A, E, R>, that: Stream<A2, E2, R2>): Stream<A | A2, E | E2, R | R2>
} = dual(
  2,
  <A, E, R, A2, E2, R2>(self: Stream<A, E, R>, that: Stream<A2, E2, R2>): Stream<A | A2, E | E2, R | R2> =>
    interleaveWith(
      self,
      that,
      fromIterable(Iterable.forever([true, false]))
    )
)

/**
 * Interleaves two streams deterministically by following a boolean decider stream.
 *
 * **Details**
 *
 * The decider controls how many elements are pulled; if one side ends, pulls for
 * that side are ignored.
 *
 * **Example** (Interleaving two streams deterministically by following a boolean decider stream)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const left = Stream.make(1, 3, 5)
 *   const right = Stream.make(2, 4, 6)
 *   const decider = Stream.make(true, false, false, true, true)
 *
 *   const values = yield* Stream.runCollect(
 *     Stream.interleaveWith(left, right, decider)
 *   )
 *
 *   values // => [ 1, 2, 4, 3, 5 ]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category merging
 * @since 2.0.0
 */
export const interleaveWith: {
  <A2, E2, R2, E3, R3>(
    that: Stream<A2, E2, R2>,
    decider: Stream<boolean, E3, R3>
  ): <A, E, R>(self: Stream<A, E, R>) => Stream<A2 | A, E2 | E3 | E, R2 | R3 | R>
  <A, E, R, A2, E2, R2, E3, R3>(
    self: Stream<A, E, R>,
    that: Stream<A2, E2, R2>,
    decider: Stream<boolean, E3, R3>
  ): Stream<A | A2, E | E2 | E3, R | R2 | R3>
} = dual(3, <A, E, R, A2, E2, R2, E3, R3>(
  self: Stream<A, E, R>,
  that: Stream<A2, E2, R2>,
  decider: Stream<boolean, E3, R3>
): Stream<A | A2, E | E2 | E3, R | R2 | R3> =>
  fromChannel(Channel.fromTransform(Effect.fnUntraced(function*(upstream, scope) {
    const pullDecider = yield* Channel.toTransform(Channel.flattenArray(decider.channel))(upstream, scope)
    const retry = Symbol()
    type retry = typeof retry
    let leftDone = false
    let rightDone = false
    const pullLeft = (yield* Channel.toTransform(Channel.flattenArray(self.channel))(
      upstream,
      scope
    )).pipe(
      Pull.catchDone(() => {
        leftDone = true
        return Effect.succeed<retry>(retry)
      })
    )
    const pullRight = (yield* Channel.toTransform(Channel.flattenArray(that.channel))(
      upstream,
      scope
    )).pipe(
      Pull.catchDone(() => {
        rightDone = true
        return Effect.succeed<retry>(retry)
      })
    )

    return Effect.gen(function*() {
      while (true) {
        if (leftDone && rightDone) {
          return yield* Cause.done()
        }
        const side = yield* pullDecider
        if (side && leftDone) continue
        if (!side && rightDone) continue
        const elem = yield* (side ? pullLeft : pullRight)
        if (elem === retry) continue
        return Arr.of(elem)
      }
    })
  }))))

/**
 * Interrupts the evaluation of this stream when the provided effect
 * completes. The given effect will be forked as part of this stream, and its
 * success will be discarded. This combinator will also interrupt any
 * in-progress element being pulled from upstream.
 *
 * **Details**
 *
 * If the effect completes with a failure before the stream completes, the
 * returned stream will emit that failure.
 *
 * **Example** (Interrupting when an effect completes)
 *
 * ```ts import.meta.vitest
 * import { Deferred, Effect, Stream } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const interrupt = yield* Deferred.make<void>()
 *   const stream = Stream.make(1, 2, 3).pipe(
 *     Stream.tap((value) =>
 *       value === 2
 *         ? Deferred.succeed(interrupt, void 0)
 *         : Effect.void
 *     ),
 *     Stream.interruptWhen(Deferred.await(interrupt))
 *   )
 *
 *   const result = yield* Stream.runCollect(stream)
 *   result // => [ 1 ]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category interruption
 * @since 2.0.0
 */
export const interruptWhen: {
  <X, E2, R2>(effect: Effect.Effect<X, E2, R2>): <A, E, R>(self: Stream<A, E, R>) => Stream<A, E2 | E, R2 | R>
  <A, E, R, X, E2, R2>(self: Stream<A, E, R>, effect: Effect.Effect<X, E2, R2>): Stream<A, E | E2, R | R2>
} = dual(
  2,
  <A, E, R, X, E2, R2>(self: Stream<A, E, R>, effect: Effect.Effect<X, E2, R2>): Stream<A, E | E2, R | R2> =>
    fromChannel(Channel.interruptWhen(self.channel, effect))
)

/**
 * Stops a stream after the current pull when an effect completes.
 *
 * **When to use**
 *
 * Use to stop before the next pull after an external signal completes.
 *
 * **Details**
 *
 * The effect is forked, its success value is discarded, and its failure fails
 * the stream.
 *
 * **Gotchas**
 *
 * This does not interrupt or truncate an in-progress pull. A pull may emit
 * multiple elements in a single chunk, in which case the entire chunk is
 * emitted. Use {@link interruptWhen} when the stream should be interrupted
 * immediately.
 *
 * **Example** (Halting a stream after an effect completes)
 *
 * ```ts import.meta.vitest
 * import { Deferred, Effect, Stream } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const halt = yield* Deferred.make<void>()
 *   const values = yield* Stream.fromArray([1, 2, 3]).pipe(
 *     Stream.tap((value) => value === 2 ? Deferred.succeed(halt, void 0) : Effect.void),
 *     Stream.haltWhen(Deferred.await(halt)),
 *     Stream.runCollect
 *   )
 *   values // => [ 1, 2 ]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category interruption
 * @since 2.0.0
 */
export const haltWhen: {
  <X, E2, R2>(effect: Effect.Effect<X, E2, R2>): <A, E, R>(self: Stream<A, E, R>) => Stream<A, E2 | E, R2 | R>
  <A, E, R, X, E2, R2>(self: Stream<A, E, R>, effect: Effect.Effect<X, E2, R2>): Stream<A, E | E2, R | R2>
} = dual(
  2,
  <A, E, R, X, E2, R2>(self: Stream<A, E, R>, effect: Effect.Effect<X, E2, R2>): Stream<A, E | E2, R | R2> =>
    fromChannel(Channel.haltWhen(self.channel, effect))
)

/**
 * Runs the provided finalizer when the stream exits, passing the exit value.
 *
 * **Example** (Running a finalizer on exit)
 *
 * ```ts import.meta.vitest
 * import { Effect, Exit, Stream } from "effect"
 *
 * const exits: Array<string> = []
 * const stream = Stream.make(1, 2, 3).pipe(
 *   Stream.onExit((exit) =>
 *     Exit.isSuccess(exit)
 *       ? Effect.sync(() => exits.push("success"))
 *       : Effect.sync(() => exits.push("failure"))
 *   )
 * )
 *
 * await Effect.runPromise(Effect.gen(function*() {
 *   yield* Stream.runCollect(stream)
 * }))
 * exits // => ["success"]
 * ```
 *
 * @category resource management
 * @since 4.0.0
 */
export const onExit: {
  <E, R2>(
    finalizer: (exit: Exit.Exit<unknown, E>) => Effect.Effect<unknown, never, R2>
  ): <A, R>(self: Stream<A, E, R>) => Stream<A, E, R | R2>
  <A, E, R, R2>(
    self: Stream<A, E, R>,
    finalizer: (exit: Exit.Exit<unknown, E>) => Effect.Effect<unknown, never, R2>
  ): Stream<A, E, R | R2>
} = dual(2, <A, E, R, R2>(
  self: Stream<A, E, R>,
  finalizer: (exit: Exit.Exit<unknown, E>) => Effect.Effect<unknown, never, R2>
): Stream<A, E, R | R2> => fromChannel(Channel.onExit(self.channel, finalizer)))

/**
 * Runs the provided effect when the stream fails, passing the failure cause.
 *
 * **Gotchas**
 *
 * Note: Unlike `Effect.onError` there is no guarantee that the provided
 * effect will not be interrupted.
 *
 * **Example** (Running an effect on errors)
 *
 * ```ts import.meta.vitest
 * import { Cause, Effect, Stream } from "effect"
 *
 * const errors: Array<string> = []
 * const program = Effect.gen(function*() {
 *   const stream = Stream.make(1, 2, 3).pipe(
 *     Stream.concat(Stream.fail("boom")),
 *     Stream.onError((cause) => Effect.sync(() => errors.push(String(Cause.squash(cause)))))
 *   )
 *
 *   yield* Stream.runCollect(stream)
 * })
 *
 * await Effect.runPromise(Effect.exit(program))
 * errors // => ["boom"]
 * ```
 *
 * @category resource management
 * @since 2.0.0
 */
export const onError: {
  <E, X, R2>(
    cleanup: (cause: Cause.Cause<E>) => Effect.Effect<X, never, R2>
  ): <A, R>(self: Stream<A, E, R>) => Stream<A, E, R2 | R>
  <A, E, R, X, R2>(
    self: Stream<A, E, R>,
    cleanup: (cause: Cause.Cause<E>) => Effect.Effect<X, never, R2>
  ): Stream<A, E, R | R2>
} = dual(2, <A, E, R, X, R2>(
  self: Stream<A, E, R>,
  cleanup: (cause: Cause.Cause<E>) => Effect.Effect<X, never, R2>
): Stream<A, E, R | R2> => fromChannel(Channel.onError(self.channel, cleanup)))

/**
 * Runs the provided effect before this stream starts.
 *
 * **Example** (Running an effect on start)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const events: Array<string> = []
 * const program = Effect.gen(function*() {
 *   const stream = Stream.fromArray([1, 2, 3]).pipe(
 *     Stream.onStart(Effect.sync(() => events.push("started")))
 *   )
 *
 *   const values = yield* Stream.runCollect(stream)
 *   values // => [1, 2, 3]
 * })
 *
 * await Effect.runPromise(program)
 * events // => ["started"]
 * ```
 *
 * @category sequencing
 * @since 3.6.0
 */
export const onStart: {
  <X, EX, RX>(
    onStart: Effect.Effect<X, EX, RX>
  ): <A, E, R>(self: Stream<A, E, R>) => Stream<A, E | EX, R | RX>
  <A, E, R, X, EX, RX>(
    self: Stream<A, E, R>,
    onStart: Effect.Effect<X, EX, RX>
  ): Stream<A, E | EX, R | RX>
} = dual(2, <A, E, R, X, EX, RX>(
  self: Stream<A, E, R>,
  onStart: Effect.Effect<X, EX, RX>
): Stream<A, E | EX, R | RX> => fromChannel(Channel.onStart(self.channel, onStart)))

/**
 * Runs the provided effect with the first element emitted by the stream.
 *
 * **Example** (Running an effect on the first value)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const first: Array<number> = []
 * await Effect.runPromise(Effect.gen(function* () {
 *   yield* Stream.fromArray([1, 2, 3]).pipe(
 *     Stream.onFirst((value) => Effect.sync(() => first.push(value))),
 *     Stream.runDrain
 *   )
 * }))
 * first // => [1]
 * ```
 *
 * @category sequencing
 * @since 4.0.0
 */
export const onFirst: {
  <A, X, EX, RX>(
    onFirst: (element: NoInfer<A>) => Effect.Effect<X, EX, RX>
  ): <E, R>(self: Stream<A, E, R>) => Stream<A, E | EX, R | RX>
  <A, E, R, X, EX, RX>(
    self: Stream<A, E, R>,
    onFirst: (element: NoInfer<A>) => Effect.Effect<X, EX, RX>
  ): Stream<A, E | EX, R | RX>
} = dual(2, <A, E, R, X, EX, RX>(
  self: Stream<A, E, R>,
  onFirst: (element: NoInfer<A>) => Effect.Effect<X, EX, RX>
): Stream<A, E | EX, R | RX> => fromChannel(Channel.onFirst(self.channel, (arr) => onFirst(arr[0]))))

/**
 * Runs the provided effect when the stream ends successfully.
 *
 * **Example** (Running an effect on end)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const events: Array<string> = []
 * const program = Effect.gen(function*() {
 *   const values = yield* Stream.make(1, 2, 3).pipe(
 *     Stream.onEnd(Effect.sync(() => events.push("ended"))),
 *     Stream.runCollect
 *   )
 *   values // => [1, 2, 3]
 * })
 *
 * await Effect.runPromise(program)
 * events // => ["ended"]
 * ```
 *
 * @category sequencing
 * @since 3.6.0
 */
export const onEnd: {
  <X, EX, RX>(
    onEnd: Effect.Effect<X, EX, RX>
  ): <A, E, R>(self: Stream<A, E, R>) => Stream<A, E | EX, R | RX>
  <A, E, R, X, EX, RX>(
    self: Stream<A, E, R>,
    onEnd: Effect.Effect<X, EX, RX>
  ): Stream<A, E | EX, R | RX>
} = dual(2, <A, E, R, X, EX, RX>(
  self: Stream<A, E, R>,
  onEnd: Effect.Effect<X, EX, RX>
): Stream<A, E | EX, R | RX> => fromChannel(Channel.onEnd(self.channel, onEnd)))

/**
 * Executes the provided finalizer after this stream's finalizers run.
 *
 * **Example** (Ensuring finalization)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const events: Array<string> = []
 * const stream = Stream.fromArray([1, 2]).pipe(
 *   Stream.ensuring(Effect.sync(() => events.push("cleanup")))
 * )
 *
 * const program = Effect.gen(function*() {
 *   const collected = yield* Stream.runCollect(stream)
 *   collected // => [1, 2]
 * })
 *
 * await Effect.runPromise(program)
 * events // => ["cleanup"]
 * ```
 *
 * @category resource management
 * @since 2.0.0
 */
export const ensuring: {
  <R2>(finalizer: Effect.Effect<unknown, never, R2>): <A, E, R>(self: Stream<A, E, R>) => Stream<A, E, R | R2>
  <A, E, R, R2>(self: Stream<A, E, R>, finalizer: Effect.Effect<unknown, never, R2>): Stream<A, E, R | R2>
} = dual(
  2,
  <A, E, R, R2>(self: Stream<A, E, R>, finalizer: Effect.Effect<unknown, never, R2>): Stream<A, E, R | R2> =>
    fromChannel(Channel.ensuring(self.channel, finalizer))
)

/**
 * Provides a layer or context to the stream, removing the corresponding
 * service requirements. Use `options.local` to build the layer every time; by
 * default, layers are shared between provide calls.
 *
 * **Example** (Providing stream requirements)
 *
 * ```ts import.meta.vitest
 * import { Console, Context, Effect, Layer, Stream } from "effect"
 *
 * class Env extends Context.Service<Env, { readonly name: string }>()("Env") {}
 *
 * const layer = Layer.succeed(Env)({ name: "Ada" })
 *
 * const stream = Stream.fromEffect(
 *   Effect.gen(function*() {
 *     const env = yield* Effect.service(Env)
 *     return `Hello, ${env.name}`
 *   })
 * )
 *
 * const withEnv = stream.pipe(Stream.provide(layer))
 *
 * await Effect.runPromise(Stream.runCollect(withEnv)) // => ["Hello, Ada"]
 * ```
 *
 * @category providing services
 * @since 4.0.0
 */
export const provide: {
  <AL, EL = never, RL = never>(
    layer: Layer.Layer<AL, EL, RL> | Context.Context<AL>,
    options?: {
      readonly local?: boolean | undefined
    } | undefined
  ): <A, E, R>(
    self: Stream<A, E, R>
  ) => Stream<A, E | EL, Exclude<R, AL> | RL>
  <A, E, R, AL, EL = never, RL = never>(
    self: Stream<A, E, R>,
    layer: Layer.Layer<AL, EL, RL> | Context.Context<AL>,
    options?: {
      readonly local?: boolean | undefined
    } | undefined
  ): Stream<A, E | EL, Exclude<R, AL> | RL>
} = dual((args) => isStream(args[0]), <A, E, R, AL, EL = never, RL = never>(
  self: Stream<A, E, R>,
  layer: Layer.Layer<AL, EL, RL> | Context.Context<AL>,
  options?: {
    readonly local?: boolean | undefined
  } | undefined
): Stream<A, E | EL, Exclude<R, AL> | RL> => fromChannel(Channel.provide(self.channel, layer, options)))

/**
 * Provides multiple services to the stream using a context.
 *
 * **Example** (Providing multiple services to the stream using a context)
 *
 * ```ts import.meta.vitest
 * import { Context, Effect, Stream } from "effect"
 *
 * class Config extends Context.Service<Config, { readonly prefix: string }>()("Config") {}
 * class Greeter extends Context.Service<Greeter, { greet: (name: string) => string }>()("Greeter") {}
 *
 * const context = Context.make(Config, { prefix: "Hello" }).pipe(
 *   Context.add(Greeter, { greet: (name: string) => `${name}!` })
 * )
 *
 * const stream = Stream.fromEffect(
 *   Effect.gen(function*() {
 *     const config = yield* Effect.service(Config)
 *     const greeter = yield* Effect.service(Greeter)
 *     return greeter.greet(config.prefix)
 *   })
 * )
 *
 * const program = Effect.gen(function*() {
 *   const result = yield* Stream.runCollect(Stream.provideContext(stream, context))
 *   result // => [ 'Hello!' ]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category providing services
 * @since 2.0.0
 */
export const provideContext: {
  <R2>(context: Context.Context<R2>): <A, E, R>(self: Stream<A, E, R>) => Stream<A, E, Exclude<R, R2>>
  <A, E, R, R2>(self: Stream<A, E, R>, context: Context.Context<R2>): Stream<A, E, Exclude<R, R2>>
} = dual(
  2,
  <A, E, R, R2>(self: Stream<A, E, R>, context: Context.Context<R2>): Stream<A, E, Exclude<R, R2>> =>
    fromChannel(Channel.provideContext(self.channel, context))
)

/**
 * Provides the stream with a single required service, eliminating that
 * requirement from its environment.
 *
 * **Example** (Providing a stream service)
 *
 * ```ts import.meta.vitest
 * import { Context, Effect, Stream } from "effect"
 *
 * class Greeter extends Context.Service<Greeter, {
 *   greet: (name: string) => string
 * }>()("Greeter") {}
 *
 * const stream = Stream.fromEffect(
 *   Effect.service(Greeter).pipe(
 *     Effect.map((greeter) => greeter.greet("Ada"))
 *   )
 * )
 *
 * const program = Effect.gen(function*() {
 *   const collected = yield* Stream.runCollect(
 *     stream.pipe(
 *       Stream.provideService(Greeter, {
 *         greet: (name) => `Hello, ${name}`
 *       })
 *     )
 *   )
 *   collected // => [ 'Hello, Ada' ]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category providing services
 * @since 2.0.0
 */
export const provideService: {
  <I, S>(
    key: Context.Key<I, S>,
    service: NoInfer<S>
  ): <A, E, R>(
    self: Stream<A, E, R>
  ) => Stream<A, E, Exclude<R, I>>
  <A, E, R, I, S>(
    self: Stream<A, E, R>,
    key: Context.Key<I, S>,
    service: NoInfer<S>
  ): Stream<A, E, Exclude<R, I>>
} = dual(3, <A, E, R, I, S>(
  self: Stream<A, E, R>,
  key: Context.Key<I, S>,
  service: NoInfer<S>
): Stream<A, E, Exclude<R, I>> => fromChannel(Channel.provideService(self.channel, key, service)))

/**
 * Provides a service to the stream using an effect, removing the requirement and adding the effect's error and environment.
 *
 * **Example** (Providing a stream service effectfully)
 *
 * ```ts import.meta.vitest
 * import { Context, Effect, Stream } from "effect"
 *
 * class ApiConfig extends Context.Service<ApiConfig, { readonly baseUrl: string }>()("ApiConfig") {}
 *
 * const stream = Stream.fromEffect(
 *   Effect.gen(function*() {
 *     const config = yield* Effect.service(ApiConfig)
 *     return config.baseUrl
 *   })
 * )
 *
 * const events: Array<string> = []
 * const withConfig = stream.pipe(
 *   Stream.provideServiceEffect(
 *     ApiConfig,
 *     Effect.succeed({ baseUrl: "https://example.com" }).pipe(
 *       Effect.tap(() => Effect.sync(() => events.push("loading")))
 *     )
 *   )
 * )
 *
 * await Effect.runPromise(Stream.runCollect(withConfig)) // => ["https://example.com"]
 * events // => ["loading"]
 * ```
 *
 * @category providing services
 * @since 2.0.0
 */
export const provideServiceEffect: {
  <I, S, ES, RS>(
    key: Context.Key<I, S>,
    service: Effect.Effect<NoInfer<S>, ES, RS>
  ): <A, E, R>(
    self: Stream<A, E, R>
  ) => Stream<A, E | ES, Exclude<R, I> | RS>
  <A, E, R, I, S, ES, RS>(
    self: Stream<A, E, R>,
    key: Context.Key<I, S>,
    service: Effect.Effect<NoInfer<S>, ES, RS>
  ): Stream<A, E | ES, Exclude<R, I> | RS>
} = dual(3, <A, E, R, I, S, ES, RS>(
  self: Stream<A, E, R>,
  key: Context.Key<I, S>,
  service: Effect.Effect<NoInfer<S>, ES, RS>
): Stream<A, E | ES, Exclude<R, I> | RS> => fromChannel(Channel.provideServiceEffect(self.channel, key, service)))

/**
 * Transforms the stream's required services by mapping the current context
 * to a new one.
 *
 * **Example** (Updating the stream context)
 *
 * ```ts import.meta.vitest
 * import { Context, Effect, Stream } from "effect"
 *
 * class Logger extends Context.Service<Logger, { prefix: string }>()("Logger") {}
 * class Config extends Context.Service<Config, { name: string }>()("Config") {}
 *
 * const stream = Stream.fromEffect(
 *   Effect.gen(function*() {
 *     const logger = yield* Effect.service(Logger)
 *     const config = yield* Effect.service(Config)
 *     return `${logger.prefix}${config.name}`
 *   })
 * )
 *
 * const updated = stream.pipe(
 *   Stream.updateContext((context: Context.Context<Logger>) =>
 *     Context.add(context, Config, { name: "World" })
 *   )
 * )
 *
 * const program = Effect.gen(function*() {
 *   const values = yield* Stream.runCollect(updated)
 *   values // => [ 'Hello World' ]
 * })
 *
 * await Effect.runPromise(
 *   Effect.provideService(program, Logger, { prefix: "Hello " })
 * )
 * ```
 *
 * @category providing services
 * @since 4.0.0
 */
export const updateContext: {
  <R, R2>(
    f: (context: Context.Context<R2>) => Context.Context<R>
  ): <A, E>(
    self: Stream<A, E, R>
  ) => Stream<A, E, R2>
  <A, E, R, R2>(
    self: Stream<A, E, R>,
    f: (context: Context.Context<R2>) => Context.Context<R>
  ): Stream<A, E, R2>
} = dual(2, <A, E, R, R2>(
  self: Stream<A, E, R>,
  f: (context: Context.Context<R2>) => Context.Context<R>
): Stream<A, E, R2> => fromChannel(Channel.updateContext(self.channel, f)))

/**
 * Updates a single service in the stream environment by applying a function.
 *
 * **Example** (Updating a stream service)
 *
 * ```ts import.meta.vitest
 * import { Context, Effect, Stream } from "effect"
 *
 * class Counter extends Context.Service<Counter, { count: number }>()("Counter") {}
 *
 * const stream = Stream.fromEffect(Effect.service(Counter)).pipe(
 *   Stream.updateService(Counter, (counter) => ({ count: counter.count + 1 }))
 * )
 *
 * const program = Effect.gen(function*() {
 *   const counters = yield* Stream.runCollect(stream)
 *   const message = `Updated count: ${counters[0].count}` // => "Updated count: 1"
 * })
 *
 * await Effect.runPromise(Effect.provideService(program, Counter, { count: 0 }))
 * ```
 *
 * @category providing services
 * @since 2.0.0
 */
export const updateService: {
  <I, S>(
    key: Context.Key<I, S>,
    f: (service: NoInfer<S>) => S
  ): <A, E, R>(
    self: Stream<A, E, R>
  ) => Stream<A, E, R | I>
  <A, E, R, I, S>(
    self: Stream<A, E, R>,
    key: Context.Key<I, S>,
    f: (service: NoInfer<S>) => S
  ): Stream<A, E, R | I>
} = dual(3, <A, E, R, I, S>(
  self: Stream<A, E, R>,
  service: Context.Key<I, S>,
  f: (service: NoInfer<S>) => S
): Stream<A, E, R | I> =>
  updateContext(self, (context) =>
    Context.add(
      context,
      service,
      f(Context.get(context, service))
    )))

/**
 * Wraps the stream with a new span for tracing.
 *
 * **Example** (Wrapping a stream in a span)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const stream = Stream.fromArray([1, 2, 3]).pipe(Stream.withSpan("numbers"))
 *
 * await Effect.runPromise(
 *   Effect.gen(function*() {
 *     const values = yield* Stream.runCollect(stream)
 *     values // => [ 1, 2, 3 ]
 *   })
 * )
 * ```
 *
 * @category tracing
 * @since 2.0.0
 */
export const withSpan: {
  (name: string, options?: SpanOptions): <A, E, R>(self: Stream<A, E, R>) => Stream<A, E, Exclude<R, ParentSpan>>
  <A, E, R>(self: Stream<A, E, R>, name: string, options?: SpanOptions): Stream<A, E, Exclude<R, ParentSpan>>
} = function() {
  const dataFirst = isStream(arguments[0])
  const name = dataFirst ? arguments[1] : arguments[0]
  const options = addSpanStackTrace(dataFirst ? arguments[2] : arguments[1])
  if (dataFirst) {
    const self = arguments[0] as Stream<any, any, any>
    return fromChannel(Channel.withSpan(self.channel, name, options))
  }
  return (self: Stream<any, any, any>) => fromChannel(Channel.withSpan(self.channel, name, options))
} as any

/**
 * Provides the entry point for do-notation style stream composition.
 *
 * **Example** (Starting stream do notation)
 *
 * ```ts import.meta.vitest
 * import { Effect, pipe, Stream } from "effect"
 *
 * const program = pipe(
 *   Stream.Do,
 *   Stream.bind("value", () => Stream.fromArray([1, 2])),
 *   Stream.let("next", ({ value }) => value + 1)
 * )
 *
 * const effect = Effect.gen(function*() {
 *   const collected = yield* Stream.runCollect(program)
 *   collected // => [ { value: 1, next: 2 }, { value: 2, next: 3 } ]
 * })
 *
 * await Effect.runPromise(effect)
 * ```
 *
 * @category do notation
 * @since 2.0.0
 */
export const Do: Stream<{}> = succeed({})

const let_: {
  <N extends string, A extends Record<string, any>, B>(
    name: N,
    f: (a: NoInfer<A>) => B
  ): <E, R>(self: Stream<A, E, R>) => Stream<Simplify<Omit<A, N> & Record<N, B>>, E, R>
  <A extends Record<string, any>, E, R, B, N extends string>(
    self: Stream<A, E, R>,
    name: N,
    f: (a: NoInfer<A>) => B
  ): Stream<Simplify<Omit<A, N> & Record<N, B>>, E, R>
} = dual(3, <A extends Record<string, any>, E, R, B, N extends string>(
  self: Stream<A, E, R>,
  name: N,
  f: (a: NoInfer<A>) => B
): Stream<Simplify<Omit<A, N> & Record<N, B>>, E, R> => map(self, (a) => ({ ...a, [name]: f(a) } as any)))
export {
  /**
   * Adds a computed field to the current Do-notation record.
   *
   * **Example** (Adding a computed field)
   *
   * ```ts import.meta.vitest
   * import { Effect, Stream } from "effect"
   *
   * const stream = Stream.Do.pipe(
   *   Stream.let("x", () => 2),
   *   Stream.let("y", ({ x }) => x * 3)
   * )
   *
   * const program = Effect.gen(function*() {
   *   const records = yield* Stream.runCollect(stream)
   *   records // => [ { x: 2, y: 6 } ]
   * })
   *
   * await Effect.runPromise(program)
   * ```
   *
   * @category do notation
   * @since 2.0.0
   */
  let_ as let
}

/**
 * Binds the result of a stream to a field in the do-notation record.
 *
 * **Example** (Binding a stream value)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const program = Stream.Do.pipe(
 *   Stream.bind("a", () => Stream.make(1, 2)),
 *   Stream.bind("b", ({ a }) => Stream.succeed(a + 1))
 * )
 *
 * const result = Stream.runCollect(program)
 *
 * await Effect.runPromise(result) // => [{ a: 1, b: 2 }, { a: 2, b: 3 }]
 * ```
 *
 * @category do notation
 * @since 2.0.0
 */
export const bind: {
  <N extends string, A extends Record<string, any>, B, E2, R2>(
    name: N,
    f: (a: NoInfer<A>) => Stream<B, E2, R2>,
    options?: {
      readonly concurrency?: Concurrency | undefined
      readonly bufferSize?: number | undefined
    } | undefined
  ): <E, R>(self: Stream<A, E, R>) => Stream<Simplify<Omit<A, N> & Record<N, B>>, E2 | E, R2 | R>
  <A extends Record<string, any>, E, R, B, E2, R2, N extends string>(
    self: Stream<A, E, R>,
    name: N,
    f: (a: NoInfer<A>) => Stream<B, E2, R2>,
    options?: {
      readonly concurrency?: Concurrency | undefined
      readonly bufferSize?: number | undefined
    } | undefined
  ): Stream<Simplify<Omit<A, N> & Record<N, B>>, E | E2, R | R2>
} = dual((args) => isStream(args[0]), <A extends Record<string, any>, E, R, B, E2, R2, N extends string>(
  self: Stream<A, E, R>,
  name: N,
  f: (a: NoInfer<A>) => Stream<B, E2, R2>,
  options?: {
    readonly concurrency?: Concurrency | undefined
    readonly bufferSize?: number | undefined
  } | undefined
): Stream<Simplify<Omit<A, N> & Record<N, B>>, E | E2, R | R2> =>
  flatMap(self, (a) => map(f(a), (b) => ({ ...a, [name]: b } as any)), options))

/**
 * Binds an Effect-produced value into the do-notation record for each stream element.
 *
 * **Example** (Binding an effect value)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const stream = Stream.Do.pipe(
 *   Stream.bind("value", () => Stream.make(1, 2)),
 *   Stream.bindEffect("double", ({ value }) => Effect.succeed(value * 2))
 * )
 *
 * const program = Effect.gen(function*() {
 *   const result = yield* Stream.runCollect(stream)
 *   result // => [ { value: 1, double: 2 }, { value: 2, double: 4 } ]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category do notation
 * @since 2.0.0
 */
export const bindEffect: {
  <N extends string, A extends Record<string, any>, B, E2, R2>(
    name: N,
    f: (a: NoInfer<A>) => Effect.Effect<B, E2, R2>,
    options?: {
      readonly concurrency?: Concurrency | undefined
      readonly bufferSize?: number | undefined
      readonly unordered?: boolean | undefined
    } | undefined
  ): <E, R>(self: Stream<A, E, R>) => Stream<Simplify<Omit<A, N> & Record<N, B>>, E | E2, R | R2>
  <A extends Record<string, any>, E, R, B, E2, R2, N extends string>(
    self: Stream<A, E, R>,
    name: N,
    f: (a: NoInfer<A>) => Effect.Effect<B, E2, R2>,
    options?: {
      readonly concurrency?: Concurrency | undefined
      readonly bufferSize?: number | undefined
      readonly unordered?: boolean | undefined
    } | undefined
  ): Stream<Simplify<Omit<A, N> & Record<N, B>>, E | E2, R | R2>
} = dual((args) => isStream(args[0]), <A extends Record<string, any>, E, R, B, E2, R2, N extends string>(
  self: Stream<A, E, R>,
  name: N,
  f: (a: NoInfer<A>) => Effect.Effect<B, E2, R2>,
  options?: {
    readonly concurrency?: Concurrency | undefined
    readonly bufferSize?: number | undefined
    readonly unordered?: boolean | undefined
  } | undefined
): Stream<Simplify<Omit<A, N> & Record<N, B>>, E | E2, R | R2> =>
  mapEffect(self, (a) => Effect.map(f(a), (b) => ({ ...a, [name]: b } as any)), options))

/**
 * Maps each element into a record keyed by the provided name.
 *
 * **Example** (Binding values to a record key)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const stream = Stream.make(1, 2, 3).pipe(Stream.bindTo("value"))
 *
 * await Effect.runPromise(Stream.runCollect(stream)) // => [{ value: 1 }, { value: 2 }, { value: 3 }]
 * ```
 *
 * @category do notation
 * @since 2.0.0
 */
export const bindTo: {
  <N extends string>(name: N): <A, E, R>(self: Stream<A, E, R>) => Stream<{ [K in N]: A }, E, R>
  <A, E, R, N extends string>(self: Stream<A, E, R>, name: N): Stream<{ [K in N]: A }, E, R>
} = dual(2, <A, E, R, N extends string>(
  self: Stream<A, E, R>,
  name: N
): Stream<{ [K in N]: A }, E, R> => map(self, (a) => ({ [name]: a } as any)))

/**
 * Runs a stream with a sink and returns the sink result.
 *
 * **Example** (Running a stream with a sink)
 *
 * ```ts import.meta.vitest
 * import { Effect, Sink, Stream } from "effect"
 *
 * const program = Stream.run(Stream.make(1, 2, 3), Sink.sum)
 *
 * await Effect.runPromise(program) // => 6
 * ```
 *
 * @category destructors
 * @since 2.0.0
 */
export const run: {
  <A2, A, L, E2, R2>(
    sink: Sink.Sink<A2, A, L, E2, R2>
  ): <E, R>(self: Stream<A, E, R>) => Effect.Effect<A2, E2 | E, R | R2>
  <A, E, R, L, A2, E2, R2>(
    self: Stream<A, E, R>,
    sink: Sink.Sink<A2, A, L, E2, R2>
  ): Effect.Effect<A2, E | E2, R | R2>
} = dual(2, <A, E, R, L, A2, E2, R2>(
  self: Stream<A, E, R>,
  sink: Sink.Sink<A2, A, L, E2, R2>
): Effect.Effect<A2, E | E2, R | R2> =>
  Effect.scopedWith((scope) =>
    Channel.toPullScoped(self.channel, scope).pipe(
      Effect.flatMap((upstream) => sink.transform(upstream as any, scope)),
      Effect.map(([a]) => a)
    )
  ))

/**
 * Runs the stream and collects all elements into an array.
 *
 * **Example** (Collecting stream values)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const stream = Stream.make(1, 2, 3, 4, 5)
 *
 * const program = Effect.gen(function*() {
 *   const collected = yield* Stream.runCollect(stream)
 *   collected // => [ 1, 2, 3, 4, 5 ]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category destructors
 * @since 2.0.0
 */
export const runCollect = <A, E, R>(self: Stream<A, E, R>): Effect.Effect<Array<A>, E, R> =>
  Channel.runFold(
    self.channel,
    () => [] as Array<A>,
    (acc, chunk) => {
      for (let i = 0; i < chunk.length; i++) {
        acc.push(chunk[i])
      }
      return acc
    }
  )

/**
 * Runs the stream and returns the number of elements emitted.
 *
 * **Example** (Counting stream values)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const stream = Stream.make(1, 2, 3, 4, 5)
 *
 * const program = Effect.gen(function* () {
 *   const count = yield* Stream.runCount(stream)
 *   count // => 5
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category destructors
 * @since 2.0.0
 */
export const runCount = <A, E, R>(self: Stream<A, E, R>): Effect.Effect<number, E, R> =>
  Channel.runFold(self.channel, () => 0, (acc, chunk) => acc + chunk.length)

/**
 * Runs the stream and returns the numeric sum of its elements.
 *
 * **Example** (Summing stream values)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const total = yield* Stream.runSum(Stream.make(1, 2, 3))
 *   total // => 6
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category destructors
 * @since 2.0.0
 */
export const runSum = <E, R>(self: Stream<number, E, R>): Effect.Effect<number, E, R> =>
  Channel.runFold(self.channel, () => 0, (acc, chunk) => {
    for (let i = 0; i < chunk.length; i++) {
      acc += chunk[i]
    }
    return acc
  })

/**
 * Runs the stream and folds elements using a pure reducer.
 *
 * **Example** (Folding stream values)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const total = yield* Stream.runFold(
 *     Stream.make(1, 2, 3),
 *     () => 0,
 *     (acc, n) => acc + n
 *   )
 *   total // => 6
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category destructors
 * @since 2.0.0
 */
export const runFold: {
  <Z, A>(
    initial: LazyArg<Z>,
    f: (acc: Z, a: A) => Z
  ): <E, R>(
    self: Stream<A, E, R>
  ) => Effect.Effect<Z, E, R>
  <A, E, R, Z>(
    self: Stream<A, E, R>,
    initial: LazyArg<Z>,
    f: (acc: Z, a: A) => Z
  ): Effect.Effect<Z, E, R>
} = dual(3, <A, E, R, Z>(
  self: Stream<A, E, R>,
  initial: LazyArg<Z>,
  f: (acc: Z, a: A) => Z
): Effect.Effect<Z, E, R> =>
  Channel.runFold(self.channel, initial, (acc, arr) => {
    for (let i = 0; i < arr.length; i++) {
      acc = f(acc, arr[i])
    }
    return acc
  }))

/**
 * Runs the stream and folds elements using an effectful reducer.
 *
 * **When to use**
 *
 * Use when reducing stream elements needs Effects, services, or failures in the
 * reducer.
 *
 * **Example** (Effectfully folding stream values)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const total = yield* Stream.runFoldEffect(
 *     Stream.make(1, 2, 3),
 *     () => 0,
 *     (acc, n) => Effect.succeed(acc + n)
 *   )
 *   total // => 6
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category destructors
 * @since 2.0.0
 */
export const runFoldEffect: {
  <Z, A, EX, RX>(
    initial: LazyArg<Z>,
    f: (acc: Z, a: A) => Effect.Effect<Z, EX, RX>
  ): <E, R>(
    self: Stream<A, E, R>
  ) => Effect.Effect<Z, E | EX, R | RX>
  <A, E, R, Z, EX, RX>(
    self: Stream<A, E, R>,
    initial: LazyArg<Z>,
    f: (acc: Z, a: A) => Effect.Effect<Z, EX, RX>
  ): Effect.Effect<Z, E | EX, R | RX>
} = dual(3, <A, E, R, Z, EX, RX>(
  self: Stream<A, E, R>,
  initial: LazyArg<Z>,
  f: (acc: Z, a: A) => Effect.Effect<Z, EX, RX>
): Effect.Effect<Z, E | EX, R | RX> =>
  Channel.runFoldEffect(self.channel, initial, (acc, arr) => {
    let i = 0
    let s = acc
    return Effect.map(
      Effect.whileLoop({
        while: () => i < arr.length,
        body: () => f(s, arr[i]),
        step(z) {
          s = z
          i++
        }
      }),
      () => s
    )
  }))

/**
 * Runs the stream and returns the first element as an `Option`.
 *
 * **Example** (Getting the first stream value)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option, Stream } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const head = yield* Stream.runHead(Stream.make(1, 2, 3))
 *   Option.getOrThrow(head) // => 1
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category destructors
 * @since 2.0.0
 */
export const runHead = <A, E, R>(self: Stream<A, E, R>): Effect.Effect<Option.Option<A>, E, R> =>
  Effect.map(Channel.runHead(self.channel), Option.map(Arr.getUnsafe(0)))

/**
 * Runs the stream and returns the last element as an `Option`.
 *
 * **When to use**
 *
 * Use to consume a finite stream when only the final emitted element matters.
 *
 * **Details**
 *
 * `Option.some` contains the last emitted element. `Option.none` means the
 * stream completed without emitting.
 *
 * **Gotchas**
 *
 * The returned effect waits for the stream to complete before it can produce a
 * value.
 *
 * @see {@link runHead} for consuming only the first emitted element
 * @see {@link runCollect} for collecting every emitted element
 * @see {@link runDrain} for consuming the stream while discarding emitted elements
 *
 * @category destructors
 * @since 2.0.0
 */
export const runLast = <A, E, R>(self: Stream<A, E, R>): Effect.Effect<Option.Option<A>, E, R> =>
  Effect.map(Channel.runLast(self.channel), Option.map(Arr.lastNonEmpty))

/**
 * Runs the provided effectful callback for each element of the stream.
 *
 * **Example** (Running an effect for each value)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const stream = Stream.make(1, 2, 3)
 * const values: Array<string> = []
 *
 * const program = Effect.gen(function*() {
 *   yield* Stream.runForEach(stream, (n) => Effect.sync(() => values.push(`Processing: ${n}`)))
 * })
 *
 * await Effect.runPromise(program)
 * values // => ["Processing: 1", "Processing: 2", "Processing: 3"]
 * ```
 *
 * @category destructors
 * @since 2.0.0
 */
export const runForEach: {
  <A, X, E2, R2>(
    f: (a: A) => Effect.Effect<X, E2, R2>
  ): <E, R>(self: Stream<A, E, R>) => Effect.Effect<void, E2 | E, R2 | R>
  <A, E, R, X, E2, R2>(
    self: Stream<A, E, R>,
    f: (a: A) => Effect.Effect<X, E2, R2>
  ): Effect.Effect<void, E | E2, R | R2>
} = dual(2, <A, E, R, X, E2, R2>(
  self: Stream<A, E, R>,
  f: (a: A) => Effect.Effect<X, E2, R2>
): Effect.Effect<void, E | E2, R | R2> =>
  Channel.runForEach(self.channel, (arr) => {
    let i = 0
    return Effect.whileLoop({
      while: () => i < arr.length,
      body: () => f(arr[i++]),
      step: constVoid
    })
  }))

/**
 * Runs the stream, applying the effectful predicate to each element and
 * stopping when it returns `false`.
 *
 * **Example** (Running effects while a predicate holds)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const values: Array<number> = []
 * const program = Effect.gen(function*() {
 *   const stream = Stream.make(1, 2, 3, 4, 5)
 *
 *   yield* Stream.runForEachWhile(stream, (n) =>
 *     Effect.gen(function*() {
 *       yield* Effect.sync(() => values.push(n))
 *       return n < 3
 *     })
 *   )
 * })
 *
 * await Effect.runPromise(program)
 * values // => [1, 2, 3]
 * ```
 *
 * @category destructors
 * @since 2.0.0
 */
export const runForEachWhile: {
  <A, E2, R2>(
    f: (a: A) => Effect.Effect<boolean, E2, R2>
  ): <E, R>(self: Stream<A, E, R>) => Effect.Effect<void, E2 | E, R2 | R>
  <A, E, R, E2, R2>(
    self: Stream<A, E, R>,
    f: (a: A) => Effect.Effect<boolean, E2, R2>
  ): Effect.Effect<void, E | E2, R | R2>
} = dual(2, <A, E, R, E2, R2>(
  self: Stream<A, E, R>,
  f: (a: A) => Effect.Effect<boolean, E2, R2>
): Effect.Effect<void, E | E2, R | R2> =>
  Channel.runForEachWhile(self.channel, (arr) => {
    let done = false
    let i = 0
    return Effect.map(
      Effect.whileLoop({
        while: () => !done && i < arr.length,
        body: () => f(arr[i]),
        step(b) {
          i++
          if (!b) done = true
        }
      }),
      () => !done
    )
  }))

/**
 * Consumes the stream in chunks, passing each non-empty array to the callback.
 *
 * **Example** (Consuming stream chunks)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const stream = Stream.make(1, 2, 3, 4, 5)
 * const chunks: Array<string> = []
 * const program = Effect.gen(function*() {
 *   yield* Stream.runForEachArray(
 *     stream,
 *     (chunk) => Effect.sync(() => chunks.push(chunk.join(", ")))
 *   )
 * })
 *
 * await Effect.runPromise(program)
 * chunks // => ["1, 2, 3, 4, 5"]
 * ```
 *
 * @category destructors
 * @since 4.0.0
 */
export const runForEachArray: {
  <A, X, E2, R2>(
    f: (a: Arr.NonEmptyReadonlyArray<A>) => Effect.Effect<X, E2, R2>
  ): <E, R>(self: Stream<A, E, R>) => Effect.Effect<void, E2 | E, R2 | R>
  <A, E, R, X, E2, R2>(
    self: Stream<A, E, R>,
    f: (a: Arr.NonEmptyReadonlyArray<A>) => Effect.Effect<X, E2, R2>
  ): Effect.Effect<void, E | E2, R | R2>
} = dual(2, <A, E, R, X, E2, R2>(
  self: Stream<A, E, R>,
  f: (a: Arr.NonEmptyReadonlyArray<A>) => Effect.Effect<X, E2, R2>
): Effect.Effect<void, E | E2, R | R2> => Channel.runForEach(self.channel, f))

/**
 * Runs the stream for its effects, discarding emitted elements.
 *
 * **Example** (Draining a stream run)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const values: Array<number> = []
 * const program = Effect.gen(function*() {
 *   const stream = Stream.make(1, 2, 3).pipe(
 *     Stream.mapEffect((n) => Effect.sync(() => values.push(n)))
 *   )
 *
 *   yield* Stream.runDrain(stream)
 * })
 *
 * await Effect.runPromise(program)
 * values // => [1, 2, 3]
 * ```
 *
 * @category destructors
 * @since 2.0.0
 */
export const runDrain = <A, E, R>(self: Stream<A, E, R>): Effect.Effect<void, E, R> => Channel.runDrain(self.channel)

/**
 * Returns a scoped pull for manually consuming the stream's output chunks.
 *
 * **Details**
 *
 * The pull fails with `Cause.Done` when the stream ends and with the stream
 * error on failure.
 *
 * **Example** (Creating a scoped pull)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const stream = Stream.make(1, 2, 3)
 *
 * const program = Effect.scoped(
 *   Effect.gen(function*() {
 *     const pull = yield* Stream.toPull(stream)
 *     const chunk = yield* pull
 *     chunk // => [ 1, 2, 3 ]
 *   })
 * )
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category destructors
 * @since 2.0.0
 */
export const toPull = <A, E, R>(
  self: Stream<A, E, R>
): Effect.Effect<Pull.Pull<Arr.NonEmptyReadonlyArray<A>, E>, never, R | Scope.Scope> => Channel.toPull(self.channel)

/**
 * Concatenates all emitted strings into a single string.
 *
 * **Example** (Joining strings from a stream)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const stream = Stream.make("Hello", " ", "World", "!")
 * const program = Effect.gen(function*() {
 *   const text = yield* Stream.mkString(stream)
 *   text // => "Hello World!"
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category destructors
 * @since 2.0.0
 */
export const mkString = <E, R>(self: Stream<string, E, R>): Effect.Effect<string, E, R> =>
  Channel.runFold(
    self.channel,
    () => "",
    (acc, chunk) => acc + chunk.join("")
  )

/**
 * Concatenates the stream's `Uint8Array` chunks into a single `ArrayBuffer`.
 *
 * **Gotchas**
 *
 * This materializes the full content in memory. The source stream must not
 * reuse or mutate emitted buffers, which are retained until collection completes.
 *
 * **Example** (Joining byte chunks into an ArrayBuffer)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const program = Stream.make(
 *   new Uint8Array([1, 2]),
 *   new Uint8Array([3, 4])
 * ).pipe(
 *   Stream.mkArrayBuffer,
 *   Effect.map((buffer) => [...new Uint8Array(buffer)])
 * )
 *
 * await Effect.runPromise(program) // => [1, 2, 3, 4]
 * ```
 *
 * @category destructors
 * @since 4.0.0
 */
export const mkArrayBuffer = <E, R>(self: Stream<Uint8Array, E, R>): Effect.Effect<ArrayBuffer, E, R> =>
  Effect.map(Channel.mkUint8Array(self.channel), (bytes) => bytes.buffer)

/**
 * Concatenates the stream's `Uint8Array` chunks into a single `Uint8Array`.
 *
 * **Gotchas**
 *
 * This materializes the full content in memory. The source stream must not
 * reuse or mutate emitted buffers, which are retained until collection completes.
 *
 * **Example** (Joining Uint8Array chunks)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const stream = Stream.make(new Uint8Array([1, 2]), new Uint8Array([3, 4]))
 * const program = Effect.gen(function*() {
 *   const bytes = yield* Stream.mkUint8Array(stream)
 *   const values = Array.from(bytes) // => [1, 2, 3, 4]
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category destructors
 * @since 4.0.0
 */
export const mkUint8Array = <E, R>(self: Stream<Uint8Array, E, R>): Effect.Effect<Uint8Array, E, R> =>
  Channel.mkUint8Array(self.channel)

/**
 * Converts the stream to a `ReadableStream` using the provided services.
 *
 * **When to use**
 *
 * Use when bridging to Web Streams and you already have the `Context` required
 * to run the stream outside an `Effect`.
 *
 * **Details**
 *
 * See https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream.
 *
 * **Example** (Converting to a ReadableStream with services)
 *
 * ```ts import.meta.vitest
 * import { Context, Stream } from "effect"
 *
 * const stream = Stream.make(1, 2, 3, 4, 5)
 * const readableStream = Stream.toReadableStreamWith(stream, Context.empty())
 * const values = await Array.fromAsync(readableStream)
 * values // => [ 1, 2, 3, 4, 5 ]
 * ```
 *
 * @category destructors
 * @since 4.0.0
 */
export const toReadableStreamWith: {
  <A, XR>(
    context: Context.Context<XR>,
    options?: { readonly strategy?: QueuingStrategy<A> | undefined }
  ): <E, R extends XR>(self: Stream<A, E, R>) => ReadableStream<A>
  <A, E, XR, R extends XR>(
    self: Stream<A, E, R>,
    context: Context.Context<XR>,
    options?: { readonly strategy?: QueuingStrategy<A> | undefined }
  ): ReadableStream<A>
} = dual(
  (args) => isStream(args[0]),
  <A, E, XR, R extends XR>(
    self: Stream<A, E, R>,
    context: Context.Context<XR>,
    options?: { readonly strategy?: QueuingStrategy<A> | undefined }
  ): ReadableStream<A> => {
    let currentResolve: (() => void) | undefined = undefined
    let fiber: Fiber.Fiber<void, E> | undefined = undefined
    const latch = Latch.makeUnsafe(false)

    return new ReadableStream<A>({
      start(controller) {
        fiber = Effect.runFork(Effect.provideContext(
          runForEachArray(self, (chunk) =>
            latch.whenOpen(Effect.sync(() => {
              latch.closeUnsafe()
              for (let i = 0; i < chunk.length; i++) {
                controller.enqueue(chunk[i])
              }
              currentResolve!()
              currentResolve = undefined
            }))),
          context
        ))
        fiber.addObserver((exit) => {
          if (exit._tag === "Failure") {
            controller.error(Cause.squash(exit.cause))
          } else {
            controller.close()
          }
        })
      },
      pull() {
        return new Promise<void>((resolve) => {
          currentResolve = resolve
          latch.openUnsafe()
        })
      },
      cancel() {
        if (!fiber) return
        return Effect.runPromise(Effect.asVoid(Fiber.interrupt(fiber)))
      }
    }, options?.strategy)
  }
)

/**
 * Converts a stream to a `ReadableStream`.
 *
 * **Details**
 *
 * See https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream.
 *
 * **Example** (Converting a stream to a ReadableStream)
 *
 * ```ts import.meta.vitest
 * import { Stream } from "effect"
 *
 * const readableStream = Stream.toReadableStream(Stream.make(1, 2, 3))
 * const values = await Array.fromAsync(readableStream)
 * values // => [ 1, 2, 3 ]
 * ```
 *
 * @category destructors
 * @since 2.0.0
 */
export const toReadableStream: {
  <A>(
    options?: { readonly strategy?: QueuingStrategy<A> | undefined }
  ): <E>(
    self: Stream<A, E>
  ) => ReadableStream<A>
  <A, E>(
    self: Stream<A, E>,
    options?: { readonly strategy?: QueuingStrategy<A> | undefined }
  ): ReadableStream<A>
} = dual(
  (args) => isStream(args[0]),
  <A, E>(
    self: Stream<A, E>,
    options?: { readonly strategy?: QueuingStrategy<A> | undefined }
  ): ReadableStream<A> => toReadableStreamWith(self, Context.empty(), options)
)

/**
 * Creates an Effect that builds a ReadableStream from the stream.
 *
 * **When to use**
 *
 * Use when bridging to Web Streams from inside an `Effect` so the required
 * services can be captured from the current context.
 *
 * **Details**
 *
 * See https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream.
 *
 * **Example** (Creating a ReadableStream effect)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const stream = Stream.make(1, 2, 3, 4, 5)
 *
 * const effect = Effect.gen(function*() {
 *   const readableStream = yield* Stream.toReadableStreamEffect(stream)
 *   readableStream instanceof ReadableStream // => true
 * })
 *
 * await Effect.runPromise(effect)
 * ```
 *
 * @category destructors
 * @since 2.0.0
 */
export const toReadableStreamEffect: {
  <A>(
    options?: { readonly strategy?: QueuingStrategy<A> | undefined }
  ): <E, R>(
    self: Stream<A, E, R>
  ) => Effect.Effect<ReadableStream<A>, never, R>
  <A, E, R>(
    self: Stream<A, E, R>,
    options?: { readonly strategy?: QueuingStrategy<A> | undefined }
  ): Effect.Effect<ReadableStream<A>, never, R>
} = dual(
  (args) => isStream(args[0]),
  <A, E, R>(
    self: Stream<A, E, R>,
    options?: { readonly strategy?: QueuingStrategy<A> | undefined }
  ): Effect.Effect<ReadableStream<A>, never, R> =>
    Effect.map(
      Effect.context<R>(),
      (context) => toReadableStreamWith(self, context, options)
    )
)

/**
 * Converts the stream to an `AsyncIterable` using the provided services.
 *
 * **When to use**
 *
 * Use when converting outside an Effect and you already have the `Context`
 * needed to run the stream.
 *
 * **Example** (Converting to an AsyncIterable with services)
 *
 * ```ts import.meta.vitest
 * import { Context, Stream } from "effect"
 *
 * const stream = Stream.make(1, 2, 3)
 * const iterable = Stream.toAsyncIterableWith(stream, Context.empty())
 *
 * await Array.fromAsync(iterable) // => [1, 2, 3]
 * ```
 *
 * @category destructors
 * @since 4.0.0
 */
export const toAsyncIterableWith: {
  <XR>(context: Context.Context<XR>): <A, E, R extends XR>(self: Stream<A, E, R>) => AsyncIterable<A>
  <A, E, XR, R extends XR>(
    self: Stream<A, E, R>,
    context: Context.Context<XR>
  ): AsyncIterable<A>
} = dual(
  2,
  <A, E, XR, R extends XR>(
    self: Stream<A, E, R>,
    context: Context.Context<XR>
  ): AsyncIterable<A> => ({
    [Symbol.asyncIterator]() {
      const runPromise = Effect.runPromiseWith(context)
      const runFork = Effect.runForkWith(context)
      const scope = Scope.makeUnsafe()
      let pull: Pull.Pull<Arr.NonEmptyReadonlyArray<A>, E, void, R> | undefined
      let currentIter: Iterator<A> | undefined
      let currentFiber: Fiber.Fiber<Arr.NonEmptyReadonlyArray<A>, E | Cause.Done<void>> | undefined
      let closePromise: Promise<IteratorResult<A>> | undefined
      const close = (exit: Exit.Exit<unknown, unknown>): Promise<IteratorResult<A>> => {
        if (closePromise) return closePromise
        const fiber = currentFiber
        closePromise = runPromise(Effect.as(
          Effect.andThen(
            fiber ? Fiber.interrupt(fiber) : Effect.void,
            Scope.close(scope, exit)
          ),
          { done: true, value: undefined }
        ))
        return closePromise
      }
      const closeAndReportError = async (exit: Exit.Exit<unknown, unknown>): Promise<void> => {
        try {
          await close(exit)
        } catch (error) {
          await runPromise(Effect.logError("Suppressed error while closing Stream async iterator", error))
        }
      }
      return {
        async next(): Promise<IteratorResult<A>> {
          if (closePromise) return closePromise
          if (currentIter) {
            const next = currentIter.next()
            if (!next.done) return next
            currentIter = undefined
          }
          const fiber = runFork(
            pull ??
              Effect.flatMap(Channel.toPullScoped(self.channel, scope), (nextPull) => {
                pull = nextPull
                return nextPull
              })
          )
          currentFiber = fiber
          const exit = await runPromise(Fiber.await(fiber))
          if (currentFiber === fiber) {
            currentFiber = undefined
          }
          if (Exit.isSuccess(exit)) {
            currentIter = exit.value[Symbol.iterator]()
            return currentIter.next()
          } else if (Pull.isDoneCause(exit.cause)) {
            return close(Exit.void)
          }
          if (closePromise && Cause.hasInterruptsOnly(exit.cause)) {
            return closePromise
          }
          await closeAndReportError(exit)
          throw Cause.squash(exit.cause)
        },
        return() {
          return close(Exit.void)
        },
        async throw(error) {
          await closeAndReportError(Exit.die(error))
          throw error
        }
      }
    }
  })
)

/**
 * Creates an effect that yields an `AsyncIterable` using the current services.
 *
 * **When to use**
 *
 * Use when the `AsyncIterable` should be created inside Effect with the current
 * context supplying the stream's services.
 *
 * **Example** (Creating an AsyncIterable effect)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const stream = Stream.make(1, 2, 3)
 *
 * const program = Effect.gen(function*() {
 *   const iterable = yield* Stream.toAsyncIterableEffect(stream)
 *   return yield* Effect.promise(() => Array.fromAsync(iterable))
 * })
 *
 * await Effect.runPromise(program) // => [1, 2, 3]
 * ```
 *
 * @category destructors
 * @since 3.15.0
 */
export const toAsyncIterableEffect = <A, E, R>(self: Stream<A, E, R>): Effect.Effect<AsyncIterable<A>, never, R> =>
  Effect.map(
    Effect.context<R>(),
    (context) => toAsyncIterableWith(self, context)
  )

/**
 * Converts a stream to an `AsyncIterable` for `for await...of` consumption.
 *
 * **Example** (Converting to an async iterable)
 *
 * ```ts import.meta.vitest
 * import { Stream } from "effect"
 *
 * const stream = Stream.make(1, 2, 3)
 *
 * await Array.fromAsync(Stream.toAsyncIterable(stream)) // => [1, 2, 3]
 * ```
 *
 * @category destructors
 * @since 3.15.0
 */
export const toAsyncIterable = <A, E>(self: Stream<A, E>): AsyncIterable<A> =>
  toAsyncIterableWith(self, Context.empty())

/**
 * Runs the stream, publishing elements into the provided PubSub.
 *
 * **Details**
 *
 * `shutdownOnEnd` controls whether the PubSub is shut down when the stream ends.
 * It only shuts down when set to `true`.
 *
 * **Example** (Running a stream into a PubSub)
 *
 * ```ts import.meta.vitest
 * import { Effect, PubSub, Stream } from "effect"
 *
 * const program = Effect.scoped(Effect.gen(function* () {
 *   const pubsub = yield* PubSub.unbounded<number>()
 *   const subscription = yield* PubSub.subscribe(pubsub)
 *
 *   yield* Stream.runIntoPubSub(Stream.fromIterable([1, 2]), pubsub)
 *
 *   const first = yield* PubSub.take(subscription)
 *   const second = yield* PubSub.take(subscription)
 *
 *   first // => 1
 *   second // => 2
 * }))
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @category destructors
 * @since 2.0.0
 */
export const runIntoPubSub: {
  <A>(
    pubsub: PubSub.PubSub<A>,
    options?: {
      readonly shutdownOnEnd?: boolean | undefined
    } | undefined
  ): <E, R>(self: Stream<A, E, R>) => Effect.Effect<void, E, R>
  <A, E, R>(
    self: Stream<A, E, R>,
    pubsub: PubSub.PubSub<A>,
    options?: {
      readonly shutdownOnEnd?: boolean | undefined
    } | undefined
  ): Effect.Effect<void, E, R>
} = dual((args) => isStream(args[0]), <A, E, R>(
  self: Stream<A, E, R>,
  pubsub: PubSub.PubSub<A>,
  options?: {
    readonly shutdownOnEnd?: boolean | undefined
  } | undefined
): Effect.Effect<void, E, R> => Channel.runIntoPubSubArray(self.channel, pubsub, options))

/**
 * Converts a stream to a PubSub of emitted values for concurrent consumption.
 *
 * **Details**
 *
 * `shutdownOnEnd` indicates whether the PubSub should be shut down when the
 * stream ends. By default this is `true`.
 *
 * **Example** (Converting a stream to a PubSub for concurrent consumption)
 *
 * ```ts import.meta.vitest
 * import { Effect, PubSub, Stream } from "effect"
 *
 * const program = Effect.scoped(Effect.gen(function* () {
 *   const pubsub = yield* Stream.fromArray([1, 2]).pipe(
 *     Stream.toPubSub({ capacity: 8 })
 *   )
 *   const subscription = yield* PubSub.subscribe(pubsub)
 *   const first = yield* PubSub.take(subscription)
 *
 *   first // => 1
 * }))
 * await Effect.runPromise(program)
 * ```
 *
 * @category destructors
 * @since 2.0.0
 */
export const toPubSub: {
  (
    options: {
      readonly capacity: "unbounded"
      readonly replay?: number | undefined
      readonly shutdownOnEnd?: boolean | undefined
    } | {
      readonly capacity: number
      readonly strategy?: "dropping" | "sliding" | "suspend" | undefined
      readonly replay?: number | undefined
      readonly shutdownOnEnd?: boolean | undefined
    }
  ): <A, E, R>(self: Stream<A, E, R>) => Effect.Effect<PubSub.PubSub<A>, never, R | Scope.Scope>
  <A, E, R>(
    self: Stream<A, E, R>,
    options: {
      readonly capacity: "unbounded"
      readonly replay?: number | undefined
      readonly shutdownOnEnd?: boolean | undefined
    } | {
      readonly capacity: number
      readonly strategy?: "dropping" | "sliding" | "suspend" | undefined
      readonly replay?: number | undefined
      readonly shutdownOnEnd?: boolean | undefined
    }
  ): Effect.Effect<PubSub.PubSub<A>, never, R | Scope.Scope>
} = dual(
  2,
  <A, E, R>(
    self: Stream<A, E, R>,
    options: {
      readonly capacity: "unbounded"
      readonly replay?: number | undefined
      readonly shutdownOnEnd?: boolean | undefined
    } | {
      readonly capacity: number
      readonly strategy?: "dropping" | "sliding" | "suspend" | undefined
      readonly replay?: number | undefined
      readonly shutdownOnEnd?: boolean | undefined
    }
  ): Effect.Effect<PubSub.PubSub<A>, never, R | Scope.Scope> => Channel.toPubSubArray(self.channel, options)
)

/**
 * Converts a stream to a PubSub of `Take` values for concurrent consumption.
 *
 * **Details**
 *
 * Chunks are published as `Take` values. When the stream ends, the PubSub is
 * ended with the stream's `Exit`, so every subscriber, including one that
 * subscribes later, observes completion or failure after its buffered chunks.
 *
 * **Example** (Converting to a PubSub of takes)
 *
 * ```ts import.meta.vitest
 * import { Effect, PubSub, Stream } from "effect"
 *
 * const program = Effect.gen(function* () {
 *   const pubsub = yield* Stream.fromArray([1, 2, 3]).pipe(
 *     Stream.toPubSubTake({ capacity: 8 })
 *   )
 *   const subscription = yield* PubSub.subscribe(pubsub)
 *   const take = yield* PubSub.take(subscription)
 *
 *   if (Array.isArray(take)) {
 *     take // => [ 1, 2, 3 ]
 *   }
 * })
 * await Effect.runPromise(Effect.scoped(program))
 * ```
 *
 * @category destructors
 * @since 4.0.0
 */
export const toPubSubTake: {
  (
    options: {
      readonly capacity: "unbounded"
      readonly replay?: number | undefined
    } | {
      readonly capacity: number
      readonly strategy?: "dropping" | "sliding" | "suspend" | undefined
      readonly replay?: number | undefined
    }
  ): <A, E, R>(self: Stream<A, E, R>) => Effect.Effect<PubSub.PubSub<Take.Take<A, E>>, never, R | Scope.Scope>
  <A, E, R>(
    self: Stream<A, E, R>,
    options: {
      readonly capacity: "unbounded"
      readonly replay?: number | undefined
    } | {
      readonly capacity: number
      readonly strategy?: "dropping" | "sliding" | "suspend" | undefined
      readonly replay?: number | undefined
    }
  ): Effect.Effect<PubSub.PubSub<Take.Take<A, E>>, never, R | Scope.Scope>
} = dual(
  2,
  <A, E, R>(
    self: Stream<A, E, R>,
    options: {
      readonly capacity: "unbounded"
      readonly replay?: number | undefined
    } | {
      readonly capacity: number
      readonly strategy?: "dropping" | "sliding" | "suspend" | undefined
      readonly replay?: number | undefined
    }
  ): Effect.Effect<PubSub.PubSub<Take.Take<A, E>>, never, R | Scope.Scope> =>
    Channel.toPubSubTake(self.channel, options)
)

/**
 * Creates a scoped dequeue that is fed by the stream for concurrent
 * consumption.
 *
 * **Details**
 *
 * Elements are offered to the queue as the stream runs. Stream completion is
 * signaled with `Cause.Done`, stream failures fail the queue, and the queue is
 * shut down when the surrounding scope closes.
 *
 * **Example** (Converting a stream to a Queue for concurrent consumption)
 *
 * ```ts import.meta.vitest
 * import { Effect, Queue, Stream } from "effect"
 *
 * const program = Effect.gen(function* () {
 *   const queue = yield* Stream.toQueue(Stream.fromIterable([1, 2, 3]), { capacity: 8 })
 *   const chunk = yield* Queue.takeBetween(queue, 1, 3)
 *   chunk // => [ 1, 2, 3 ]
 * })
 * await Effect.runPromise(Effect.scoped(program))
 * ```
 *
 * @category destructors
 * @since 2.0.0
 */
export const toQueue: {
  (
    options: {
      readonly capacity: "unbounded"
    } | {
      readonly capacity: number
      readonly strategy?: "dropping" | "sliding" | "suspend" | undefined
    }
  ): <A, E, R>(self: Stream<A, E, R>) => Effect.Effect<Queue.Dequeue<A, E | Cause.Done>, never, R | Scope.Scope>
  <A, E, R>(
    self: Stream<A, E, R>,
    options: {
      readonly capacity: "unbounded"
    } | {
      readonly capacity: number
      readonly strategy?: "dropping" | "sliding" | "suspend" | undefined
    }
  ): Effect.Effect<Queue.Dequeue<A, E | Cause.Done>, never, R | Scope.Scope>
} = dual(
  2,
  <A, E, R>(
    self: Stream<A, E, R>,
    options: {
      readonly capacity: "unbounded"
    } | {
      readonly capacity: number
      readonly strategy?: "dropping" | "sliding" | "suspend" | undefined
    }
  ): Effect.Effect<Queue.Dequeue<A, E | Cause.Done>, never, R | Scope.Scope> =>
    Channel.toQueueArray(self.channel, options)
)

/**
 * Runs the stream, offering each element to the provided queue and ending it
 * with `Cause.Done` when the stream completes.
 *
 * **Example** (Running a stream into a queue)
 *
 * ```ts import.meta.vitest
 * import { Cause, Effect, Queue, Stream } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const queue = yield* Queue.bounded<number, Cause.Done>(4)
 *
 *   yield* Effect.forkChild(
 *     Stream.runIntoQueue(Stream.fromIterable([1, 2, 3]), queue)
 *   )
 *
 *   const values = [
 *     yield* Queue.take(queue),
 *     yield* Queue.take(queue),
 *     yield* Queue.take(queue)
 *   ]
 *   const done = yield* Effect.flip(Queue.take(queue))
 *
 *   values // => [ 1, 2, 3 ]
 *   done._tag === "Done" // => true
 * })
 * await Effect.runPromise(program)
 * ```
 *
 * @category destructors
 * @since 2.0.0
 */
export const runIntoQueue: {
  <A, E>(queue: Queue.Queue<A, E | Cause.Done>): <R>(self: Stream<A, E, R>) => Effect.Effect<void, never, R>
  <A, E, R>(self: Stream<A, E, R>, queue: Queue.Queue<A, E | Cause.Done>): Effect.Effect<void, never, R>
} = dual(2, <A, E, R>(
  self: Stream<A, E, R>,
  queue: Queue.Queue<A, E | Cause.Done>
): Effect.Effect<void, never, R> => Channel.runIntoQueueArray(self.channel, queue))
