/**
 * Consumes values from a `Stream` and produces one final result.
 *
 * A `Sink` may read no input, a fixed amount of input, or keep reading until a
 * condition is met. If it reads more than it needs, it can return leftovers so
 * the stream can continue from those values. Sinks are used to collect, fold,
 * search, count, or otherwise reduce streamed input, and they can be composed
 * when a stream needs more than one consuming step.
 *
 * @since 2.0.0
 */
import type { NonEmptyReadonlyArray } from "./Array.ts"
import * as Arr from "./Array.ts"
import * as Cause from "./Cause.ts"
import * as Channel from "./Channel.ts"
import * as Clock from "./Clock.ts"
import type * as Context from "./Context.ts"
import * as Duration from "./Duration.ts"
import * as Effect from "./Effect.ts"
import * as Exit from "./Exit.ts"
import type * as Filter from "./Filter.ts"
import type { LazyArg } from "./Function.ts"
import { constant, constFalse, constTrue, constVoid, dual, identity, pipe } from "./Function.ts"
import * as Count from "./internal/count.ts"
import * as internalStream from "./internal/stream.ts"
import * as Option from "./Option.ts"
import { type Pipeable, pipeArguments } from "./Pipeable.ts"
import type { Predicate, Refinement } from "./Predicate.ts"
import { hasProperty } from "./Predicate.ts"
import * as PubSub from "./PubSub.ts"
import * as Pull from "./Pull.ts"
import * as Queue from "./Queue.ts"
import * as Result from "./Result.ts"
import * as Scope from "./Scope.ts"
import type { Stream } from "./Stream.ts"
import type * as Types from "./Types.ts"
import type * as Unify from "./Unify.ts"

const TypeId = "~effect/Sink"

/**
 * A `Sink<A, In, L, E, R>` is used to consume elements produced by a `Stream`.
 * You can think of a sink as a function that will consume a variable amount of
 * `In` elements (could be 0, 1, or many), might fail with an error of type `E`,
 * and will eventually yield a value of type `A` together with a remainder of
 * type `L` (i.e. any leftovers).
 *
 * **Example** (Running a sink with a stream)
 *
 * ```ts import.meta.vitest
 * import { Effect, Sink, Stream } from "effect"
 *
 * // Create a simple sink that always succeeds with a value
 * const sink: Sink.Sink<number> = Sink.succeed(42)
 *
 * // Use the sink to consume a stream
 * const stream = Stream.make(1, 2, 3)
 * await Effect.runPromise(Stream.run(stream, sink)) // => 42
 * ```
 *
 * @category models
 * @since 2.0.0
 */
export interface Sink<out A, in In = unknown, out L = never, out E = never, out R = never>
  extends Sink.Variance<A, In, L, E, R>, Pipeable
{
  readonly transform: (
    upstream: Pull.Pull<NonEmptyReadonlyArray<In>, never, void>,
    scope: Scope.Scope
  ) => Effect.Effect<End<A, L>, E, R>
  [Unify.typeSymbol]?: unknown
  [Unify.unifySymbol]?: SinkUnify<this>
  [Unify.ignoreSymbol]?: SinkUnifyIgnore
}

/**
 * Tuple returned when a `Sink` finishes.
 *
 * **Details**
 *
 * The first element is the sink result. The optional second element contains a
 * non-empty array of leftover input that was pulled but not consumed.
 *
 * @category models
 * @since 4.0.0
 */
export type End<A, L = never> = readonly [value: A, leftover?: NonEmptyReadonlyArray<L> | undefined]

const endVoid = Effect.succeed([void 0] as End<void, never>)

/**
 * Type-level unification support for `Sink` values.
 *
 * **Details**
 *
 * This preserves the result, input, leftover, error, and service type
 * parameters when Effect's `Unify` machinery normalizes generic values that
 * include sinks. Users normally do not need to reference this interface
 * directly.
 *
 * @category models
 * @since 2.0.0
 */
export interface SinkUnify<A extends { [Unify.typeSymbol]?: any }> extends Effect.EffectUnify<A> {
  Sink?: () => A[Unify.typeSymbol] extends
    | Sink<
      infer A,
      infer In,
      infer L,
      infer E,
      infer R
    >
    | infer _ ? Sink<A, In, L, E, R>
    : never
}

/**
 * Marker used by Effect's `Unify` machinery for `Sink` values.
 *
 * **Details**
 *
 * It prevents the inherited `Effect` unifier from being selected when
 * sink-specific unification should preserve the `Sink` type parameters. Users
 * normally do not need to reference this interface directly.
 *
 * @category models
 * @since 2.0.0
 */
export interface SinkUnifyIgnore {
  Effect?: true
}

/**
 * Namespace containing types and interfaces for Sink variance and type relationships.
 *
 * @since 2.0.0
 */
export declare namespace Sink {
  /**
   * Type-level variance marker for `Sink`.
   *
   * **Details**
   *
   * The result `A`, leftovers `L`, errors `E`, and services `R` are
   * covariant. The input type `In` is contravariant because values flow into
   * the sink.
   *
   * @category models
   * @since 2.0.0
   */
  export interface Variance<out A, in In, out L, out E, out R> {
    readonly [TypeId]: VarianceStruct<A, In, L, E, R>
  }
  /**
   * Structural encoding used by `Sink.Variance` to record each `Sink` type
   * parameter's variance.
   *
   * **Details**
   *
   * `_A`, `_L`, `_E`, and `_R` are covariant markers. `_In` is a
   * contravariant marker.
   *
   * @category models
   * @since 2.0.0
   */
  export interface VarianceStruct<out A, in In, out L, out E, out R> {
    _A: Types.Covariant<A>
    _In: Types.Contravariant<In>
    _L: Types.Covariant<L>
    _E: Types.Covariant<E>
    _R: Types.Covariant<R>
  }
}

const sinkVariance = {
  _A: identity,
  _In: identity,
  _L: identity,
  _E: identity,
  _R: identity
}

const SinkProto = {
  [TypeId]: sinkVariance,
  pipe() {
    return pipeArguments(this, arguments)
  }
}

/**
 * Checks whether a value is a Sink.
 *
 * **Example** (Checking for a sink)
 *
 * ```ts import.meta.vitest
 * import { Sink } from "effect"
 *
 * const sink = Sink.never
 * const notStream = { data: [1, 2, 3] }
 *
 * Sink.isSink(sink) // => true
 * Sink.isSink(notStream) // => false
 * ```
 *
 * @category guards
 * @since 4.0.0
 */
export const isSink = (u: unknown): u is Sink<unknown, never, unknown, unknown, unknown> => hasProperty(u, TypeId)

/**
 * Creates a sink from a `Channel`.
 *
 * **When to use**
 *
 * Use to create a `Sink` from a `Channel` that processes non-empty arrays of
 * input values.
 *
 * **Example** (Using channel completion as the sink result)
 *
 * ```ts import.meta.vitest
 * import { Channel, Effect, Sink, Stream } from "effect"
 *
 * const channel = Channel.identity<readonly [number, ...Array<number>], never, void>().pipe(
 *   Channel.drain,
 *   Channel.mapDone(() => ["consumed"] as const)
 * )
 * const sink = Sink.fromChannel(channel)
 *
 * await Effect.runPromise(Stream.run(Stream.make(1, 2, 3), sink)) // => "consumed"
 * ```
 *
 * @see {@link toChannel} for converting a `Sink` back to a `Channel`
 * @category constructors
 * @since 2.0.0
 */
export const fromChannel = <L, In, E, A, R>(
  channel: Channel.Channel<
    never,
    E,
    End<A, L>,
    NonEmptyReadonlyArray<In>,
    never,
    void,
    R
  >
): Sink<A, In, L, E, R> =>
  fromTransform((upstream, scope) =>
    Channel.toTransform(channel)(upstream, scope).pipe(
      Effect.flatMap(Effect.forever({ disableYield: true })),
      Pull.catchDone(Effect.succeed)
    ) as Effect.Effect<End<A, L>, E, R>
  )

/**
 * Creates a sink that writes its input to a Web `WritableStream`.
 *
 * **Example** (Collecting values in a Web stream)
 *
 * ```ts import.meta.vitest
 * import { Effect, Sink, Stream } from "effect"
 *
 * const written: Array<number> = []
 * const sink = Sink.fromWritableStream({
 *   evaluate: () => new WritableStream<number>({
 *     write(value) {
 *       written.push(value)
 *     }
 *   }),
 *   onError: (cause) => new Error(String(cause))
 * })
 *
 * await Effect.runPromise(Stream.run(Stream.make(1, 2, 3), sink))
 * written // => [1, 2, 3]
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export const fromWritableStream = <A, E>(options: {
  readonly evaluate: LazyArg<WritableStream<A>>
  readonly onError: (error: unknown) => E
  readonly closeOnDone?: boolean | undefined
}): Sink<void, A, never, E> =>
  fromChannel(
    Channel.mapDone(
      Channel.fromWritableStream<never, E, A>(options),
      (_) => [_]
    )
  )

/**
 * Creates a `Sink` from a low-level transform function.
 *
 * **Details**
 *
 * The transform receives the upstream pull of non-empty input arrays and the
 * active scope, and returns an effect that completes with the sink's `End`
 * value.
 *
 * @category constructors
 * @since 4.0.0
 */
export const fromTransform = <In, A, E, R, L = never>(
  transform: (
    upstream: Pull.Pull<NonEmptyReadonlyArray<In>, never, void>,
    scope: Scope.Scope
  ) => Effect.Effect<End<A, L>, E, R>
): Sink<A, In, L, E, R> => {
  const self = Object.create(SinkProto)
  self.transform = transform
  return self
}

/**
 * Creates a `Channel` from a Sink.
 *
 * **Example** (Running a sink as a channel)
 *
 * ```ts import.meta.vitest
 * import { Channel, Effect, Sink, Stream } from "effect"
 *
 * const channel = Stream.toChannel(Stream.make(1, 2, 3)).pipe(
 *   Channel.pipeTo(Sink.toChannel(Sink.sum))
 * )
 *
 * await Effect.runPromise(Channel.runDrain(channel)) // => [6]
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const toChannel = <A, In, L, E, R>(
  self: Sink<A, In, L, E, R>
): Channel.Channel<never, E, End<A, L>, NonEmptyReadonlyArray<In>, never, void, R> =>
  Channel.fromTransform((upstream, scope) =>
    Effect.succeed(Effect.flatMap(
      self.transform(upstream, scope),
      Cause.done
    ))
  )

/**
 * Creates a pipe-style constructor for sinks over input type `In`.
 *
 * **Details**
 *
 * The returned function exposes the sink input as a `Stream<In>`, applies the
 * provided pipeline, and uses the final effect's success value as the sink
 * result.
 *
 * @category constructors
 * @since 4.0.0
 */
export const make = <In>(): make.Constructor<In> => (...fns: []) =>
  fromTransform((upstream, scope) =>
    pipe(
      internalStream.fromChannel(Channel.fromPull(Effect.succeed(upstream))),
      ...fns as any as [() => Effect.Effect<any>],
      Effect.flatMap((a) => Cause.done<End<any>>([a])),
      Scope.provide(scope)
    )
  )

/**
 * Companion namespace containing overload types for the pipe-style sink
 * constructor returned by `Sink.make`.
 *
 * @since 4.0.0
 */
export declare namespace make {
  /**
   * Overloaded function type returned by `Sink.make`.
   *
   * **Details**
   *
   * The first pipeline function receives the sink input as a `Stream<In>`. The
   * final pipeline step must return an `Effect`, whose success value becomes
   * the sink result.
   *
   * @category models
   * @since 4.0.0
   */
  export interface Constructor<In> {
    <E, R, B = never>(ab: (_: Stream<In>) => Effect.Effect<B, E, R>): Sink<B, In, never, E, Exclude<R, Scope.Scope>>
    <E, R, B = never, C = never>(
      ab: (_: Stream<In>) => B,
      bc: (_: B) => Effect.Effect<C, E, R>
    ): Sink<C, In, never, E, Exclude<R, Scope.Scope>>
    <E, R, B = never, C = never, D = never>(
      ab: (_: Stream<In>) => B,
      bc: (_: B) => C,
      cd: (_: C) => Effect.Effect<D, E, R>
    ): Sink<D, In, never, E, Exclude<R, Scope.Scope>>
    <E, R, B = never, C = never, D = never, F = never>(
      ab: (_: Stream<In>) => B,
      bc: (_: B) => C,
      cd: (_: C) => D,
      df: (_: D) => Effect.Effect<F, E, R>
    ): Sink<F, In, never, E, Exclude<R, Scope.Scope>>
    <E, R, B = never, C = never, D = never, F = never, G = never>(
      ab: (_: Stream<In>) => B,
      bc: (_: B) => C,
      cd: (_: C) => D,
      df: (_: D) => F,
      fg: (_: F) => Effect.Effect<G, E, R>
    ): Sink<G, In, never, E, Exclude<R, Scope.Scope>>
    <E, R, B = never, C = never, D = never, F = never, G = never, H = never>(
      ab: (_: Stream<In>) => B,
      bc: (_: B) => C,
      cd: (_: C) => D,
      df: (_: D) => F,
      fg: (_: F) => G,
      gh: (_: G) => Effect.Effect<H, E, R>
    ): Sink<H, In, never, E, Exclude<R, Scope.Scope>>
    <E, R, B = never, C = never, D = never, F = never, G = never, H = never, I = never>(
      ab: (_: Stream<In>) => B,
      bc: (_: B) => C,
      cd: (_: C) => D,
      df: (_: D) => F,
      fg: (_: F) => G,
      gh: (_: G) => H,
      hi: (_: H) => Effect.Effect<I, E, R>
    ): Sink<I, In, never, E, Exclude<R, Scope.Scope>>
    <E, R, B = never, C = never, D = never, F = never, G = never, H = never, I = never, J = never>(
      ab: (_: Stream<In>) => B,
      bc: (_: B) => C,
      cd: (_: C) => D,
      df: (_: D) => F,
      fg: (_: F) => G,
      gh: (_: G) => H,
      hi: (_: H) => I,
      ij: (_: I) => Effect.Effect<J, E, R>
    ): Sink<J, In, never, E, Exclude<R, Scope.Scope>>
    <E, R, B = never, C = never, D = never, F = never, G = never, H = never, I = never, J = never, K = never>(
      ab: (_: Stream<In>) => B,
      bc: (_: B) => C,
      cd: (_: C) => D,
      df: (_: D) => F,
      fg: (_: F) => G,
      gh: (_: G) => H,
      hi: (_: H) => I,
      ij: (_: I) => J,
      jk: (_: J) => Effect.Effect<K, E, R>
    ): Sink<K, In, never, E, Exclude<R, Scope.Scope>>
    <
      E,
      R,
      B = never,
      C = never,
      D = never,
      F = never,
      G = never,
      H = never,
      I = never,
      J = never,
      K = never,
      L = never
    >(
      ab: (_: Stream<In>) => B,
      bc: (_: B) => C,
      cd: (_: C) => D,
      df: (_: D) => F,
      fg: (_: F) => G,
      gh: (_: G) => H,
      hi: (_: H) => I,
      ij: (_: I) => J,
      jk: (_: J) => K,
      kl: (_: K) => Effect.Effect<L, E, R>
    ): Sink<L, In, never, E, Exclude<R, Scope.Scope>>
  }
}

/**
 * Creates a sink that ignores upstream input and completes from an effect that
 * already returns an `End`.
 *
 * **When to use**
 *
 * Use when you need to create a sink from an effect that returns both the sink
 * result value and optional leftovers.
 *
 * @category constructors
 * @since 4.0.0
 */
export const fromEffectEnd = <A, E, R, L = never>(
  effect: Effect.Effect<End<A, L>, E, R>
): Sink<A, unknown, L, E, R> => fromTransform(() => effect)

/**
 * Creates a sink that ignores upstream input and completes with the success
 * value of the provided effect.
 *
 * **Details**
 *
 * If the effect fails, the sink fails with the same error.
 *
 * @category constructors
 * @since 2.0.0
 */
export const fromEffect = <A, E, R>(
  effect: Effect.Effect<A, E, R>
): Sink<A, unknown, never, E, R> => fromEffectEnd(Effect.map(effect, (a) => [a]))

/**
 * Creates a sink that offers every consumed input element to a queue.
 *
 * **Details**
 *
 * When the upstream stream ends, the sink ends the queue and completes with
 * `void`.
 *
 * @category constructors
 * @since 2.0.0
 */
export const fromQueue = <A>(
  queue: Queue.Queue<A, Cause.Done>
): Sink<void, A> =>
  fromTransform((upstream) =>
    upstream.pipe(
      Effect.flatMap((arr) => Queue.offerAll(queue, arr)),
      Effect.forever({ disableYield: true }),
      Pull.catchDone((_) => {
        Queue.endUnsafe(queue)
        return endVoid
      })
    )
  )

/**
 * Creates a sink that publishes every consumed input element to a `PubSub`.
 *
 * **Details**
 *
 * The sink completes with `void` when the upstream stream ends.
 *
 * @category constructors
 * @since 2.0.0
 */
export const fromPubSub = <A>(
  pubsub: PubSub.PubSub<A>
): Sink<void, A> => forEachArray((arr) => PubSub.publishAll(pubsub, arr))

/**
 * A sink that immediately ends with the specified value.
 *
 * **Example** (Succeeding with a value)
 *
 * ```ts import.meta.vitest
 * import { Effect, Sink, Stream } from "effect"
 *
 * // Create a sink that always yields the same value
 * const sink = Sink.succeed(42)
 *
 * // Use it with a stream
 * const stream = Stream.make(1, 2, 3)
 * await Effect.runPromise(Stream.run(stream, sink)) // => 42
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const succeed = <A, L = never>(a: A, leftovers?: NonEmptyReadonlyArray<L> | undefined): Sink<A, unknown, L> =>
  fromEffectEnd(Effect.succeed([a, leftovers]))

/**
 * A sink that immediately ends with the specified lazily evaluated value.
 *
 * @category constructors
 * @since 2.0.0
 */
export const sync = <A>(a: LazyArg<A>): Sink<A> => fromEffect(Effect.sync(a))

/**
 * A sink that is created from a lazily evaluated sink.
 *
 * @category constructors
 * @since 2.0.0
 */
export const suspend = <A, In, L, E, R>(evaluate: LazyArg<Sink<A, In, L, E, R>>): Sink<A, In, L, E, R> =>
  fromTransform((upstream, scope) => evaluate().transform(upstream, scope))

/**
 * A sink that always fails with the specified error.
 *
 * **Example** (Failing with an error)
 *
 * ```ts import.meta.vitest
 * import { Effect, Exit, Sink, Stream } from "effect"
 *
 * // Create a sink that always fails
 * const sink = Sink.fail("Sink failed")
 *
 * // Use it with a stream
 * const stream = Stream.make(1, 2, 3)
 * await Effect.runPromiseExit(Stream.run(stream, sink)) // => Exit.fail("Sink failed")
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const fail = <E>(e: E): Sink<never, unknown, never, E> => fromEffectEnd(Effect.fail(e))

/**
 * A sink that always fails with the specified lazily evaluated error.
 *
 * **Example** (Failing with a lazy error)
 *
 * ```ts import.meta.vitest
 * import { Effect, Exit, Sink, Stream } from "effect"
 *
 * // Create a sink that fails with a lazy error
 * const sink = Sink.failSync(() => "Lazy error")
 *
 * // Use it with a stream
 * const stream = Stream.make(1, 2, 3)
 * await Effect.runPromiseExit(Stream.run(stream, sink)) // => Exit.fail("Lazy error")
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const failSync = <E>(evaluate: LazyArg<E>): Sink<never, unknown, never, E> =>
  fromEffectEnd(Effect.failSync(evaluate))

/**
 * Creates a sink halting with a specified `Cause`.
 *
 * **Example** (Failing with a cause)
 *
 * ```ts import.meta.vitest
 * import { Cause, Effect, Exit, Sink, Stream } from "effect"
 *
 * // Create a sink that fails with a specific cause
 * const sink = Sink.failCause(Cause.fail("Custom cause"))
 *
 * // Use it with a stream
 * const stream = Stream.make(1, 2, 3)
 * await Effect.runPromiseExit(Stream.run(stream, sink)) // => Exit.fail("Custom cause")
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const failCause = <E>(cause: Cause.Cause<E>): Sink<never, unknown, never, E> =>
  fromEffectEnd(Effect.failCause(cause))

/**
 * Creates a sink halting with a specified lazily evaluated `Cause`.
 *
 * **Example** (Failing with a lazy cause)
 *
 * ```ts import.meta.vitest
 * import { Cause, Effect, Exit, Sink, Stream } from "effect"
 *
 * // Create a sink that fails with a lazy cause
 * const sink = Sink.failCauseSync(() => Cause.fail("Lazy cause"))
 *
 * // Use it with a stream
 * const stream = Stream.make(1, 2, 3)
 * await Effect.runPromiseExit(Stream.run(stream, sink)) // => Exit.fail("Lazy cause")
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const failCauseSync = <E>(evaluate: LazyArg<Cause.Cause<E>>): Sink<never, unknown, never, E> =>
  fromEffectEnd(Effect.failCauseSync(evaluate))

/**
 * Creates a sink halting with a specified defect.
 *
 * **Example** (Dying with a defect)
 *
 * ```ts import.meta.vitest
 * import { Effect, Exit, Sink, Stream } from "effect"
 *
 * // Create a sink that dies with a defect
 * const sink = Sink.die("Defect error")
 *
 * // Use it with a stream
 * const stream = Stream.make(1, 2, 3)
 * await Effect.runPromiseExit(Stream.run(stream, sink)) // => Exit.die("Defect error")
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const die = (defect: unknown): Sink<never> => fromEffectEnd(Effect.die(defect))

/**
 * A sink that never completes.
 *
 * @category constructors
 * @since 2.0.0
 */
export const never: Sink<unknown> = fromEffectEnd(Effect.never)

/**
 * Drops leftovers produced by a sink.
 *
 * **Details**
 *
 * The sink result is preserved, but any leftover elements are discarded
 * instead of being returned to downstream sink composition. This does not
 * continue pulling additional elements from the upstream stream.
 *
 * @category filtering
 * @since 2.0.0
 */
export const ignoreLeftover = <A, In, L, E, R>(self: Sink<A, In, L, E, R>): Sink<A, In, never, E, R> =>
  mapEnd(self, ([a]) => [a])

/**
 * Consumes and ignores all stream inputs.
 *
 * **When to use**
 *
 * Use to consume all upstream input and complete with void when the input
 * values and any aggregate result are not needed.
 *
 * @see {@link count} for consuming all input while returning the number of elements
 * @see {@link forEach} for consuming all input while running an effect for each element
 *
 * @category constructors
 * @since 2.0.0
 */
export const drain: Sink<void, unknown> = fromTransform((upstream) =>
  Pull.catchDone(
    Effect.forever(upstream, { disableYield: true }),
    () => endVoid
  )
)

/**
 * A sink that folds its inputs with the provided function, termination
 * predicate and initial state.
 *
 * **When to use**
 *
 * Use to accumulate stream input element by element with an effectful step and
 * stop based on the accumulated state.
 *
 * **Details**
 *
 * The initial state is evaluated lazily. Each input element is folded with the
 * effectful function, and the sink continues while `contFn` returns `true`. If
 * the sink stops in the middle of a pulled array, the remaining elements from
 * that array are returned as leftovers.
 *
 * @see {@link foldArray} for folding each pulled non-empty input array at once
 * @see {@link foldUntil} for folding until a fixed maximum number of elements is consumed
 *
 * @category folding
 * @since 2.0.0
 */
export const fold = <S, In, E = never, R = never>(
  s: LazyArg<S>,
  contFn: Predicate<S>,
  f: (s: S, input: In) => Effect.Effect<S, E, R>
): Sink<S, In, In, E, R> =>
  fromTransform((upstream) => {
    let state = s()
    return Effect.gen(function*() {
      while (true) {
        const arr = yield* upstream
        for (let i = 0; i < arr.length; i++) {
          state = yield* f(state, arr[i])
          if (contFn(state)) continue
          return [
            state,
            (i + 1) < arr.length ? (arr.slice(i + 1) as any) : undefined
          ] as const
        }
      }
    }).pipe(
      Pull.catchDone(() => Effect.succeed<End<S, In>>([state]))
    )
  })

/**
 * Folds non-empty input arrays into state with an effectful function.
 *
 * **When to use**
 *
 * Use to update state with an effectful function once per pulled non-empty
 * input array when batch-level processing is the natural unit.
 *
 * **Details**
 *
 * The initial state is evaluated lazily. After each pulled array is folded,
 * the sink continues while `contFn` returns `true`; otherwise it completes
 * with the current state.
 *
 * @see {@link fold} for folding element by element and returning leftovers when stopping mid-array
 * @see {@link reduceWhileArrayEffect} for array-level effectful reducing that checks the predicate before consuming input
 *
 * @category folding
 * @since 4.0.0
 */
export const foldArray = <S, In, E = never, R = never>(
  s: LazyArg<S>,
  contFn: Predicate<S>,
  f: (s: S, input: Arr.NonEmptyReadonlyArray<In>) => Effect.Effect<S, E, R>
): Sink<S, In, never, E, R> =>
  fromTransform((upstream) => {
    let state = s()
    return Effect.gen(function*() {
      while (true) {
        const arr = yield* upstream
        state = yield* f(state, arr)
        if (contFn(state)) continue
        return [state] as const
      }
    }).pipe(
      Pull.catchDone(() => Effect.succeed<End<S>>([state]))
    )
  })

/**
 * Folds input elements into state until the specified maximum number of
 * elements has been consumed or the upstream stream ends.
 *
 * **Details**
 *
 * Finite fractional values of `max` are rounded down. If `max` is `NaN` or
 * non-positive, the sink completes with the initial state without consuming
 * input.
 *
 * If the sink stops in the middle of a pulled array, the remaining elements
 * from that array are returned as leftovers.
 *
 * @category folding
 * @since 2.0.0
 */
export const foldUntil = <S, In, E = never, R = never>(
  s: LazyArg<S>,
  max: number,
  f: (s: S, input: In) => Effect.Effect<S, E, R>
): Sink<S, In, In, E, R> => {
  const count = Count.normalize(max)
  if (count === 0) return sync(s)
  return fold<readonly [S, number], In, E, R>(
    () => [s(), 0],
    (tuple) => tuple[1] < count,
    ([output, consumed], input) => Effect.map(f(output, input), (s) => [s, consumed + 1] as const)
  ).pipe(
    map((tuple) => tuple[0])
  )
}

/**
 * A sink that returns whether all elements satisfy the specified predicate.
 *
 * **When to use**
 *
 * Use to reduce a stream to a boolean that is true only when every input
 * satisfies a pure predicate.
 *
 * @see {@link some} for the dual any-match check
 *
 * @category constructors
 * @since 2.0.0
 */
export const every = <In>(predicate: Predicate<In>): Sink<boolean, In, In> =>
  fold(
    constTrue,
    identity,
    (_, a) => Effect.succeed(predicate(a))
  )

/**
 * A sink that returns whether an element satisfies the specified predicate.
 *
 * **When to use**
 *
 * Use to reduce a stream to a boolean that is true when any input satisfies a
 * pure predicate.
 *
 * @see {@link every} for the all-match check
 *
 * @category constructors
 * @since 2.0.0
 */
export const some = <In>(predicate: Predicate<In>): Sink<boolean, In, In> =>
  fold(
    constFalse,
    (b) => !b,
    (_, a) => Effect.succeed(predicate(a))
  )

/**
 * Transforms this sink's result.
 *
 * **When to use**
 *
 * Use to compute a new result from the original sink result while preserving
 * the sink's input consumption behavior.
 *
 * **Details**
 *
 * The transformed sink preserves the original sink's input type, leftovers,
 * errors, and requirements.
 *
 * @see {@link mapEffect} for effectful result transformations
 * @see {@link as} for replacing the result with a constant value
 * @see {@link mapEnd} for transforming both the result and leftovers
 *
 * @category mapping
 * @since 2.0.0
 */
export const map: {
  <A, A2>(f: (a: A) => A2): <In, L, E, R>(self: Sink<A, In, L, E, R>) => Sink<A2, In, L, E, R>
  <A, In, L, E, R, A2>(self: Sink<A, In, L, E, R>, f: (a: A) => A2): Sink<A2, In, L, E, R>
} = dual(
  2,
  <A, In, L, E, R, A2>(self: Sink<A, In, L, E, R>, f: (a: A) => A2): Sink<A2, In, L, E, R> =>
    mapEnd(self, ([a, l]) => [f(a), l])
)

/**
 * Sets the sink's result to a constant value.
 *
 * **When to use**
 *
 * Use to keep a sink's input consumption, errors, requirements, and leftovers
 * while replacing only its result with a known value.
 *
 * @see {@link map} for computing the replacement from the original result
 *
 * @category mapping
 * @since 2.0.0
 */
export const as: {
  <A2>(a2: A2): <A, In, L, E, R>(self: Sink<A, In, L, E, R>) => Sink<A2, In, L, E, R>
  <A, In, L, E, R, A2>(self: Sink<A, In, L, E, R>, a2: A2): Sink<A2, In, L, E, R>
} = dual(
  2,
  <A, In, L, E, R, A2>(self: Sink<A, In, L, E, R>, a2: A2): Sink<A2, In, L, E, R> => map(self, () => a2)
)

/**
 * Transforms this sink's input elements.
 *
 * @category mapping
 * @since 2.0.0
 */
export const mapInput: {
  <In0, In>(f: (input: In0) => In): <A, L, E, R>(self: Sink<A, In, L, E, R>) => Sink<A, In0, L, E, R>
  <A, In, L, E, R, In0>(self: Sink<A, In, L, E, R>, f: (input: In0) => In): Sink<A, In0, L, E, R>
} = dual(
  2,
  <A, In, L, E, R, In0>(self: Sink<A, In, L, E, R>, f: (input: In0) => In): Sink<A, In0, L, E, R> =>
    mapInputArray(self, Arr.map(f))
)

/**
 * Transforms this sink's input elements effectfully.
 *
 * @category mapping
 * @since 2.0.0
 */
export const mapInputEffect: {
  <In0, In, E2, R2>(
    f: (input: In0) => Effect.Effect<In, E2, R2>
  ): <A, L, E, R>(self: Sink<A, In, L, E, R>) => Sink<A, In0, L, E2 | E, R2 | R>
  <A, In, L, E, R, In0, E2, R2>(
    self: Sink<A, In, L, E, R>,
    f: (input: In0) => Effect.Effect<In, E2, R2>
  ): Sink<A, In0, L, E | E2, R | R2>
} = dual(
  2,
  <A, In, L, E, R, In0, E2, R2>(
    self: Sink<A, In, L, E, R>,
    f: (input: In0) => Effect.Effect<In, E2, R2>
  ): Sink<A, In0, L, E | E2, R | R2> => mapInputArrayEffect(self, Effect.forEach(f))
)

/**
 * Transforms each non-empty array of upstream input before it is fed to this
 * sink.
 *
 * @category mapping
 * @since 4.0.0
 */
export const mapInputArray: {
  <In0, In>(
    f: (input: Arr.NonEmptyReadonlyArray<In0>) => Arr.NonEmptyReadonlyArray<In>
  ): <A, L, E, R>(self: Sink<A, In, L, E, R>) => Sink<A, In0, L, E, R>
  <A, In, L, E, R, In0>(
    self: Sink<A, In, L, E, R>,
    f: (input: Arr.NonEmptyReadonlyArray<In0>) => Arr.NonEmptyReadonlyArray<In>
  ): Sink<A, In0, L, E, R>
} = dual(
  2,
  <A, In, L, E, R, In0>(
    self: Sink<A, In, L, E, R>,
    f: (input: Arr.NonEmptyReadonlyArray<In0>) => Arr.NonEmptyReadonlyArray<In>
  ): Sink<A, In0, L, E, R> => fromTransform((upstream, scope) => self.transform(Effect.map(upstream, f), scope))
)

/**
 * Transforms each non-empty array of upstream input effectfully before it is
 * fed to this sink.
 *
 * @category mapping
 * @since 4.0.0
 */
export const mapInputArrayEffect: {
  <In0, In, E2, R2>(
    f: (input: Arr.NonEmptyReadonlyArray<In0>) => Effect.Effect<Arr.NonEmptyReadonlyArray<In>, E2, R2>
  ): <A, L, E, R>(self: Sink<A, In, L, E, R>) => Sink<A, In0, L, E2 | E, R2 | R>
  <A, In, L, E, R, In0, E2, R2>(
    self: Sink<A, In, L, E, R>,
    f: (input: Arr.NonEmptyReadonlyArray<In0>) => Effect.Effect<Arr.NonEmptyReadonlyArray<In>, E2, R2>
  ): Sink<A, In0, L, E | E2, R | R2>
} = dual(
  2,
  <A, In, L, E, R, In0, E2, R2>(
    self: Sink<A, In, L, E, R>,
    f: (input: Arr.NonEmptyReadonlyArray<In0>) => Effect.Effect<Arr.NonEmptyReadonlyArray<In>, E2, R2>
  ): Sink<A, In0, L, E | E2, R | R2> =>
    fromTransform((upstream, scope) =>
      self.transform(
        Effect.flatMap(upstream, f) as any,
        scope
      )
    )
)

/**
 * Transforms the full `End` produced by this sink.
 *
 * **Details**
 *
 * This can change both the result value and the optional leftovers.
 *
 * @category mapping
 * @since 4.0.0
 */
export const mapEnd: {
  <A, L, A2, L2 = never>(
    f: (a: End<A, L>) => End<A2, L2>
  ): <In, E, R>(self: Sink<A, In, L, E, R>) => Sink<A2, In, L2, E, R>
  <A, In, L, E, R, A2, L2 = never>(self: Sink<A, In, L, E, R>, f: (a: End<A, L>) => End<A2, L2>): Sink<A2, In, L2, E, R>
} = dual(
  2,
  <A, In, L, E, R, A2, L2 = never>(
    self: Sink<A, In, L, E, R>,
    f: (a: End<A, L>) => End<A2, L2>
  ): Sink<A2, In, L2, E, R> =>
    fromTransform((upstream, scope) =>
      Effect.map(
        self.transform(upstream, scope),
        f
      )
    )
)

const transformEffect = <A, In, L, E, R, A2, E2, R2, L2 = never>(
  self: Sink<A, In, L, E, R>,
  f: (effect: Effect.Effect<End<A, L>, E, R>) => Effect.Effect<End<A2, L2>, E2, R2>
): Sink<A2, In, L2, E2, R2> => fromTransform((upstream, scope) => f(self.transform(upstream, scope)))

/**
 * Transforms the full `End` produced by this sink effectfully.
 *
 * **Details**
 *
 * This can change both the result value and the optional leftovers, and the
 * transformation can fail or require services.
 *
 * @category mapping
 * @since 4.0.0
 */
export const mapEffectEnd: {
  <A, L, A2, E2, R2, L2 = never>(
    f: (end: End<A, L>) => Effect.Effect<End<A2, L2>, E2, R2>
  ): <In, E, R>(self: Sink<A, In, L, E, R>) => Sink<A2, In, L2, E2 | E, R2 | R>
  <A, In, L, E, R, A2, E2, R2, L2 = never>(
    self: Sink<A, In, L, E, R>,
    f: (end: End<A, L>) => Effect.Effect<End<A2, L2>, E2, R2>
  ): Sink<A2, In, L2, E | E2, R | R2>
} = dual(2, <A, In, L, E, R, A2, E2, R2, L2 = never>(
  self: Sink<A, In, L, E, R>,
  f: (end: End<A, L>) => Effect.Effect<End<A2, L2>, E2, R2>
): Sink<A2, In, L2, E | E2, R | R2> => transformEffect(self, Effect.flatMap(f)))

/**
 * Transforms this sink's result effectfully.
 *
 * **When to use**
 *
 * Use when you need a sink result transformation that is effectful, can fail,
 * or requires services.
 *
 * **Details**
 *
 * The transformed sink preserves the original sink's input consumption and
 * leftovers while adding the errors and requirements of the transformation.
 *
 * @see {@link map} for pure result transformations
 * @see {@link mapEffectEnd} for effectfully transforming both the result and leftovers
 * @see {@link flatMap} for continuing with another sink based on the result
 *
 * @category mapping
 * @since 2.0.0
 */
export const mapEffect: {
  <A, A2, E2, R2>(
    f: (a: A) => Effect.Effect<A2, E2, R2>
  ): <In, L, E, R>(self: Sink<A, In, L, E, R>) => Sink<A2, In, L, E2 | E, R2 | R>
  <A, In, L, E, R, A2, E2, R2>(
    self: Sink<A, In, L, E, R>,
    f: (a: A) => Effect.Effect<A2, E2, R2>
  ): Sink<A2, In, L, E | E2, R | R2>
} = dual(2, <A, In, L, E, R, A2, E2, R2>(
  self: Sink<A, In, L, E, R>,
  f: (a: A) => Effect.Effect<A2, E2, R2>
): Sink<A2, In, L, E | E2, R | R2> => mapEffectEnd(self, ([a, l]) => Effect.map(f(a), (a2) => [a2, l] as End<A2, L>)))

/**
 * Transforms the errors emitted by this sink using `f`.
 *
 * @category mapping
 * @since 2.0.0
 */
export const mapError: {
  <E, E2>(f: (error: E) => E2): <A, In, L, R>(self: Sink<A, In, L, E, R>) => Sink<A, In, L, E2, R>
  <A, In, L, E, R, E2>(self: Sink<A, In, L, E, R>, f: (error: E) => E2): Sink<A, In, L, E2, R>
} = dual(2, <A, In, L, E, R, E2>(
  self: Sink<A, In, L, E, R>,
  f: (error: E) => E2
): Sink<A, In, L, E2, R> => transformEffect(self, Effect.mapError(f)))

/**
 * Transforms the leftovers emitted by this sink using `f`.
 *
 * @category mapping
 * @since 2.0.0
 */
export const mapLeftover: {
  <L, L2>(f: (leftover: L) => L2): <A, In, E, R>(self: Sink<A, In, L, E, R>) => Sink<A, In, L2, E, R>
  <A, In, L, E, R, L2>(self: Sink<A, In, L, E, R>, f: (leftover: L) => L2): Sink<A, In, L2, E, R>
} = dual(2, <A, In, L, E, R, L2>(
  self: Sink<A, In, L, E, R>,
  f: (leftover: L) => L2
): Sink<A, In, L2, E, R> => mapEnd(self, ([a, l]) => [a, l && Arr.map(l, f)]))

/**
 * Collects up to `n` input elements into an array.
 *
 * **Details**
 *
 * Finite fractional values of `n` are rounded down. If `n` is `NaN` or
 * non-positive, the sink completes with an empty array. If more elements are
 * pulled than needed, the remaining elements from the same array are returned
 * as leftovers.
 *
 * @category constructors
 * @since 2.0.0
 */
export const take = <In>(n: number): Sink<Array<In>, In, In> => {
  const count = Count.normalize(n)
  return fromTransform((upstream) => {
    const taken: Array<In> = []
    if (count === 0) {
      return Effect.succeed([taken] as const)
    }
    let leftover: NonEmptyReadonlyArray<In> | undefined = undefined
    return upstream.pipe(
      Effect.flatMap((arr) => {
        if (taken.length + arr.length <= count) {
          taken.push(...arr)
          if (taken.length === count) {
            return Cause.done()
          }
          return Effect.void
        }
        for (let i = 0; i < arr.length; i++) {
          taken.push(arr[i])
          if (taken.length === count) {
            if ((i + 1) < arr.length) {
              leftover = arr.slice(i + 1) as any
            }
            return Cause.done()
          }
        }
        return Effect.void
      }),
      Effect.forever({ disableYield: true }),
      Pull.catchDone(() => Effect.succeed([taken, leftover] as const))
    )
  })
}

/**
 * Runs this sink until it yields a result, then uses that result to create
 * another sink from the provided function which will continue to run until it
 * yields a result.
 *
 * **When to use**
 *
 * Use to compose sinks when the next sink depends on the result produced by the
 * previous sink.
 *
 * **Details**
 *
 * Leftovers from the first sink are fed to the sink returned by `f` before more
 * upstream input is pulled.
 *
 * @see {@link map} for transforming the result without switching sinks
 * @see {@link mapEffect} for effectfully transforming the result without switching sinks
 *
 * @category sequencing
 * @since 2.0.0
 */
export const flatMap: {
  <A, A1, L, In1 extends L, L1, E1, R1>(
    f: (a: A) => Sink<A1, In1, L1, E1, R1>
  ): <In, E, R>(self: Sink<A, In, L, E, R>) => Sink<A1, In & In1, L1 | L, E1 | E, R1 | R>
  <A, In, L, E, R, A1, In1 extends L, L1, E1, R1>(
    self: Sink<A, In, L, E, R>,
    f: (a: A) => Sink<A1, In1, L1, E1, R1>
  ): Sink<A1, In & In1, L | L1, E | E1, R | R1>
} = dual(2, <A, In, L, E, R, A1, In1 extends L, L1, E1, R1>(
  self: Sink<A, In, L, E, R>,
  f: (a: A) => Sink<A1, In1, L1, E1, R1>
): Sink<A1, In & In1, L | L1, E | E1, R | R1> =>
  fromTransform((upstream, scope) => {
    let upstreamDone = false
    const pull = Effect.catchCause(upstream, (cause) => {
      upstreamDone = true
      return Effect.failCause(cause)
    })
    return Effect.flatMap(
      self.transform(pull, scope),
      ([a, leftover]) =>
        f(a).transform(
          Effect.suspend(() => {
            if (leftover) {
              const arr = leftover as Arr.NonEmptyReadonlyArray<In1>
              leftover = undefined
              return Effect.succeed(arr)
            } else if (upstreamDone) {
              return Cause.done()
            }
            return upstream
          }),
          scope
        ).pipe(Effect.map((end): End<A1, L | L1> => {
          if (!leftover) {
            return end
          }
          return [end[0], end[1] ? [...end[1], ...leftover] : leftover]
        }))
    )
  }))

/**
 * A sink that reduces input elements from the provided `initial` state with
 * `f` while the specified `predicate` returns `true`.
 *
 * @category folding
 * @since 4.0.0
 */
export const reduceWhile = <S, In>(
  initial: LazyArg<S>,
  predicate: Predicate<S>,
  f: (s: S, input: In) => S
): Sink<S, In, In> =>
  fromTransform((upstream) => {
    let state = initial()
    let leftover: NonEmptyReadonlyArray<In> | undefined = undefined
    if (!predicate(state)) {
      return Effect.succeed([state] as const)
    }
    return upstream.pipe(
      Effect.flatMap((arr) => {
        for (let i = 0; i < arr.length; i++) {
          state = f(state, arr[i])
          if (!predicate(state)) {
            if ((i + 1) < arr.length) {
              leftover = arr.slice(i + 1) as any
            }
            return Cause.done()
          }
        }
        return Effect.void
      }),
      Effect.forever({ disableYield: true }),
      Pull.catchDone(() => Effect.succeed([state, leftover] as const))
    )
  })

/**
 * A sink that effectfully reduces input elements from the provided `initial`
 * state with `f` while the specified `predicate` returns `true`.
 *
 * @category folding
 * @since 4.0.0
 */
export const reduceWhileEffect = <S, In, E, R>(
  initial: LazyArg<S>,
  predicate: Predicate<S>,
  f: (s: S, input: In) => Effect.Effect<S, E, R>
): Sink<S, In, In, E, R> =>
  fromTransform((upstream) => {
    let state = initial()
    let leftover: NonEmptyReadonlyArray<In> | undefined = undefined
    if (!predicate(state)) {
      return Effect.succeed([state] as const)
    }
    return upstream.pipe(
      Effect.flatMap((arr) => {
        let i = 0
        return Effect.whileLoop({
          while: () => i < arr.length,
          body: constant(Effect.flatMap(Effect.suspend(() => f(state, arr[i++])), (s) => {
            state = s
            if (!predicate(state)) {
              if (i < arr.length) {
                leftover = arr.slice(i) as any
              }
              return Cause.done()
            }
            return Effect.void
          })),
          step: constVoid
        })
      }),
      Effect.forever({ disableYield: true }),
      Pull.catchDone(() => Effect.succeed([state, leftover] as const))
    )
  })

/**
 * A sink that reduces non-empty input arrays from the provided `initial` state
 * with `f` while the specified `predicate` returns `true`.
 *
 * @category folding
 * @since 4.0.0
 */
export const reduceWhileArray = <S, In>(
  initial: LazyArg<S>,
  contFn: Predicate<S>,
  f: (s: S, input: NonEmptyReadonlyArray<In>) => S
): Sink<S, In> =>
  fromTransform((upstream) => {
    let state = initial()
    if (!contFn(state)) {
      return Effect.succeed([state] as const)
    }
    return upstream.pipe(
      Effect.flatMap((arr) => {
        state = f(state, arr)
        if (!contFn(state)) {
          return Cause.done()
        }
        return Effect.void
      }),
      Effect.forever({ disableYield: true }),
      Pull.catchDone(() => Effect.succeed([state] as const))
    )
  })

/**
 * A sink that effectfully reduces non-empty input arrays from the provided
 * `initial` state with `f` while the specified `predicate` returns `true`.
 *
 * @category folding
 * @since 4.0.0
 */
export const reduceWhileArrayEffect = <S, In, E, R>(
  initial: LazyArg<S>,
  predicate: Predicate<S>,
  f: (s: S, input: NonEmptyReadonlyArray<In>) => Effect.Effect<S, E, R>
): Sink<S, In, never, E, R> =>
  fromTransform((upstream) => {
    let state = initial()
    if (!predicate(state)) {
      return Effect.succeed([state] as const)
    }
    return upstream.pipe(
      Effect.flatMap((arr) => f(state, arr)),
      Effect.flatMap((s) => {
        state = s
        if (!predicate(state)) {
          return Cause.done()
        }
        return Effect.void
      }),
      Effect.forever({ disableYield: true }),
      Pull.catchDone(() => Effect.succeed([state] as const))
    )
  })

/**
 * A sink that reduces its inputs using the provided function `f` starting from
 * the provided `initial` state.
 *
 * @category folding
 * @since 4.0.0
 */
export const reduce = <S, In>(initial: LazyArg<S>, f: (s: S, input: In) => S): Sink<S, In> =>
  reduceArray(initial, (s, arr) => {
    for (let i = 0; i < arr.length; i++) {
      s = f(s, arr[i])
    }
    return s
  })

/**
 * A sink that reduces its inputs using the provided function `f` starting from
 * the specified `initial` state.
 *
 * @category folding
 * @since 4.0.0
 */
export const reduceArray = <S, In>(
  initial: LazyArg<S>,
  f: (s: S, input: NonEmptyReadonlyArray<In>) => S
): Sink<S, In> =>
  fromTransform((upstream) => {
    let state = initial()
    return upstream.pipe(
      Effect.flatMap((arr) => {
        state = f(state, arr)
        return Effect.void
      }),
      Effect.forever({ disableYield: true }),
      Pull.catchDone(() => Effect.succeed([state] as const))
    )
  })

/**
 * A sink that reduces its inputs using the provided effectful function `f`
 * starting from the specified `initial` state.
 *
 * @category folding
 * @since 4.0.0
 */
export const reduceEffect = <S, In, E, R>(
  initial: LazyArg<S>,
  f: (s: S, input: In) => Effect.Effect<S, E, R>
): Sink<S, In, never, E, R> => reduceWhileEffect(initial, constTrue, f) as any

const head_ = reduceWhile(Option.none<unknown>, Option.isNone, (_, in_) => Option.some(in_))

/**
 * Creates a sink containing the first value.
 *
 * **Details**
 *
 * Returns `Option.some(first)` for non-empty input, or `Option.none` when the
 * upstream ends without input. The first element is consumed; later elements
 * from the same pulled array are emitted as leftovers.
 *
 * @category constructors
 * @since 2.0.0
 */
export const head = <In>(): Sink<Option.Option<In>, In, In> => head_ as any

const last_ = reduceArray(Option.none<unknown>, (_, arr) => Arr.last(arr))

/**
 * Creates a sink containing the last value.
 *
 * **When to use**
 *
 * Use when you need to consume all upstream input and keep only the final
 * element.
 *
 * **Details**
 *
 * Returns `Option.some(last)` with the final input value, or `Option.none` when
 * the upstream ends without input.
 *
 * **Gotchas**
 *
 * This sink produces a result only when the upstream ends, so it does not
 * complete for a stream that does not end.
 *
 * @see {@link head} for taking the first input value instead
 *
 * @category constructors
 * @since 2.0.0
 */
export const last = <In>(): Sink<Option.Option<In>, In> => last_ as any

/**
 * Creates a sink containing the first value matched by a synchronous predicate.
 *
 * **When to use**
 *
 * Use to scan stream input until the first matching element is found and return
 * that element as an `Option`.
 *
 * **Details**
 *
 * Returns `Option.none` if the upstream stream ends before a match is found.
 * Refinement predicates narrow the returned value type. The matching input is
 * consumed; any later elements from the same pulled array are returned as
 * leftovers.
 *
 * @see {@link findEffect} for an effectful predicate that can fail or require services
 *
 * @category constructors
 * @since 4.0.0
 */
export const find: {
  <In, Out extends In>(refinement: Refinement<In, Out>): Sink<Option.Option<Out>, In, In>
  <In>(predicate: Predicate<In>): Sink<Option.Option<In>, In, In>
} = <In>(predicate: Predicate<In>): Sink<Option.Option<In>, In, In> =>
  reduceWhile(
    Option.none<In>,
    Option.isNone,
    (acc, in_) => predicate(in_) ? Option.some(in_) : acc
  )

/**
 * Creates a sink containing the first value matched by an effectful predicate.
 *
 * **When to use**
 *
 * Use when you need to run effects, fail, or use services while searching for
 * the first matching input.
 *
 * **Details**
 *
 * Returns `Option.some` with the first input whose predicate result is `true`,
 * or `Option.none` if the upstream stream ends first. If the predicate effect
 * fails, the sink fails with the same error.
 *
 * @see {@link find} for the synchronous predicate variant
 *
 * @category constructors
 * @since 2.0.0
 */
export const findEffect = <In, E, R>(
  predicate: (input: In) => Effect.Effect<boolean, E, R>
): Sink<Option.Option<In>, In, In, E, R> =>
  reduceWhileEffect(
    Option.none<In>,
    Option.isNone,
    (acc, in_) => Effect.map(predicate(in_), (b) => b ? Option.some(in_) : acc)
  )

/**
 * Creates a sink which sums up its inputs.
 *
 * @category constructors
 * @since 2.0.0
 */
export const sum: Sink<number, number> = reduceArray(() => 0, (s, arr) => {
  for (let i = 0; i < arr.length; i++) {
    s += arr[i]
  }
  return s
})

/**
 * A sink that counts the number of elements fed to it.
 *
 * **When to use**
 *
 * Use to consume input and return only the number of elements received.
 *
 * @category constructors
 * @since 2.0.0
 */
export const count: Sink<number, unknown> = reduceArray(() => 0, (s, arr) => s + arr.length)

/**
 * Accumulates incoming elements into an array.
 *
 * **When to use**
 *
 * Use when you need a sink result containing all upstream input elements.
 *
 * @see {@link take} for collecting only a fixed number of input elements
 *
 * @category constructors
 * @since 4.0.0
 */
export const collect = <In>(): Sink<Array<In>, In> =>
  reduceArray(Arr.empty<In>, (s, arr) => {
    s.push(...arr)
    return s
  })

/**
 * Collects the longest input prefix whose elements satisfy the predicate or
 * refinement.
 *
 * **Details**
 *
 * The first failing input is consumed and excluded from the result. Any later
 * elements from the same pulled array are returned as leftovers.
 *
 * @category constructors
 * @since 4.0.0
 */
export const takeWhile: {
  <In, Out extends In>(refinement: Refinement<In, Out>): Sink<Array<Out>, In, In>
  <In>(predicate: Predicate<In>): Sink<Array<In>, In, In>
} = <In>(predicate: Predicate<In>): Sink<Array<In>, In, In> =>
  fromTransform((upstream) => {
    const out = Arr.empty<In>()
    return upstream.pipe(
      Effect.flatMap((arr) => {
        for (let i = 0; i < arr.length; i++) {
          if (!predicate(arr[i])) {
            const leftover: Arr.NonEmptyReadonlyArray<In> | undefined = (i + 1) < arr.length
              ? arr.slice(i + 1) as any
              : undefined
            return Cause.done([out, leftover] as const)
          }
          out.push(arr[i])
        }
        return Effect.void
      }),
      Effect.forever({ disableYield: true }),
      Pull.catchDone((end) => Effect.succeed<End<Array<In>, In>>(end ?? [out]))
    )
  })

/**
 * Applies a `Filter` to input elements while it succeeds, collecting each
 * successful output.
 *
 * **Details**
 *
 * The first input for which the filter fails is consumed and excluded from the
 * result. Any later elements from the same pulled array are returned as
 * leftovers.
 *
 * @category constructors
 * @since 4.0.0
 */
export const takeWhileFilter = <In, Out, X>(
  filter: Filter.Filter<In, Out, X>
): Sink<Array<Out>, In, In> =>
  fromTransform((upstream) => {
    const out = Arr.empty<Out>()
    return upstream.pipe(
      Effect.flatMap((arr) => {
        for (let i = 0; i < arr.length; i++) {
          const result = filter(arr[i])
          if (Result.isFailure(result)) {
            const leftover: Arr.NonEmptyReadonlyArray<In> | undefined = (i + 1) < arr.length
              ? arr.slice(i + 1) as any
              : undefined
            return Cause.done([out, leftover] as const)
          }
          out.push(result.success)
        }
        return Effect.void
      }),
      Effect.forever({ disableYield: true }),
      Pull.catchDone((end) => Effect.succeed<End<Array<Out>, In>>(end ?? [out]))
    )
  })

/**
 * Collects input elements effectfully while the predicate succeeds.
 *
 * **Details**
 *
 * The first input for which the predicate returns `false` is consumed and
 * excluded from the result. Any later elements from the same pulled array are
 * returned as leftovers.
 *
 * @category constructors
 * @since 4.0.0
 */
export const takeWhileEffect: {
  <In, E, R>(predicate: (input: In) => Effect.Effect<boolean, E, R>): Sink<Array<In>, In, In, E, R>
} = <In, E, R>(
  predicate: (input: In) => Effect.Effect<boolean, E, R>
): Sink<Array<In>, In, In, E, R> =>
  fromTransform((upstream) => {
    const out = Arr.empty<In>()
    let leftover: Arr.NonEmptyReadonlyArray<In> | undefined = undefined
    return upstream.pipe(
      Effect.flatMap((arr) => {
        let i = 0
        return Effect.whileLoop({
          while: () => i < arr.length,
          body: constant(Effect.flatMap(
            Effect.suspend(() => {
              const input = arr[i++]
              return Effect.map(predicate(input), (passes) => [input, passes] as const)
            }),
            ([input, passes]) => {
              if (!passes) {
                if (i < arr.length) {
                  leftover = arr.slice(i) as any
                }
                return Cause.done()
              }
              out.push(input)
              return Effect.void
            }
          )),
          step: constVoid
        })
      }),
      Effect.forever({ disableYield: true }),
      Pull.catchDone(() => Effect.succeed([out, leftover] as const))
    )
  })

/**
 * Applies a `FilterEffect` to input elements effectfully while it succeeds,
 * collecting each successful output.
 *
 * **Details**
 *
 * The first input for which the filter fails is consumed and excluded from the
 * result. Any later elements from the same pulled array are returned as
 * leftovers.
 *
 * @category constructors
 * @since 4.0.0
 */
export const takeWhileFilterEffect = <In, Out, X, E, R>(
  filter: Filter.FilterEffect<In, Out, X, E, R>
): Sink<Array<Out>, In, In, E, R> =>
  fromTransform((upstream) => {
    const out = Arr.empty<Out>()
    let leftover: Arr.NonEmptyReadonlyArray<In> | undefined = undefined
    return upstream.pipe(
      Effect.flatMap((arr) => {
        let i = 0
        return Effect.whileLoop({
          while: () => i < arr.length,
          body: constant(Effect.flatMap(Effect.suspend(() => filter(arr[i++])), (result) => {
            if (Result.isFailure(result)) {
              if (i < arr.length) {
                leftover = arr.slice(i) as any
              }
              return Cause.done()
            }
            out.push(result.success)
            return Effect.void
          })),
          step: constVoid
        })
      }),
      Effect.forever({ disableYield: true }),
      Pull.catchDone(() => Effect.succeed([out, leftover] as const))
    )
  })

/**
 * Collects input elements until the predicate returns `true`, including the
 * matching element in the result.
 *
 * @category constructors
 * @since 4.0.0
 */
export const takeUntil = <In>(predicate: Predicate<In>): Sink<Array<In>, In, In> =>
  suspend(() => {
    let done = false
    return takeWhile((i) => {
      if (done) return false
      done = predicate(i)
      return true
    })
  })

/**
 * Collects input elements effectfully until the predicate returns `true`,
 * including the matching element in the result.
 *
 * **Details**
 *
 * If the predicate effect fails, the sink fails with the same error.
 *
 * @category constructors
 * @since 4.0.0
 */
export const takeUntilEffect = <In, E, R>(
  predicate: (input: In) => Effect.Effect<boolean, E, R>
): Sink<Array<In>, In, In, E, R> =>
  suspend(() => {
    let done = false
    return takeWhileEffect((input) => {
      if (done) {
        return Effect.succeed(false)
      }
      return Effect.map(predicate(input), (b) => {
        done = b
        return true
      })
    })
  })

/**
 * A sink that executes the provided effectful function for every item fed
 * to it.
 *
 * **Example** (Running effects for each item)
 *
 * ```ts import.meta.vitest
 * import { Effect, Sink, Stream } from "effect"
 *
 * const processed: Array<number> = []
 * const sink = Sink.forEach((item: number) => Effect.sync(() => processed.push(item)))
 *
 * // Use it with a stream
 * const stream = Stream.make(1, 2, 3)
 * await Effect.runPromise(Stream.run(stream, sink))
 * processed // => [1, 2, 3]
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const forEach = <In, X, E, R>(
  f: (input: In) => Effect.Effect<X, E, R>
): Sink<void, In, never, E, R> => forEachArray(Effect.forEach((_) => f(_), { discard: true }))

/**
 * A sink that executes the provided effectful function for every Chunk fed
 * to it.
 *
 * **Example** (Running effects for each chunk)
 *
 * ```ts import.meta.vitest
 * import { Effect, Sink, Stream } from "effect"
 *
 * const processed: Array<Array<number>> = []
 * const sink = Sink.forEachArray((chunk: ReadonlyArray<number>) => Effect.sync(() => processed.push([...chunk])))
 *
 * // Use it with a stream
 * const stream = Stream.make(1, 2, 3, 4, 5)
 * await Effect.runPromise(Stream.run(stream, sink))
 * processed // => [[1, 2, 3, 4, 5]]
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export const forEachArray = <In, X, E, R>(
  f: (input: NonEmptyReadonlyArray<In>) => Effect.Effect<X, E, R>
): Sink<void, In, never, E, R> =>
  fromTransform((upstream) =>
    upstream.pipe(
      Effect.flatMap(f),
      Effect.forever({ disableYield: true }),
      Pull.catchDone(() => endVoid)
    )
  )

/**
 * Runs an effectful function for each input element while it returns `true`.
 *
 * **Details**
 *
 * The sink stops consuming input when the function returns `false` or when the
 * upstream stream ends, and completes with `void`.
 *
 * @category constructors
 * @since 2.0.0
 */
export const forEachWhile = <In, E, R>(
  f: (input: In) => Effect.Effect<boolean, E, R>
): Sink<void, In, never, E, R> =>
  forEachWhileArray(Effect.fnUntraced(function*(input) {
    for (let i = 0; i < input.length; i++) {
      const cont = yield* f(input[i])
      if (!cont) return false
    }
    return true
  }))

/**
 * Runs an effectful function for each non-empty input array while it returns
 * `true`.
 *
 * **Details**
 *
 * The sink stops consuming input when the function returns `false` or when the
 * upstream stream ends, and completes with `void`.
 *
 * @category constructors
 * @since 4.0.0
 */
export const forEachWhileArray = <In, E, R>(
  f: (input: NonEmptyReadonlyArray<In>) => Effect.Effect<boolean, E, R>
): Sink<void, In, never, E, R> =>
  fromTransform((upstream) =>
    upstream.pipe(
      Effect.flatMap(f),
      Effect.flatMap((cont) => cont ? Effect.void : Cause.done()),
      Effect.forever({ disableYield: true }),
      Pull.catchDone(() => endVoid)
    )
  )

/**
 * Creates a sink produced from a scoped effect.
 *
 * **Example** (Unwrapping a sink effect)
 *
 * ```ts import.meta.vitest
 * import { Effect, Sink, Stream } from "effect"
 *
 * // Create a sink from an effect that produces a sink
 * const processed: Array<number> = []
 * const sinkEffect = Effect.succeed(
 *   Sink.forEach((item: number) => Effect.sync(() => processed.push(item)))
 * )
 * const sink = Sink.unwrap(sinkEffect)
 *
 * // Use it with a stream
 * const stream = Stream.make(1, 2, 3)
 * await Effect.runPromise(Stream.run(stream, sink))
 * processed // => [1, 2, 3]
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const unwrap = <A, In, L, E, R, R2>(
  effect: Effect.Effect<Sink<A, In, L, E, R2>, E, R>
): Sink<A, In, L, E, Exclude<R, Scope.Scope> | R2> => fromChannel(Channel.unwrap(Effect.map(effect, toChannel)))

/**
 * Runs a summary effect when the sink starts and again when it completes.
 *
 * @category mapping
 * @since 2.0.0
 */
export const summarized: {
  <A2, E2, R2, A3>(
    summary: Effect.Effect<A2, E2, R2>,
    f: (start: A2, end: A2) => A3
  ): <A, In, L, E, R>(self: Sink<A, In, L, E, R>) => Sink<[A, A3], In, L, E2 | E, R2 | R>
  <A, In, L, E, R, A2, E2, R2, A3>(
    self: Sink<A, In, L, E, R>,
    summary: Effect.Effect<A2, E2, R2>,
    f: (start: A2, end: A2) => A3
  ): Sink<[A, A3], In, L, E | E2, R | R2>
} = dual(3, <A, In, L, E, R, A2, E2, R2, A3>(
  self: Sink<A, In, L, E, R>,
  summary: Effect.Effect<A2, E2, R2>,
  f: (start: A2, end: A2) => A3
): Sink<[A, A3], In, L, E | E2, R | R2> =>
  fromTransform(Effect.fnUntraced(function*(upstream, scope) {
    const start = yield* summary
    const [done, leftover] = yield* self.transform(upstream, scope)
    const end = yield* summary
    return [[done, f(start, end)], leftover] as const
  })))

/**
 * Returns the sink that executes this one and times its execution.
 *
 * @category mapping
 * @since 2.0.0
 */
export const withDuration = <A, In, L, E, R>(
  self: Sink<A, In, L, E, R>
): Sink<[A, Duration.Duration], In, L, E, R> =>
  summarized(self, Clock.monotonicTimeNanos, (start, end) => Duration.nanos(end - start))

/**
 * A sink that drains all input and returns the elapsed duration.
 *
 * @category constructors
 * @since 2.0.0
 */
export const timed: Sink<Duration.Duration, unknown> = map(withDuration(drain), ([, duration]) => duration)

/**
 * Provides a `Context` to this sink.
 *
 * **Details**
 *
 * Services contained in the provided context are removed from the sink's
 * service requirements.
 *
 * @category providing services
 * @since 2.0.0
 */
export const provideContext: {
  <Provided>(
    context: Context.Context<Provided>
  ): <A, In, L, E, R>(self: Sink<A, In, L, E, R>) => Sink<A, In, L, E, Exclude<R, Provided>>
  <A, In, L, E, R, Provided>(
    self: Sink<A, In, L, E, R>,
    context: Context.Context<Provided>
  ): Sink<A, In, L, E, Exclude<R, Provided>>
} = dual(2, <A, In, L, E, R, Provided>(
  self: Sink<A, In, L, E, R>,
  context: Context.Context<Provided>
): Sink<A, In, L, E, Exclude<R, Provided>> =>
  fromTransform((upstream, scope) =>
    self.transform(upstream, scope).pipe(
      Effect.provideContext(context)
    )
  ))

/**
 * Provides a single service implementation to this sink.
 *
 * **Details**
 *
 * The service identified by `key` is removed from the sink's service
 * requirements.
 *
 * @category providing services
 * @since 4.0.0
 */
export const provideService: {
  <I, S>(
    key: Context.Key<I, S>,
    value: Types.NoInfer<S>
  ): <A, In, L, E, R>(self: Sink<A, In, L, E, R>) => Sink<A, In, L, E, Exclude<R, I>>
  <A, In, L, E, R, I, S>(
    self: Sink<A, In, L, E, R>,
    key: Context.Key<I, S>,
    value: Types.NoInfer<S>
  ): Sink<A, In, L, E, Exclude<R, I>>
} = dual(3, <A, In, L, E, R, I, S>(
  self: Sink<A, In, L, E, R>,
  key: Context.Key<I, S>,
  value: Types.NoInfer<S>
): Sink<A, In, L, E, Exclude<R, I>> =>
  fromTransform((upstream, scope) =>
    self.transform(upstream, scope).pipe(
      Effect.provideService(key, value)
    )
  ))

/**
 * Runs a fallback sink if this sink fails with a typed error.
 *
 * **Details**
 *
 * The fallback is built from the error and continues consuming from the same
 * upstream stream. If the upstream stream had already ended, the fallback sees
 * the upstream end instead.
 *
 * @category error handling
 * @since 2.0.0
 */
export const orElse: {
  <E, A2, In2, L2, E2, R2>(
    f: (error: Types.NoInfer<E>) => Sink<A2, In2, L2, E2, R2>
  ): <A, In, L, R>(self: Sink<A, In, L, E, R>) => Sink<A2 | A, In & In2, L2 | L, E2 | E, R2 | R>
  <A, In, L, E, R, A2, In2, L2, E2, R2>(
    self: Sink<A, In, L, E, R>,
    f: (error: E) => Sink<A2, In2, L2, E2, R2>
  ): Sink<A | A2, In & In2, L | L2, E | E2, R | R2>
} = dual(2, <A, In, L, E, R, A2, In2, L2, E2, R2>(
  self: Sink<A, In, L, E, R>,
  f: (error: E) => Sink<A2, In2, L2, E2, R2>
): Sink<A | A2, In & In2, L | L2, E | E2, R | R2> =>
  fromTransform((upstream, scope) => {
    let upstreamDone = false
    const pull = Effect.catchCause(upstream, (cause) => {
      upstreamDone = true
      return Effect.failCause(cause)
    })
    return Effect.catch(
      self.transform(pull, scope) as Effect.Effect<End<A | A2, L | L2>, E, R>,
      (error) =>
        f(error).transform(
          Effect.suspend(() => {
            if (upstreamDone) {
              return Cause.done()
            }
            return upstream
          }),
          scope
        )
    )
  }))

/**
 * Handles failures from this sink by inspecting the full `Cause`.
 *
 * **When to use**
 *
 * Use to recover from a sink failure based on the full `Cause` instead of only
 * the typed error value.
 *
 * **Details**
 *
 * When this sink fails, the handler effect is run and its success value
 * becomes the sink result. If the handler fails, the returned sink fails with
 * that error.
 *
 * @see {@link catch_ catch} for recovering from typed errors only
 * @see {@link orElse} for recovering by switching to another sink
 *
 * @category error handling
 * @since 4.0.0
 */
export const catchCause: {
  <E, A2, E2, R2>(
    f: (error: Cause.Cause<Types.NoInfer<E>>) => Effect.Effect<A2, E2, R2>
  ): <A, In, L, R>(self: Sink<A, In, L, E, R>) => Sink<A2 | A, In, L, E, R2 | R>
  <A, In, L, E, R, A2, E2, R2>(
    self: Sink<A, In, L, E, R>,
    f: (error: Cause.Cause<E>) => Effect.Effect<A2, E2, R2>
  ): Sink<A | A2, In, L, E2, R | R2>
} = dual(2, <A, In, L, E, R, A2, E2, R2>(
  self: Sink<A, In, L, E, R>,
  f: (error: Cause.Cause<E>) => Effect.Effect<A2, E2, R2>
): Sink<A | A2, In, L, E2, R | R2> =>
  transformEffect(
    self,
    Effect.catchCause((cause) => Effect.map(f(cause), (a2) => [a2 as A | A2] as const))
  ))

const catch_: {
  <E, A2, E2, R2>(
    f: (error: Types.NoInfer<E>) => Effect.Effect<A2, E2, R2>
  ): <A, In, L, R>(self: Sink<A, In, L, E, R>) => Sink<A2 | A, In, L, E2, R2 | R>
  <A, In, L, E, R, A2, E2, R2>(
    self: Sink<A, In, L, E, R>,
    f: (error: E) => Effect.Effect<A2, E2, R2>
  ): Sink<A | A2, In, L, E2, R | R2>
} = dual(2, <A, In, L, E, R, A2, E2, R2>(
  self: Sink<A, In, L, E, R>,
  f: (error: E) => Effect.Effect<A2, E2, R2>
): Sink<A | A2, In, L, E2, R | R2> =>
  transformEffect(
    self,
    Effect.catch((error) => Effect.map(f(error), (a2) => [a2 as A | A2] as const))
  ))

export {
  /**
   * Handles typed errors from this sink with an effectful fallback value.
   *
   * **When to use**
   *
   * Use to recover from a typed sink failure by producing the replacement
   * result with an `Effect`.
   *
   * @see {@link catchCause} for recovering from the full failure cause
   * @see {@link orElse} for recovering by switching to another sink
   *
   * @category error handling
   * @since 4.0.0
   */
  catch_ as catch
}

/**
 * Runs an effect after this sink completes, fails, or is interrupted.
 *
 * **Details**
 *
 * The effect receives the sink's `Exit` for the result value. The original
 * sink result and leftovers are preserved unless the finalizer itself fails.
 *
 * @category resource management
 * @since 4.0.0
 */
export const onExit: {
  <A, E, X, E2, R2>(
    f: (exit: Exit.Exit<A, E>) => Effect.Effect<X, E2, R2>
  ): <In, L, R>(self: Sink<A, In, L, E, R>) => Sink<A, In, L, E | E2, R2 | R>
  <A, In, L, E, R, X, E2, R2>(
    self: Sink<A, In, L, E, R>,
    f: (exit: Exit.Exit<A, E>) => Effect.Effect<X, E2, R2>
  ): Sink<A, In, L, E | E2, R | R2>
} = dual(2, <A, In, L, E, R, X, E2, R2>(
  self: Sink<A, In, L, E, R>,
  f: (exit: Exit.Exit<A, E>) => Effect.Effect<X, E2, R2>
): Sink<A, In, L, E | E2, R | R2> =>
  transformEffect(
    self,
    Effect.onExit((exit) => f(Exit.map(exit, ([a]) => a)))
  ))

/**
 * Runs a finalizer effect after this sink completes, fails, or is interrupted.
 *
 * **Details**
 *
 * The original sink result and leftovers are preserved unless the finalizer
 * itself fails.
 *
 * @category resource management
 * @since 2.0.0
 */
export const ensuring: {
  <X, E2, R2>(
    effect: Effect.Effect<X, E2, R2>
  ): <A, E, In, L, R>(self: Sink<A, In, L, E, R>) => Sink<A, In, L, E | E2, R2 | R>
  <A, In, L, E, R, X, E2, R2>(
    self: Sink<A, In, L, E, R>,
    effect: Effect.Effect<X, E2, R2>
  ): Sink<A, In, L, E | E2, R | R2>
} = dual(2, <A, In, L, E, R, X, E2, R2>(
  self: Sink<A, In, L, E, R>,
  effect: Effect.Effect<X, E2, R2>
): Sink<A, In, L, E | E2, R | R2> => onExit(self, () => effect))
