/**
 * Provides low-level building blocks for streaming data through Effect.
 *
 * A `Channel` can read input elements, write output elements, fail with a typed
 * error, and finish with a typed result while managing resources safely.
 * Streams and sinks are built on channels, so most application code uses those
 * higher-level modules instead. This module is useful when implementing stream
 * operators or specialized streaming workflows.
 *
 * @since 2.0.0
 */
// @effect-diagnostics returnEffectInGen:off
import * as Arr from "./Array.ts"
import * as Cause from "./Cause.ts"
import * as Chunk from "./Chunk.ts"
import * as Context from "./Context.ts"
import * as Effect from "./Effect.ts"
import * as Exit from "./Exit.ts"
import * as Fiber from "./Fiber.ts"
import type * as Filter from "./Filter.ts"
import type { LazyArg } from "./Function.ts"
import { constant, constTrue, constVoid, dual, identity as identity_ } from "./Function.ts"
import * as Count from "./internal/count.ts"
import { ClockRef, endSpan } from "./internal/effect.ts"
import { addSpanStackTrace } from "./internal/tracer.ts"
import * as Iterable from "./Iterable.ts"
import * as Latch from "./Latch.ts"
import * as Layer from "./Layer.ts"
import type { Severity } from "./LogLevel.ts"
import * as MutableRef from "./MutableRef.ts"
import * as Option from "./Option.ts"
import type { Pipeable } from "./Pipeable.ts"
import { pipeArguments } from "./Pipeable.ts"
import type * as Predicate from "./Predicate.ts"
import { hasProperty, isTagged } from "./Predicate.ts"
import * as PubSub from "./PubSub.ts"
import * as Pull from "./Pull.ts"
import * as Queue from "./Queue.ts"
import { TracerTimingEnabled } from "./References.ts"
import * as Result from "./Result.ts"
import * as Schedule from "./Schedule.ts"
import * as Scope from "./Scope.ts"
import * as Semaphore from "./Semaphore.ts"
import * as String from "./String.ts"
import * as Take from "./Take.ts"
import { ParentSpan, type SpanOptions } from "./Tracer.ts"
import type * as Types from "./Types.ts"
import type * as Unify from "./Unify.ts"

/**
 * String literal type used as the unique brand for `Channel` values.
 *
 * @category type IDs
 * @since 4.0.0
 */
export type TypeId = "~effect/Channel"

/**
 * Runtime identifier stored on `Channel` values and used by `isChannel` to
 * recognize them.
 *
 * @category type IDs
 * @since 4.0.0
 */
export const TypeId: TypeId = "~effect/Channel"

/**
 * Checks whether a value is a `Channel`.
 *
 * **Example** (Checking for channels)
 *
 * ```ts import.meta.vitest
 * import { Channel } from "effect"
 *
 * const channel = Channel.succeed(42)
 * Channel.isChannel(channel) // => true
 * Channel.isChannel("not a channel") // => false
 * ```
 *
 * @category guards
 * @since 3.5.4
 */
export const isChannel = (
  u: unknown
): u is Channel<unknown, unknown, unknown, unknown, unknown, unknown, unknown> => hasProperty(u, TypeId)

/**
 * A `Channel` is a nexus of I/O operations, which supports both reading and
 * writing. A channel may read values of type `InElem` and write values of type
 * `OutElem`. When the channel finishes, it yields a value of type `OutDone`. A
 * channel may fail with a value of type `OutErr`.
 *
 * **Details**
 *
 * Channels are the foundation of Streams: both streams and sinks are built on
 * channels. Most users shouldn't have to use channels directly, as streams and
 * sinks are much more convenient and cover all common use cases. However, when
 * adding new stream and sink operators, or doing something highly specialized,
 * it may be useful to use channels directly.
 *
 * Channels compose in a variety of ways:
 *
 *  - **Piping**: One channel can be piped to another channel, assuming the
 *    input type of the second is the same as the output type of the first.
 *  - **Sequencing**: The terminal value of one channel can be used to create
 *    another channel, and both the first channel and the function that makes
 *    the second channel can be composed into a channel.
 *  - **Concatenating**: The output of one channel can be used to create other
 *    channels, which are all concatenated together. The first channel and the
 *    function that makes the other channels can be composed into a channel.
 *
 * **Example** (Typing channels)
 *
 * ```ts import.meta.vitest
 * import { Channel, Effect } from "effect"
 *
 * // A channel that outputs numbers and requires no environment
 * type NumberChannel = Channel.Channel<number>
 *
 * // A channel that outputs strings, can fail with Error, completes with boolean
 * type StringChannel = Channel.Channel<string, Error, boolean>
 *
 * // A channel with all type parameters specified
 * type FullChannel = Channel.Channel<
 *   string, // OutElem - output elements
 *   Error, // OutErr - output errors
 *   number, // OutDone - completion value
 *   number, // InElem - input elements
 *   string, // InErr - input errors
 *   boolean, // InDone - input completion
 *   { db: string } // Env - required environment
 * >
 *
 * const channel: NumberChannel = Channel.succeed(1)
 * Effect.runSync(Channel.runCollect(channel)) // => [1]
 * ```
 *
 * @category models
 * @since 2.0.0
 */
export interface Channel<
  out OutElem,
  out OutErr = never,
  out OutDone = void,
  in InElem = unknown,
  in InErr = unknown,
  in InDone = unknown,
  out Env = never
> extends Variance<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>, Pipeable {
  [Unify.typeSymbol]?: unknown
  [Unify.unifySymbol]?: ChannelUnify<this>
  [Unify.ignoreSymbol]?: ChannelUnifyIgnore
}

/**
 * Type-level unification support for `Channel` values.
 *
 * **Details**
 *
 * This preserves all `Channel` type parameters when `Unify` normalizes unions
 * or generic return types that include channels. Users normally do not need to
 * reference this interface directly.
 *
 * @category models
 * @since 2.0.0
 */
export interface ChannelUnify<A extends { [Unify.typeSymbol]?: any }> extends Effect.EffectUnify<A> {
  Channel?: () => A[Unify.typeSymbol] extends
    | Channel<infer OutElem, infer OutErr, infer OutDone, infer InElem, infer InErr, infer InDone, infer Env>
    | infer _ ? Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>
    : never
}

/**
 * Marker used by `Unify` while resolving `Channel` values.
 *
 * **Details**
 *
 * It prevents the inherited `Effect` unifier from being selected when the
 * channel-specific unifier should preserve `Channel` input, output, and
 * environment type parameters. Users normally do not need to reference this
 * interface directly.
 *
 * @category models
 * @since 2.0.0
 */
export interface ChannelUnifyIgnore {
  Effect?: true
}

type TagsWithReason<E> = {
  [T in Types.Tags<E>]: Types.ReasonTags<Types.ExtractTag<E, T>> extends never ? never : T
}[Types.Tags<E>]

/**
 * Phantom variance marker for the type parameters of `Channel`.
 *
 * **Details**
 *
 * Output element, output error, output done, and environment types are
 * covariant. Input element, input error, and input done types are
 * contravariant. This is type-level machinery and is not used directly at
 * runtime.
 *
 * @category models
 * @since 2.0.0
 */
export interface Variance<
  out OutElem,
  out OutErr,
  out OutDone,
  in InElem,
  in InErr,
  in InDone,
  out Env
> {
  readonly [TypeId]: VarianceStruct<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>
}
/**
 * Structural encoding used by `Variance` to record each `Channel` type
 * parameter's variance.
 *
 * **Details**
 *
 * The `_OutElem`, `_OutErr`, `_OutDone`, and `_Env` fields are covariant; the
 * `_InElem`, `_InErr`, and `_InDone` fields are contravariant. Users normally
 * do not need to reference this interface directly.
 *
 * @category models
 * @since 2.0.0
 */
export interface VarianceStruct<
  out OutElem,
  out OutErr,
  out OutDone,
  in InElem,
  in InErr,
  in InDone,
  out Env
> {
  _Env: Types.Covariant<Env>
  _InErr: Types.Contravariant<InErr>
  _InElem: Types.Contravariant<InElem>
  _InDone: Types.Contravariant<InDone>
  _OutErr: Types.Covariant<OutErr>
  _OutElem: Types.Covariant<OutElem>
  _OutDone: Types.Covariant<OutDone>
}

const ChannelProto = {
  [TypeId]: {
    _Env: identity_,
    _InErr: identity_,
    _InElem: identity_,
    _OutErr: identity_,
    _OutElem: identity_
  },
  pipe() {
    return pipeArguments(this, arguments)
  }
}

// -----------------------------------------------------------------------------
// Constructors
// -----------------------------------------------------------------------------

/**
 * Creates a `Channel` from a transformation function that operates on upstream pulls.
 *
 * **Example** (Creating channels from transforms)
 *
 * ```ts import.meta.vitest
 * import { Channel, Effect } from "effect"
 *
 * const channel = Channel.fromTransform((upstream, scope) =>
 *   Effect.succeed(upstream)
 * )
 * await Effect.runPromise(Channel.runCollect(channel)) // => []
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export const fromTransform = <OutElem, OutErr, OutDone, InElem, InErr, InDone, EX, EnvX, Env>(
  transform: (
    upstream: Pull.Pull<InElem, InErr, InDone>,
    scope: Scope.Scope
  ) => Effect.Effect<Pull.Pull<OutElem, OutErr, OutDone, EnvX>, EX, Env>
): Channel<
  OutElem,
  Pull.ExcludeDone<OutErr> | EX,
  OutDone,
  InElem,
  InErr,
  InDone,
  Env | EnvX
> => {
  const self = Object.create(ChannelProto)
  self.transform = (upstream: any, scope: Scope.Scope) =>
    Effect.catchCause(transform(upstream, scope), (cause) => Effect.succeed(Effect.failCause(cause)))
  return self
}

/**
 * Transforms a Channel by applying a function to its Pull implementation.
 *
 * **Example** (Transforming pull behavior)
 *
 * ```ts import.meta.vitest
 * import { Channel, Effect } from "effect"
 *
 * // Transform a channel by modifying its pull behavior
 * const originalChannel = Channel.fromIterable([1, 2, 3])
 *
 * const transformedChannel = Channel.transformPull(
 *   originalChannel,
 *   (pull, scope) =>
 *     Effect.succeed(
 *       Effect.map(pull, (value) => value * 2)
 *     )
 * )
 * await Effect.runPromise(Channel.runCollect(transformedChannel)) // => [2, 4, 6]
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export const transformPull = <
  OutElem,
  OutErr,
  OutDone,
  InElem,
  InErr,
  InDone,
  Env,
  OutElem2,
  OutErr2,
  OutDone2,
  Env2,
  OutErrX,
  EnvX
>(
  self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
  f: (
    pull: Pull.Pull<OutElem, OutErr, OutDone>,
    scope: Scope.Scope
  ) => Effect.Effect<Pull.Pull<OutElem2, OutErr2, OutDone2, Env2>, OutErrX, EnvX>
): Channel<
  OutElem2,
  Pull.ExcludeDone<OutErr2> | OutErrX,
  OutDone2,
  InElem,
  InErr,
  InDone,
  Env | Env2 | EnvX
> => fromTransform((upstream, scope) => Effect.flatMap(toTransform(self)(upstream, scope), (pull) => f(pull, scope)))

/**
 * Creates a `Channel` from an `Effect` that produces a `Pull`.
 *
 * **Example** (Creating channels from pulls)
 *
 * ```ts import.meta.vitest
 * import { Cause, Channel, Effect } from "effect"
 *
 * const channel = Channel.fromPull(Effect.sync(() => {
 *   let emitted = false
 *   return Effect.suspend(() => {
 *     if (emitted) return Cause.done()
 *     emitted = true
 *     return Effect.succeed(42)
 *   })
 * }))
 * await Effect.runPromise(Channel.runCollect(channel)) // => [42]
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export const fromPull = <OutElem, OutErr, OutDone, EX, EnvX, Env>(
  effect: Effect.Effect<Pull.Pull<OutElem, OutErr, OutDone, EnvX>, EX, Env>
): Channel<OutElem, Pull.ExcludeDone<OutErr> | EX, OutDone, unknown, unknown, unknown, Env | EnvX> =>
  fromTransform((_, __) => effect) as any

/**
 * Creates a `Channel` from a transformation function that operates on upstream
 * pulls, but also provides a forked scope that closes when the resulting
 * Channel completes.
 *
 * **When to use**
 *
 * Use when building channels that require scoped resource lifecycle management,
 * providing both the channel scope and a forked scope that automatically closes
 * when the channel completes.
 *
 * @see {@link fromTransform} for a simpler transformation without a forked scope
 * @category constructors
 * @since 4.0.0
 */
export const fromTransformBracket = <OutElem, OutErr, OutDone, InElem, InErr, InDone, EX, EnvX, Env>(
  f: (
    upstream: Pull.Pull<InElem, InErr, InDone>,
    scope: Scope.Scope,
    forkedScope: Scope.Scope
  ) => Effect.Effect<Pull.Pull<OutElem, OutErr, OutDone, EnvX>, EX, Env>
): Channel<OutElem, Pull.ExcludeDone<OutErr> | EX, OutDone, InElem, InErr, InDone, Env | EnvX> =>
  fromTransform(
    Effect.fnUntraced(function*(upstream, scope) {
      const closableScope = Scope.forkUnsafe(scope)
      const onCause = (cause: Cause.Cause<EX | OutErr | Cause.Done<OutDone>>) =>
        Scope.close(closableScope, Pull.doneExitFromCause(cause))
      const pull = yield* Effect.onError(
        f(upstream, scope, closableScope),
        onCause
      )
      return Effect.onError(pull, onCause)
    })
  )

/**
 * Converts a `Channel` back to its underlying transformation function.
 *
 * **Example** (Extracting channel transforms)
 *
 * ```ts import.meta.vitest
 * import { Channel, Effect } from "effect"
 *
 * const channel = Channel.succeed(42)
 * const transform = Channel.toTransform(channel)
 * typeof transform // => "function"
 * Effect.runSync(Channel.runCollect(channel)) // => [42]
 * ```
 *
 * @category destructors
 * @since 4.0.0
 */
export const toTransform = <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>(
  channel: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>
): (
  upstream: Pull.Pull<InElem, InErr, InDone>,
  scope: Scope.Scope
) => Effect.Effect<Pull.Pull<OutElem, OutErr, OutDone>, never, Env> => (channel as any).transform

/**
 * The default chunk size used by channels for batching operations.
 *
 * **Example** (Reading the default chunk size)
 *
 * ```ts import.meta.vitest
 * import { Channel } from "effect"
 *
 * Channel.DefaultChunkSize // => 4096
 * ```
 *
 * @category constants
 * @since 4.0.0
 */
export const DefaultChunkSize: number = 4096

const asyncQueue = <A, E = never, R = never>(
  scope: Scope.Scope,
  f: (queue: Queue.Queue<A, E | Cause.Done>) => Effect.Effect<unknown, E, R | Scope.Scope>,
  options?: {
    readonly bufferSize?: number | undefined
    readonly strategy?: "sliding" | "dropping" | "suspend" | undefined
  }
) =>
  Queue.make<A, E | Cause.Done>({
    capacity: options?.bufferSize,
    strategy: options?.strategy
  }).pipe(
    Effect.tap((queue) => Scope.addFinalizer(scope, Queue.shutdown(queue))),
    Effect.tap((queue) => Effect.forkIn(Scope.provide(f(queue), scope), scope))
  )

/**
 * Creates a `Channel` that interacts with a callback function using a queue.
 *
 * **Example** (Creating channels from callbacks)
 *
 * ```ts import.meta.vitest
 * import { Channel, Effect, Queue } from "effect"
 *
 * const channel = Channel.callback<number>((queue) =>
 *   Effect.gen(function*() {
 *     yield* Queue.offer(queue, 1)
 *     yield* Queue.offer(queue, 2)
 *     yield* Queue.offer(queue, 3)
 *     yield* Queue.end(queue)
 *   })
 * )
 * await Effect.runPromise(Channel.runCollect(channel)) // => [1, 2, 3]
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
): Channel<A, E, void, unknown, unknown, unknown, Exclude<R, Scope.Scope>> =>
  fromTransform((_, scope) => Effect.map(asyncQueue(scope, f, options), Queue.take))

/**
 * Creates a `Channel` that interacts with a callback function using a queue, emitting arrays.
 *
 * **Example** (Creating array channels from callbacks)
 *
 * ```ts import.meta.vitest
 * import { Channel, Effect, Queue } from "effect"
 *
 * const channel = Channel.callbackArray<number>(Effect.fn(function*(queue) {
 *   yield* Queue.offer(queue, 1)
 *   yield* Queue.offer(queue, 2)
 *   yield* Queue.end(queue)
 * }))
 * await Effect.runPromise(Channel.runCollect(channel)) // => [[1, 2]]
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export const callbackArray = <A, E = never, R = never>(
  f: (queue: Queue.Queue<A, E | Cause.Done>) => Effect.Effect<unknown, E, R | Scope.Scope>,
  options?: {
    readonly bufferSize?: number | undefined
    readonly strategy?: "sliding" | "dropping" | "suspend" | undefined
  }
): Channel<Arr.NonEmptyReadonlyArray<A>, E, void, unknown, unknown, unknown, Exclude<R, Scope.Scope>> =>
  fromTransform((_, scope) => Effect.map(asyncQueue(scope, f, options), Queue.takeAll))

/**
 * Creates a `Channel` that lazily evaluates to another channel.
 *
 * **Example** (Suspending channel creation)
 *
 * ```ts import.meta.vitest
 * import { Channel, Effect } from "effect"
 *
 * const channel = Channel.suspend(() => Channel.succeed(42))
 * Effect.runSync(Channel.runCollect(channel)) // => [42]
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const suspend = <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>(
  evaluate: LazyArg<Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>>
): Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env> =>
  fromTransform((upstream, scope) => Effect.suspend(() => toTransform(evaluate())(upstream, scope)))

/**
 * Acquires a resource, uses it to build a `Channel`, and guarantees that
 * `release` runs with the channel's `Exit` when the channel completes, fails,
 * or is interrupted.
 *
 * **Details**
 *
 * Acquisition is uninterruptible. If acquisition fails, `use` is not run and
 * `release` is not registered.
 *
 * **Example** (Managing resources with acquire-use-release)
 *
 * ```ts import.meta.vitest
 * import { Channel, Effect } from "effect"
 *
 * const released: Array<string> = []
 * const channel = Channel.acquireUseRelease(
 *   Effect.succeed("resource"),
 *   (resource) => Channel.succeed(resource.toUpperCase()),
 *   (resource, exit) => Effect.sync(() => released.push(resource))
 * )
 * const observed = [await Effect.runPromise(Channel.runCollect(channel)), released] // => [["RESOURCE"], ["resource"]]
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const acquireUseRelease = <A, E, R, OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>(
  acquire: Effect.Effect<A, E, R>,
  use: (a: A) => Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
  release: (a: A, exit: Exit.Exit<OutDone, OutErr>) => Effect.Effect<unknown>
): Channel<OutElem, OutErr | E, OutDone, InElem, InErr, InDone, Env | R> =>
  fromTransformBracket(
    Effect.fnUntraced(function*(upstream, scope, forkedScope) {
      let option = Option.none<A>()
      yield* Scope.addFinalizerExit(forkedScope, (exit) =>
        Option.isSome(option)
          ? release(option.value, exit as any)
          : Effect.void)
      const value = yield* Effect.uninterruptible(acquire)
      option = Option.some(value)
      return yield* toTransform(use(value))(upstream, scope)
    })
  )

/**
 * Acquires a resource, emits the acquired value as a single channel element,
 * and registers `release` in the channel scope.
 *
 * **Details**
 *
 * The release action runs when the channel scope closes and receives the scope
 * exit. If acquisition fails, no element is emitted and `release` is not
 * registered.
 *
 * **Example** (Managing resources with acquire-release)
 *
 * ```ts import.meta.vitest
 * import { Channel, Effect } from "effect"
 *
 * const released: Array<string> = []
 * const channel = Channel.acquireRelease(
 *   Effect.succeed("resource"),
 *   (resource, exit) => Effect.sync(() => released.push(resource))
 * )
 * const observed = [await Effect.runPromise(Channel.runCollect(channel)), released] // => [["resource"], ["resource"]]
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export const acquireRelease: {
  <Z>(
    release: (z: Z, e: Exit.Exit<unknown, unknown>) => Effect.Effect<unknown>
  ): <E, R>(self: Effect.Effect<Z, E, R>) => Channel<Z, E, void, unknown, unknown, unknown, R>
  <Z, E, R>(
    self: Effect.Effect<Z, E, R>,
    release: (z: Z, e: Exit.Exit<unknown, unknown>) => Effect.Effect<unknown>
  ): Channel<Z, E, void, unknown, unknown, unknown, R>
} = dual(2, <Z, E, R>(
  self: Effect.Effect<Z, E, R>,
  release: (z: Z, e: Exit.Exit<unknown, unknown>) => Effect.Effect<unknown>
): Channel<Z, E, void, unknown, unknown, unknown, R> =>
  unwrap(Effect.map(
    Effect.acquireRelease(self, release),
    succeed
  )))

/**
 * Creates a `Channel` from an iterator.
 *
 * **Example** (Creating channels from iterators)
 *
 * ```ts import.meta.vitest
 * import { Channel, Effect } from "effect"
 *
 * const numbers = [1, 2, 3, 4, 5]
 * const channel = Channel.fromIterator(() => numbers[Symbol.iterator]())
 * Effect.runSync(Channel.runCollect(channel)) // => [1, 2, 3, 4, 5]
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export const fromIterator = <A, L>(iterator: LazyArg<Iterator<A, L>>): Channel<A, never, L> =>
  fromPull(
    Effect.sync(() => {
      const iter = iterator()
      return Effect.suspend(() => {
        const state = iter.next()
        return state.done ? Cause.done(state.value) : Effect.succeed(state.value)
      })
    })
  )

/**
 * Creates a `Channel` that emits all elements from an array.
 *
 * **Example** (Creating channels from arrays)
 *
 * ```ts import.meta.vitest
 * import { Channel, Effect } from "effect"
 *
 * const channel = Channel.fromArray([1, 2, 3, 4, 5])
 * Effect.runSync(Channel.runCollect(channel)) // => [1, 2, 3, 4, 5]
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export const fromArray = <A>(array: ReadonlyArray<A>): Channel<A> =>
  fromPull(Effect.sync(() => {
    let index = 0
    return Effect.suspend(() => index >= array.length ? Cause.done() : Effect.succeed(array[index++]))
  }))

/**
 * Creates a `Channel` that emits all elements from a chunk.
 *
 * **Example** (Creating channels from chunks)
 *
 * ```ts import.meta.vitest
 * import { Channel, Chunk, Effect } from "effect"
 *
 * const chunk = Chunk.make(1, 2, 3)
 * const channel = Channel.fromChunk(chunk)
 * Effect.runSync(Channel.runCollect(channel)) // => [1, 2, 3]
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export const fromChunk = <A>(chunk: Chunk.Chunk<A>): Channel<A> => fromArray(Chunk.toReadonlyArray(chunk))

/**
 * Creates a `Channel` from an iterator that emits arrays of elements.
 *
 * **Details**
 *
 * Finite fractional `chunkSize` values are rounded down. `NaN` and non-positive
 * values are treated as `1` so every successful pull emits a non-empty array.
 *
 * **Example** (Batching iterator output)
 *
 * ```ts import.meta.vitest
 * import { Channel, Effect } from "effect"
 *
 * // Create a channel from a simple iterator
 * const numberIterator = (): Iterator<number, string> => {
 *   let count = 0
 *   return {
 *     next: () => {
 *       if (count < 3) {
 *         return { value: count++, done: false }
 *       }
 *       return { value: "finished", done: true }
 *     }
 *   }
 * }
 *
 * const channel = Channel.fromIteratorArray(() => numberIterator(), 2)
 * Effect.runSync(Channel.runCollect(channel)) // => [[0, 1], [2]]
 * ```
 *
 * **Example** (Batching generator output)
 *
 * ```ts import.meta.vitest
 * import { Channel, Effect } from "effect"
 *
 * // Create channel from a generator function
 * function* fibonacci(): Generator<number, void, unknown> {
 *   let a = 0, b = 1
 *   for (let i = 0; i < 5; i++) {
 *     yield a
 *     ;[a, b] = [b, a + b]
 *   }
 * }
 *
 * const fibChannel = Channel.fromIteratorArray(() => fibonacci(), 3)
 * Effect.runSync(Channel.runCollect(fibChannel)) // => [[0, 1, 1], [2, 3]]
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export const fromIteratorArray = <A, L>(
  iterator: LazyArg<Iterator<A, L>>,
  chunkSize = DefaultChunkSize
): Channel<Arr.NonEmptyReadonlyArray<A>, never, L> => {
  const size = Count.normalizeNonEmpty(chunkSize)
  return fromPull(
    Effect.sync(() => {
      const iter = iterator()
      let done = Option.none<L>()
      return Effect.suspend(() => {
        if (done._tag === "Some") return Cause.done(done.value)
        const buffer: Array<A> = []
        while (buffer.length < size) {
          const state = iter.next()
          if (state.done) {
            if (buffer.length === 0) {
              return Cause.done(state.value)
            }
            done = Option.some(state.value)
            break
          }
          buffer.push(state.value)
        }
        return Effect.succeed(buffer as any as Arr.NonEmptyReadonlyArray<A>)
      })
    })
  )
}

/**
 * Creates a `Channel` that emits all elements from an iterable.
 *
 * **Example** (Creating channels from iterables)
 *
 * ```ts import.meta.vitest
 * import { Channel, Effect } from "effect"
 *
 * const set = new Set([1, 2, 3])
 * const channel = Channel.fromIterable(set)
 * Effect.runSync(Channel.runCollect(channel)) // => [1, 2, 3]
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export const fromIterable = <A, L>(iterable: Iterable<A, L>): Channel<A, never, L> =>
  fromIterator(() => iterable[Symbol.iterator]())

/**
 * Creates a `Channel` that emits arrays of elements from an iterable.
 *
 * **Details**
 *
 * Finite fractional `chunkSize` values are rounded down. `NaN` and non-positive
 * values are treated as `1`.
 *
 * **Example** (Batching iterable output)
 *
 * ```ts import.meta.vitest
 * import { Channel, Effect } from "effect"
 *
 * const numbers = [1, 2, 3, 4, 5]
 * const channel = Channel.fromIterableArray(numbers, 4)
 * Effect.runSync(Channel.runCollect(channel)) // => [[1, 2, 3, 4], [5]]
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export const fromIterableArray = <A, L>(
  iterable: Iterable<A, L>,
  chunkSize = DefaultChunkSize
): Channel<Arr.NonEmptyReadonlyArray<A>, never, L> => fromIteratorArray(() => iterable[Symbol.iterator](), chunkSize)

/**
 * Creates a `Channel` that emits a single value and then ends.
 *
 * **Example** (Creating channels that succeed)
 *
 * ```ts import.meta.vitest
 * import { Channel, Effect } from "effect"
 *
 * const channel = Channel.succeed(42)
 * Effect.runSync(Channel.runCollect(channel)) // => [42]
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const succeed = <A>(value: A): Channel<A> => fromEffect(Effect.succeed(value))

/**
 * Creates a `Channel` that immediately ends with the specified value.
 *
 * **Example** (Ending with a value)
 *
 * ```ts import.meta.vitest
 * import { Channel, Effect } from "effect"
 *
 * const channel = Channel.end("done")
 * Effect.runSync(Channel.runCollect(channel)) // => []
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export const end = <A>(value: A): Channel<never, never, A> => fromPull(Effect.succeed(Cause.done(value)))

/**
 * Creates a `Channel` that immediately ends with the lazily evaluated value.
 *
 * @category constructors
 * @since 4.0.0
 */
export const endSync = <A>(evaluate: LazyArg<A>): Channel<never, never, A> =>
  fromPull(Effect.sync(() => Cause.done(evaluate())))

/**
 * Creates a `Channel` that emits a single value computed by a lazy evaluation.
 *
 * **Example** (Computing values lazily)
 *
 * ```ts import.meta.vitest
 * import { Channel, Effect } from "effect"
 *
 * let requests = 0
 *
 * const channel = Channel.sync(() => {
 *   requests += 1
 *   return `request-${requests}`
 * })
 * Effect.runSync(Channel.runCollect(channel)) // => ["request-1"]
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const sync = <A>(evaluate: LazyArg<A>): Channel<A> => fromEffect(Effect.sync(evaluate))

/**
 * Represents a `Channel` that emits no elements.
 *
 * **Example** (Creating empty channels)
 *
 * ```ts import.meta.vitest
 * import { Channel, Effect } from "effect"
 *
 * // Create an empty channel
 * const emptyChannel = Channel.empty
 *
 * // Use empty channel in composition
 * const combined = Channel.concatWith(emptyChannel, () => Channel.succeed(42))
 * // Will immediately provide the second channel's output
 *
 * // Empty channel can be used as a no-op in conditional logic
 * const conditionalChannel = (shouldEmit: boolean) =>
 *   shouldEmit ? Channel.succeed("data") : Channel.empty
 *
 * Effect.runSync(Channel.runCollect(conditionalChannel(true))) // => ["data"]
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export const empty: Channel<never> = fromPull(Effect.succeed(Cause.done()))

/**
 * Represents a `Channel` that never completes.
 *
 * **Example** (Creating non-terminating channels)
 *
 * ```ts import.meta.vitest
 * import { Channel } from "effect"
 *
 * // Create a channel that never completes
 * const neverChannel = Channel.never
 *
 * // Use in conditional logic
 * const withFallback = Channel.concatWith(
 *   neverChannel,
 *   () => Channel.succeed("fallback")
 * )
 *
 * // Never channel is useful for testing or as a placeholder
 * const conditionalChannel = (shouldComplete: boolean) =>
 *   shouldComplete ? Channel.succeed("done") : Channel.never
 *
 * Channel.isChannel(conditionalChannel(false)) // => true
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const never: Channel<never, never, never> = fromPull(Effect.succeed(Effect.never))

/**
 * Constructs a channel that fails immediately with the specified error.
 *
 * **Example** (Failing with an error)
 *
 * ```ts import.meta.vitest
 * import { Channel, Effect, Exit } from "effect"
 *
 * const failedChannel = Channel.fail("Something went wrong")
 * Effect.runSync(Effect.exit(Channel.runCollect(failedChannel))) // => Exit.fail("Something went wrong")
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const fail = <E>(error: E): Channel<never, E, never> => fromPull(Effect.succeed(Effect.fail(error)))

/**
 * Constructs a channel that fails immediately with the specified lazily
 * evaluated error.
 *
 * **When to use**
 *
 * Use when the error value should be computed each time the channel runs instead
 * of when the channel is constructed.
 *
 * **Example** (Failing with a lazy error)
 *
 * ```ts import.meta.vitest
 * import { Channel, Effect, Exit } from "effect"
 *
 * let attempts = 0
 * const conditionalError = Channel.failSync(() => {
 *   attempts += 1
 *   return `Error after attempt ${attempts}`
 * })
 * const observed = [
 *   Effect.runSync(Effect.exit(Channel.runCollect(conditionalError))),
 *   attempts
 * ] // => [Exit.fail("Error after attempt 1"), 1]
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const failSync = <E>(evaluate: LazyArg<E>): Channel<never, E, never> => fromPull(Effect.failSync(evaluate))

/**
 * Constructs a channel that fails immediately with the specified `Cause`.
 *
 * **When to use**
 *
 * Use when the channel failure must preserve a full `Cause`, such as defects,
 * interruptions, or combined failures.
 *
 * **Example** (Failing with causes)
 *
 * ```ts import.meta.vitest
 * import { Cause, Channel, Effect, Exit } from "effect"
 *
 * const simpleCause = Cause.fail("Simple error")
 * const failedChannel = Channel.failCause(simpleCause)
 * Effect.runSync(Effect.exit(Channel.runCollect(failedChannel))) // => Exit.failCause(simpleCause)
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const failCause = <E>(cause: Cause.Cause<E>): Channel<never, E, never> => fromPull(Effect.failCause(cause))

/**
 * Constructs a channel that fails immediately with the specified lazily
 * evaluated `Cause`.
 *
 * **Example** (Failing with lazy causes)
 *
 * ```ts import.meta.vitest
 * import { Cause, Channel, Effect, Exit } from "effect"
 *
 * // Create a channel that fails with a lazily computed cause
 * let attempts = 0
 * const failedChannel = Channel.failCauseSync(() => {
 *   attempts += 1
 *   return Cause.fail(`Runtime error after attempt ${attempts}`)
 * })
 *
 * const observed = [
 *   Effect.runSync(Effect.exit(Channel.runCollect(failedChannel))),
 *   attempts
 * ] // => [Exit.fail("Runtime error after attempt 1"), 1]
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const failCauseSync = <E>(
  evaluate: LazyArg<Cause.Cause<E>>
): Channel<never, E, never> => fromPull(Effect.failCauseSync(evaluate))

/**
 * Constructs a channel that fails immediately with the specified defect.
 *
 * **Example** (Dying with defects)
 *
 * ```ts import.meta.vitest
 * import { Cause, Channel, Effect, Exit } from "effect"
 *
 * const defect = "Unrecoverable error"
 * const diedChannel = Channel.die(defect)
 * Effect.runSync(Effect.exit(Channel.runCollect(diedChannel))) // => Exit.failCause(Cause.die(defect))
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export const die = (defect: unknown): Channel<never, never, never> => failCause(Cause.die(defect))

/**
 * Uses an effect to write a single value to the channel.
 *
 * **Example** (Creating channels from effects)
 *
 * ```ts import.meta.vitest
 * import { Channel, Effect } from "effect"
 *
 * const successChannel = Channel.fromEffect(
 *   Effect.succeed("Hello from effect!")
 * )
 * Effect.runSync(Channel.runCollect(successChannel)) // => ["Hello from effect!"]
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const fromEffect = <A, E, R>(
  effect: Effect.Effect<A, E, R>
): Channel<A, Pull.ExcludeDone<E>, void, unknown, unknown, unknown, R> =>
  fromPull(
    Effect.sync(() => {
      let done = false
      return Effect.suspend((): Pull.Pull<A, E, void, R> => {
        if (done) return Cause.done()
        done = true
        return effect
      })
    })
  )

/**
 * Creates a channel that evaluates an effect and uses its successful value as
 * the channel's done value without emitting any output elements.
 *
 * **Details**
 *
 * If the effect fails, the channel fails with the effect's error.
 *
 * @category constructors
 * @since 4.0.0
 */
export const fromEffectDone = <A, E, R>(
  effect: Effect.Effect<A, E, R>
): Channel<never, Pull.ExcludeDone<E>, A, unknown, unknown, unknown, R> =>
  fromPull(Effect.succeed(Effect.flatMap(effect, Cause.done)))

/**
 * Uses an effect and discards its result.
 *
 * @category constructors
 * @since 4.0.0
 */
export const fromEffectDrain = <A, E, R>(
  effect: Effect.Effect<A, E, R>
): Channel<never, E, void, unknown, unknown, unknown, R> => fromPull(Effect.flatMap(effect, () => Cause.done())) as any

/**
 * Creates a channel from an effect that produces a `Take`.
 *
 * **Details**
 *
 * A successful `Take` emits a non-empty array of output elements. A failed
 * `Take` fails the channel. A done `Take` completes the channel with its done
 * value.
 *
 * @category constructors
 * @since 4.0.0
 */
export const fromEffectTake = <A, E, Done, E2, R>(
  effect: Effect.Effect<Take.Take<A, E, Done>, E2, R>
): Channel<Arr.NonEmptyReadonlyArray<A>, E | E2, Done, unknown, unknown, unknown, R> =>
  fromPull(Effect.succeed(Effect.flatMap(effect, Take.toPull)))

/**
 * Creates a channel from a queue.
 *
 * **Example** (Creating channels from queues)
 *
 * ```ts import.meta.vitest
 * import { Cause, Channel, Effect, Queue } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const queue = yield* Queue.bounded<string, Cause.Done>(3)
 *   yield* Queue.offerAll(queue, ["item1", "item2", "item3"])
 *   yield* Queue.end(queue)
 *   const channel = Channel.fromQueue(queue)
 *   return yield* Channel.runCollect(channel)
 * })
 * await Effect.runPromise(program) // => ["item1", "item2", "item3"]
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const fromQueue = <A, E>(
  queue: Queue.Dequeue<A, E>
): Channel<A, Exclude<E, Cause.Done>> => fromPull(Effect.succeed(Queue.take(queue)))

/**
 * Creates a channel from a queue that emits arrays of elements.
 *
 * **Example** (Creating batched channels from queues)
 *
 * ```ts import.meta.vitest
 * import { Cause, Channel, Effect, Queue } from "effect"
 *
 * const program = Effect.gen(function*() {
 *   const queue = yield* Queue.bounded<number, Cause.Done>(4)
 *   yield* Queue.offerAll(queue, [1, 2, 3, 4])
 *   yield* Queue.end(queue)
 *   const arrayChannel = Channel.fromQueueArray(queue)
 *   return yield* Channel.runCollect(arrayChannel)
 * })
 * await Effect.runPromise(program) // => [[1, 2, 3, 4]]
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export const fromQueueArray = <A, E>(
  queue: Queue.Dequeue<A, E>
): Channel<Arr.NonEmptyReadonlyArray<A>, Exclude<E, Cause.Done>> => fromPull(Effect.succeed(Queue.takeAll(queue)))

/**
 * Creates a channel that forwards upstream input elements, input errors, and
 * the upstream done value unchanged.
 *
 * @category constructors
 * @since 2.0.0
 */
export const identity = <Elem, Err, Done>(): Channel<Elem, Err, Done, Elem, Err, Done> =>
  fromTransform((upstream, _scope) => Effect.succeed(upstream))

/**
 * Creates a channel from a PubSub subscription.
 *
 * **Example** (Creating channels from subscriptions)
 *
 * ```ts import.meta.vitest
 * import { Channel, Data, Effect, Option, PubSub } from "effect"
 *
 * class SubscriptionError extends Data.TaggedError("SubscriptionError")<{
 *   readonly reason: string
 * }> {}
 *
 * const program = Effect.gen(function*() {
 *   // Create a PubSub
 *   const pubsub = yield* PubSub.bounded<string>(32)
 *
 *   // Create a subscription
 *   const subscription = yield* PubSub.subscribe(pubsub)
 *
 *   // Publish some messages
 *   yield* PubSub.publish(pubsub, "Hello")
 *   yield* PubSub.publish(pubsub, "World")
 *   yield* PubSub.publish(pubsub, "from")
 *   yield* PubSub.publish(pubsub, "PubSub")
 *
 *   // Create a channel from the subscription
 *   const channel = Channel.fromSubscription(subscription)
 *
 *   // The channel will receive all published messages
 *   return channel
 * })
 * const result = Effect.scoped(Effect.flatMap(program, Channel.runHead))
 * await Effect.runPromise(result) // => Option.some("Hello")
 *
 * // Real-time notifications example
 * const notificationChannel = Effect.gen(function*() {
 *   const eventBus = yield* PubSub.unbounded<{ type: string; payload: any }>()
 *   const userSubscription = yield* PubSub.subscribe(eventBus)
 *
 *   return Channel.fromSubscription(userSubscription)
 * })
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export const fromSubscription = <A>(
  subscription: PubSub.Subscription<A>
): Channel<A> => fromPull(Effect.succeed(Effect.onInterrupt(PubSub.take(subscription), () => Cause.done())))

/**
 * Creates a channel from a PubSub subscription that outputs arrays of values.
 *
 * **Details**
 *
 * This constructor creates a channel that reads from a PubSub subscription and outputs
 * arrays of values in chunks. It's useful when you want to process multiple values at once
 * for better performance.
 *
 * **Example** (Batching subscription values)
 *
 * ```ts import.meta.vitest
 * import { Channel, Data, Effect, Option, PubSub } from "effect"
 *
 * class StreamError extends Data.TaggedError("StreamError")<{
 *   readonly message: string
 * }> {}
 *
 * const program = Effect.gen(function*() {
 *   const pubsub = yield* PubSub.bounded<number>(16)
 *   const subscription = yield* PubSub.subscribe(pubsub)
 *
 *   // Create a channel that reads arrays of values
 *   const channel = Channel.fromSubscriptionArray(subscription)
 *
 *   // Publish some values
 *   yield* PubSub.publish(pubsub, 1)
 *   yield* PubSub.publish(pubsub, 2)
 *   yield* PubSub.publish(pubsub, 3)
 *   yield* PubSub.publish(pubsub, 4)
 *
 *   // The channel will output arrays like [1, 2, 3] and [4]
 *   return channel
 * })
 * const result = Effect.scoped(Effect.flatMap(program, Channel.runHead))
 * await Effect.runPromise(result) // => Option.some([1, 2, 3, 4])
 * ```
 *
 * **Example** (Processing subscription values in batches)
 *
 * ```ts import.meta.vitest
 * import { Channel, Data, Effect, Option, PubSub } from "effect"
 *
 * class BatchProcessingError extends Data.TaggedError("BatchProcessingError")<{
 *   readonly reason: string
 * }> {}
 *
 * const batchProcessor = Effect.gen(function*() {
 *   const pubsub = yield* PubSub.bounded<string>(32)
 *   const subscription = yield* PubSub.subscribe(pubsub)
 *
 *   // Create a channel that processes items in batches
 *   const batchChannel = Channel.fromSubscriptionArray(subscription)
 *
 *   // Transform to process each batch
 *   const processedChannel = Channel.map(batchChannel, (batch) =>
 *     batch.map((item) => item.toUpperCase())
 *   )
 *
 *   yield* PubSub.publishAll(pubsub, ["one", "two"])
 *   return processedChannel
 * })
 * const batch = Effect.scoped(Effect.flatMap(batchProcessor, Channel.runHead))
 * await Effect.runPromise(batch) // => Option.some(["ONE", "TWO"])
 * ```
 *
 * **Example** (Aggregating subscription metrics)
 *
 * ```ts import.meta.vitest
 * import { Channel, Effect, Option, PubSub } from "effect"
 *
 * const metricsAggregator = Effect.gen(function*() {
 *   const metricsPubSub = yield* PubSub.bounded<
 *     { timestamp: number; value: number }
 *   >(100)
 *   const subscription = yield* PubSub.subscribe(metricsPubSub)
 *
 *   // Create a channel that collects metrics in chunks
 *   const metricsChannel = Channel.fromSubscriptionArray(subscription)
 *
 *   // Transform to calculate aggregate statistics
 *   const aggregatedChannel = Channel.map(metricsChannel, (metrics) => {
 *     const values = metrics.map((m) => m.value)
 *     const sum = values.reduce((a, b) => a + b, 0)
 *     const avg = sum / values.length
 *     const min = Math.min(...values)
 *     const max = Math.max(...values)
 *
 *     return {
 *       count: values.length,
 *       sum,
 *       average: avg,
 *       min,
 *       max,
 *       firstTimestamp: Math.min(...metrics.map((m) => m.timestamp)),
 *       lastTimestamp: Math.max(...metrics.map((m) => m.timestamp))
 *     }
 *   })
 *
 *   yield* PubSub.publish(metricsPubSub, { timestamp: 1, value: 10 })
 *   return aggregatedChannel
 * })
 * const metric = Effect.scoped(Effect.flatMap(metricsAggregator, Channel.runHead))
 * const result = await Effect.runPromise(metric)
 * Option.map(result, ({ count, sum, average, min, max }) => ({ count, sum, average, min, max })) // => Option.some({ count: 1, sum: 10, average: 10, min: 10, max: 10 })
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export const fromSubscriptionArray = <A>(
  subscription: PubSub.Subscription<A>
): Channel<Arr.NonEmptyReadonlyArray<A>> =>
  fromPull(Effect.succeed(Effect.onInterrupt(PubSub.takeAll(subscription), () => Cause.done())))

/**
 * Creates a channel from a PubSub that outputs individual values.
 *
 * **Details**
 *
 * This constructor creates a channel that reads from a PubSub by automatically
 * subscribing to it. The channel outputs individual values as they are published
 * to the PubSub, making it ideal for real-time streaming scenarios.
 *
 * **Example** (Creating channels from PubSubs)
 *
 * ```ts import.meta.vitest
 * import { Channel, Data, Effect, Option, PubSub } from "effect"
 *
 * class StreamError extends Data.TaggedError("StreamError")<{
 *   readonly message: string
 * }> {}
 *
 * const program = Effect.gen(function*() {
 *   const pubsub = yield* PubSub.unbounded<number>({ replay: 3 })
 *
 *   // Create a channel that reads individual values
 *   const channel = Channel.fromPubSub(pubsub)
 *
 *   // Publish some values
 *   yield* PubSub.publish(pubsub, 1)
 *   yield* PubSub.publish(pubsub, 2)
 *   yield* PubSub.publish(pubsub, 3)
 *
 *   // The channel will output: 1, 2, 3 (individual values)
 *   return channel
 * })
 * const result = Effect.scoped(Effect.flatMap(program, Channel.runHead))
 * await Effect.runPromise(result) // => Option.some(1)
 * ```
 *
 * **Example** (Streaming PubSub notifications)
 *
 * ```ts import.meta.vitest
 * import { Channel, Effect, Option, PubSub } from "effect"
 *
 * const notificationService = Effect.gen(function*() {
 *   const notificationPubSub = yield* PubSub.unbounded<string>({ replay: 1 })
 *
 *   // Create a channel for real-time notifications
 *   const notificationChannel = Channel.fromPubSub(notificationPubSub)
 *
 *   // Transform notifications to add timestamps
 *   const receivedAt = "2024-01-01T00:00:00.000Z"
 *   const timestampedChannel = Channel.map(notificationChannel, (message) => ({
 *     message,
 *     receivedAt,
 *     id: `notification:${message}`
 *   }))
 *
 *   yield* PubSub.publish(notificationPubSub, "ready")
 *   return timestampedChannel
 * })
 * const notification = Effect.scoped(Effect.flatMap(notificationService, Channel.runHead))
 * await Effect.runPromise(notification) // => Option.some({ message: "ready", receivedAt: "2024-01-01T00:00:00.000Z", id: "notification:ready" })
 * ```
 *
 * **Example** (Processing PubSub events)
 *
 * ```ts import.meta.vitest
 * import { Channel, Effect, Option, PubSub } from "effect"
 *
 * interface DomainEvent {
 *   readonly type: string
 *   readonly payload: unknown
 *   readonly timestamp: number
 * }
 *
 * const eventProcessor = Effect.gen(function*() {
 *   const eventPubSub = yield* PubSub.unbounded<DomainEvent>({ replay: 1 })
 *
 *   // Create a channel for processing domain events
 *   const eventChannel = Channel.fromPubSub(eventPubSub)
 *
 *   // Filter and transform events
 *   const processedChannel = Channel.map(eventChannel, (event) => {
 *     if (event.type === "user.created") {
 *       return {
 *         ...event,
 *         processed: true,
 *         processedAt: event.timestamp + 1
 *       }
 *     }
 *     return event
 *   })
 *
 *   yield* PubSub.publish(eventPubSub, { type: "user.created", payload: {}, timestamp: 1 })
 *   return processedChannel
 * })
 * const event = Effect.scoped(Effect.flatMap(eventProcessor, Channel.runHead))
 * const result = await Effect.runPromise(event) // => Option.some({ type: "user.created", payload: {}, timestamp: 1, processed: true, processedAt: 2 })
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const fromPubSub = <A>(
  pubsub: PubSub.PubSub<A>
): Channel<A> => unwrap(Effect.map(PubSub.subscribe(pubsub), fromSubscription))

/**
 * Creates a channel from a PubSub that outputs arrays of values.
 *
 * **Details**
 *
 * This constructor creates a channel that reads from a PubSub by automatically
 * subscribing to it and collecting values into arrays. The channel outputs
 * arrays of values in chunks, making it ideal for batch processing scenarios.
 *
 * **Example** (Batching PubSub values)
 *
 * ```ts import.meta.vitest
 * import { Channel, Data, Effect, Option, PubSub } from "effect"
 *
 * class BatchError extends Data.TaggedError("BatchError")<{
 *   readonly message: string
 * }> {}
 *
 * const program = Effect.gen(function*() {
 *   const pubsub = yield* PubSub.unbounded<number>({ replay: 4 })
 *
 *   // Create a channel that reads arrays of values
 *   const channel = Channel.fromPubSubArray(pubsub)
 *
 *   // Publish some values
 *   yield* PubSub.publish(pubsub, 1)
 *   yield* PubSub.publish(pubsub, 2)
 *   yield* PubSub.publish(pubsub, 3)
 *   yield* PubSub.publish(pubsub, 4)
 *
 *   // The channel will output arrays like [1, 2, 3] and [4]
 *   return channel
 * })
 * const result = Effect.scoped(Effect.flatMap(program, Channel.runHead))
 * await Effect.runPromise(result) // => Option.some([1, 2, 3, 4])
 * ```
 *
 * **Example** (Processing PubSub orders in batches)
 *
 * ```ts import.meta.vitest
 * import { Channel, Effect, Option, PubSub } from "effect"
 *
 * interface Order {
 *   readonly id: string
 *   readonly customerId: string
 *   readonly items: ReadonlyArray<string>
 *   readonly total: number
 *   readonly submittedAt: number
 * }
 *
 * const orderBatchProcessor = Effect.gen(function*() {
 *   const orderPubSub = yield* PubSub.unbounded<Order>({ replay: 1 })
 *
 *   // Create a channel that processes orders in batches
 *   const orderChannel = Channel.fromPubSubArray(orderPubSub)
 *
 *   // Transform to process each batch of orders
 *   const processedChannel = Channel.map(orderChannel, (orderBatch) => {
 *     const totalRevenue = orderBatch.reduce((sum, order) => sum + order.total, 0)
 *     const customerCount = new Set(orderBatch.map((order) =>
 *       order.customerId
 *     )).size
 *
 *     return {
 *       batchSize: orderBatch.length,
 *       totalRevenue,
 *       uniqueCustomers: customerCount,
 *       firstSubmittedAt: Math.min(...orderBatch.map((order) => order.submittedAt)),
 *       orders: orderBatch
 *     }
 *   })
 *
 *   yield* PubSub.publish(orderPubSub, {
 *     id: "1", customerId: "a", items: ["book"], total: 10, submittedAt: 1
 *   })
 *   return processedChannel
 * })
 * const order = Effect.scoped(Effect.flatMap(orderBatchProcessor, Channel.runHead))
 * const result = await Effect.runPromise(order)
 * Option.map(result, (batch) => [batch.batchSize, batch.totalRevenue, batch.uniqueCustomers]) // => Option.some([1, 10, 1])
 * ```
 *
 * **Example** (Processing PubSub logs in batches)
 *
 * ```ts import.meta.vitest
 * import { Channel, Effect, Option, PubSub } from "effect"
 *
 * interface LogEntry {
 *   readonly timestamp: number
 *   readonly level: "info" | "warn" | "error"
 *   readonly message: string
 *   readonly source: string
 * }
 *
 * const logAggregator = Effect.gen(function*() {
 *   const logPubSub = yield* PubSub.unbounded<LogEntry>({ replay: 1 })
 *
 *   // Create a channel that collects logs in batches
 *   const logChannel = Channel.fromPubSubArray(logPubSub)
 *
 *   // Transform to analyze log batches
 *   const analysisChannel = Channel.map(logChannel, (logBatch) => {
 *     const errorCount = logBatch.filter((log) => log.level === "error").length
 *     const warnCount = logBatch.filter((log) => log.level === "warn").length
 *     const infoCount = logBatch.filter((log) => log.level === "info").length
 *
 *     const timeRange = {
 *       start: Math.min(...logBatch.map((log) => log.timestamp)),
 *       end: Math.max(...logBatch.map((log) => log.timestamp))
 *     }
 *
 *     return {
 *       batchId: `${timeRange.start}-${timeRange.end}`,
 *       totalEntries: logBatch.length,
 *       errorCount,
 *       warnCount,
 *       infoCount,
 *       timeRange,
 *       sources: [...new Set(logBatch.map((log) => log.source))]
 *     }
 *   })
 *
 *   yield* PubSub.publish(logPubSub, {
 *     timestamp: 1,
 *     level: "info",
 *     message: "ready",
 *     source: "app"
 *   } satisfies LogEntry)
 *   return analysisChannel
 * })
 * const log = Effect.scoped(Effect.flatMap(logAggregator, Channel.runHead))
 * const result = await Effect.runPromise(log)
 * Option.map(result, (batch) => [batch.batchId, batch.totalEntries, batch.infoCount]) // => Option.some(["1-1", 1, 1])
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export const fromPubSubArray = <A>(pubsub: PubSub.PubSub<A>): Channel<Arr.NonEmptyReadonlyArray<A>> =>
  unwrap(Effect.map(PubSub.subscribe(pubsub), fromSubscriptionArray))

/**
 * Subscribes to a `PubSub` of `Take` values and exposes them as a channel.
 *
 * **Details**
 *
 * Output `Take` values are emitted as non-empty arrays. Failed `Take` values
 * fail the channel. Done `Take` values complete the channel.
 *
 * @category constructors
 * @since 4.0.0
 */
export const fromPubSubTake = <A, E, Done>(
  pubsub: PubSub.PubSub<Take.Take<A, E, Done>>
): Channel<Arr.NonEmptyReadonlyArray<A>, E, Done> =>
  unwrap(Effect.map(PubSub.subscribe(pubsub), (sub) => fromEffectTake(PubSub.take(sub))))

/**
 * Creates a Channel from a Schedule.
 *
 * @category constructors
 * @since 4.0.0
 */
export const fromSchedule = <O, E, R>(
  schedule: Schedule.Schedule<O, unknown, E, R>
): Channel<O, E, O, unknown, unknown, unknown, R> =>
  fromPull(Effect.map(Schedule.toStepWithSleep(schedule), (step) => step(void 0)))

/**
 * Creates a channel from a lazily supplied Web `ReadableStream`.
 *
 * **Example** (Reading from a Web stream)
 *
 * ```ts import.meta.vitest
 * import { Channel, Effect } from "effect"
 *
 * const channel = Channel.fromReadableStream({
 *   evaluate: () => new ReadableStream({
 *     start(controller) {
 *       controller.enqueue(1)
 *       controller.close()
 *     }
 *   }),
 *   onError: (cause) => new Error(String(cause))
 * })
 *
 * await Effect.runPromise(Channel.runCollect(channel)) // => [[1]]
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export const fromReadableStream = <A, E>(options: {
  readonly evaluate: LazyArg<ReadableStream<A>>
  readonly onError: (error: unknown) => E
  readonly releaseLockOnEnd?: boolean | undefined
}): Channel<Arr.NonEmptyReadonlyArray<A>, E> =>
  fromTransform((_, scope) =>
    readableStreamToPullUnsafe({
      scope,
      readable: options.evaluate(),
      onError: options.onError,
      releaseLockOnEnd: options.releaseLockOnEnd
    })
  )

/** @internal */
export const pullIntoWritableStream = <A, IE, E>(options: {
  readonly pull: Pull.Pull<Arr.NonEmptyReadonlyArray<A>, IE, unknown>
  readonly writable: WritableStream<A>
  readonly onError: (error: unknown) => E
  readonly closeOnDone?: boolean | undefined
}): Pull.Pull<never, IE | E, unknown> =>
  Effect.acquireUseRelease(
    Effect.sync(() => options.writable.getWriter()),
    (writer) => {
      const loop = options.pull.pipe(
        Effect.flatMap((chunk) =>
          Effect.forEach(
            chunk,
            (value) =>
              Effect.tryPromise({
                try: () => writer.ready.then(() => writer.write(value)),
                catch: options.onError
              }),
            { discard: true }
          )
        ),
        Effect.forever({ disableYield: true })
      )
      const withClose = options.closeOnDone !== false
        ? Pull.catchDone(loop, (done) =>
          Effect.andThen(
            Effect.tryPromise({
              try: () => writer.close(),
              catch: options.onError
            }),
            Cause.done(done)
          ))
        : loop
      return Effect.onError(
        withClose,
        (cause) =>
          Pull.isDoneCause(cause)
            ? Effect.void
            : Effect.promise(() => writer.abort(cause).catch(constVoid))
      )
    },
    (writer) => Effect.sync(() => writer.releaseLock())
  )

/**
 * Creates a channel that writes upstream values to a lazily supplied Web
 * `WritableStream`.
 *
 * **Example** (Writing channel input)
 *
 * ```ts import.meta.vitest
 * import { Channel, Effect } from "effect"
 *
 * const written: Array<number> = []
 * const sink = Channel.fromWritableStream<never, Error, number>({
 *   evaluate: () => new WritableStream({
 *     write(value) {
 *       written.push(value)
 *     }
 *   }),
 *   onError: (cause) => new Error(String(cause))
 * })
 *
 * const program = Channel.fromArray([[1, 2] as [number, number]]).pipe(
 *   Channel.pipeTo(sink),
 *   Channel.runDrain
 * )
 *
 * await Effect.runPromise(program)
 * written // => [1, 2]
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export const fromWritableStream = <IE, E, A>(options: {
  readonly evaluate: LazyArg<WritableStream<A>>
  readonly onError: (error: unknown) => E
  readonly closeOnDone?: boolean | undefined
}): Channel<never, IE | E, void, Arr.NonEmptyReadonlyArray<A>, IE> =>
  fromTransform((pull: Pull.Pull<Arr.NonEmptyReadonlyArray<A>, IE, unknown>) => {
    const writable = options.evaluate()
    return Effect.succeed(pullIntoWritableStream({ ...options, writable, pull }))
  })

/**
 * Creates a channel backed by a Web `TransformStream`, writing upstream values
 * while emitting transformed values from its readable side.
 *
 * **Example** (Transforming channel input)
 *
 * ```ts import.meta.vitest
 * import { Channel, Effect } from "effect"
 *
 * const transform = Channel.fromTransformStream<never, number, number, Error>({
 *   evaluate: () => new TransformStream({
 *     transform(value, controller) {
 *       controller.enqueue(value * 2)
 *     }
 *   }),
 *   onError: (cause) => new Error(String(cause))
 * })
 *
 * const program = Channel.fromArray([[1, 2] as [number, number]]).pipe(
 *   Channel.pipeTo(transform),
 *   Channel.runCollect
 * )
 *
 * await Effect.runPromise(program) // => [[2], [4]]
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export const fromTransformStream = <IE, I, O, E>(options: {
  readonly evaluate: LazyArg<TransformStream<I, O>>
  readonly onError: (error: unknown) => E
  readonly closeOnDone?: boolean | undefined
  readonly releaseLockOnEnd?: boolean | undefined
}): Channel<Arr.NonEmptyReadonlyArray<O>, IE | E, void, Arr.NonEmptyReadonlyArray<I>, IE> =>
  fromTransform((upstream, scope) => {
    const transform = options.evaluate()
    const exit = MutableRef.make<Exit.Exit<never, IE | E | Cause.Done> | undefined>(undefined)
    return pullIntoWritableStream({
      pull: upstream,
      writable: transform.writable,
      onError: options.onError,
      closeOnDone: options.closeOnDone
    }).pipe(
      Effect.catchCause((cause) => {
        if (!Pull.isDoneCause(cause)) {
          exit.current = Exit.failCause(cause as Cause.Cause<IE | E | Cause.Done>)
        }
        return Effect.void
      }),
      Effect.forkIn(scope),
      Effect.flatMap(() =>
        readableStreamToPullUnsafe({
          scope,
          exit,
          readable: transform.readable,
          onError: options.onError,
          releaseLockOnEnd: options.releaseLockOnEnd
        })
      )
    )
  })

const readableStreamToPullUnsafe = <A, E, E2 = never>(options: {
  readonly scope: Scope.Scope
  readonly exit?: MutableRef.MutableRef<Exit.Exit<never, E | E2 | Cause.Done> | undefined> | undefined
  readonly readable: ReadableStream<A>
  readonly onError: (error: unknown) => E
  readonly releaseLockOnEnd?: boolean | undefined
}): Effect.Effect<Pull.Pull<Arr.NonEmptyReadonlyArray<A>, E | E2>, never> => {
  const reader = options.readable.getReader()
  const exit = options.exit ?? MutableRef.make(undefined)
  const pull = Effect.suspend(() => {
    if (exit.current) return exit.current
    return Effect.matchCauseEffect(
      Effect.tryPromise({
        try: () => reader.read(),
        catch: options.onError
      }),
      {
        onFailure: (cause) => exit.current ?? Effect.failCause(cause),
        onSuccess: ({ done, value }) => {
          if (exit.current) return exit.current
          return done ? Cause.done() : Effect.succeed(Arr.of(value))
        }
      }
    )
  })
  return Effect.as(
    Scope.addFinalizer(
      options.scope,
      options.releaseLockOnEnd
        ? Effect.sync(() => reader.releaseLock())
        : Effect.promise(() => reader.cancel().catch(constVoid))
    ),
    pull
  )
}

/**
 * Creates a channel that pulls values from an `AsyncIterable`.
 *
 * **Details**
 *
 * Each yielded value is emitted as an output element. The iterator's return
 * value becomes the channel's done value. Thrown or rejected iterator errors
 * are converted with `onError`. If the channel scope closes early and the
 * iterator has a `return` method, that method is called.
 *
 * @category constructors
 * @since 4.0.0
 */
export const fromAsyncIterable = <A, D, E>(
  iterable: AsyncIterable<A, D>,
  onError: (error: unknown) => E
): Channel<A, E, D> =>
  fromTransform(Effect.fnUntraced(function*(_, scope) {
    const iter = iterable[Symbol.asyncIterator]()
    if (iter.return) {
      yield* Scope.addFinalizer(scope, Effect.promise(() => iter.return!()))
    }
    return Effect.flatMap(
      Effect.tryPromise({
        try: () => iter.next(),
        catch: onError
      }),
      (result) => result.done ? Cause.done(result.value) : Effect.succeed(result.value)
    )
  }))

/**
 * Creates a channel from an `AsyncIterable`, emitting each yielded value as a
 * single-element non-empty array.
 *
 * **Details**
 *
 * The iterator's return value becomes the channel's done value. Thrown or
 * rejected iterator errors are converted with `onError`. If the channel scope
 * closes early and the iterator has a `return` method, that method is called.
 *
 * @category constructors
 * @since 4.0.0
 */
export const fromAsyncIterableArray = <A, D, E>(
  iterable: AsyncIterable<A, D>,
  onError: (error: unknown) => E
): Channel<Arr.NonEmptyReadonlyArray<A>, E, D> => map(fromAsyncIterable(iterable, onError), Arr.of)

/**
 * Maps the output of this channel using the specified function.
 *
 * **Example** (Mapping channel output)
 *
 * ```ts import.meta.vitest
 * import { Channel, Data, Effect } from "effect"
 *
 * class TransformError extends Data.TaggedError("TransformError")<{
 *   readonly reason: string
 * }> {}
 *
 * // Basic mapping of channel values
 * const numbersChannel = Channel.fromIterable([1, 2, 3, 4, 5])
 * const doubledChannel = Channel.map(numbersChannel, (n) => n * 2)
 * Effect.runSync(Channel.runCollect(doubledChannel)) // => [2, 4, 6, 8, 10]
 *
 * // Transform string data
 * const wordsChannel = Channel.fromIterable(["hello", "world", "effect"])
 * const upperCaseChannel = Channel.map(wordsChannel, (word) => word.toUpperCase())
 * Effect.runSync(Channel.runCollect(upperCaseChannel)) // => ["HELLO", "WORLD", "EFFECT"]
 *
 * // Complex object transformation
 * type User = { id: number; name: string }
 * type UserDisplay = { displayName: string; isActive: boolean }
 *
 * const usersChannel = Channel.fromIterable([
 *   { id: 1, name: "Alice" },
 *   { id: 2, name: "Bob" }
 * ])
 * const displayChannel = Channel.map(usersChannel, (user): UserDisplay => ({
 *   displayName: `User: ${user.name}`,
 *   isActive: true
 * }))
 * Effect.runSync(Channel.runCollect(displayChannel)) // => [{ displayName: "User: Alice", isActive: true }, { displayName: "User: Bob", isActive: true }]
 * ```
 *
 * @category sequencing
 * @since 2.0.0
 */
export const map: {
  <OutElem, OutElem2>(
    f: (o: OutElem, i: number) => OutElem2
  ): <OutErr, OutDone, InElem, InErr, InDone, Env>(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>
  ) => Channel<OutElem2, OutErr, OutDone, InElem, InErr, InDone, Env>
  <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env, OutElem2>(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
    f: (o: OutElem, i: number) => OutElem2
  ): Channel<OutElem2, OutErr, OutDone, InElem, InErr, InDone, Env>
} = dual(
  2,
  <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env, OutElem2>(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
    f: (o: OutElem, i: number) => OutElem2
  ): Channel<OutElem2, OutErr, OutDone, InElem, InErr, InDone, Env> =>
    transformPull(self, (pull) =>
      Effect.sync(() => {
        let i = 0
        return Effect.map(pull, (o) => f(o, i++))
      }))
)

/**
 * Maps the done value of this channel using the specified function.
 *
 * @category sequencing
 * @since 4.0.0
 */
export const mapDone: {
  <OutDone, OutDone2>(
    f: (o: OutDone) => OutDone2
  ): <OutElem, OutErr, InElem, InErr, InDone, Env>(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>
  ) => Channel<OutElem, OutErr, OutDone2, InElem, InErr, InDone, Env>
  <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env, OutDone2>(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
    f: (o: OutDone) => OutDone2
  ): Channel<OutElem, OutErr, OutDone2, InElem, InErr, InDone, Env>
} = dual(
  2,
  <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env, OutDone2>(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
    f: (o: OutDone) => OutDone2
  ): Channel<OutElem, OutErr, OutDone2, InElem, InErr, InDone, Env> => mapDoneEffect(self, (o) => Effect.succeed(f(o)))
)

/**
 * Maps the done value of this channel using the specified effectful function.
 *
 * **When to use**
 *
 * Use when the terminal done value transformation needs services or can fail,
 * while emitted elements should pass through unchanged.
 *
 * @category sequencing
 * @since 4.0.0
 */
export const mapDoneEffect: {
  <OutDone, OutDone2, E, R>(
    f: (o: OutDone) => Effect.Effect<OutDone2, E, R>
  ): <OutElem, OutErr, InElem, InErr, InDone, Env>(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>
  ) => Channel<OutElem, OutErr | E, OutDone2, InElem, InErr, InDone, Env | R>
  <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env, OutDone2, E, R>(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
    f: (o: OutDone) => Effect.Effect<OutDone2, E, R>
  ): Channel<OutElem, OutErr | E, OutDone2, InElem, InErr, InDone, Env | R>
} = dual(
  2,
  <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env, OutDone2, E, R>(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
    f: (o: OutDone) => Effect.Effect<OutDone2, E, R>
  ): Channel<OutElem, OutErr | E, OutDone2, InElem, InErr, InDone, Env | R> =>
    transformPull(self, (pull) =>
      Effect.succeed(Pull.catchDone(
        pull,
        (done) => Effect.flatMap(f(done as OutDone), Cause.done)
      )))
)

const concurrencyIsSequential = (
  concurrency: Types.Concurrency | undefined
) => concurrency === undefined || (concurrency !== "unbounded" && concurrency <= 1)

/**
 * Maps each output element with an effectful function, preserving the source
 * channel's done value.
 *
 * **When to use**
 *
 * Use when transforming each channel output needs an Effect, service
 * dependency, failure channel, or configured concurrency.
 *
 * **Details**
 *
 * The mapping function receives the output element and its zero-based index.
 * By default elements are mapped sequentially. Use `options.concurrency` to
 * map multiple elements concurrently, and `options.unordered` to allow
 * concurrently mapped outputs to be emitted as soon as they complete.
 *
 * **Example** (Mapping channel output with effects)
 *
 * ```ts import.meta.vitest
 * import { Channel, Effect } from "effect"
 *
 * const numbersChannel = Channel.fromIterable([1, 2, 3, 4, 5])
 * const processedChannel = Channel.mapEffect(
 *   numbersChannel,
 *   (n) => Effect.succeed(n * n)
 * )
 * await Effect.runPromise(Channel.runCollect(processedChannel)) // => [1, 4, 9, 16, 25]
 * ```
 *
 * @category sequencing
 * @since 2.0.0
 */
export const mapEffect: {
  <OutElem, OutElem1, OutErr1, Env1>(
    f: (d: OutElem, i: number) => Effect.Effect<OutElem1, OutErr1, Env1>,
    options?: {
      readonly concurrency?: Types.Concurrency | undefined
      readonly unordered?: boolean | undefined
    }
  ): <OutErr, OutDone, InElem, InErr, InDone, Env>(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>
  ) => Channel<OutElem1, OutErr1 | OutErr, OutDone, InElem, InErr, InDone, Env1 | Env>
  <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env, OutElem1, OutErr1, Env1>(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
    f: (d: OutElem, i: number) => Effect.Effect<OutElem1, OutErr1, Env1>,
    options?: {
      readonly concurrency?: Types.Concurrency | undefined
      readonly unordered?: boolean | undefined
    }
  ): Channel<OutElem1, OutErr | OutErr1, OutDone, InElem, InErr, InDone, Env | Env1>
} = dual(
  (args) => isChannel(args[0]),
  <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env, OutElem1, OutErr1, Env1>(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
    f: (d: OutElem, i: number) => Effect.Effect<OutElem1, OutErr1, Env1>,
    options?: {
      readonly concurrency?: Types.Concurrency | undefined
      readonly unordered?: boolean | undefined
    }
  ): Channel<OutElem1, OutErr | OutErr1, OutDone, InElem, InErr, InDone, Env | Env1> =>
    concurrencyIsSequential(options?.concurrency)
      ? mapEffectSequential(self, f)
      : mapEffectConcurrent(self, f, options as any)
)

const mapEffectSequential = <
  OutElem,
  OutErr,
  OutDone,
  InElem,
  InErr,
  InDone,
  Env,
  OutElem2,
  EX,
  RX
>(
  self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
  f: (o: OutElem, i: number) => Effect.Effect<OutElem2, EX, RX>
): Channel<OutElem2, OutErr | EX, OutDone, InElem, InErr, InDone, Env | RX> =>
  fromTransform((upstream, scope) => {
    let i = 0
    return Effect.map(toTransform(self)(upstream, scope), Effect.flatMap((o) => f(o, i++)))
  })

const mapEffectConcurrent = <
  OutElem,
  OutErr,
  OutDone,
  InElem,
  InErr,
  InDone,
  Env,
  OutElem2,
  EX,
  RX
>(
  self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
  f: (o: OutElem, i: number) => Effect.Effect<OutElem2, EX, RX>,
  options: {
    readonly concurrency: Types.Concurrency
    readonly unordered?: boolean | undefined
  }
): Channel<OutElem2, OutErr | EX, OutDone, InElem, InErr, InDone, Env | RX> =>
  fromTransformBracket(
    Effect.fnUntraced(function*(upstream, scope, forkedScope) {
      let i = 0
      const pull = yield* toTransform(self)(upstream, scope)
      const concurrencyN = options.concurrency === "unbounded"
        ? Number.MAX_SAFE_INTEGER
        : options.concurrency
      const queue = yield* Queue.bounded<OutElem2, OutErr | EX | Cause.Done<OutDone>>(0)
      yield* Scope.addFinalizer(forkedScope, Queue.shutdown(queue))

      const runFork = Effect.runForkWith(yield* Effect.context<RX>())
      const trackFiber = Fiber.runIn(forkedScope)

      if (options.unordered) {
        const semaphore = Semaphore.makeUnsafe(concurrencyN)
        const release = constant(semaphore.release(1))
        const handle = Effect.matchCauseEffect({
          onFailure: (cause: Cause.Cause<EX>) => Effect.flatMap(Queue.failCause(queue, cause), release),
          onSuccess: (value: OutElem2) => Effect.flatMap(Queue.offer(queue, value), release)
        })
        yield* semaphore.take(1).pipe(
          Effect.flatMap(() => pull),
          Effect.flatMap((value) => {
            const index = i++
            trackFiber(runFork(handle(Effect.suspend(() => f(value, index)))))
            return Effect.void
          }),
          Effect.forever({ disableYield: true }),
          Effect.catchCause((cause) =>
            semaphore.withPermits(concurrencyN - 1)(
              Queue.failCause(queue, cause)
            )
          ),
          Effect.forkIn(forkedScope)
        )
      } else {
        // capacity is n - 2 because
        // - 1 for the offer *after* starting a fiber
        // - 1 for the current processing fiber
        const effects = yield* Queue.bounded<
          Effect.Effect<OutElem2, OutErr | EX | Cause.Done<OutDone>>,
          OutErr | EX | Cause.Done<OutDone>
        >(concurrencyN - 2)
        yield* Scope.addFinalizer(forkedScope, Queue.shutdown(effects))

        yield* Queue.take(effects).pipe(
          Effect.flatten,
          Effect.flatMap((value) => Queue.offer(queue, value)),
          Effect.forever({ disableYield: true }),
          Effect.catchCause((cause) => Queue.failCause(queue, cause)),
          Effect.forkIn(forkedScope)
        )

        let errorCause: Cause.Cause<EX> | undefined
        const onExit = (exit: Exit.Exit<OutElem2, EX>) => {
          if (exit._tag === "Success") return
          errorCause = exit.cause
          Queue.failCauseUnsafe(queue, exit.cause)
        }
        yield* pull.pipe(
          Effect.flatMap((value) => {
            if (errorCause) return Effect.failCause(errorCause)
            const index = i++
            const fiber = runFork(Effect.suspend(() => f(value, index)))
            trackFiber(fiber)
            fiber.addObserver(onExit)
            return Queue.offer(effects, Fiber.join(fiber))
          }),
          Effect.forever({ disableYield: true }),
          Effect.catchCause((cause) =>
            Queue.offer(effects, Exit.failCause(cause)).pipe(
              Effect.andThen(Queue.failCause(effects, cause))
            )
          ),
          Effect.forkIn(forkedScope)
        )
      }

      return Queue.take(queue)
    })
  )

/**
 * Returns a new channel which is the same as this one but applies the given
 * function to the input channel’s input elements.
 *
 * @category sequencing
 * @since 2.0.0
 */
export const mapInput: {
  <InElem, InElem2, InErr, R = never>(
    f: (i: InElem2) => Effect.Effect<InElem, InErr, R>
  ): <OutElem, OutErr, OutDone, InErr, InDone, Env>(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env | R>
  ) => Channel<OutElem, OutErr, OutDone, InElem2, InErr, InDone, Env>
  <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env, InElem2, R = never>(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
    f: (i: InElem2) => Effect.Effect<InElem, InErr, R>
  ): Channel<OutElem, OutErr, OutDone, InElem2, InErr, InDone, Env | R>
} = dual(2, <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env, InElem2, R = never>(
  self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
  f: (i: InElem2) => Effect.Effect<InElem, InErr, R>
): Channel<OutElem, OutErr, OutDone, InElem2, InErr, InDone, Env | R> =>
  fromTransform((upstream, scope) =>
    toTransform(self)(
      Effect.flatMap(upstream, (el) => f(el)) as Pull.Pull<InElem, InErr, InDone>,
      scope
    )
  ))

/**
 * Returns a new channel which is the same as this one but applies the given
 * function to the input errors.
 *
 * @category sequencing
 * @since 2.0.0
 */
export const mapInputError: {
  <InErr, InErr2, R = never>(
    f: (i: InErr2) => Effect.Effect<InErr, InErr, R>
  ): <OutElem, OutErr, OutDone, InElem, InDone, Env>(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env | R>
  ) => Channel<OutElem, OutErr, OutDone, InElem, InErr2, InDone, Env>
  <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env, InErr2, R = never>(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
    f: (i: InErr2) => Effect.Effect<InErr, InErr, R>
  ): Channel<OutElem, OutErr, OutDone, InElem, InErr2, InDone, Env | R>
} = dual(2, <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env, InErr2, R = never>(
  self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
  f: (i: InErr2) => Effect.Effect<InErr, InErr, R>
): Channel<OutElem, OutErr, OutDone, InElem, InErr2, InDone, Env | R> =>
  fromTransform((upstream, scope) =>
    toTransform(self)(
      Effect.catch(upstream, (err): Pull.Pull<never, InErr, InDone> => {
        if (Cause.isDone(err)) return Effect.fail(err)
        return Effect.flatMap(f(err), Effect.fail) as Pull.Pull<never, InErr, InDone>
      }),
      scope
    )
  ))

/**
 * Applies a side effect function to each output element of the channel,
 * returning a new channel that emits the same elements.
 *
 * **Details**
 *
 * The `tap` function allows you to perform side effects (like logging or
 * debugging) on each element emitted by a channel without modifying the
 * elements themselves.
 *
 * **Example** (Tapping channel output)
 *
 * ```ts import.meta.vitest
 * import { Channel, Data, Effect } from "effect"
 *
 * class LogError extends Data.TaggedError("LogError")<{
 *   readonly message: string
 * }> {}
 *
 * // Create a channel that outputs numbers
 * const numberChannel = Channel.fromIterable([1, 2, 3])
 *
 * // Tap into each output element to perform side effects
 * const processed: Array<number> = []
 * const tappedChannel = Channel.tap(
 *   numberChannel,
 *   (n) => Effect.sync(() => processed.push(n))
 * )
 *
 * const observed = [await Effect.runPromise(Channel.runCollect(tappedChannel)), processed] // => [[1, 2, 3], [1, 2, 3]]
 * ```
 *
 * @category sequencing
 * @since 4.0.0
 */
export const tap: {
  <OutElem, X, OutErr1, Env1>(
    f: (d: Types.NoInfer<OutElem>) => Effect.Effect<X, OutErr1, Env1>,
    options?: {
      readonly concurrency?: Types.Concurrency | undefined
    }
  ): <OutErr, OutDone, InElem, InErr, InDone, Env>(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>
  ) => Channel<OutElem, OutErr1 | OutErr, OutDone, InElem, InErr, InDone, Env1 | Env>
  <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env, X, OutErr1, Env1>(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
    f: (d: Types.NoInfer<OutElem>) => Effect.Effect<X, OutErr1, Env1>,
    options?: {
      readonly concurrency?: Types.Concurrency | undefined
    }
  ): Channel<OutElem, OutErr | OutErr1, OutDone, InElem, InErr, InDone, Env | Env1>
} = dual(
  (args) => isChannel(args[0]),
  <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env, X, OutErr1, Env1>(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
    f: (d: Types.NoInfer<OutElem>) => Effect.Effect<X, OutErr1, Env1>,
    options?: {
      readonly concurrency?: Types.Concurrency | undefined
    }
  ): Channel<OutElem, OutErr | OutErr1, OutDone, InElem, InErr, InDone, Env | Env1> =>
    mapEffect(self, (a) => Effect.as(f(a), a), options)
)

/**
 * Maps each output element to a channel and flattens the child channel
 * outputs.
 *
 * **Details**
 *
 * The source channel's done value is preserved. Child channel done values are
 * used only for child-channel completion. By default child channels are run
 * sequentially. Use `options.concurrency` and `options.bufferSize` to run child
 * channels concurrently.
 *
 * **Example** (Flat mapping channel output)
 *
 * ```ts import.meta.vitest
 * import { Channel, Data, Effect } from "effect"
 *
 * class ProcessError extends Data.TaggedError("ProcessError")<{
 *   readonly cause: string
 * }> {}
 *
 * // Create a channel that outputs numbers
 * const numberChannel = Channel.fromIterable([1, 2, 3])
 *
 * // FlatMap each number to create new channels
 * const flatMappedChannel = Channel.flatMap(
 *   numberChannel,
 *   (n) =>
 *     Channel.fromIterable(Array.from({ length: n }, (_, i) => `item-${n}-${i}`))
 * )
 *
 * Effect.runSync(Channel.runCollect(flatMappedChannel)) // => ["item-1-0", "item-2-0", "item-2-1", "item-3-0", "item-3-1", "item-3-2"]
 * ```
 *
 * @category sequencing
 * @since 2.0.0
 */
export const flatMap: {
  <OutElem, OutElem1, OutErr1, OutDone1, InElem1, InErr1, InDone1, Env1>(
    f: (d: OutElem) => Channel<OutElem1, OutErr1, OutDone1, InElem1, InErr1, InDone1, Env1>,
    options?: {
      readonly concurrency?: Types.Concurrency | undefined
      readonly bufferSize?: number | undefined
    }
  ): <OutErr, OutDone, InElem, InErr, InDone, Env>(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>
  ) => Channel<
    OutElem1,
    OutErr1 | OutErr,
    OutDone,
    InElem & InElem1,
    InErr & InErr1,
    InDone & InDone1,
    Env1 | Env
  >
  <
    OutElem,
    OutErr,
    OutDone,
    InElem,
    InErr,
    InDone,
    Env,
    OutElem1,
    OutErr1,
    OutDone1,
    InElem1,
    InErr1,
    InDone1,
    Env1
  >(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
    f: (d: OutElem) => Channel<OutElem1, OutErr1, OutDone1, InElem1, InErr1, InDone1, Env1>,
    options?: {
      readonly concurrency?: Types.Concurrency | undefined
      readonly bufferSize?: number | undefined
    }
  ): Channel<
    OutElem1,
    OutErr | OutErr1,
    OutDone,
    InElem & InElem1,
    InErr & InErr1,
    InDone & InDone1,
    Env | Env1
  >
} = dual(
  (args) => isChannel(args[0]),
  <
    OutElem,
    OutErr,
    OutDone,
    InElem,
    InErr,
    InDone,
    Env,
    OutElem1,
    OutErr1,
    OutDone1,
    InElem1,
    InErr1,
    InDone1,
    Env1
  >(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
    f: (d: OutElem) => Channel<OutElem1, OutErr1, OutDone1, InElem1, InErr1, InDone1, Env1>,
    options?: {
      readonly concurrency?: Types.Concurrency | undefined
      readonly bufferSize?: number | undefined
    }
  ): Channel<
    OutElem1,
    OutErr | OutErr1,
    OutDone,
    InElem & InElem1,
    InErr & InErr1,
    InDone & InDone1,
    Env | Env1
  > =>
    concurrencyIsSequential(options?.concurrency)
      ? flatMapSequential(self, f)
      : flatMapConcurrent(self, f, options as any)
)

const flatMapSequential = <
  OutElem,
  OutErr,
  OutDone,
  InElem,
  InErr,
  InDone,
  Env,
  OutElem1,
  OutErr1,
  OutDone1,
  InElem1,
  InErr1,
  InDone1,
  Env1
>(
  self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
  f: (d: OutElem) => Channel<OutElem1, OutErr1, OutDone1, InElem1, InErr1, InDone1, Env1>
): Channel<
  OutElem1,
  OutErr | OutErr1,
  OutDone,
  InElem & InElem1,
  InErr & InErr1,
  InDone & InDone1,
  Env | Env1
> =>
  fromTransform((upstream, scope) =>
    Effect.map(toTransform(self)(upstream, scope), (pull) => {
      let childPull: Effect.Effect<OutElem1, OutErr1, Env1> | undefined
      let childScope: Scope.Closeable | undefined
      const makePull: Pull.Pull<
        OutElem1,
        OutErr | OutErr1,
        OutDone,
        Env1
      > = Effect.flatMap(pull, (value) => {
        childScope ??= Scope.forkUnsafe(scope)
        return Effect.flatMapEager(toTransform(f(value))(upstream, childScope), (pull) => {
          childPull = catchHalt(pull) as any
          return childPull!
        })
      })
      const catchHalt = Pull.catchDone((_) => {
        childPull = undefined
        // the scope can be reused if the inner channel left no finalizers behind
        if (childScope!.state._tag === "Empty") {
          return makePull
        }
        const close = Scope.close(childScope!, Exit.void)
        childScope = undefined
        return Effect.flatMap(close, () => makePull)
      })
      return Effect.suspend(() => childPull ?? makePull)
    })
  )

const flatMapConcurrent = <
  OutElem,
  OutErr,
  OutDone,
  InElem,
  InErr,
  InDone,
  Env,
  OutElem1,
  OutErr1,
  OutDone1,
  InElem1,
  InErr1,
  InDone1,
  Env1
>(
  self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
  f: (d: OutElem) => Channel<OutElem1, OutErr1, OutDone1, InElem1, InErr1, InDone1, Env1>,
  options: {
    readonly concurrency: Types.Concurrency
    readonly bufferSize?: number | undefined
  }
): Channel<
  OutElem1,
  OutErr | OutErr1,
  OutDone,
  InElem & InElem1,
  InErr & InErr1,
  InDone & InDone1,
  Env | Env1
> => self.pipe(map(f), mergeAll(options))

/**
 * Concatenates this channel with another channel created from the terminal value
 * of this channel. The new channel is created using the provided function.
 *
 * **Example** (Concatenating with completion values)
 *
 * ```ts import.meta.vitest
 * import { Channel, Data, Effect } from "effect"
 *
 * class ConcatError extends Data.TaggedError("ConcatError")<{
 *   readonly reason: string
 * }> {}
 *
 * // Create a channel that outputs numbers and terminates with sum
 * const numberChannel = Channel.fromIterable([1, 2, 3]).pipe(
 *   Channel.concatWith((sum: void) => Channel.succeed(`Completed processing`))
 * )
 *
 * Effect.runSync(Channel.runCollect(numberChannel)) // => [1, 2, 3, "Completed processing"]
 * ```
 *
 * @category sequencing
 * @since 4.0.0
 */
export const concatWith: {
  <OutDone, OutElem1, OutErr1, OutDone1, InElem1, InErr1, InDone1, Env1>(
    f: (leftover: Types.NoInfer<OutDone>) => Channel<OutElem1, OutErr1, OutDone1, InElem1, InErr1, InDone1, Env1>
  ): <OutElem, OutErr, InElem, InErr, InDone, Env>(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>
  ) => Channel<
    OutElem | OutElem1,
    OutErr1 | OutErr,
    OutDone1,
    InElem & InElem1,
    InErr & InErr1,
    InDone & InDone1,
    Env1 | Env
  >
  <
    OutElem,
    OutErr,
    OutDone,
    InElem,
    InErr,
    InDone,
    Env,
    OutElem1,
    OutErr1,
    OutDone1,
    InElem1,
    InErr1,
    InDone1,
    Env1
  >(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
    f: (leftover: Types.NoInfer<OutDone>) => Channel<OutElem1, OutErr1, OutDone1, InElem1, InErr1, InDone1, Env1>
  ): Channel<
    OutElem | OutElem1,
    OutErr1 | OutErr,
    OutDone1,
    InElem & InElem1,
    InErr & InErr1,
    InDone & InDone1,
    Env1 | Env
  >
} = dual(2, <
  OutElem,
  OutErr,
  OutDone,
  InElem,
  InErr,
  InDone,
  Env,
  OutElem1,
  OutErr1,
  OutDone1,
  InElem1,
  InErr1,
  InDone1,
  Env1
>(
  self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
  f: (leftover: Types.NoInfer<OutDone>) => Channel<OutElem1, OutErr1, OutDone1, InElem1, InErr1, InDone1, Env1>
): Channel<
  OutElem | OutElem1,
  OutErr1 | OutErr,
  OutDone1,
  InElem & InElem1,
  InErr & InErr1,
  InDone & InDone1,
  Env1 | Env
> =>
  fromTransform((upstream, scope) =>
    Effect.sync(() => {
      let currentPull: Pull.Pull<OutElem | OutElem1, OutErr1 | OutErr, OutDone1, Env1 | Env> | undefined
      const forkedScope = Scope.forkUnsafe(scope)
      const makePull = Effect.flatMap(toTransform(self)(upstream, forkedScope), (pull) => {
        currentPull = Pull.catchDone(pull, (leftover) => {
          return Scope.close(forkedScope, Exit.void).pipe(
            Effect.flatMap(() => toTransform(f(leftover as OutDone))(upstream, scope)),
            Effect.flatMap((pull) => {
              currentPull = pull
              return pull
            })
          )
        })
        return currentPull
      })
      return Effect.suspend(() => currentPull ?? makePull)
    })
  ))

/**
 * Concatenates this channel with another channel, so that the second channel
 * starts emitting values after the first channel has completed.
 *
 * **Example** (Concatenating channels)
 *
 * ```ts import.meta.vitest
 * import { Channel, Data, Effect } from "effect"
 *
 * class ConcatError extends Data.TaggedError("ConcatError")<{
 *   readonly reason: string
 * }> {}
 *
 * // Create two channels
 * const firstChannel = Channel.fromIterable([1, 2, 3])
 * const secondChannel = Channel.fromIterable(["a", "b", "c"])
 *
 * // Concatenate them
 * const concatenatedChannel = Channel.concat(firstChannel, secondChannel)
 *
 * Effect.runSync(Channel.runCollect(concatenatedChannel)) // => [1, 2, 3, "a", "b", "c"]
 * ```
 *
 * @category sequencing
 * @since 4.0.0
 */
export const concat: {
  <OutElem1, OutErr1, OutDone1, InElem1, InErr1, InDone1, Env1>(
    that: Channel<OutElem1, OutErr1, OutDone1, InElem1, InErr1, InDone1, Env1>
  ): <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>
  ) => Channel<
    OutElem | OutElem1,
    OutErr1 | OutErr,
    OutDone1,
    InElem & InElem1,
    InErr & InErr1,
    InDone & InDone1,
    Env1 | Env
  >
  <
    OutElem,
    OutErr,
    OutDone,
    InElem,
    InErr,
    InDone,
    Env,
    OutElem1,
    OutErr1,
    OutDone1,
    InElem1,
    InErr1,
    InDone1,
    Env1
  >(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
    that: Channel<OutElem1, OutErr1, OutDone1, InElem1, InErr1, InDone1, Env1>
  ): Channel<
    OutElem | OutElem1,
    OutErr1 | OutErr,
    OutDone1,
    InElem & InElem1,
    InErr & InErr1,
    InDone & InDone1,
    Env1 | Env
  >
} = dual(2, <
  OutElem,
  OutErr,
  OutDone,
  InElem,
  InErr,
  InDone,
  Env,
  OutElem1,
  OutErr1,
  OutDone1,
  InElem1,
  InErr1,
  InDone1,
  Env1
>(
  self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
  that: Channel<OutElem1, OutErr1, OutDone1, InElem1, InErr1, InDone1, Env1>
): Channel<
  OutElem | OutElem1,
  OutErr1 | OutErr,
  OutDone1,
  InElem & InElem1,
  InErr & InErr1,
  InDone & InDone1,
  Env1 | Env
> => concatWith(self, (_) => that))

/**
 * Combines two channels with a stateful pull function.
 *
 * **When to use**
 *
 * Use to coordinate pulling from two channels when each output element depends
 * on both sides and local state.
 *
 * **Details**
 *
 * The combining function receives the current state and pull functions for the
 * left and right channels. It returns the next output element together with the
 * next state.
 *
 * @category sequencing
 * @since 4.0.0
 */
export const combine: {
  <OutElem2, OutErr2, OutDone2, InElem2, InErr2, InDone2, Env2, S, OutElem, OutErr, OutDone, A, E, R>(
    that: Channel<OutElem2, OutErr2, OutDone2, InElem2, InErr2, InDone2, Env2>,
    s: LazyArg<S>,
    f: (
      s: S,
      pullLeft: Pull.Pull<OutElem, OutErr, OutDone>,
      pullRight: Pull.Pull<OutElem2, OutErr2, OutDone2>
    ) => Effect.Effect<readonly [A, S], E, R>
  ): <InElem, InErr, InDone, Env>(self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>) => Channel<
    A,
    Pull.ExcludeDone<E>,
    Cause.Done.Extract<E>,
    InElem & InElem2,
    InErr & InErr2,
    InDone & InDone2,
    Env | Env2 | R
  >
  <
    OutElem,
    OutErr,
    OutDone,
    InElem,
    InErr,
    InDone,
    Env,
    OutElem2,
    OutErr2,
    OutDone2,
    InElem2,
    InErr2,
    InDone2,
    Env2,
    S,
    A,
    E,
    R
  >(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
    that: Channel<OutElem2, OutErr2, OutDone2, InElem2, InErr2, InDone2, Env2>,
    s: LazyArg<S>,
    f: (
      s: S,
      pullLeft: Pull.Pull<OutElem, OutErr, OutDone>,
      pullRight: Pull.Pull<OutElem2, OutErr2, OutDone2>
    ) => Effect.Effect<readonly [A, S], E, R>
  ): Channel<
    A,
    Pull.ExcludeDone<E>,
    Cause.Done.Extract<E>,
    InElem & InElem2,
    InErr & InErr2,
    InDone & InDone2,
    Env | Env2 | R
  >
} = dual(4, <
  OutElem,
  OutErr,
  OutDone,
  InElem,
  InErr,
  InDone,
  Env,
  OutElem2,
  OutErr2,
  OutDone2,
  InElem2,
  InErr2,
  InDone2,
  Env2,
  S,
  A,
  E,
  R
>(
  self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
  that: Channel<OutElem2, OutErr2, OutDone2, InElem2, InErr2, InDone2, Env2>,
  s: LazyArg<S>,
  f: (
    s: S,
    pullLeft: Pull.Pull<OutElem, OutErr, OutDone>,
    pullRight: Pull.Pull<OutElem2, OutErr2, OutDone2>
  ) => Effect.Effect<readonly [A, S], E, R>
): Channel<
  A,
  Pull.ExcludeDone<E>,
  Cause.Done.Extract<E>,
  InElem & InElem2,
  InErr & InErr2,
  InDone & InDone2,
  Env | Env2 | R
> =>
  fromTransform(Effect.fnUntraced(function*(upstream, scope) {
    const leftPull = yield* toTransform(self)(upstream, scope)
    const rightPull = yield* toTransform(that)(upstream, scope)
    let state = s()
    return Effect.suspend(() => {
      const combinedPull = f(state, leftPull, rightPull)
      return Effect.map(combinedPull, ([a, s1]) => {
        state = s1
        return a
      })
    })
  })))

/**
 * Runs a fallback channel if this channel completes without emitting any
 * output elements.
 *
 * **Details**
 *
 * If the source emits at least one element, the source is used unchanged. If
 * the source completes before emitting an element, the fallback function
 * receives the source done value and returns the replacement channel.
 *
 * @category sequencing
 * @since 4.0.0
 */
export const orElseIfEmpty: {
  <OutDone, OutElem1, OutErr1, OutDone1, InElem1, InErr1, InDone1, Env1>(
    f: (leftover: Types.NoInfer<OutDone>) => Channel<OutElem1, OutErr1, OutDone1, InElem1, InErr1, InDone1, Env1>
  ): <OutElem, OutErr, InElem, InErr, InDone, Env>(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>
  ) => Channel<
    OutElem | OutElem1,
    OutErr1 | OutErr,
    OutDone | OutDone1,
    InElem & InElem1,
    InErr & InErr1,
    InDone & InDone1,
    Env1 | Env
  >
  <
    OutElem,
    OutErr,
    OutDone,
    InElem,
    InErr,
    InDone,
    Env,
    OutElem1,
    OutErr1,
    OutDone1,
    InElem1,
    InErr1,
    InDone1,
    Env1
  >(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
    f: (leftover: Types.NoInfer<OutDone>) => Channel<OutElem1, OutErr1, OutDone1, InElem1, InErr1, InDone1, Env1>
  ): Channel<
    OutElem | OutElem1,
    OutErr1 | OutErr,
    OutDone | OutDone1,
    InElem & InElem1,
    InErr & InErr1,
    InDone & InDone1,
    Env1 | Env
  >
} = dual(2, <
  OutElem,
  OutErr,
  OutDone,
  InElem,
  InErr,
  InDone,
  Env,
  OutElem1,
  OutErr1,
  OutDone1,
  InElem1,
  InErr1,
  InDone1,
  Env1
>(
  self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
  f: (leftover: Types.NoInfer<OutDone>) => Channel<OutElem1, OutErr1, OutDone1, InElem1, InErr1, InDone1, Env1>
): Channel<
  OutElem | OutElem1,
  OutErr1 | OutErr,
  OutDone | OutDone1,
  InElem & InElem1,
  InErr & InErr1,
  InDone & InDone1,
  Env1 | Env
> =>
  fromTransform((upstream, scope) =>
    Effect.sync(() => {
      let currentPull: Pull.Pull<OutElem | OutElem1, OutErr1 | OutErr, OutDone | OutDone1, Env1 | Env> | undefined
      const forkedScope = Scope.forkUnsafe(scope)
      const makePull = Effect.flatMap(toTransform(self)(upstream, forkedScope), (pull) => {
        const next = pull.pipe(
          Effect.tap(() => {
            currentPull = pull
            return Effect.void
          }),
          Pull.catchDone((leftover) =>
            Scope.close(forkedScope, Exit.succeed(leftover)).pipe(
              Effect.andThen(toTransform(f(leftover as OutDone))(upstream, scope)),
              Effect.flatMap((pull) => {
                currentPull = pull
                return pull
              })
            )
          )
        )
        currentPull = next
        return next
      })
      return Effect.suspend(() => currentPull ?? makePull)
    })
  ))

/**
 * Flattens a channel of channels.
 *
 * **Example** (Flattening nested channels)
 *
 * ```ts import.meta.vitest
 * import { Channel, Data, Effect } from "effect"
 *
 * class FlattenError extends Data.TaggedError("FlattenError")<{
 *   readonly cause: string
 * }> {}
 *
 * // Create a channel that outputs channels
 * const nestedChannels = Channel.fromIterable([
 *   Channel.fromIterable([1, 2]),
 *   Channel.fromIterable([3, 4]),
 *   Channel.fromIterable([5, 6])
 * ])
 *
 * // Flatten the nested channels
 * const flattenedChannel = Channel.flatten(nestedChannels)
 *
 * Effect.runSync(Channel.runCollect(flattenedChannel)) // => [1, 2, 3, 4, 5, 6]
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const flatten = <
  OutElem,
  OutErr,
  OutDone,
  InElem,
  InErr,
  InDone,
  Env,
  OutErr1,
  OutDone1,
  InElem1,
  InErr1,
  InDone1,
  Env1
>(
  channels: Channel<
    Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
    OutErr1,
    OutDone1,
    InElem1,
    InErr1,
    InDone1,
    Env1
  >
): Channel<OutElem, OutErr | OutErr1, OutDone1, InElem & InElem1, InErr & InErr1, InDone & InDone1, Env | Env1> =>
  flatMap(channels, identity_)

/**
 * Flattens a channel that outputs arrays into a channel that outputs individual elements.
 *
 * **Example** (Flattening arrays of channel output)
 *
 * ```ts import.meta.vitest
 * import { Channel, Data, Effect } from "effect"
 *
 * class FlattenError extends Data.TaggedError("FlattenError")<{
 *   readonly message: string
 * }> {}
 *
 * // Create a channel that outputs arrays
 * const arrayChannel = Channel.fromIterable([
 *   [1, 2, 3],
 *   [4, 5],
 *   [6, 7, 8, 9]
 * ])
 *
 * // Flatten the arrays into individual elements
 * const flattenedChannel = Channel.flattenArray(arrayChannel)
 *
 * Effect.runSync(Channel.runCollect(flattenedChannel)) // => [1, 2, 3, 4, 5, 6, 7, 8, 9]
 * ```
 *
 * @category transforming
 * @since 4.0.0
 */
export const flattenArray = <
  OutElem,
  OutErr,
  OutDone,
  InElem,
  InErr,
  InDone,
  Env
>(
  self: Channel<ReadonlyArray<OutElem>, OutErr, OutDone, InElem, InErr, InDone, Env>
): Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env> =>
  transformPull(self, (pull) => {
    let array: ReadonlyArray<OutElem> | undefined
    let index = 0
    const pump = Effect.suspend(function loop(): Pull.Pull<OutElem, OutErr, OutDone> {
      if (array === undefined) {
        return Effect.flatMap(pull, (array_) => {
          switch (array_.length) {
            case 0:
              return loop()
            case 1:
              return Effect.succeed(array_[0])
            default: {
              array = array_
              return Effect.succeed(array_[index++])
            }
          }
        })
      }
      const next = array[index++]
      if (index >= array.length) {
        array = undefined
        index = 0
      }
      return Effect.succeed(next)
    })
    return Effect.succeed(pump)
  })

/**
 * Flattens a channel that emits `Take` values into a channel that emits the
 * `Take` outputs directly.
 *
 * **Details**
 *
 * Output `Take` values are emitted as non-empty arrays. Failed `Take` values
 * fail the returned channel. Done `Take` values complete the returned channel.
 *
 * @category transforming
 * @since 4.0.0
 */
export const flattenTake = <
  OutElem,
  OutErr,
  OutDone,
  OutErr2,
  OutDone2,
  InElem,
  InErr,
  InDone,
  Env
>(
  self: Channel<Take.Take<OutElem, OutErr, OutDone>, OutErr2, OutDone2, InElem, InErr, InDone, Env>
): Channel<Arr.NonEmptyReadonlyArray<OutElem>, OutErr | OutErr2, OutDone, InElem, InErr, InDone, Env> =>
  mapEffectSequential(self, Take.toPull) as any

/**
 * Creates a new channel that consumes all output from the source channel
 * but emits nothing, preserving only the completion value.
 *
 * **Example** (Draining channel output)
 *
 * ```ts import.meta.vitest
 * import { Channel, Effect } from "effect"
 *
 * // Create a channel that outputs values
 * const sourceChannel = Channel.fromIterable([1, 2, 3, 4, 5])
 *
 * // Drain all output, keeping only the completion
 * const drainedChannel = Channel.drain(sourceChannel)
 *
 * Effect.runSync(Channel.runCollect(drainedChannel)) // => []
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const drain = <
  OutElem,
  OutErr,
  OutDone,
  InElem,
  InErr,
  InDone,
  Env
>(
  self: Channel<
    OutElem,
    OutErr,
    OutDone,
    InElem,
    InErr,
    InDone,
    Env
  >
): Channel<never, OutErr, OutDone, InElem, InErr, InDone, Env> =>
  transformPull(self, (pull) => Effect.succeed(Effect.forever(pull, { disableYield: true })))

/**
 * Repeats this channel according to the provided schedule.
 *
 * @category repetition
 * @since 4.0.0
 */
export const repeat: {
  <SO, OutDone, SE, SR>(
    schedule:
      | Schedule.Schedule<SO, Types.NoInfer<OutDone>, SE, SR>
      | ((
        $: <SO, SE, SR>(_: Schedule.Schedule<SO, NoInfer<OutDone>, SE, SR>) => Schedule.Schedule<SO, OutDone, SE, SR>
      ) => Schedule.Schedule<SO, Types.NoInfer<OutDone>, SE, SR>)
  ): <OutElem, OutErr, InElem, InErr, InDone, Env>(
    self: Channel<OutElem, OutErr | SE, OutDone, InElem, InErr, InDone, Env | SR>
  ) => Channel<OutElem, OutErr | SE, OutDone, InElem, InErr, InDone, Env | SR>
  <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env, SO, SE, SR>(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
    schedule:
      | Schedule.Schedule<SO, OutDone, SE, SR>
      | ((
        $: <SO, SE, SR>(_: Schedule.Schedule<SO, NoInfer<OutDone>, SE, SR>) => Schedule.Schedule<SO, OutDone, SE, SR>
      ) => Schedule.Schedule<SO, Types.NoInfer<OutDone>, SE, SR>)
  ): Channel<OutElem, OutErr | SE, OutDone, InElem, InErr, InDone, Env | SR>
} = dual(2, <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env, SO, SE, SR>(
  self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
  schedule:
    | Schedule.Schedule<SO, OutDone, SE, SR>
    | ((
      $: <SO, SE, SR>(_: Schedule.Schedule<SO, NoInfer<OutDone>, SE, SR>) => Schedule.Schedule<SO, OutDone, SE, SR>
    ) => Schedule.Schedule<SO, Types.NoInfer<OutDone>, SE, SR>)
): Channel<OutElem, OutErr | SE, OutDone, InElem, InErr, InDone, Env | SR> =>
  Schedule.toStepWithMetadata(typeof schedule === "function" ? schedule(identity_) : schedule).pipe(
    Effect.map((step) => {
      let meta = Schedule.CurrentMetadata.defaultValue()
      return repeatLoop(
        provideServiceEffect(self, Schedule.CurrentMetadata, Effect.sync(() => meta)),
        (done) =>
          step(done).pipe(
            Effect.map((meta_) => {
              meta = meta_
            }),
            Pull.catchDone(() => Cause.done(done))
          )
      )
    }),
    unwrap
  ))

const repeatLoop = <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env, E, OutDone2, R>(
  self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
  onDone: (done: OutDone) => Pull.Pull<void, E, OutDone2, R>
): Channel<OutElem, OutErr | E, OutDone2, InElem, InErr, InDone, Env | R> =>
  fromTransform((upstream, scope) =>
    Effect.sync(() => {
      let currentPull: Pull.Pull<OutElem, OutErr | E, OutDone2, Env | R> | undefined
      const makePull = (): Pull.Pull<OutElem, OutErr | E, OutDone2, Env | R> => {
        const runScope = Scope.forkUnsafe(scope)
        return Effect.flatMap(toTransform(self)(upstream, runScope), (pull) => {
          currentPull = Pull.catchDone(pull, (done) =>
            Scope.close(runScope, Exit.void).pipe(
              Effect.flatMap(() => onDone(done as OutDone)),
              Effect.flatMap(makePull)
            ))
          return currentPull
        })
      }
      return Effect.suspend(() => currentPull ?? makePull())
    })
  )

/**
 * Repeats this channel forever.
 *
 * @category repetition
 * @since 4.0.0
 */
export const forever = <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>(
  self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>
): Channel<OutElem, OutErr, never, InElem, InErr, InDone, Env> => repeatLoop(self, () => Effect.void)

/**
 * Runs a schedule step for each output element while preserving the emitted
 * elements.
 *
 * **Details**
 *
 * The schedule receives each output element as input. Schedule delays are
 * applied between emitted elements. If the schedule fails, the returned channel
 * fails. If the schedule finishes, the returned channel completes with the
 * schedule output.
 *
 * @category sequencing
 * @since 4.0.0
 */
export const schedule: {
  <SO, OutElem, SE, SR>(
    schedule: Schedule.Schedule<SO, Types.NoInfer<OutElem>, SE, SR>
  ): <OutErr, OutDone, InElem, InErr, InDone, Env>(
    self: Channel<OutElem, OutErr | SE, OutDone, InElem, InErr, InDone, Env | SR>
  ) => Channel<OutElem, OutErr | SE, OutDone | SO, InElem, InErr, InDone, Env | SR>
  <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env, SO, SE, SR>(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
    schedule: Schedule.Schedule<SO, OutElem, SE, SR>
  ): Channel<OutElem, OutErr | SE, OutDone | SO, InElem, InErr, InDone, Env | SR>
} = dual(2, <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env, SO, SE, SR>(
  self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
  schedule: Schedule.Schedule<SO, OutElem, SE, SR>
): Channel<OutElem, OutErr | SE, OutDone | SO, InElem, InErr, InDone, Env | SR> =>
  transformPull(
    self,
    (pull, _scope) =>
      Effect.map(
        Schedule.toStepWithSleep(schedule),
        (step) => {
          const pullWithStep: Pull.Pull<
            OutElem,
            OutErr | SE,
            OutDone | SO,
            SR
          > = Effect.tap(pull, step)
          return pullWithStep
        }
      )
  ))

/**
 * Filters the output elements of a channel using a predicate function.
 * Elements that don't match the predicate are discarded.
 *
 * **Example** (Filtering channel output)
 *
 * ```ts import.meta.vitest
 * import { Channel, Effect } from "effect"
 *
 * // Create a channel with mixed numbers
 * const numbersChannel = Channel.fromIterable([1, 2, 3, 4, 5, 6, 7, 8])
 *
 * // Filter to keep only even numbers
 * const evenChannel = Channel.filter(numbersChannel, (n) => n % 2 === 0)
 * Effect.runSync(Channel.runCollect(evenChannel)) // => [2, 4, 6, 8]
 *
 * // Filter with type refinement
 * const mixedChannel = Channel.fromIterable([1, "hello", 2, "world", 3])
 * const numbersOnlyChannel = Channel.filter(
 *   mixedChannel,
 *   (value): value is number => typeof value === "number"
 * )
 * Effect.runSync(Channel.runCollect(numbersOnlyChannel)) // => [1, 2, 3]
 * ```
 *
 * @category filtering
 * @since 4.0.0
 */
export const filter: {
  <OutElem, B extends OutElem>(
    refinement: Predicate.Refinement<OutElem, B>
  ): <OutErr, OutDone, InElem, InErr, InDone, Env>(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>
  ) => Channel<B, OutErr, OutDone, InElem, InErr, InDone, Env>
  <OutElem>(
    predicate: Predicate.Predicate<OutElem>
  ): <OutErr, OutDone, InElem, InErr, InDone, Env>(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>
  ) => Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>
  <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env, B extends OutElem>(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
    refinement: Predicate.Refinement<OutElem, B>
  ): Channel<B, OutErr, OutDone, InElem, InErr, InDone, Env>
  <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
    predicate: Predicate.Predicate<OutElem>
  ): Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>
} = dual(2, <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>(
  self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
  predicate: Predicate.Predicate<OutElem>
): Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env> =>
  fromTransform((upstream, scope) =>
    Effect.map(
      toTransform(self)(upstream, scope),
      (pull) =>
        Effect.flatMap(pull, function loop(elem): Pull.Pull<OutElem, OutErr, OutDone> {
          return predicate(elem)
            ? Effect.succeed(elem)
            : Effect.flatMap(pull, loop)
        })
    )
  ))

/**
 * Filters and maps output elements using a `Filter`.
 *
 * **When to use**
 *
 * Use to keep only channel output elements accepted by a `Filter` and emit
 * each filter success value.
 *
 * **Details**
 *
 * Successful filter results are emitted as mapped values. Failed filter
 * results are discarded. The source channel's errors and done value are
 * preserved.
 *
 * @see {@link filter} for keeping original output elements with a predicate
 * @see {@link filterMapEffect} for using an effectful `Filter`
 * @see {@link filterMapArray} for filtering arrays of output elements
 *
 * @category filtering
 * @since 4.0.0
 */
export const filterMap: {
  <OutElem, B, X>(
    filter: Filter.Filter<OutElem, B, X>
  ): <OutErr, OutDone, InElem, InErr, InDone, Env>(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>
  ) => Channel<B, OutErr, OutDone, InElem, InErr, InDone, Env>
  <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env, B, X>(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
    filter: Filter.Filter<OutElem, B, X>
  ): Channel<B, OutErr, OutDone, InElem, InErr, InDone, Env>
} = dual(2, <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env, B, X>(
  self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
  filter: Filter.Filter<OutElem, B, X>
): Channel<B, OutErr, OutDone, InElem, InErr, InDone, Env> =>
  fromTransform((upstream, scope) =>
    Effect.map(
      toTransform(self)(upstream, scope),
      (pull) =>
        Effect.flatMap(pull, function loop(elem): Pull.Pull<B, OutErr, OutDone> {
          const result = filter(elem)
          return Result.isFailure(result)
            ? Effect.flatMap(pull, loop)
            : Effect.succeed(result.success)
        })
    )
  ))

/**
 * Filters output elements with an effectful predicate.
 *
 * **When to use**
 *
 * Use when the keep/discard decision depends on an Effect or service and
 * predicate failures should fail the returned channel.
 *
 * **Details**
 *
 * Elements for which the predicate succeeds with `true` are emitted. Elements
 * for which the predicate succeeds with `false` are discarded. Predicate
 * failures fail the returned channel.
 *
 * @category filtering
 * @since 4.0.0
 */
export const filterEffect: {
  <OutElem, E, R>(
    predicate: (a: OutElem) => Effect.Effect<boolean, E, R>
  ): <OutErr, OutDone, InElem, InErr, InDone, Env>(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>
  ) => Channel<OutElem, OutErr | E, OutDone, InElem, InErr, InDone, Env | R>
  <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env, E, R>(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
    predicate: (a: OutElem) => Effect.Effect<boolean, E, R>
  ): Channel<OutElem, OutErr | E, OutDone, InElem, InErr, InDone, Env | R>
} = dual(2, <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env, E, R>(
  self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
  predicate: (a: OutElem) => Effect.Effect<boolean, E, R>
): Channel<OutElem, OutErr | E, OutDone, InElem, InErr, InDone, Env | R> =>
  fromTransform((upstream, scope) =>
    Effect.map(
      toTransform(self)(upstream, scope),
      (pull) =>
        Effect.flatMap(pull, function loop(elem): Pull.Pull<OutElem, OutErr | E, OutDone, R> {
          return Effect.flatMap(
            predicate(elem),
            (passes) =>
              passes
                ? Effect.succeed(elem)
                : Effect.flatMap(pull, loop)
          )
        })
    )
  ))

/**
 * Filters and maps output elements using an effectful `Filter`.
 *
 * **When to use**
 *
 * Use to apply effectful logic that can discard channel output elements and
 * emit transformed values for the elements that pass.
 *
 * **Details**
 *
 * Successful filter results are emitted as mapped values. Failed filter
 * results are discarded. Failures from the effectful filter fail the returned
 * channel.
 *
 * @see {@link filterMap} for using a synchronous `Filter`
 * @see {@link filterEffect} for effectfully keeping original output elements
 * @see {@link mapEffect} for effectfully transforming every output element
 * @see {@link filterMapArrayEffect} for effectful filtering of array outputs
 *
 * @category filtering
 * @since 4.0.0
 */
export const filterMapEffect: {
  <OutElem, B, X, EX, RX>(
    filter: Filter.FilterEffect<OutElem, B, X, EX, RX>
  ): <OutErr, OutDone, InElem, InErr, InDone, Env>(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>
  ) => Channel<B, OutErr | EX, OutDone, InElem, InErr, InDone, Env | RX>
  <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env, B, X, EX, RX>(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
    filter: Filter.FilterEffect<OutElem, B, X, EX, RX>
  ): Channel<B, OutErr | EX, OutDone, InElem, InErr, InDone, Env | RX>
} = dual(2, <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env, B, X, EX, RX>(
  self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
  filter: Filter.FilterEffect<OutElem, B, X, EX, RX>
): Channel<B, OutErr | EX, OutDone, InElem, InErr, InDone, Env | RX> =>
  fromTransform((upstream, scope) =>
    Effect.map(
      toTransform(self)(upstream, scope),
      (pull) =>
        Effect.flatMap(pull, function loop(elem): Pull.Pull<B, OutErr | EX, OutDone, RX> {
          return Effect.flatMap(
            filter(elem),
            (result) =>
              Result.isFailure(result)
                ? Effect.flatMap(pull, loop)
                : Effect.succeed(result.success)
          )
        })
    )
  ))

/**
 * Filters arrays of elements emitted by a channel, applying the filter
 * to each element within the arrays and only emitting non-empty filtered arrays.
 *
 * **Example** (Filtering array output)
 *
 * ```ts import.meta.vitest
 * import { Array, Channel, Effect } from "effect"
 *
 * const nonEmptyArrayPredicate = Array.isReadonlyArrayNonEmpty
 *
 * // Create a channel that outputs arrays of mixed data
 * const arrayChannel = Channel.fromIterable([
 *   Array.make(1, 2, 3, 4, 5),
 *   Array.make(6, 7, 8, 9, 10),
 *   Array.make(11, 12, 13, 14, 15)
 * ]).pipe(Channel.filter(nonEmptyArrayPredicate))
 *
 * // Filter arrays to keep only even numbers
 * const evenArraysChannel = Channel.filterArray(arrayChannel, (n) => n % 2 === 0)
 * Effect.runSync(Channel.runCollect(evenArraysChannel)) // => [[2, 4], [6, 8, 10], [12, 14]]
 * // Note: Only non-empty filtered arrays are emitted
 *
 * // Arrays that would become empty after filtering are discarded entirely
 * const oddChannel = Channel.fromIterable([
 *   Array.make(1, 3, 5),
 *   Array.make(2, 4),
 *   Array.make(7, 9)
 * ]).pipe(Channel.filter(nonEmptyArrayPredicate))
 * const filteredOddChannel = Channel.filterArray(oddChannel, (n) => n % 2 === 0)
 * Effect.runSync(Channel.runCollect(filteredOddChannel)) // => [[2, 4]]
 * ```
 *
 * @category filtering
 * @since 4.0.0
 */
export const filterArray: {
  <OutElem, B extends OutElem>(
    refinement: Predicate.Refinement<OutElem, B>
  ): <OutErr, OutDone, InElem, InErr, InDone, Env>(
    self: Channel<Arr.NonEmptyReadonlyArray<OutElem>, OutErr, OutDone, InElem, InErr, InDone, Env>
  ) => Channel<Arr.NonEmptyReadonlyArray<B>, OutErr, OutDone, InElem, InErr, InDone, Env>
  <OutElem>(
    predicate: Predicate.Predicate<Types.NoInfer<OutElem>>
  ): <OutErr, OutDone, InElem, InErr, InDone, Env>(
    self: Channel<Arr.NonEmptyReadonlyArray<OutElem>, OutErr, OutDone, InElem, InErr, InDone, Env>
  ) => Channel<Arr.NonEmptyReadonlyArray<OutElem>, OutErr, OutDone, InElem, InErr, InDone, Env>
  <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env, B extends OutElem>(
    self: Channel<Arr.NonEmptyReadonlyArray<OutElem>, OutErr, OutDone, InElem, InErr, InDone, Env>,
    refinement: Predicate.Refinement<OutElem, B>
  ): Channel<Arr.NonEmptyReadonlyArray<B>, OutErr, OutDone, InElem, InErr, InDone, Env>
  <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>(
    self: Channel<Arr.NonEmptyReadonlyArray<OutElem>, OutErr, OutDone, InElem, InErr, InDone, Env>,
    predicate: Predicate.Predicate<Types.NoInfer<OutElem>>
  ): Channel<Arr.NonEmptyReadonlyArray<OutElem>, OutErr, OutDone, InElem, InErr, InDone, Env>
} = dual(2, <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>(
  self: Channel<Arr.NonEmptyReadonlyArray<OutElem>, OutErr, OutDone, InElem, InErr, InDone, Env>,
  predicate: Predicate.Predicate<Types.NoInfer<OutElem>>
): Channel<Arr.NonEmptyReadonlyArray<OutElem>, OutErr, OutDone, InElem, InErr, InDone, Env> =>
  transformPull(self, (pull) =>
    Effect.succeed(Effect.flatMap(
      pull,
      function loop(arr): Pull.Pull<Arr.NonEmptyReadonlyArray<OutElem>, OutErr, OutDone> {
        const passes: Array<OutElem> = []
        for (let i = 0; i < arr.length; i++) {
          if (predicate(arr[i] as Types.NoInfer<OutElem>)) {
            passes.push(arr[i])
          }
        }
        return Arr.isReadonlyArrayNonEmpty(passes)
          ? Effect.succeed(passes)
          : Effect.flatMap(pull, loop)
      }
    ))))

/**
 * Filters and maps each element inside emitted non-empty arrays using a
 * `Filter`.
 *
 * **Details**
 *
 * Successful filter results are kept as mapped values. Failed filter results
 * are removed from the array. Arrays that become empty are discarded.
 *
 * @category filtering
 * @since 4.0.0
 */
export const filterMapArray: {
  <OutElem, B, X>(
    filter: Filter.Filter<Types.NoInfer<OutElem>, B, X>
  ): <OutErr, OutDone, InElem, InErr, InDone, Env>(
    self: Channel<Arr.NonEmptyReadonlyArray<OutElem>, OutErr, OutDone, InElem, InErr, InDone, Env>
  ) => Channel<Arr.NonEmptyReadonlyArray<B>, OutErr, OutDone, InElem, InErr, InDone, Env>
  <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env, B, X>(
    self: Channel<Arr.NonEmptyReadonlyArray<OutElem>, OutErr, OutDone, InElem, InErr, InDone, Env>,
    filter: Filter.Filter<OutElem, B, X>
  ): Channel<Arr.NonEmptyReadonlyArray<B>, OutErr, OutDone, InElem, InErr, InDone, Env>
} = dual(2, <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env, B, X>(
  self: Channel<Arr.NonEmptyReadonlyArray<OutElem>, OutErr, OutDone, InElem, InErr, InDone, Env>,
  filter: Filter.Filter<OutElem, B, X>
): Channel<Arr.NonEmptyReadonlyArray<B>, OutErr, OutDone, InElem, InErr, InDone, Env> =>
  transformPull(self, (pull) =>
    Effect.succeed(Effect.flatMap(
      pull,
      function loop(arr): Pull.Pull<Arr.NonEmptyReadonlyArray<B>, OutErr, OutDone> {
        const passes: Array<B> = []
        for (let i = 0; i < arr.length; i++) {
          const result = filter(arr[i])
          if (Result.isSuccess(result)) {
            passes.push(result.success)
          }
        }
        return Arr.isReadonlyArrayNonEmpty(passes)
          ? Effect.succeed(passes)
          : Effect.flatMap(pull, loop)
      }
    ))))

/**
 * Filters each element inside emitted non-empty arrays with an effectful
 * predicate.
 *
 * **When to use**
 *
 * Use when filtering array-valued channel outputs requires Effects or services,
 * and arrays that become empty should be skipped.
 *
 * **Details**
 *
 * The predicate receives the element and its index within the array. Elements
 * for which the predicate succeeds with `true` are kept. Arrays that become
 * empty are discarded. Predicate failures fail the returned channel.
 *
 * @category filtering
 * @since 4.0.0
 */
export const filterArrayEffect: {
  <OutElem, E, R>(
    predicate: (a: Types.NoInfer<OutElem>, index: number) => Effect.Effect<boolean, E, R>
  ): <OutErr, OutDone, InElem, InErr, InDone, Env>(
    self: Channel<Arr.NonEmptyReadonlyArray<OutElem>, OutErr, OutDone, InElem, InErr, InDone, Env>
  ) => Channel<Arr.NonEmptyReadonlyArray<OutElem>, OutErr | E, OutDone, InElem, InErr, InDone, Env | R>
  <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env, E, R>(
    self: Channel<Arr.NonEmptyReadonlyArray<OutElem>, OutErr, OutDone, InElem, InErr, InDone, Env>,
    predicate: (a: Types.NoInfer<OutElem>, index: number) => Effect.Effect<boolean, E, R>
  ): Channel<Arr.NonEmptyReadonlyArray<OutElem>, OutErr | E, OutDone, InElem, InErr, InDone, Env | R>
} = dual(2, <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env, E, R>(
  self: Channel<Arr.NonEmptyReadonlyArray<OutElem>, OutErr, OutDone, InElem, InErr, InDone, Env>,
  predicate: (a: Types.NoInfer<OutElem>, index: number) => Effect.Effect<boolean, E, R>
): Channel<Arr.NonEmptyReadonlyArray<OutElem>, OutErr | E, OutDone, InElem, InErr, InDone, Env | R> =>
  transformPull(self, (pull) => {
    const f = Effect.flatMap(pull, (arr) => Effect.filter(arr, predicate))
    return Effect.succeed(Effect.flatMap(
      f,
      function loop(arr): Pull.Pull<Arr.NonEmptyReadonlyArray<OutElem>, OutErr | E, OutDone, R> {
        return Arr.isReadonlyArrayNonEmpty(arr) ? Effect.succeed(arr) : Effect.flatMap(f, loop)
      }
    ))
  }))

/**
 * Filters and maps each element inside emitted non-empty arrays using an
 * effectful `Filter`.
 *
 * **When to use**
 *
 * Use when array-valued channel outputs need an effectful filter-map that can
 * fail and can discard arrays that become empty.
 *
 * **Details**
 *
 * Successful filter results are kept as mapped values. Failed filter results
 * are removed from the array. Arrays that become empty are discarded. Failures
 * from the effectful filter fail the returned channel.
 *
 * @category filtering
 * @since 4.0.0
 */
export const filterMapArrayEffect: {
  <OutElem, B, X, EX, RX>(
    filter: Filter.FilterEffect<Types.NoInfer<OutElem>, B, X, EX, RX>
  ): <OutErr, OutDone, InElem, InErr, InDone, Env>(
    self: Channel<Arr.NonEmptyReadonlyArray<OutElem>, OutErr, OutDone, InElem, InErr, InDone, Env>
  ) => Channel<Arr.NonEmptyReadonlyArray<B>, OutErr | EX, OutDone, InElem, InErr, InDone, Env | RX>
  <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env, B, X, EX, RX>(
    self: Channel<Arr.NonEmptyReadonlyArray<OutElem>, OutErr, OutDone, InElem, InErr, InDone, Env>,
    filter: Filter.FilterEffect<OutElem, B, X, EX, RX>
  ): Channel<Arr.NonEmptyReadonlyArray<B>, OutErr | EX, OutDone, InElem, InErr, InDone, Env | RX>
} = dual(2, <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env, B, X, EX, RX>(
  self: Channel<Arr.NonEmptyReadonlyArray<OutElem>, OutErr, OutDone, InElem, InErr, InDone, Env>,
  filter: Filter.FilterEffect<OutElem, B, X, EX, RX>
): Channel<Arr.NonEmptyReadonlyArray<B>, OutErr | EX, OutDone, InElem, InErr, InDone, Env | RX> =>
  transformPull(self, (pull) =>
    Effect.succeed(Effect.flatMap(
      pull,
      function loop(arr): Pull.Pull<Arr.NonEmptyReadonlyArray<B>, OutErr | EX, OutDone, RX> {
        return Effect.flatMap(
          Effect.filterMapEffect(arr, filter as any),
          (passes) =>
            Arr.isReadonlyArrayNonEmpty(passes)
              ? Effect.succeed(passes as Arr.NonEmptyReadonlyArray<B>)
              : Effect.flatMap(pull, loop)
        )
      }
    ))))

/**
 * Maps over a channel statefully with an accumulator, where each element can produce multiple output values.
 *
 * **Example** (Mapping with accumulated state)
 *
 * ```ts import.meta.vitest
 * import { Channel, Effect } from "effect"
 *
 * // Create a channel with numbers
 * const numbersChannel = Channel.fromIterable([1, 2, 3, 4])
 *
 * // Use mapAccum to create running sums and emit both current and sum
 * const runningSum = Channel.mapAccum(
 *   numbersChannel,
 *   () => 0, // initial accumulator state
 *   (sum, current) => {
 *     const newSum = sum + current
 *     // Return [newState, outputValues]
 *     return [newSum, [current, newSum]] as const
 *   }
 * )
 * // Using with Effect for async processing
 * const asyncMapAccum = Channel.mapAccum(
 *   numbersChannel,
 *   () => "",
 *   (acc, value) =>
 *     Effect.gen(function*() {
 *       const newAcc = acc + value.toString()
 *       return [newAcc, [`${value}-processed`, newAcc]] as const
 *     })
 * )
 * Effect.runSync(Channel.runCollect(runningSum)) // => [1, 1, 2, 3, 3, 6, 4, 10]
 * Effect.runSync(Channel.runCollect(asyncMapAccum)) // => ["1-processed", "1", "2-processed", "12", "3-processed", "123", "4-processed", "1234"]
 * ```
 *
 * @category sequencing
 * @since 4.0.0
 */
export const mapAccum: {
  <S, OutElem, B, E = never, R = never>(
    initial: LazyArg<S>,
    f: (
      s: S,
      a: Types.NoInfer<OutElem>
    ) =>
      | Effect.Effect<readonly [state: S, values: ReadonlyArray<B>], E, R>
      | readonly [state: S, values: ReadonlyArray<B>],
    options?: {
      readonly onHalt?: ((state: S) => Array<B>) | undefined
    }
  ): <
    OutErr,
    OutDone,
    InElem,
    InErr,
    InDone,
    Env
  >(self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>) => Channel<
    B,
    OutErr | E,
    OutDone,
    InElem,
    InErr,
    InDone,
    Env | R
  >
  <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env, S, B, E = never, R = never>(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
    initial: LazyArg<S>,
    f: (
      s: S,
      a: Types.NoInfer<OutElem>
    ) =>
      | Effect.Effect<readonly [state: S, values: ReadonlyArray<B>], E, R>
      | readonly [state: S, values: ReadonlyArray<B>],
    options?: {
      readonly onHalt?: ((state: S) => Array<B>) | undefined
    }
  ): Channel<B, OutErr | E, OutDone, InElem, InErr, InDone, Env | R>
} = dual(
  (args) => isChannel(args[0]),
  <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env, S, B, E = never, R = never>(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
    initial: LazyArg<S>,
    f: (
      s: S,
      a: Types.NoInfer<OutElem>
    ) =>
      | Effect.Effect<readonly [state: S, values: ReadonlyArray<B>], E, R>
      | readonly [state: S, values: ReadonlyArray<B>],
    options?: {
      readonly onHalt?: ((state: S) => ReadonlyArray<B>) | undefined
    }
  ): Channel<B, OutErr | E, OutDone, InElem, InErr, InDone, Env | R> =>
    fromTransform((upstream, scope) =>
      Effect.map(toTransform(self)(upstream, scope), (pull) => {
        let state = initial()
        let current: ReadonlyArray<B> | undefined
        let index = 0
        let cause: Cause.Cause<OutErr | Cause.Done<OutDone>> | undefined
        const pullNext = Effect.matchCauseEffect(pull, {
          onFailure(cause_) {
            cause = cause_
            const b = options?.onHalt && options.onHalt(state)
            return b && b.length > 0
              ? Effect.succeed([state, b] as const)
              : Effect.failCause(cause_)
          },
          onSuccess(a): Effect.Effect<readonly [state: S, values: ReadonlyArray<B>], E, R> {
            const b = f(state, a)
            return Arr.isArray(b)
              ? Effect.succeed(b as any)
              : b as any
          }
        })
        const pump = Effect.suspend(function loop(): Pull.Pull<B, OutErr | E, OutDone, R> {
          if (current === undefined) {
            if (cause) return Effect.failCause(cause)
            return Effect.flatMap(pullNext, ([newState, values]) => {
              state = newState
              if (values.length === 0) {
                return loop()
              } else if (values.length === 1) {
                return Effect.succeed(values[0])
              }
              current = values
              return loop()
            })
          }
          const next = current[index++]
          if (index >= current.length) {
            current = undefined
            index = 0
          }
          return Effect.succeed(next)
        })
        return pump
      })
    )
)

/**
 * Transforms a channel statefully by scanning over its output with an accumulator function.
 * Emits the intermediate results of the scan operation.
 *
 * **Example** (Scanning channel output)
 *
 * ```ts import.meta.vitest
 * import { Channel, Effect } from "effect"
 *
 * // Create a channel with numbers
 * const numbersChannel = Channel.fromIterable([1, 2, 3, 4, 5])
 *
 * // Scan to create running sum
 * const runningSumChannel = Channel.scan(numbersChannel, 0, (sum, n) => sum + n)
 * Effect.runSync(Channel.runCollect(runningSumChannel)) // => [0, 1, 3, 6, 10, 15]
 * // Note: emits the initial value and each intermediate result
 *
 * // Scan with string concatenation
 * const wordsChannel = Channel.fromIterable(["hello", "world", "from", "effect"])
 * const sentenceChannel = Channel.scan(
 *   wordsChannel,
 *   "",
 *   (sentence, word) => sentence === "" ? word : `${sentence} ${word}`
 * )
 * Effect.runSync(Channel.runCollect(sentenceChannel)) // => ["", "hello", "hello world", "hello world from", "hello world from effect"]
 * ```
 *
 * @category sequencing
 * @since 4.0.0
 */
export const scan: {
  <S, OutElem>(initial: S, f: (s: S, a: Types.NoInfer<OutElem>) => S): <
    OutErr,
    OutDone,
    InElem,
    InErr,
    InDone,
    Env
  >(self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>) => Channel<
    S,
    OutErr,
    OutDone,
    InElem,
    InErr,
    InDone,
    Env
  >
  <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env, S>(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
    initial: S,
    f: (s: S, a: Types.NoInfer<OutElem>) => S
  ): Channel<S, OutErr, OutDone, InElem, InErr, InDone, Env>
} = dual(3, <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env, S>(
  self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
  initial: S,
  f: (s: S, a: Types.NoInfer<OutElem>) => S
): Channel<S, OutErr, OutDone, InElem, InErr, InDone, Env> =>
  scanEffect(self, initial, (s, a) => Effect.succeed(f(s, a))))

/**
 * Transforms a channel statefully by scanning over its output with an effectful accumulator function.
 * Emits the intermediate results of the scan operation.
 *
 * **When to use**
 *
 * Use when maintaining accumulated state over channel output requires Effects
 * or can fail, while still emitting each intermediate state.
 *
 * **Example** (Scanning channel output with effects)
 *
 * ```ts import.meta.vitest
 * import { Channel, Data, Effect } from "effect"
 *
 * class ScanError extends Data.TaggedError("ScanError")<{
 *   readonly reason: string
 * }> {}
 *
 * // Create a channel with numbers
 * const numbersChannel = Channel.fromIterable([1, 2, 3, 4])
 *
 * // Effectful scan with async operations
 * const asyncScanChannel = Channel.scanEffect(
 *   numbersChannel,
 *   "",
 *   (acc, value) =>
 *     Effect.gen(function*() {
 *       return acc + value.toString()
 *     })
 * )
 * await Effect.runPromise(Channel.runCollect(asyncScanChannel)) // => ["", "1", "12", "123", "1234"]
 *
 * // Scan with error handling
 * const errorHandlingScan = Channel.scanEffect(
 *   numbersChannel,
 *   0,
 *   (sum, n) => {
 *     if (n < 0) {
 *       return Effect.fail(new ScanError({ reason: "negative number" }))
 *     }
 *     return Effect.succeed(sum + n)
 *   }
 * )
 * await Effect.runPromise(Channel.runCollect(errorHandlingScan)) // => [0, 1, 3, 6, 10]
 * ```
 *
 * @category sequencing
 * @since 4.0.0
 */
export const scanEffect: {
  <S, OutElem, E, R>(initial: S, f: (s: S, a: Types.NoInfer<OutElem>) => Effect.Effect<S, E, R>): <
    OutErr,
    OutDone,
    InElem,
    InErr,
    InDone,
    Env
  >(self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>) => Channel<
    S,
    OutErr | E,
    OutDone,
    InElem,
    InErr,
    InDone,
    Env | R
  >
  <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env, S, E, R>(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
    initial: S,
    f: (s: S, a: Types.NoInfer<OutElem>) => Effect.Effect<S, E, R>
  ): Channel<S, OutErr | E, OutDone, InElem, InErr, InDone, Env | R>
} = dual(3, <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env, S, E, R>(
  self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
  initial: S,
  f: (s: S, a: Types.NoInfer<OutElem>) => Effect.Effect<S, E, R>
): Channel<S, OutErr | E, OutDone, InElem, InErr, InDone, Env | R> =>
  fromTransform((upstream, scope) =>
    Effect.map(toTransform(self)(upstream, scope), (pull) => {
      let state = initial
      let isFirst = true
      return Effect.suspend(() => {
        if (isFirst) {
          isFirst = false
          return Effect.succeed(state)
        }
        return Effect.map(
          Effect.flatMap(pull, (a) => f(state, a)),
          (newState) => {
            state = newState
            return state
          }
        )
      })
    })
  ))

/**
 * Catches any cause of failure from the channel and allows recovery by
 * creating a new channel based on the caught cause.
 *
 * **Example** (Recovering from failure causes)
 *
 * ```ts import.meta.vitest
 * import { Cause, Channel, Data, Effect } from "effect"
 *
 * class ProcessError extends Data.TaggedError("ProcessError")<{
 *   readonly reason: string
 * }> {}
 *
 * class RecoveryError extends Data.TaggedError("RecoveryError")<{
 *   readonly message: string
 * }> {}
 *
 * // Create a failing channel
 * const failingChannel = Channel.fail(
 *   new ProcessError({ reason: "network error" })
 * )
 *
 * // Catch the cause and provide recovery
 * const recoveredChannel = Channel.catchCause(failingChannel, (cause) => {
 *   if (Cause.hasFails(cause)) {
 *     return Channel.succeed("Recovered from failure")
 *   }
 *   return Channel.succeed("Recovered from interruption")
 * })
 *
 * Effect.runSync(Channel.runCollect(recoveredChannel)) // => ["Recovered from failure"]
 * ```
 *
 * @category error handling
 * @since 2.0.0
 */
export const catchCause: {
  <OutErr, OutElem1, OutErr1, OutDone1, InElem1, InErr1, InDone1, Env1>(
    f: (d: Cause.Cause<OutErr>) => Channel<OutElem1, OutErr1, OutDone1, InElem1, InErr1, InDone1, Env1>
  ): <
    OutElem,
    OutDone,
    InElem,
    InErr,
    InDone,
    Env
  >(self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>) => Channel<
    OutElem | OutElem1,
    OutErr1,
    OutDone | OutDone1,
    InElem & InElem1,
    InErr & InErr1,
    InDone & InDone1,
    Env | Env1
  >
  <
    OutElem,
    OutErr,
    OutDone,
    InElem,
    InErr,
    InDone,
    Env,
    OutElem1,
    OutErr1,
    OutDone1,
    InElem1,
    InErr1,
    InDone1,
    Env1
  >(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
    f: (d: Cause.Cause<OutErr>) => Channel<OutElem1, OutErr1, OutDone1, InElem1, InErr1, InDone1, Env1>
  ): Channel<
    OutElem | OutElem1,
    OutErr1,
    OutDone | OutDone1,
    InElem & InElem1,
    InErr & InErr1,
    InDone & InDone1,
    Env | Env1
  >
} = dual(2, <
  OutElem,
  OutErr,
  OutDone,
  InElem,
  InErr,
  InDone,
  Env,
  OutElem1,
  OutErr1,
  OutDone1,
  InElem1,
  InErr1,
  InDone1,
  Env1
>(
  self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
  f: (d: Cause.Cause<OutErr>) => Channel<OutElem1, OutErr1, OutDone1, InElem1, InErr1, InDone1, Env1>
): Channel<
  OutElem | OutElem1,
  OutErr1,
  OutDone | OutDone1,
  InElem & InElem1,
  InErr & InErr1,
  InDone & InDone1,
  Env | Env1
> =>
  fromTransform((upstream, scope) => {
    let forkedScope = Scope.forkUnsafe(scope)
    return Effect.map(toTransform(self)(upstream, forkedScope), (pull) => {
      let currentPull: Pull.Pull<OutElem | OutElem1, OutErr1, OutDone | OutDone1, Env | Env1> = pull.pipe(
        Effect.catchCause((cause): Pull.Pull<OutElem1, OutErr1, OutDone | OutDone1, Env1> => {
          if (Pull.isDoneCause(cause)) {
            return Effect.failCause(cause as Cause.Cause<Cause.Done<OutDone>>)
          }
          const toClose = forkedScope
          forkedScope = Scope.forkUnsafe(scope)
          return Scope.close(toClose, Exit.failCause(cause)).pipe(
            Effect.andThen(toTransform(f(cause as Cause.Cause<OutErr>))(upstream, forkedScope)),
            Effect.flatMap((childPull) => {
              currentPull = childPull
              return childPull
            })
          )
        })
      )
      return Effect.suspend(() => currentPull)
    })
  }))

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
 * import { Channel, Effect } from "effect"
 *
 * const channel = Channel.fromEffect(Effect.die("boom")).pipe(
 *   Channel.catchDefect((defect) => Channel.succeed(`recovered: ${defect}`))
 * )
 *
 * Effect.runSync(Channel.runCollect(channel)) // => ["recovered: boom"]
 * ```
 *
 * @category error handling
 * @since 4.0.0
 */
export const catchDefect: {
  <OutElem1, OutErr1, OutDone1, InElem1, InErr1, InDone1, Env1>(
    f: (defect: unknown) => Channel<OutElem1, OutErr1, OutDone1, InElem1, InErr1, InDone1, Env1>
  ): <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>
  ) => Channel<
    OutElem | OutElem1,
    OutErr | OutErr1,
    OutDone | OutDone1,
    InElem & InElem1,
    InErr & InErr1,
    InDone & InDone1,
    Env | Env1
  >
  <
    OutElem,
    OutErr,
    OutDone,
    InElem,
    InErr,
    InDone,
    Env,
    OutElem1,
    OutErr1,
    OutDone1,
    InElem1,
    InErr1,
    InDone1,
    Env1
  >(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
    f: (defect: unknown) => Channel<OutElem1, OutErr1, OutDone1, InElem1, InErr1, InDone1, Env1>
  ): Channel<
    OutElem | OutElem1,
    OutErr | OutErr1,
    OutDone | OutDone1,
    InElem & InElem1,
    InErr & InErr1,
    InDone & InDone1,
    Env | Env1
  >
} = dual(2, <
  OutElem,
  OutErr,
  OutDone,
  InElem,
  InErr,
  InDone,
  Env,
  OutElem1,
  OutErr1,
  OutDone1,
  InElem1,
  InErr1,
  InDone1,
  Env1
>(
  self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
  f: (defect: unknown) => Channel<OutElem1, OutErr1, OutDone1, InElem1, InErr1, InDone1, Env1>
): Channel<
  OutElem | OutElem1,
  OutErr | OutErr1,
  OutDone | OutDone1,
  InElem & InElem1,
  InErr & InErr1,
  InDone & InDone1,
  Env | Env1
> => catchCauseFilter(self, Cause.findDefect, f))

/**
 * Runs an effect with the full failure `Cause` when the channel fails, then
 * fails the returned channel with the original cause.
 *
 * **When to use**
 *
 * Use when observing the full channel failure `Cause` is needed without
 * changing successful output or replacing the original cause.
 *
 * **Details**
 *
 * Use this for observing failures, such as logging or metrics. If the observer
 * effect fails, that failure can fail the returned channel.
 *
 * @category error handling
 * @since 4.0.0
 */
export const tapCause: {
  <OutErr, A, E, R>(
    f: (d: Cause.Cause<OutErr>) => Effect.Effect<A, E, R>
  ): <
    OutElem,
    OutDone,
    InElem,
    InErr,
    InDone,
    Env
  >(self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>) => Channel<
    OutElem,
    OutErr | E,
    OutDone | void,
    InElem,
    InErr,
    InDone,
    Env | R
  >
  <
    OutElem,
    OutErr,
    OutDone,
    InElem,
    InErr,
    InDone,
    Env,
    A,
    E,
    R
  >(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
    f: (d: Cause.Cause<OutErr>) => Effect.Effect<A, E, R>
  ): Channel<
    OutElem,
    OutErr | E,
    OutDone | void,
    InElem,
    InErr,
    InDone,
    Env | R
  >
} = dual(2, <
  OutElem,
  OutErr,
  OutDone,
  InElem,
  InErr,
  InDone,
  Env,
  A,
  E,
  R
>(
  self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
  f: (d: Cause.Cause<OutErr>) => Effect.Effect<A, E, R>
): Channel<
  OutElem,
  OutErr | E,
  OutDone | void,
  InElem,
  InErr,
  InDone,
  Env | R
> => catchCause(self, (cause) => fromEffectDrain(Effect.flatMap(f(cause), (_) => Effect.failCause(cause)))))

/**
 * Catches causes of failure that match a specific filter, allowing
 * conditional error recovery based on the type of failure.
 *
 * **When to use**
 *
 * Use to recover a channel only when its full `Cause` satisfies a boolean
 * predicate.
 *
 * **Details**
 *
 * When the predicate matches, the recovery function receives the original
 * cause. When it does not match, the returned channel fails with the original
 * cause.
 *
 * @see {@link catchCauseFilter} for selecting causes with a `Filter`
 * @see {@link catchCause} for recovering from every cause
 * @see {@link catchIf} for recovering from typed channel errors
 *
 * @category error handling
 * @since 4.0.0
 */
export const catchCauseIf: {
  <
    OutErr,
    OutElem1,
    OutErr1,
    OutDone1,
    InElem1,
    InErr1,
    InDone1,
    Env1
  >(
    predicate: Predicate.Predicate<Cause.Cause<OutErr>>,
    f: (cause: Cause.Cause<OutErr>) => Channel<OutElem1, OutErr1, OutDone1, InElem1, InErr1, InDone1, Env1>
  ): <
    OutElem,
    OutDone,
    InElem,
    InErr,
    InDone,
    Env
  >(self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>) => Channel<
    OutElem | OutElem1,
    OutErr | OutErr1,
    OutDone | OutDone1,
    InElem & InElem1,
    InErr & InErr1,
    InDone & InDone1,
    Env | Env1
  >
  <
    OutElem,
    OutErr,
    OutDone,
    InElem,
    InErr,
    InDone,
    Env,
    OutElem1,
    OutErr1,
    OutDone1,
    InElem1,
    InErr1,
    InDone1,
    Env1
  >(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
    predicate: Predicate.Predicate<Cause.Cause<OutErr>>,
    f: (cause: Cause.Cause<OutErr>) => Channel<OutElem1, OutErr1, OutDone1, InElem1, InErr1, InDone1, Env1>
  ): Channel<
    OutElem | OutElem1,
    OutErr | OutErr1,
    OutDone | OutDone1,
    InElem & InElem1,
    InErr & InErr1,
    InDone & InDone1,
    Env | Env1
  >
} = dual(3, <
  OutElem,
  OutErr,
  OutDone,
  InElem,
  InErr,
  InDone,
  Env,
  OutElem1,
  OutErr1,
  OutDone1,
  InElem1,
  InErr1,
  InDone1,
  Env1
>(
  self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
  predicate: Predicate.Predicate<Cause.Cause<OutErr>>,
  f: (cause: Cause.Cause<OutErr>) => Channel<OutElem1, OutErr1, OutDone1, InElem1, InErr1, InDone1, Env1>
): Channel<
  OutElem | OutElem1,
  OutErr | OutErr1,
  OutDone | OutDone1,
  InElem & InElem1,
  InErr & InErr1,
  InDone & InDone1,
  Env | Env1
> =>
  catchCause(
    self,
    (
      cause
    ): Channel<
      OutElem1,
      OutErr | OutErr1,
      OutDone1,
      InElem1,
      InErr1,
      InDone1,
      Env1
    > => {
      return predicate(cause)
        ? f(cause)
        : failCause(cause as any)
    }
  ))

/**
 * Recovers from channel failures whose full `Cause` is selected by a `Filter`.
 *
 * **When to use**
 *
 * Use when you need to recover a channel only from causes selected by a
 * `Filter`, while giving the recovery both the selected value and the original
 * `Cause`.
 *
 * **Details**
 *
 * When the filter succeeds, the recovery function receives the selected value
 * and the original cause. When the filter fails, the returned channel fails
 * with the residual cause produced by the filter.
 *
 * @see {@link catchCauseIf} for selecting causes with a predicate
 * @see {@link catchFilter} for selecting typed errors with a `Filter`
 * @see {@link catchCause} for recovering from every cause
 *
 * @category error handling
 * @since 4.0.0
 */
export const catchCauseFilter: {
  <
    OutErr,
    EB,
    X extends Cause.Cause<any>,
    OutElem1,
    OutErr1,
    OutDone1,
    InElem1,
    InErr1,
    InDone1,
    Env1
  >(
    filter: Filter.Filter<Cause.Cause<OutErr>, EB, X>,
    f: (
      failure: EB,
      cause: Cause.Cause<OutErr>
    ) => Channel<OutElem1, OutErr1, OutDone1, InElem1, InErr1, InDone1, Env1>
  ): <
    OutElem,
    OutDone,
    InElem,
    InErr,
    InDone,
    Env
  >(self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>) => Channel<
    OutElem | OutElem1,
    Cause.Cause.Error<X> | OutErr1,
    OutDone | OutDone1,
    InElem & InElem1,
    InErr & InErr1,
    InDone & InDone1,
    Env | Env1
  >
  <
    OutElem,
    OutErr,
    OutDone,
    InElem,
    InErr,
    InDone,
    Env,
    EB,
    X extends Cause.Cause<any>,
    OutElem1,
    OutErr1,
    OutDone1,
    InElem1,
    InErr1,
    InDone1,
    Env1
  >(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
    filter: Filter.Filter<Cause.Cause<OutErr>, EB, X>,
    f: (
      failure: EB,
      cause: Cause.Cause<OutErr>
    ) => Channel<OutElem1, OutErr1, OutDone1, InElem1, InErr1, InDone1, Env1>
  ): Channel<
    OutElem | OutElem1,
    Cause.Cause.Error<X> | OutErr1,
    OutDone | OutDone1,
    InElem & InElem1,
    InErr & InErr1,
    InDone & InDone1,
    Env | Env1
  >
} = dual(3, <
  OutElem,
  OutErr,
  OutDone,
  InElem,
  InErr,
  InDone,
  Env,
  EB,
  X extends Cause.Cause<any>,
  OutElem1,
  OutErr1,
  OutDone1,
  InElem1,
  InErr1,
  InDone1,
  Env1
>(
  self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
  filter: Filter.Filter<Cause.Cause<OutErr>, EB, X>,
  f: (
    failure: EB,
    cause: Cause.Cause<OutErr>
  ) => Channel<OutElem1, OutErr1, OutDone1, InElem1, InErr1, InDone1, Env1>
): Channel<
  OutElem | OutElem1,
  Cause.Cause.Error<X> | OutErr1,
  OutDone | OutDone1,
  InElem & InElem1,
  InErr & InErr1,
  InDone & InDone1,
  Env | Env1
> =>
  catchCause(
    self,
    (
      cause
    ): Channel<
      OutElem1,
      Cause.Cause.Error<X> | OutErr1,
      OutDone1,
      InElem1,
      InErr1,
      InDone1,
      Env1
    > => {
      const result = filter(cause)
      return Result.isFailure(result)
        ? failCause(result.failure)
        : f(result.success, cause)
    }
  ))

const catch_: {
  <OutErr, OutElem1, OutErr1, OutDone1, InElem1, InErr1, InDone1, Env1>(
    f: (d: OutErr) => Channel<OutElem1, OutErr1, OutDone1, InElem1, InErr1, InDone1, Env1>
  ): <
    OutElem,
    OutDone,
    InElem,
    InErr,
    InDone,
    Env
  >(self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>) => Channel<
    OutElem | OutElem1,
    OutErr1,
    OutDone | OutDone1,
    InElem & InElem1,
    InErr & InErr1,
    InDone & InDone1,
    Env | Env1
  >
  <
    OutElem,
    OutErr,
    OutDone,
    InElem,
    InErr,
    InDone,
    Env,
    OutElem1,
    OutErr1,
    OutDone1,
    InElem1,
    InErr1,
    InDone1,
    Env1
  >(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
    f: (d: OutErr) => Channel<OutElem1, OutErr1, OutDone1, InElem1, InErr1, InDone1, Env1>
  ): Channel<
    OutElem | OutElem1,
    OutErr1,
    OutDone | OutDone1,
    InElem & InElem1,
    InErr & InErr1,
    InDone & InDone1,
    Env | Env1
  >
} = dual(2, <
  OutElem,
  OutErr,
  OutDone,
  InElem,
  InErr,
  InDone,
  Env,
  OutElem1,
  OutErr1,
  OutDone1,
  InElem1,
  InErr1,
  InDone1,
  Env1
>(
  self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
  f: (d: OutErr) => Channel<OutElem1, OutErr1, OutDone1, InElem1, InErr1, InDone1, Env1>
): Channel<
  OutElem | OutElem1,
  OutErr1,
  OutDone | OutDone1,
  InElem & InElem1,
  InErr & InErr1,
  InDone & InDone1,
  Env | Env1
> => catchCauseFilter(self, Cause.findError, (e) => f(e)))

export {
  /**
   * Recovers from typed channel errors by running a fallback channel.
   *
   * @category error handling
   * @since 4.0.0
   */
  catch_ as catch
}

/**
 * Runs an effect when the channel fails with a typed error, then preserves the
 * original channel failure.
 *
 * **Details**
 *
 * The effect is not run for normal channel completion. If the observer effect
 * fails, that failure can fail the returned channel.
 *
 * @category error handling
 * @since 4.0.0
 */
export const tapError: {
  <OutErr, A, E, R>(
    f: (d: OutErr) => Effect.Effect<A, E, R>
  ): <
    OutElem,
    OutDone,
    InElem,
    InErr,
    InDone,
    Env
  >(self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>) => Channel<
    OutElem,
    OutErr | E,
    OutDone | void,
    InElem,
    InErr,
    InDone,
    Env | R
  >
  <
    OutElem,
    OutErr,
    OutDone,
    InElem,
    InErr,
    InDone,
    Env,
    A,
    E,
    R
  >(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
    f: (d: OutErr) => Effect.Effect<A, E, R>
  ): Channel<
    OutElem,
    OutErr | E,
    OutDone | void,
    InElem,
    InErr,
    InDone,
    Env | R
  >
} = dual(2, <
  OutElem,
  OutErr,
  OutDone,
  InElem,
  InErr,
  InDone,
  Env,
  A,
  E,
  R
>(
  self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
  f: (d: OutErr) => Effect.Effect<A, E, R>
): Channel<
  OutElem,
  OutErr | E,
  OutDone | void,
  InElem,
  InErr,
  InDone,
  Env | R
> =>
  transformPull(
    self,
    (pull) =>
      Effect.succeed(Effect.tapError(
        pull,
        (err) => Cause.isDone(err) ? Effect.void : Effect.asVoid(f(err))
      ))
  ))

/**
 * Recovers from typed channel errors that match a predicate or refinement.
 *
 * **When to use**
 *
 * Use to recover from typed channel errors when a predicate or refinement
 * selects the failures that should switch to a recovery channel.
 *
 * **Details**
 *
 * Matching errors are handled by the recovery function. Non-matching errors
 * are handled by `orElse` when provided. Without `orElse`, non-matching errors
 * are re-failed.
 *
 * @see {@link catch_ catch} for recovering from every typed channel error
 * @see {@link catchFilter} for selecting typed errors with a `Filter`
 * @see {@link catchTag} for selecting tagged typed errors
 * @see {@link catchCauseFilter} for selecting full causes with a `Filter`
 *
 * @category error handling
 * @since 4.0.0
 */
export const catchIf: {
  <
    OutErr,
    EB extends OutErr,
    OutElem1,
    OutErr1,
    OutDone1,
    InElem1,
    InErr1,
    InDone1,
    Env1,
    OutElem2 = Types.unassigned,
    OutErr2 = never,
    OutDone2 = never,
    InElem2 = unknown,
    InErr2 = unknown,
    InDone2 = unknown,
    Env2 = never
  >(
    refinement: Predicate.Refinement<OutErr, EB>,
    f: (failure: EB) => Channel<OutElem1, OutErr1, OutDone1, InElem1, InErr1, InDone1, Env1>,
    orElse?:
      | ((
        failure: Exclude<OutErr, EB>
      ) => Channel<OutElem2, OutErr2, OutDone2, InElem2, InErr2, InDone2, Env2>)
      | undefined
  ): <
    OutElem,
    OutDone,
    InElem,
    InErr,
    InDone,
    Env
  >(self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>) => Channel<
    OutElem | OutElem1 | Exclude<OutElem2, Types.unassigned>,
    OutErr1 | OutErr2 | (OutElem2 extends Types.unassigned ? Exclude<OutErr, EB> : never),
    OutDone | OutDone1 | OutDone2,
    InElem & InElem1 & InElem2,
    InErr & InErr1 & InErr2,
    InDone & InDone1 & InDone2,
    Env | Env1 | Env2
  >
  <
    OutErr,
    OutElem1,
    OutErr1,
    OutDone1,
    InElem1,
    InErr1,
    InDone1,
    Env1,
    OutElem2 = Types.unassigned,
    OutErr2 = never,
    OutDone2 = never,
    InElem2 = unknown,
    InErr2 = unknown,
    InDone2 = unknown,
    Env2 = never
  >(
    predicate: Predicate.Predicate<OutErr>,
    f: (failure: OutErr) => Channel<OutElem1, OutErr1, OutDone1, InElem1, InErr1, InDone1, Env1>,
    orElse?:
      | ((
        failure: OutErr
      ) => Channel<OutElem2, OutErr2, OutDone2, InElem2, InErr2, InDone2, Env2>)
      | undefined
  ): <
    OutElem,
    OutDone,
    InElem,
    InErr,
    InDone,
    Env
  >(self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>) => Channel<
    OutElem | OutElem1 | Exclude<OutElem2, Types.unassigned>,
    OutErr1 | OutErr2 | (OutElem2 extends Types.unassigned ? OutErr : never),
    OutDone | OutDone1 | OutDone2,
    InElem & InElem1 & InElem2,
    InErr & InErr1 & InErr2,
    InDone & InDone1 & InDone2,
    Env | Env1 | Env2
  >
  <
    OutElem,
    OutErr,
    OutDone,
    InElem,
    InErr,
    InDone,
    Env,
    EB extends OutErr,
    OutElem1,
    OutErr1,
    OutDone1,
    InElem1,
    InErr1,
    InDone1,
    Env1,
    OutElem2 = Types.unassigned,
    OutErr2 = never,
    OutDone2 = never,
    InElem2 = unknown,
    InErr2 = unknown,
    InDone2 = unknown,
    Env2 = never
  >(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
    refinement: Predicate.Refinement<OutErr, EB>,
    f: (failure: EB) => Channel<OutElem1, OutErr1, OutDone1, InElem1, InErr1, InDone1, Env1>,
    orElse?:
      | ((
        failure: Exclude<OutErr, EB>
      ) => Channel<OutElem2, OutErr2, OutDone2, InElem2, InErr2, InDone2, Env2>)
      | undefined
  ): Channel<
    OutElem | OutElem1 | Exclude<OutElem2, Types.unassigned>,
    OutErr1 | OutErr2 | (OutElem2 extends Types.unassigned ? Exclude<OutErr, EB> : never),
    OutDone | OutDone1 | OutDone2,
    InElem & InElem1 & InElem2,
    InErr & InErr1 & InErr2,
    InDone & InDone1 & InDone2,
    Env | Env1 | Env2
  >
  <
    OutElem,
    OutErr,
    OutDone,
    InElem,
    InErr,
    InDone,
    Env,
    OutElem1,
    OutErr1,
    OutDone1,
    InElem1,
    InErr1,
    InDone1,
    Env1,
    OutElem2 = Types.unassigned,
    OutErr2 = never,
    OutDone2 = never,
    InElem2 = unknown,
    InErr2 = unknown,
    InDone2 = unknown,
    Env2 = never
  >(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
    predicate: Predicate.Predicate<OutErr>,
    f: (failure: OutErr) => Channel<OutElem1, OutErr1, OutDone1, InElem1, InErr1, InDone1, Env1>,
    orElse?:
      | ((
        failure: OutErr
      ) => Channel<OutElem2, OutErr2, OutDone2, InElem2, InErr2, InDone2, Env2>)
      | undefined
  ): Channel<
    OutElem | OutElem1 | Exclude<OutElem2, Types.unassigned>,
    OutErr1 | OutErr2 | (OutElem2 extends Types.unassigned ? OutErr : never),
    OutDone | OutDone1 | OutDone2,
    InElem & InElem1 & InElem2,
    InErr & InErr1 & InErr2,
    InDone & InDone1 & InDone2,
    Env | Env1 | Env2
  >
} = dual((args) => isChannel(args[0]), <
  OutElem,
  OutErr,
  OutDone,
  InElem,
  InErr,
  InDone,
  Env,
  OutElem1,
  OutErr1,
  OutDone1,
  InElem1,
  InErr1,
  InDone1,
  Env1,
  OutElem2 = never,
  OutErr2 = OutErr,
  OutDone2 = never,
  InElem2 = unknown,
  InErr2 = unknown,
  InDone2 = unknown,
  Env2 = never
>(
  self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
  predicate: Predicate.Predicate<OutErr>,
  f: (failure: OutErr) => Channel<OutElem1, OutErr1, OutDone1, InElem1, InErr1, InDone1, Env1>,
  orElse?:
    | ((
      failure: OutErr
    ) => Channel<OutElem2, OutErr2, OutDone2, InElem2, InErr2, InDone2, Env2>)
    | undefined
): Channel<
  OutElem | OutElem1 | OutElem2,
  OutErr1 | OutErr2,
  OutDone | OutDone1 | OutDone2,
  InElem & InElem1 & InElem2,
  InErr & InErr1 & InErr2,
  InDone & InDone1 & InDone2,
  Env | Env1 | Env2
> =>
  catch_(
    self,
    (err): Channel<
      OutElem1 | OutElem2,
      OutErr1 | OutErr2,
      OutDone1 | OutDone2,
      InElem1 & InElem2,
      InErr1 & InErr2,
      InDone1 & InDone2,
      Env1 | Env2
    > => {
      return predicate(err)
        ? f(err)
        : orElse
        ? orElse(err)
        : fail(err as any) as any
    }
  ))

/**
 * Recovers from typed channel errors selected by a `Filter`.
 *
 * **When to use**
 *
 * Use to recover from channel errors with a reusable `Filter` when matching
 * can also narrow or transform the error before choosing the recovery channel.
 *
 * **Details**
 *
 * Successful filter results are handled by the recovery function. Failed
 * filter results are handled by `orElse` when provided. Without `orElse`,
 * failed filter results are re-failed.
 *
 * @see {@link catchIf} for selecting typed errors with a predicate
 * @see {@link catchTag} for selecting tagged typed errors
 * @see {@link catchCauseFilter} for selecting full causes with a `Filter`
 *
 * @category error handling
 * @since 4.0.0
 */
export const catchFilter: {
  <
    OutErr,
    EB,
    X,
    OutElem1,
    OutErr1,
    OutDone1,
    InElem1,
    InErr1,
    InDone1,
    Env1,
    OutElem2 = Types.unassigned,
    OutErr2 = never,
    OutDone2 = never,
    InElem2 = unknown,
    InErr2 = unknown,
    InDone2 = unknown,
    Env2 = never
  >(
    filter: Filter.Filter<OutErr, EB, X>,
    f: (failure: EB) => Channel<OutElem1, OutErr1, OutDone1, InElem1, InErr1, InDone1, Env1>,
    orElse?:
      | ((
        failure: X
      ) => Channel<OutElem2, OutErr2, OutDone2, InElem2, InErr2, InDone2, Env2>)
      | undefined
  ): <
    OutElem,
    OutDone,
    InElem,
    InErr,
    InDone,
    Env
  >(self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>) => Channel<
    OutElem | OutElem1 | Exclude<OutElem2, Types.unassigned>,
    OutErr1 | OutErr2 | (OutElem2 extends Types.unassigned ? X : never),
    OutDone | OutDone1 | OutDone2,
    InElem & InElem1 & InElem2,
    InErr & InErr1 & InErr2,
    InDone & InDone1 & InDone2,
    Env | Env1 | Env2
  >
  <
    OutElem,
    OutErr,
    OutDone,
    InElem,
    InErr,
    InDone,
    Env,
    EB,
    X,
    OutElem1,
    OutErr1,
    OutDone1,
    InElem1,
    InErr1,
    InDone1,
    Env1,
    OutElem2 = Types.unassigned,
    OutErr2 = never,
    OutDone2 = never,
    InElem2 = unknown,
    InErr2 = unknown,
    InDone2 = unknown,
    Env2 = never
  >(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
    filter: Filter.Filter<OutErr, EB, X>,
    f: (failure: EB) => Channel<OutElem1, OutErr1, OutDone1, InElem1, InErr1, InDone1, Env1>,
    orElse?:
      | ((
        failure: X
      ) => Channel<OutElem2, OutErr2, OutDone2, InElem2, InErr2, InDone2, Env2>)
      | undefined
  ): Channel<
    OutElem | OutElem1 | Exclude<OutElem2, Types.unassigned>,
    OutErr1 | OutErr2 | (OutElem2 extends Types.unassigned ? X : never),
    OutDone | OutDone1 | OutDone2,
    InElem & InElem1 & InElem2,
    InErr & InErr1 & InErr2,
    InDone & InDone1 & InDone2,
    Env | Env1 | Env2
  >
} = dual((args) => isChannel(args[0]), <
  OutElem,
  OutErr,
  OutDone,
  InElem,
  InErr,
  InDone,
  Env,
  EB,
  X,
  OutElem1,
  OutErr1,
  OutDone1,
  InElem1,
  InErr1,
  InDone1,
  Env1,
  OutElem2 = never,
  OutErr2 = X,
  OutDone2 = never,
  InElem2 = unknown,
  InErr2 = unknown,
  InDone2 = unknown,
  Env2 = never
>(
  self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
  filter: Filter.Filter<OutErr, EB, X>,
  f: (failure: EB) => Channel<OutElem1, OutErr1, OutDone1, InElem1, InErr1, InDone1, Env1>,
  orElse?:
    | ((
      failure: X
    ) => Channel<OutElem2, OutErr2, OutDone2, InElem2, InErr2, InDone2, Env2>)
    | undefined
): Channel<
  OutElem | OutElem1 | OutElem2,
  OutErr1 | OutErr2,
  OutDone | OutDone1 | OutDone2,
  InElem & InElem1 & InElem2,
  InErr & InErr1 & InErr2,
  InDone & InDone1 & InDone2,
  Env | Env1 | Env2
> =>
  catch_(
    self,
    (err): Channel<
      OutElem1 | OutElem2,
      OutErr1 | OutErr2,
      OutDone1 | OutDone2,
      InElem1 & InElem2,
      InErr1 & InErr2,
      InDone1 & InDone2,
      Env1 | Env2
    > => {
      const result = filter(err)
      return Result.isFailure(result)
        ? orElse
          ? orElse(result.failure)
          : fail(result.failure as any) as any
        : f(result.success)
    }
  ))

/**
 * Recovers from tagged channel errors whose `_tag` matches one or more tags.
 *
 * **Details**
 *
 * Matching tagged errors are handled by the recovery function. Non-matching
 * errors are handled by `orElse` when provided. Without `orElse`,
 * non-matching errors are re-failed.
 *
 * @category error handling
 * @since 4.0.0
 */
export const catchTag: {
  <
    OutErr,
    const K extends Types.Tags<OutErr> | Arr.NonEmptyReadonlyArray<Types.Tags<OutErr>>,
    OutElem1,
    OutErr1,
    OutDone1,
    InElem1,
    InErr1,
    InDone1,
    Env1,
    OutElem2 = Types.unassigned,
    OutErr2 = never,
    OutDone2 = never,
    InElem2 = unknown,
    InErr2 = unknown,
    InDone2 = unknown,
    Env2 = never
  >(
    k: K,
    f: (
      e: Types.ExtractTag<NoInfer<OutErr>, K extends Arr.NonEmptyReadonlyArray<string> ? K[number] : K>
    ) => Channel<OutElem1, OutErr1, OutDone1, InElem1, InErr1, InDone1, Env1>,
    orElse?:
      | ((
        e: Types.ExcludeTag<NoInfer<OutErr>, K extends Arr.NonEmptyReadonlyArray<string> ? K[number] : K>
      ) => Channel<OutElem2, OutErr2, OutDone2, InElem2, InErr2, InDone2, Env2>)
      | undefined
  ): <
    OutElem,
    OutDone,
    InElem,
    InErr,
    InDone,
    Env
  >(self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>) => Channel<
    OutElem | OutElem1 | Exclude<OutElem2, Types.unassigned>,
    | OutErr1
    | OutErr2
    | (OutElem2 extends Types.unassigned
      ? Types.ExcludeTag<OutErr, K extends Arr.NonEmptyReadonlyArray<string> ? K[number] : K>
      : never),
    OutDone | OutDone1 | OutDone2,
    InElem & InElem1 & InElem2,
    InErr & InErr1 & InErr2,
    InDone & InDone1 & InDone2,
    Env | Env1 | Env2
  >
  <
    OutElem,
    OutErr,
    OutDone,
    InElem,
    InErr,
    InDone,
    Env,
    const K extends Types.Tags<OutErr> | Arr.NonEmptyReadonlyArray<Types.Tags<OutErr>>,
    OutElem1,
    OutErr1,
    OutDone1,
    InElem1,
    InErr1,
    InDone1,
    Env1,
    OutElem2 = Types.unassigned,
    OutErr2 = never,
    OutDone2 = never,
    InElem2 = unknown,
    InErr2 = unknown,
    InDone2 = unknown,
    Env2 = never
  >(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
    k: K,
    f: (
      e: Types.ExtractTag<NoInfer<OutErr>, K extends Arr.NonEmptyReadonlyArray<string> ? K[number] : K>
    ) => Channel<OutElem1, OutErr1, OutDone1, InElem1, InErr1, InDone1, Env1>,
    orElse?:
      | ((
        e: Types.ExcludeTag<NoInfer<OutErr>, K extends Arr.NonEmptyReadonlyArray<string> ? K[number] : K>
      ) => Channel<OutElem2, OutErr2, OutDone2, InElem2, InErr2, InDone2, Env2>)
      | undefined
  ): Channel<
    OutElem | OutElem1 | Exclude<OutElem2, Types.unassigned>,
    | OutErr1
    | OutErr2
    | (OutElem2 extends Types.unassigned
      ? Types.ExcludeTag<OutErr, K extends Arr.NonEmptyReadonlyArray<string> ? K[number] : K>
      : never),
    OutDone | OutDone1 | OutDone2,
    InElem & InElem1 & InElem2,
    InErr & InErr1 & InErr2,
    InDone & InDone1 & InDone2,
    Env | Env1 | Env2
  >
} = dual((args) => isChannel(args[0]), <
  OutElem,
  OutErr,
  OutDone,
  InElem,
  InErr,
  InDone,
  Env,
  const K extends Types.Tags<OutErr> | Arr.NonEmptyReadonlyArray<Types.Tags<OutErr>>,
  OutElem1,
  OutErr1,
  OutDone1,
  InElem1,
  InErr1,
  InDone1,
  Env1,
  OutElem2 = never,
  OutErr2 = Types.ExcludeTag<OutErr, K extends Arr.NonEmptyReadonlyArray<string> ? K[number] : K>,
  OutDone2 = never,
  InElem2 = unknown,
  InErr2 = unknown,
  InDone2 = unknown,
  Env2 = never
>(
  self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
  k: K,
  f: (
    e: Types.ExtractTag<NoInfer<OutErr>, K extends Arr.NonEmptyReadonlyArray<string> ? K[number] : K>
  ) => Channel<OutElem1, OutErr1, OutDone1, InElem1, InErr1, InDone1, Env1>,
  orElse?:
    | ((
      e: Types.ExcludeTag<NoInfer<OutErr>, K extends Arr.NonEmptyReadonlyArray<string> ? K[number] : K>
    ) => Channel<OutElem2, OutErr2, OutDone2, InElem2, InErr2, InDone2, Env2>)
    | undefined
): Channel<
  OutElem | OutElem1 | OutElem2,
  OutErr1 | OutErr2,
  OutDone | OutDone1 | OutDone2,
  InElem & InElem1 & InElem2,
  InErr & InErr1 & InErr2,
  InDone & InDone1 & InDone2,
  Env | Env1 | Env2
> => {
  const pred = Array.isArray(k)
    ? ((e: OutErr): e is any => hasProperty(e, "_tag") && k.includes(e._tag))
    : isTagged(k as string)
  return catchIf(self, pred, f, orElse as any) as any
})

/**
 * Catches a specific reason within a tagged error.
 *
 * **Example** (Recovering from nested reasons)
 *
 * ```ts import.meta.vitest
 * import { Channel, Data, Effect } from "effect"
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
 * const reason = new RateLimitError({ retryAfter: 60 })
 * const channel = Channel.fail(new AiError({ reason }))
 *
 * const recovered = channel.pipe(
 *   Channel.catchReason("AiError", "RateLimitError", (reason) =>
 *     Channel.succeed(`retry: ${reason.retryAfter}`)
 *   )
 * )
 * Effect.runSync(Channel.runCollect(recovered)) // => ["retry: 60"]
 * ```
 *
 * @category error handling
 * @since 4.0.0
 */
export const catchReason: {
  <
    OutErr,
    K extends Types.Tags<OutErr>,
    RK extends Types.ReasonTags<Types.ExtractTag<Types.NoInfer<OutErr>, K>>,
    OutElem1,
    OutErr1,
    OutDone1,
    InElem1,
    InErr1,
    InDone1,
    Env1,
    OutElem2 = Types.unassigned,
    OutErr2 = never,
    OutDone2 = never,
    InElem2 = unknown,
    InErr2 = unknown,
    InDone2 = unknown,
    Env2 = never
  >(
    errorTag: K,
    reasonTag: RK,
    f: (
      reason: Types.ExtractReason<Types.ExtractTag<Types.NoInfer<OutErr>, K>, RK>,
      error: Types.NarrowReason<Types.ExtractTag<Types.NoInfer<OutErr>, K>, RK>
    ) => Channel<OutElem1, OutErr1, OutDone1, InElem1, InErr1, InDone1, Env1>,
    orElse?:
      | ((
        reason: Types.ExcludeReason<Types.ExtractTag<Types.NoInfer<OutErr>, K>, RK>,
        error: Types.OmitReason<Types.ExtractTag<Types.NoInfer<OutErr>, K>, RK>
      ) => Channel<OutElem2, OutErr2, OutDone2, InElem2, InErr2, InDone2, Env2>)
      | undefined
  ): <
    OutElem,
    OutDone,
    InElem,
    InErr,
    InDone,
    Env
  >(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>
  ) => Channel<
    OutElem | OutElem1 | Exclude<OutElem2, Types.unassigned>,
    | Types.ExcludeTag<OutErr, K>
    | OutErr1
    | OutErr2
    | (OutElem2 extends Types.unassigned ? Types.ExtractTag<OutErr, K> : never),
    OutDone | OutDone1 | OutDone2,
    InElem & InElem1 & InElem2,
    InErr & InErr1 & InErr2,
    InDone & InDone1 & InDone2,
    Env | Env1 | Env2
  >
  <
    OutElem,
    OutErr,
    OutDone,
    InElem,
    InErr,
    InDone,
    Env,
    K extends Types.Tags<OutErr>,
    RK extends Types.ReasonTags<Types.ExtractTag<Types.NoInfer<OutErr>, K>>,
    OutElem1,
    OutErr1,
    OutDone1,
    InElem1,
    InErr1,
    InDone1,
    Env1,
    OutElem2 = Types.unassigned,
    OutErr2 = never,
    OutDone2 = never,
    InElem2 = unknown,
    InErr2 = unknown,
    InDone2 = unknown,
    Env2 = never
  >(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
    errorTag: K,
    reasonTag: RK,
    f: (
      reason: Types.ExtractReason<Types.ExtractTag<Types.NoInfer<OutErr>, K>, RK>,
      error: Types.NarrowReason<Types.ExtractTag<Types.NoInfer<OutErr>, K>, RK>
    ) => Channel<OutElem1, OutErr1, OutDone1, InElem1, InErr1, InDone1, Env1>,
    orElse?:
      | ((
        reason: Types.ExcludeReason<Types.ExtractTag<Types.NoInfer<OutErr>, K>, RK>,
        error: Types.OmitReason<Types.ExtractTag<Types.NoInfer<OutErr>, K>, RK>
      ) => Channel<OutElem2, OutErr2, OutDone2, InElem2, InErr2, InDone2, Env2>)
      | undefined
  ): Channel<
    OutElem | OutElem1 | Exclude<OutElem2, Types.unassigned>,
    | Types.ExcludeTag<OutErr, K>
    | OutErr1
    | OutErr2
    | (OutElem2 extends Types.unassigned ? Types.ExtractTag<OutErr, K> : never),
    OutDone | OutDone1 | OutDone2,
    InElem & InElem1 & InElem2,
    InErr & InErr1 & InErr2,
    InDone & InDone1 & InDone2,
    Env | Env1 | Env2
  >
} = dual((args) => isChannel(args[0]), <
  OutElem,
  OutErr,
  OutDone,
  InElem,
  InErr,
  InDone,
  Env,
  K extends Types.Tags<OutErr>,
  RK extends Types.ReasonTags<Types.ExtractTag<Types.NoInfer<OutErr>, K>>,
  OutElem1,
  OutErr1,
  OutDone1,
  InElem1,
  InErr1,
  InDone1,
  Env1,
  OutElem2 = Types.unassigned,
  OutErr2 = never,
  OutDone2 = never,
  InElem2 = unknown,
  InErr2 = unknown,
  InDone2 = unknown,
  Env2 = never
>(
  self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
  errorTag: K,
  reasonTag: RK,
  f: (
    reason: Types.ExtractReason<Types.ExtractTag<Types.NoInfer<OutErr>, K>, RK>,
    error: Types.NarrowReason<Types.ExtractTag<Types.NoInfer<OutErr>, K>, RK>
  ) => Channel<OutElem1, OutErr1, OutDone1, InElem1, InErr1, InDone1, Env1>,
  orElse?:
    | ((
      reason: Types.ExcludeReason<Types.ExtractTag<Types.NoInfer<OutErr>, K>, RK>,
      error: Types.OmitReason<Types.ExtractTag<Types.NoInfer<OutErr>, K>, RK>
    ) => Channel<OutElem2, OutErr2, OutDone2, InElem2, InErr2, InDone2, Env2>)
    | undefined
): Channel<
  OutElem | OutElem1 | Exclude<OutElem2, Types.unassigned>,
  | Types.ExcludeTag<OutErr, K>
  | OutErr1
  | OutErr2
  | (OutElem2 extends Types.unassigned ? Types.ExtractTag<OutErr, K> : never),
  OutDone | OutDone1 | OutDone2,
  InElem & InElem1 & InElem2,
  InErr & InErr1 & InErr2,
  InDone & InDone1 & InDone2,
  Env | Env1 | Env2
> =>
  catch_(
    self,
    (error): Channel<
      OutElem1 | Exclude<OutElem2, Types.unassigned>,
      OutErr1 | OutErr2,
      OutDone1 | OutDone2,
      InElem1 & InElem2,
      InErr1 & InErr2,
      InDone1 & InDone2,
      Env1 | Env2
    > => {
      if (isTagged(error, errorTag) && hasProperty(error, "reason")) {
        const reason = error.reason as Types.ExcludeReason<Types.ExtractTag<Types.NoInfer<OutErr>, K>, RK>
        if (isTagged(reason, reasonTag)) {
          return f(reason as any, error as any)
        }
        return orElse ? orElse(reason, error as any) as any : fail(error) as any
      }
      return fail(error) as any
    }
  ))

/**
 * Catches multiple reasons within a tagged error using an object of handlers.
 *
 * @category error handling
 * @since 4.0.0
 */
export const catchReasons: {
  <
    K extends Types.Tags<OutErr>,
    OutErr,
    Cases extends {
      [RK in Types.ReasonTags<Types.ExtractTag<Types.NoInfer<OutErr>, K>>]+?: (
        reason: Types.ExtractReason<Types.ExtractTag<Types.NoInfer<OutErr>, K>, RK>,
        error: Types.NarrowReason<Types.ExtractTag<Types.NoInfer<OutErr>, K>, RK>
      ) => Channel<any, any, any, any, any, any, any>
    },
    OutElem2 = Types.unassigned,
    OutErr2 = never,
    OutDone2 = never,
    InElem2 = unknown,
    InErr2 = unknown,
    InDone2 = unknown,
    Env2 = never
  >(
    errorTag: K,
    cases: Cases,
    orElse?:
      | ((
        reason: Types.ExcludeReason<Types.ExtractTag<Types.NoInfer<OutErr>, K>, Extract<keyof Cases, string>>,
        error: Types.OmitReason<Types.ExtractTag<Types.NoInfer<OutErr>, K>, Extract<keyof Cases, string>>
      ) => Channel<OutElem2, OutErr2, OutDone2, InElem2, InErr2, InDone2, Env2>)
      | undefined
  ): <OutElem, OutDone, InElem, InErr, InDone, Env>(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>
  ) => Channel<
    | OutElem
    | Exclude<OutElem2, Types.unassigned>
    | {
      [RK in keyof Cases]: Cases[RK] extends
        (...args: Array<any>) => Channel<infer OutElem1, any, any, any, any, any, any> ? OutElem1 : never
    }[keyof Cases],
    | Types.ExcludeTag<OutErr, K>
    | OutErr2
    | (OutElem2 extends Types.unassigned ? Types.ExtractTag<OutErr, K> : never)
    | {
      [RK in keyof Cases]: Cases[RK] extends
        (...args: Array<any>) => Channel<any, infer OutErr1, any, any, any, any, any> ? OutErr1 : never
    }[keyof Cases],
    | OutDone
    | OutDone2
    | {
      [RK in keyof Cases]: Cases[RK] extends
        (...args: Array<any>) => Channel<any, any, infer OutDone1, any, any, any, any> ? OutDone1 : never
    }[keyof Cases],
    & InElem
    & InElem2
    & {
      [RK in keyof Cases]: Cases[RK] extends
        (...args: Array<any>) => Channel<any, any, any, infer InElem1, any, any, any> ? InElem1 : never
    }[keyof Cases],
    & InErr
    & InErr2
    & {
      [RK in keyof Cases]: Cases[RK] extends
        (...args: Array<any>) => Channel<any, any, any, any, infer InErr1, any, any> ? InErr1 : never
    }[keyof Cases],
    & InDone
    & InDone2
    & {
      [RK in keyof Cases]: Cases[RK] extends
        (...args: Array<any>) => Channel<any, any, any, any, any, infer InDone1, any> ? InDone1 : never
    }[keyof Cases],
    | Env
    | Env2
    | {
      [RK in keyof Cases]: Cases[RK] extends
        (...args: Array<any>) => Channel<any, any, any, any, any, any, infer Env1> ? Env1 : never
    }[keyof Cases]
  >
  <
    OutElem,
    OutErr,
    OutDone,
    InElem,
    InErr,
    InDone,
    Env,
    K extends Types.Tags<OutErr>,
    Cases extends {
      [RK in Types.ReasonTags<Types.ExtractTag<OutErr, K>>]+?: (
        reason: Types.ExtractReason<Types.ExtractTag<OutErr, K>, RK>,
        error: Types.NarrowReason<Types.ExtractTag<OutErr, K>, RK>
      ) => Channel<any, any, any, any, any, any, any>
    },
    OutElem2 = Types.unassigned,
    OutErr2 = never,
    OutDone2 = never,
    InElem2 = unknown,
    InErr2 = unknown,
    InDone2 = unknown,
    Env2 = never
  >(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
    errorTag: K,
    cases: Cases,
    orElse?:
      | ((
        reason: Types.ExcludeReason<Types.ExtractTag<Types.NoInfer<OutErr>, K>, Extract<keyof Cases, string>>,
        error: Types.OmitReason<Types.ExtractTag<Types.NoInfer<OutErr>, K>, Extract<keyof Cases, string>>
      ) => Channel<OutElem2, OutErr2, OutDone2, InElem2, InErr2, InDone2, Env2>)
      | undefined
  ): Channel<
    | OutElem
    | Exclude<OutElem2, Types.unassigned>
    | {
      [RK in keyof Cases]: Cases[RK] extends
        (...args: Array<any>) => Channel<infer OutElem1, any, any, any, any, any, any> ? OutElem1 : never
    }[keyof Cases],
    | Types.ExcludeTag<OutErr, K>
    | OutErr2
    | (OutElem2 extends Types.unassigned ? Types.ExtractTag<OutErr, K> : never)
    | {
      [RK in keyof Cases]: Cases[RK] extends
        (...args: Array<any>) => Channel<any, infer OutErr1, any, any, any, any, any> ? OutErr1 : never
    }[keyof Cases],
    | OutDone
    | OutDone2
    | {
      [RK in keyof Cases]: Cases[RK] extends
        (...args: Array<any>) => Channel<any, any, infer OutDone1, any, any, any, any> ? OutDone1 : never
    }[keyof Cases],
    & InElem
    & InElem2
    & {
      [RK in keyof Cases]: Cases[RK] extends
        (...args: Array<any>) => Channel<any, any, any, infer InElem1, any, any, any> ? InElem1 : never
    }[keyof Cases],
    & InErr
    & InErr2
    & {
      [RK in keyof Cases]: Cases[RK] extends
        (...args: Array<any>) => Channel<any, any, any, any, infer InErr1, any, any> ? InErr1 : never
    }[keyof Cases],
    & InDone
    & InDone2
    & {
      [RK in keyof Cases]: Cases[RK] extends
        (...args: Array<any>) => Channel<any, any, any, any, any, infer InDone1, any> ? InDone1 : never
    }[keyof Cases],
    | Env
    | Env2
    | {
      [RK in keyof Cases]: Cases[RK] extends
        (...args: Array<any>) => Channel<any, any, any, any, any, any, infer Env1> ? Env1 : never
    }[keyof Cases]
  >
} = dual((args) => isChannel(args[0]), (self, errorTag, cases, orElse) => {
  let keys: Set<string>
  return catch_(self, (error) => {
    if (
      isTagged(error, errorTag) &&
      hasProperty(error, "reason") &&
      hasProperty(error.reason, "_tag") &&
      String.isString(error.reason._tag)
    ) {
      const reason = error.reason as { readonly _tag: string }
      keys ??= new Set(Object.keys(cases))
      if (keys.has(reason._tag)) {
        return (cases as any)[reason._tag](reason as any, error)
      }
      return orElse ? orElse(reason, error) as any : fail(error) as any
    }
    return fail(error) as any
  })
})

/**
 * Promotes nested reason errors into the channel error, replacing the parent error.
 *
 * **Example** (Promoting nested reasons)
 *
 * ```ts import.meta.vitest
 * import { Channel, Data, Effect, Exit } from "effect"
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
 * const reason = new RateLimitError({ retryAfter: 60 })
 * const channel = Channel.fail(new AiError({ reason }))
 *
 * const unwrapped = channel.pipe(Channel.unwrapReason("AiError"))
 * Effect.runSync(Effect.exit(Channel.runCollect(unwrapped))) // => Exit.fail(reason)
 * ```
 *
 * @category error handling
 * @since 4.0.0
 */
export const unwrapReason: {
  <
    K extends TagsWithReason<OutErr>,
    OutErr
  >(
    errorTag: K
  ): <OutElem, OutDone, InElem, InErr, InDone, Env>(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>
  ) => Channel<
    OutElem,
    Types.ExcludeTag<OutErr, K> | Types.ReasonOf<Types.ExtractTag<OutErr, K>>,
    OutDone,
    InElem,
    InErr,
    InDone,
    Env
  >
  <
    OutElem,
    OutErr,
    OutDone,
    InElem,
    InErr,
    InDone,
    Env,
    K extends TagsWithReason<OutErr>
  >(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
    errorTag: K
  ): Channel<
    OutElem,
    Types.ExcludeTag<OutErr, K> | Types.ReasonOf<Types.ExtractTag<OutErr, K>>,
    OutDone,
    InElem,
    InErr,
    InDone,
    Env
  >
} = dual(2, <
  OutElem,
  OutErr,
  OutDone,
  InElem,
  InErr,
  InDone,
  Env,
  K extends TagsWithReason<OutErr>
>(
  self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
  errorTag: K
): Channel<
  OutElem,
  Types.ExcludeTag<OutErr, K> | Types.ReasonOf<Types.ExtractTag<OutErr, K>>,
  OutDone,
  InElem,
  InErr,
  InDone,
  Env
> =>
  catchFilter(
    self,
    (error) =>
      isTagged(error, errorTag) && hasProperty(error, "reason") ? Result.succeed(error.reason) : Result.fail(error),
    fail
  ) as any)

/**
 * Returns a new channel, which is the same as this one, except the failure
 * value of the returned channel is created by applying the specified function
 * to the failure value of this channel.
 *
 * @category error handling
 * @since 2.0.0
 */
export const mapError: {
  <OutErr, OutErr2>(
    f: (err: OutErr) => OutErr2
  ): <OutElem, OutDone, InElem, InErr, InDone, Env>(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>
  ) => Channel<OutElem, OutErr2, OutDone, InElem, InErr, InDone, Env>
  <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env, OutErr2>(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
    f: (err: OutErr) => OutErr2
  ): Channel<OutElem, OutErr2, OutDone, InElem, InErr, InDone, Env>
} = dual(2, <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env, OutErr2>(
  self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
  f: (err: OutErr) => OutErr2
): Channel<OutElem, OutErr2, OutDone, InElem, InErr, InDone, Env> => catch_(self, (err) => fail(f(err))))

/**
 * Converts all errors in the channel to defects (unrecoverable failures).
 * This is useful when you want to treat errors as programming errors.
 *
 * **Example** (Converting failures to defects)
 *
 * ```ts import.meta.vitest
 * import { Cause, Channel, Data, Effect, Exit } from "effect"
 *
 * class ValidationError extends Data.TaggedError("ValidationError")<{
 *   readonly field: string
 * }> {}
 *
 * // Create a channel that might fail
 * const error = new ValidationError({ field: "email" })
 * const failingChannel = Channel.fail(error)
 *
 * // Convert failures to defects
 * const fatalChannel = Channel.orDie(failingChannel)
 *
 * Effect.runSync(Effect.exit(Channel.runCollect(fatalChannel))) // => Exit.failCause(Cause.die(error))
 * ```
 *
 * @category error handling
 * @since 2.0.0
 */
export const orDie = <
  OutElem,
  OutErr,
  OutDone,
  InElem,
  InErr,
  InDone,
  Env
>(
  self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>
): Channel<OutElem, never, OutDone, InElem, InErr, InDone, Env> => catch_(self, die)

/**
 * Ignores all errors in the channel, converting them to an empty channel.
 *
 * **Details**
 *
 * Use the `log` option to emit the full {@link Cause} when the channel fails.
 *
 * @category error handling
 * @since 4.0.0
 */
export const ignore: <
  Arg extends Channel<any, any, any, any, any, any, any> | {
    readonly log?: boolean | Severity | undefined
  } | undefined = {
    readonly log?: boolean | Severity | undefined
  }
>(
  selfOrOptions: Arg,
  options?: {
    readonly log?: boolean | Severity | undefined
  } | undefined
) => [Arg] extends
  [Channel<infer OutElem, infer _OutErr, infer OutDone, infer InElem, infer InErr, infer InDone, infer Env>]
  ? Channel<OutElem, never, OutDone | void, InElem, InErr, InDone, Env>
  : <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>
  ) => Channel<OutElem, never, OutDone | void, InElem, InErr, InDone, Env> = dual(
    (args) => isChannel(args[0]),
    <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>(
      self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
      options?: {
        readonly log?: boolean | Severity | undefined
      } | undefined
    ): Channel<OutElem, never, OutDone | void, InElem, InErr, InDone, Env> => {
      if (!options?.log) {
        return catch_(self, () => empty)
      }
      const logEffect = Effect.logWithLevel(options.log === true ? undefined : options.log)
      return catch_(
        tapCause(self, (cause) => Cause.hasFails(cause) ? logEffect(cause) : Effect.void),
        () => empty
      )
    }
  )

const ignoreCause_ = <
  OutElem,
  OutErr,
  OutDone,
  InElem,
  InErr,
  InDone,
  Env
>(
  self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>
): Channel<OutElem, never, OutDone | void, InElem, InErr, InDone, Env> => catchCause(self, () => empty)

/**
 * Ignores all errors in the channel including defects, converting them to an empty channel.
 *
 * **When to use**
 *
 * Use when a channel should become best-effort and all failure causes, including
 * defects and interruptions, can be converted to empty output.
 *
 * **Details**
 *
 * Use the `log` option to emit the full {@link Cause} when the channel fails.
 *
 * @category error handling
 * @since 4.0.0
 */
export const ignoreCause: <
  Arg extends Channel<any, any, any, any, any, any, any> | {
    readonly log?: boolean | Severity | undefined
  } | undefined = {
    readonly log?: boolean | Severity | undefined
  }
>(
  selfOrOptions: Arg,
  options?: {
    readonly log?: boolean | Severity | undefined
  } | undefined
) => [Arg] extends
  [Channel<infer OutElem, infer _OutErr, infer OutDone, infer InElem, infer InErr, infer InDone, infer Env>]
  ? Channel<OutElem, never, OutDone | void, InElem, InErr, InDone, Env>
  : <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>
  ) => Channel<OutElem, never, OutDone | void, InElem, InErr, InDone, Env> = dual(
    (args) => isChannel(args[0]),
    <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>(
      self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
      options?: { readonly log?: boolean | Severity | undefined } | undefined
    ): Channel<OutElem, never, OutDone | void, InElem, InErr, InDone, Env> => {
      if (!options?.log) return ignoreCause_(self)
      const logEffect = Effect.logWithLevel(options.log === true ? undefined : options.log)
      return ignoreCause_(tapCause(self, (cause) => logEffect(cause)))
    }
  )

/**
 * Returns a new channel that retries this channel according to the specified
 * schedule whenever it fails.
 *
 * @category error handling
 * @since 4.0.0
 */
export const retry: {
  <SO, OutErr, SE, SR>(
    schedule:
      | Schedule.Schedule<SO, Types.NoInfer<OutErr>, SE, SR>
      | ((
        $: <SO, SE, SR>(
          _: Schedule.Schedule<SO, Types.NoInfer<OutErr>, SE, SR>
        ) => Schedule.Schedule<SO, OutErr, SE, SR>
      ) => Schedule.Schedule<SO, Types.NoInfer<OutErr>, SE, SR>)
  ): <OutElem, OutDone, InElem, InErr, InDone, Env>(
    self: Channel<OutElem, OutErr | SE, OutDone, InElem, InErr, InDone, Env | SR>
  ) => Channel<OutElem, OutErr | SE, OutDone, InElem, InErr, InDone, Env | SR>
  <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env, SO, SE, SR>(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
    schedule:
      | Schedule.Schedule<SO, OutErr, SE, SR>
      | ((
        $: <SO, SE, SR>(
          _: Schedule.Schedule<SO, Types.NoInfer<OutErr>, SE, SR>
        ) => Schedule.Schedule<SO, OutErr, SE, SR>
      ) => Schedule.Schedule<SO, Types.NoInfer<OutErr>, SE, SR>)
  ): Channel<OutElem, OutErr | SE, OutDone, InElem, InErr, InDone, Env | SR>
} = dual(2, <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env, SO, SE, SR>(
  self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
  schedule:
    | Schedule.Schedule<SO, OutErr, SE, SR>
    | ((
      $: <O, SE, R>(_: Schedule.Schedule<O, Types.NoInfer<OutErr>, SE, R>) => Schedule.Schedule<O, OutErr, SE, R>
    ) => Schedule.Schedule<SO, Types.NoInfer<OutErr>, SE, SR>)
): Channel<OutElem, OutErr | SE, OutDone, InElem, InErr, InDone, Env | SR> =>
  suspend(() => {
    let step: ((input: OutErr) => Pull.Pull<Schedule.Metadata<SO, OutErr>, SE, SO, SR>) | undefined = undefined
    let meta = Schedule.CurrentMetadata.defaultValue()
    const selfWithMeta = provideServiceEffect(self, Schedule.CurrentMetadata, Effect.sync(() => meta))
    const withReset = onFirst(selfWithMeta, () => {
      step = undefined
      return Effect.void
    })
    const resolvedSchedule = typeof schedule === "function" ? schedule(identity_) : schedule
    const loop: Channel<
      OutElem,
      OutErr | SE,
      OutDone,
      InElem,
      InErr,
      InDone,
      Env | SR
    > = catch_(
      withReset,
      Effect.fnUntraced(
        function*(error) {
          if (!step) {
            step = yield* Schedule.toStepWithMetadata(resolvedSchedule)
          }
          meta = yield* step(error)
          return loop
        },
        (effect, error) => Pull.catchDone(effect, () => Effect.succeed(fail(error))),
        unwrap
      )
    )
    return loop
  }))

/**
 * Maps each output element to a channel and emits values from the most recent
 * active child channels.
 *
 * **Details**
 *
 * With the default concurrency of `1`, starting a new child channel interrupts
 * the previous child channel. Use `options.concurrency` to allow more active
 * child channels. The source channel's done value is preserved.
 *
 * **Example** (Switching mapped channels)
 *
 * ```ts import.meta.vitest
 * import { Channel, Data, Effect } from "effect"
 *
 * class SwitchError extends Data.TaggedError("SwitchError")<{
 *   readonly reason: string
 * }> {}
 *
 * // Create a channel that outputs numbers
 * const numberChannel = Channel.fromIterable([1, 2, 3])
 *
 * // Switch to new channels based on each value
 * const switchedChannel = Channel.switchMap(
 *   numberChannel,
 *   (n) => Channel.fromIterable([`value-${n}`])
 * )
 *
 * await Effect.runPromise(Channel.runCollect(switchedChannel)) // => ["value-3"]
 * ```
 *
 * @category sequencing
 * @since 4.0.0
 */
export const switchMap: {
  <OutElem, OutElem1, OutErr1, OutDone1, InElem1, InErr1, InDone1, Env1>(
    f: (d: OutElem) => Channel<OutElem1, OutErr1, OutDone1, InElem1, InErr1, InDone1, Env1>,
    options?: {
      readonly concurrency?: Types.Concurrency | undefined
      readonly bufferSize?: number | undefined
    }
  ): <OutErr, OutDone, InElem, InErr, InDone, Env>(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>
  ) => Channel<
    OutElem1,
    OutErr1 | OutErr,
    OutDone,
    InElem & InElem1,
    InErr & InErr1,
    InDone & InDone1,
    Env1 | Env
  >
  <
    OutElem,
    OutErr,
    OutDone,
    InElem,
    InErr,
    InDone,
    Env,
    OutElem1,
    OutErr1,
    OutDone1,
    InElem1,
    InErr1,
    InDone1,
    Env1
  >(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
    f: (d: OutElem) => Channel<OutElem1, OutErr1, OutDone1, InElem1, InErr1, InDone1, Env1>,
    options?: {
      readonly concurrency?: Types.Concurrency | undefined
      readonly bufferSize?: number | undefined
    }
  ): Channel<
    OutElem1,
    OutErr | OutErr1,
    OutDone,
    InElem & InElem1,
    InErr & InErr1,
    InDone & InDone1,
    Env | Env1
  >
} = dual(
  (args) => isChannel(args[0]),
  <
    OutElem,
    OutErr,
    OutDone,
    InElem,
    InErr,
    InDone,
    Env,
    OutElem1,
    OutErr1,
    OutDone1,
    InElem1,
    InErr1,
    InDone1,
    Env1
  >(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
    f: (d: OutElem) => Channel<OutElem1, OutErr1, OutDone1, InElem1, InErr1, InDone1, Env1>,
    options?: {
      readonly concurrency?: Types.Concurrency | undefined
      readonly bufferSize?: number | undefined
    }
  ): Channel<
    OutElem1,
    OutErr | OutErr1,
    OutDone,
    InElem & InElem1,
    InErr & InErr1,
    InDone & InDone1,
    Env | Env1
  > =>
    self.pipe(
      map(f),
      mergeAll({
        ...options,
        concurrency: options?.concurrency ?? 1,
        switch: true
      })
    )
)

/**
 * Merges multiple channels with specified concurrency and buffering options.
 *
 * **When to use**
 *
 * Use when channel outputs are themselves channels and multiple inner channels
 * should run with configured concurrency and buffering.
 *
 * **Example** (Merging nested channels)
 *
 * ```ts import.meta.vitest
 * import { Channel, Data, Effect } from "effect"
 *
 * class MergeAllError extends Data.TaggedError("MergeAllError")<{
 *   readonly reason: string
 * }> {}
 *
 * // Create channels that output other channels
 * const nestedChannels = Channel.fromIterable([
 *   Channel.fromIterable([1, 2]),
 *   Channel.fromIterable([3, 4]),
 *   Channel.fromIterable([5, 6])
 * ])
 *
 * // Merge all channels with bounded concurrency
 * const mergedChannel = Channel.mergeAll({
 *   concurrency: 1,
 *   bufferSize: 16
 * })(nestedChannels)
 *
 * await Effect.runPromise(Channel.runCollect(mergedChannel)) // => [1, 2, 3, 4, 5, 6]
 * ```
 *
 * @category combining
 * @since 2.0.0
 */
export const mergeAll: {
  (options: {
    readonly concurrency: Types.Concurrency
    readonly bufferSize?: number | undefined
    readonly switch?: boolean | undefined
  }): <OutElem, OutErr1, OutDone1, InElem1, InErr1, InDone1, Env1, OutErr, OutDone, InElem, InErr, InDone, Env>(
    channels: Channel<
      Channel<OutElem, OutErr1, OutDone1, InElem1, InErr1, InDone1, Env1>,
      OutErr,
      OutDone,
      InElem,
      InErr,
      InDone,
      Env
    >
  ) => Channel<
    OutElem,
    OutErr1 | OutErr,
    OutDone,
    InElem & InElem1,
    InErr & InErr1,
    InDone & InDone1,
    Env1 | Env
  >
  <OutElem, OutErr1, OutDone1, InElem1, InErr1, InDone1, Env1, OutErr, OutDone, InElem, InErr, InDone, Env>(
    channels: Channel<
      Channel<OutElem, OutErr1, OutDone1, InElem1, InErr1, InDone1, Env1>,
      OutErr,
      OutDone,
      InElem,
      InErr,
      InDone,
      Env
    >,
    options: {
      readonly concurrency: Types.Concurrency
      readonly bufferSize?: number | undefined
      readonly switch?: boolean | undefined
    }
  ): Channel<
    OutElem,
    OutErr1 | OutErr,
    OutDone,
    InElem & InElem1,
    InErr & InErr1,
    InDone & InDone1,
    Env1 | Env
  >
} = dual(
  2,
  <OutElem, OutErr1, OutDone1, InElem1, InErr1, InDone1, Env1, OutErr, OutDone, InElem, InErr, InDone, Env>(
    channels: Channel<
      Channel<OutElem, OutErr1, OutDone1, InElem1, InErr1, InDone1, Env1>,
      OutErr,
      OutDone,
      InElem,
      InErr,
      InDone,
      Env
    >,
    { bufferSize = 16, concurrency, switch: switch_ = false }: {
      readonly concurrency: Types.Concurrency
      readonly bufferSize?: number | undefined
      readonly switch?: boolean | undefined
    }
  ): Channel<
    OutElem,
    OutErr1 | OutErr,
    OutDone,
    InElem & InElem1,
    InErr & InErr1,
    InDone & InDone1,
    Env1 | Env
  > =>
    fromTransformBracket(
      Effect.fnUntraced(function*(upstream, scope, forkedScope) {
        const concurrencyN = concurrency === "unbounded"
          ? Number.MAX_SAFE_INTEGER
          : Math.max(1, concurrency)
        const semaphore = switch_ ? undefined : Semaphore.makeUnsafe(concurrencyN)
        const doneLatch = yield* Latch.make(true)
        const fibers = new Set<Fiber.Fiber<any, any>>()

        const queue = yield* Queue.bounded<OutElem, OutErr | OutErr1 | Cause.Done<OutDone>>(
          bufferSize
        )
        yield* Scope.addFinalizer(forkedScope, Queue.shutdown(queue))

        const pull = yield* toTransform(channels)(upstream, scope)

        yield* Effect.gen(function*() {
          while (true) {
            let pullFiber: Fiber.Fiber<Pull.Success<typeof pull>, any> | undefined
            if (semaphore) {
              if (fibers.size < concurrencyN) {
                yield* semaphore.take(1)
              } else {
                pullFiber = yield* Effect.forkChild(pull)
                yield* Effect.raceFirst(
                  semaphore.take(1),
                  Effect.andThen(Fiber.join(pullFiber), Effect.never)
                )
              }
            }
            const channel = pullFiber === undefined
              ? yield* pull
              : yield* Fiber.join(pullFiber)
            const childScope = Scope.forkUnsafe(forkedScope)
            const childPull = yield* toTransform(channel)(upstream, childScope)

            while (fibers.size >= concurrencyN) {
              const fiber = Iterable.headUnsafe(fibers)
              fibers.delete(fiber)
              if (fibers.size === 0) yield* doneLatch.open
              yield* Fiber.interrupt(fiber)
            }

            const fiber = yield* childPull.pipe(
              Effect.tap(() => Effect.yieldNow),
              Effect.flatMap((value) => Queue.offer(queue, value)),
              Effect.forever({ disableYield: true }),
              Effect.onError(Effect.fnUntraced(function*(cause) {
                const halt = Pull.filterDone(cause)
                yield* Effect.exit(Scope.close(
                  childScope,
                  !Result.isFailure(halt) ? Exit.succeed(halt.success.value) : Exit.failCause(halt.failure)
                ))
                if (!fibers.has(fiber)) return
                fibers.delete(fiber)
                if (semaphore) yield* semaphore.release(1)
                if (fibers.size === 0) yield* doneLatch.open
                if (Result.isSuccess(halt)) return
                return yield* Queue.failCause(queue, cause as any)
              })),
              Effect.forkChild
            )

            doneLatch.closeUnsafe()
            fibers.add(fiber)
          }
        }).pipe(
          Effect.catchCause((cause) => {
            const halt = Pull.filterDone(cause)
            if (Result.isSuccess(halt)) {
              return doneLatch.whenOpen(Queue.failCause(queue, cause))
            }
            return Queue.failCause(queue, cause)
          }),
          Effect.forkIn(forkedScope)
        )

        return Queue.take(queue)
      })
    )
)

/**
 * Represents strategies for halting merged channels when one completes or fails.
 *
 * **Example** (Choosing merge halt strategies)
 *
 * ```ts import.meta.vitest
 * import { Channel } from "effect"
 *
 * // Different halt strategies for channel merging
 * const strategies: Array<Channel.HaltStrategy> = ["left", "right", "both", "either"] // => ["left", "right", "both", "either"]
 * ```
 *
 * @category models
 * @since 4.0.0
 */
export type HaltStrategy = "left" | "right" | "both" | "either"

/**
 * Returns a new channel, which is the merge of this channel and the specified
 * channel.
 *
 * **Example** (Merging channels)
 *
 * ```ts import.meta.vitest
 * import { Channel, Effect } from "effect"
 *
 * // Create two channels
 * const leftChannel = Channel.fromIterable([1, 2, 3])
 * const rightChannel = Channel.fromIterable(["a", "b", "c"])
 *
 * // The default "both" strategy waits for both channels to complete
 * const mergedChannel = Channel.merge(leftChannel, rightChannel)
 *
 * const values = await Effect.runPromise(Channel.runCollect(mergedChannel))
 * values.map(String).sort() // => ["1", "2", "3", "a", "b", "c"]
 * ```
 *
 * @category combining
 * @since 4.0.0
 */
export const merge: {
  <OutElem1, OutErr1, OutDone1, InElem1, InErr1, InDone1, Env1>(
    right: Channel<OutElem1, OutErr1, OutDone1, InElem1, InErr1, InDone1, Env1>,
    options?: {
      readonly haltStrategy?: HaltStrategy | undefined
    } | undefined
  ): <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>(
    left: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>
  ) => Channel<
    OutElem1 | OutElem,
    OutErr | OutErr1,
    OutDone | OutDone1,
    InElem & InElem1,
    InErr & InErr1,
    InDone & InDone1,
    Env1 | Env
  >
  <
    OutElem,
    OutErr,
    OutDone,
    InElem,
    InErr,
    InDone,
    Env,
    OutElem1,
    OutErr1,
    OutDone1,
    InElem1,
    InErr1,
    InDone1,
    Env1
  >(
    left: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
    right: Channel<OutElem1, OutErr1, OutDone1, InElem1, InErr1, InDone1, Env1>,
    options?: {
      readonly haltStrategy?: HaltStrategy | undefined
    } | undefined
  ): Channel<
    OutElem | OutElem1,
    OutErr | OutErr1,
    OutDone | OutDone1,
    InElem & InElem1,
    InErr & InErr1,
    InDone & InDone1,
    Env | Env1
  >
} = dual((args) => isChannel(args[0]) && isChannel(args[1]), <
  OutElem,
  OutErr,
  OutDone,
  InElem,
  InErr,
  InDone,
  Env,
  OutElem1,
  OutErr1,
  OutDone1,
  InElem1,
  InErr1,
  InDone1,
  Env1
>(
  left: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
  right: Channel<OutElem1, OutErr1, OutDone1, InElem1, InErr1, InDone1, Env1>,
  options?: {
    readonly haltStrategy?: HaltStrategy | undefined
  } | undefined
): Channel<
  OutElem | OutElem1,
  OutErr | OutErr1,
  OutDone | OutDone1,
  InElem & InElem1,
  InErr & InErr1,
  InDone & InDone1,
  Env | Env1
> =>
  fromTransformBracket(Effect.fnUntraced(function*(upstream, _scope, forkedScope) {
    const strategy = options?.haltStrategy ?? "both"
    const queue = yield* Queue.bounded<OutElem | OutElem1, OutErr | OutErr1 | Cause.Done<OutDone | OutDone1>>(0)
    yield* Scope.addFinalizer(forkedScope, Queue.shutdown(queue))
    let done = 0
    function onExit(
      side: "left" | "right",
      cause: Cause.Cause<OutErr | OutErr1 | Cause.Done<OutDone | OutDone1>>
    ): Effect.Effect<void> {
      done++
      if (!Pull.isDoneCause(cause)) {
        return Queue.failCause(queue, cause)
      }
      switch (strategy) {
        case "both": {
          return done === 2 ? Queue.failCause(queue, cause) : Effect.void
        }
        case "left":
        case "right": {
          return side === strategy ? Queue.failCause(queue, cause) : Effect.void
        }
        case "either": {
          return Queue.failCause(queue, cause)
        }
      }
    }
    const runSide = (
      side: "left" | "right",
      channel: Channel<
        OutElem | OutElem1,
        OutErr | OutErr1,
        OutDone | OutDone1,
        InElem & InElem1,
        InErr & InErr1,
        InDone & InDone1,
        Env | Env1
      >,
      scope: Scope.Closeable
    ) =>
      toTransform(channel)(upstream, scope).pipe(
        Effect.flatMap((pull) =>
          pull.pipe(
            Effect.flatMap((value) => Queue.offer(queue, value)),
            Effect.forever
          )
        ),
        Effect.onError((cause) =>
          Effect.andThen(
            Scope.close(scope, Pull.doneExitFromCause(cause)),
            onExit(side, cause)
          )
        ),
        Effect.forkIn(forkedScope)
      )
    yield* runSide("left", left, Scope.forkUnsafe(forkedScope))
    yield* runSide("right", right, Scope.forkUnsafe(forkedScope))
    return Queue.take(queue)
  })))

/**
 * Runs an effect concurrently with a channel while emitting only the channel's
 * output elements.
 *
 * **When to use**
 *
 * Use when a side effect should run for the lifetime of a channel and only the
 * channel's output elements should be emitted.
 *
 * **Details**
 *
 * The effect's successful value is ignored. If the effect fails while the
 * channel is running, the returned channel fails with that error.
 *
 * @category combining
 * @since 4.0.0
 */
export const mergeEffect: {
  <X, E, R>(
    effect: Effect.Effect<X, E, R>
  ): <OutElem, OutDone, OutErr, InElem, InErr, InDone, Env>(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>
  ) => Channel<OutElem, OutErr | E, OutDone, InElem, InErr, InDone, Env | R>
  <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env, X, E, R>(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
    effect: Effect.Effect<X, E, R>
  ): Channel<OutElem, OutErr | E, OutDone, InElem, InErr, InDone, Env | R>
} = dual(2, <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env, X, E, R>(
  self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
  effect: Effect.Effect<X, E, R>
): Channel<OutElem, OutErr | E, OutDone, InElem, InErr, InDone, Env | R> =>
  merge(
    self,
    fromEffectDrain(effect),
    { haltStrategy: "left" }
  ) as any)

/**
 * Splits upstream string chunks into lines, recognizing `\n`, `\r\n`, and
 * standalone `\r` as line terminators. The behavior matches
 * `String.linesIterator` regardless of how the input is chunked.
 *
 * **Details**
 *
 * A line terminator at the very end of the stream does **not** produce a
 * trailing empty line (consistent with `String.linesIterator`). Conversely,
 * if the stream ends without a terminator the final partial line is still
 * emitted.
 *
 * **Example** (Splitting string chunks into lines)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 *
 * const result = await Effect.runPromise(Stream.runCollect(
 *   Stream.splitLines(Stream.make("hel", "lo\r\nwor", "ld\n"))
 * ))
 * result // => ["hello", "world"]
 * ```
 *
 * @category splitting
 * @since 2.0.0
 */
export const splitLines = <Err, Done>(): Channel<
  Arr.NonEmptyReadonlyArray<string>,
  Err,
  Done,
  Arr.NonEmptyReadonlyArray<string>,
  Err,
  Done
> =>
  fromTransform((upstream, _scope) =>
    Effect.sync(() => {
      // Accumulates text that has not yet been terminated by a line break.
      // Content is carried across chunks until a terminator is found.
      let stringBuilder = ""
      // A trailing \r completes the line immediately. Remember it only to
      // suppress a leading \n in the next nonempty string.
      let midCRLF = false
      // Remembers the upstream Done value after the first time the upstream
      // signals completion, so subsequent pulls return Done immediately
      // without pulling upstream again.
      let done = Option.none<Done>()

      function splitLinesArray(chunk: Arr.NonEmptyReadonlyArray<string>): Arr.NonEmptyReadonlyArray<string> | null {
        const chunkBuilder: Array<string> = []

        function pushLine(segment: string): void {
          if (stringBuilder.length === 0) {
            chunkBuilder.push(segment)
          } else {
            chunkBuilder.push(stringBuilder + segment)
            stringBuilder = ""
          }
        }

        for (let i = 0; i < chunk.length; i++) {
          const str = chunk[i]
          if (str.length !== 0) {
            let from = 0
            let indexOfCR = str.indexOf("\r")
            let indexOfLF = str.indexOf("\n")
            if (midCRLF) {
              if (indexOfLF === 0) {
                from = 1
                indexOfLF = str.indexOf("\n", from)
              }
              midCRLF = false
            }
            while (indexOfCR !== -1 || indexOfLF !== -1) {
              if (indexOfCR === -1 || (indexOfLF !== -1 && indexOfLF < indexOfCR)) {
                pushLine(str.substring(from, indexOfLF))
                from = indexOfLF + 1
                indexOfLF = str.indexOf("\n", from)
              } else {
                pushLine(str.substring(from, indexOfCR))
                if (str.length === indexOfCR + 1) {
                  midCRLF = true
                  from = str.length
                  indexOfCR = -1
                } else {
                  from = indexOfCR + (indexOfLF === indexOfCR + 1 ? 2 : 1)
                  indexOfCR = str.indexOf("\r", from)
                  indexOfLF = str.indexOf("\n", from)
                }
              }
            }
            stringBuilder = stringBuilder + str.substring(from)
          }
        }
        return Arr.isReadonlyArrayNonEmpty(chunkBuilder) ? chunkBuilder : null
      }

      const pullOrFlush: Pull.Pull<Arr.NonEmptyReadonlyArray<string>, Err, Done> = Effect.suspend(() => {
        if (done._tag === "Some") {
          return Cause.done(done.value)
        }
        return Pull.matchEffect(upstream, {
          onSuccess: loop,
          onFailure: Effect.failCause,
          onDone: (leftover) => {
            done = Option.some(leftover)
            if (stringBuilder.length > 0) {
              const last = stringBuilder
              stringBuilder = ""
              midCRLF = false
              return Effect.succeed([last] as Arr.NonEmptyReadonlyArray<string>)
            }
            return Cause.done(leftover)
          }
        })
      })

      function loop(chunk: Arr.NonEmptyReadonlyArray<string>): Pull.Pull<Arr.NonEmptyReadonlyArray<string>, Err, Done> {
        const lines = splitLinesArray(chunk)
        return lines !== null ? Effect.succeed(lines) : pullOrFlush
      }

      return pullOrFlush
    })
  )

/**
 * Decodes incoming `Uint8Array` chunks into strings using `TextDecoder`.
 *
 * **Details**
 *
 * Input chunks are decoded with streaming enabled so multi-byte characters may
 * span `Uint8Array` boundaries. The optional `encoding` and `options` are
 * passed to `TextDecoder`.
 *
 * @category decoding
 * @since 4.0.0
 */
export const decodeText = <Err, Done>(encoding?: string, options?: TextDecoderOptions): Channel<
  Arr.NonEmptyReadonlyArray<string>,
  Err,
  Done,
  Arr.NonEmptyReadonlyArray<Uint8Array>,
  Err,
  Done
> =>
  fromTransform((upstream, _scope) =>
    Effect.sync(() => {
      const decoder = new TextDecoder(encoding, options)
      const streamOptions = { stream: true }
      return Effect.map(upstream, Arr.map((line) => decoder.decode(line, streamOptions)))
    })
  )

/**
 * Encodes incoming string chunks into `Uint8Array` values using `TextEncoder`.
 *
 * **Details**
 *
 * Each string inside an emitted array is encoded independently.
 *
 * @category encoding
 * @since 4.0.0
 */
export const encodeText = <Err, Done>(): Channel<
  Arr.NonEmptyReadonlyArray<Uint8Array>,
  Err,
  Done,
  Arr.NonEmptyReadonlyArray<string>,
  Err,
  Done
> =>
  fromTransform((upstream, _scope) =>
    Effect.sync(() => {
      const encoder = new TextEncoder()
      return Effect.map(upstream, Arr.map((line) => encoder.encode(line)))
    })
  )

/**
 * Returns a new channel that pipes the output of this channel into the
 * specified channel. The returned channel has the input type of this channel,
 * and the output type of the specified channel, terminating with the value of
 * the specified channel.
 *
 * **Example** (Piping one channel into another)
 *
 * ```ts import.meta.vitest
 * import { Channel, Data, Effect } from "effect"
 *
 * class PipeError extends Data.TaggedError("PipeError")<{
 *   readonly stage: string
 * }> {}
 *
 * // Create source and transform channels
 * const sourceChannel = Channel.fromIterable([1, 2, 3])
 * const transformChannel = Channel.map(sourceChannel, (n: number) => n * 2)
 *
 * // Pipe the source into the transform
 * const pipedChannel = Channel.pipeTo(sourceChannel, transformChannel)
 *
 * Effect.runSync(Channel.runCollect(pipedChannel)) // => [2, 4, 6]
 * ```
 *
 * @category sequencing
 * @since 2.0.0
 */
export const pipeTo: {
  <OutElem2, OutErr2, OutDone2, OutElem, OutErr, OutDone, Env2>(
    that: Channel<OutElem2, OutErr2, OutDone2, OutElem, OutErr, OutDone, Env2>
  ): <InElem, InErr, InDone, Env>(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>
  ) => Channel<OutElem2, OutErr2, OutDone2, InElem, InErr, InDone, Env2 | Env>
  <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env, OutElem2, OutErr2, OutDone2, Env2>(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
    that: Channel<OutElem2, OutErr2, OutDone2, OutElem, OutErr, OutDone, Env2>
  ): Channel<OutElem2, OutErr2, OutDone2, InElem, InErr, InDone, Env2 | Env>
} = dual(
  2,
  <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env, OutElem2, OutErr2, OutDone2, Env2>(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
    that: Channel<OutElem2, OutErr2, OutDone2, OutElem, OutErr, OutDone, Env2>
  ): Channel<OutElem2, OutErr2, OutDone2, InElem, InErr, InDone, Env2 | Env> =>
    fromTransform((upstream, scope) =>
      Effect.flatMap(toTransform(self)(upstream, scope), (upstream) => toTransform(that)(upstream, scope))
    )
)

/**
 * Returns a new channel that pipes the output of this channel into the
 * specified channel and preserves this channel's failures without providing
 * them to the other channel for observation.
 *
 * **Example** (Piping while preserving failures)
 *
 * ```ts import.meta.vitest
 * import { Channel, Data, Effect, Exit } from "effect"
 *
 * class SourceError extends Data.TaggedError("SourceError")<{
 *   readonly code: number
 * }> {}
 *
 * // Create a failing source channel
 * const error = new SourceError({ code: 404 })
 * const failingSource = Channel.fail(error)
 * const safeTransform = Channel.identity<never, never, never>()
 *
 * // Pipe while preserving source failures
 * const safePipedChannel = Channel.pipeToOrFail(failingSource, safeTransform)
 *
 * Effect.runSync(Effect.exit(Channel.runCollect(safePipedChannel))) // => Exit.fail(error)
 * ```
 *
 * @category sequencing
 * @since 2.0.0
 */
export const pipeToOrFail: {
  <OutElem2, OutErr2, OutDone2, OutElem, OutDone, Env2>(
    that: Channel<OutElem2, OutErr2, OutDone2, OutElem, never, OutDone, Env2>
  ): <OutErr, InElem, InErr, InDone, Env>(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>
  ) => Channel<OutElem2, OutErr | OutErr2, OutDone2, InElem, InErr, InDone, Env2 | Env>
  <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env, OutElem2, OutErr2, OutDone2, Env2>(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
    that: Channel<OutElem2, OutErr2, OutDone2, OutElem, never, OutDone, Env2>
  ): Channel<OutElem2, OutErr | OutErr2, OutDone2, InElem, InErr, InDone, Env2 | Env>
} = dual(
  2,
  <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env, OutElem2, OutErr2, OutDone2, Env2>(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
    that: Channel<OutElem2, OutErr2, OutDone2, OutElem, never, OutDone, Env2>
  ): Channel<OutElem2, OutErr | OutErr2, OutDone2, InElem, InErr, InDone, Env2 | Env> =>
    fromTransform((upstream, scope) =>
      Effect.flatMap(toTransform(self)(upstream, scope), (upstream) => {
        const upstreamPull = Effect.catchCause(
          upstream,
          (cause) => Pull.isDoneCause(cause) ? Effect.failCause(cause) : Effect.die(Cause.Done(cause))
        ) as Pull.Pull<OutElem, never, OutDone>

        return Effect.map(
          toTransform(that)(upstreamPull, scope),
          (pull) =>
            Effect.catchDefect(
              pull,
              (defect) =>
                Cause.isDone(defect) ? Effect.failCause(defect.value as Cause.Cause<OutErr>) : Effect.die(defect)
            )
        )
      })
    )
)

/**
 * Constructs a `Channel` from a scoped effect that will result in a
 * `Channel` if successful.
 *
 * **Example** (Unwrapping channel effects)
 *
 * ```ts import.meta.vitest
 * import { Channel, Data, Effect } from "effect"
 *
 * class UnwrapError extends Data.TaggedError("UnwrapError")<{
 *   readonly reason: string
 * }> {}
 *
 * // Create an effect that produces a channel
 * const channelEffect = Effect.succeed(
 *   Channel.fromIterable([1, 2, 3])
 * )
 *
 * // Unwrap the effect to get the channel
 * const unwrappedChannel = Channel.unwrap(channelEffect)
 *
 * Effect.runSync(Channel.runCollect(unwrappedChannel)) // => [1, 2, 3]
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const unwrap = <OutElem, OutErr, OutDone, InElem, InErr, InDone, R2, E, R>(
  channel: Effect.Effect<Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, R2>, E, R>
): Channel<OutElem, E | OutErr, OutDone, InElem, InErr, InDone, Exclude<R, Scope.Scope> | R2> =>
  fromTransform((upstream, scope) => {
    let pull: Pull.Pull<OutElem, E | OutErr, OutDone> | undefined
    return Effect.succeed(Effect.suspend(() => {
      if (pull) return pull
      return channel.pipe(
        Scope.provide(scope),
        Effect.flatMap((channel) => toTransform(channel)(upstream, scope)),
        Effect.flatMap((pull_) => pull = pull_)
      )
    }))
  })

/**
 * Runs a channel with a scope provided for the duration of the channel
 * execution, removing the channel's `Scope` requirement.
 *
 * @category resource management
 * @since 2.0.0
 */
export const scoped = <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>(
  self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>
): Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Exclude<Env, Scope.Scope>> =>
  fromTransformBracket((upstream, scope, forkedScope) =>
    Effect.map(
      Scope.provide(toTransform(self)(upstream, scope), forkedScope),
      Scope.provide(forkedScope)
    )
  )

/**
 * Runs an input handler against the upstream pull while the wrapped channel
 * runs without receiving upstream input directly.
 *
 * **Details**
 *
 * The input handler is forked in the channel scope. The wrapped channel is run
 * with an already-completed input.
 *
 * **Example** (Embedding custom input handling)
 *
 * ```ts import.meta.vitest
 * import { Channel, Effect } from "effect"
 *
 * // Create a base channel
 * const baseChannel = Channel.fromIterable([1, 2, 3])
 *
 * // Drain the embedded input while the base channel runs
 * const embeddedChannel = Channel.embedInput(
 *   baseChannel,
 *   (upstream) =>
 *     upstream.pipe(
 *       Effect.forever,
 *       Effect.ignore
 *     )
 * )
 * await Effect.runPromise(Channel.runCollect(embeddedChannel)) // => [1, 2, 3]
 * ```
 *
 * @category sequencing
 * @since 2.0.0
 */
export const embedInput: {
  <InElem, InErr, InDone, R>(
    input: (
      upstream: Pull.Pull<InElem, InErr, InDone>
    ) => Effect.Effect<void, never, R>
  ): <OutElem, OutErr, OutDone, Env>(
    self: Channel<OutElem, OutErr, OutDone, unknown, unknown, unknown, Env>
  ) => Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env | R>
  <OutElem, OutErr, OutDone, Env, InErr, InElem, InDone, R>(
    self: Channel<OutElem, OutErr, OutDone, unknown, unknown, unknown, Env>,
    input: (
      upstream: Pull.Pull<InElem, InErr, InDone>
    ) => Effect.Effect<void, never, R>
  ): Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env | R>
} = dual(
  2,
  <OutElem, OutErr, OutDone, Env, InErr, InElem, InDone, R>(
    self: Channel<OutElem, OutErr, OutDone, unknown, unknown, unknown, Env>,
    input: (
      upstream: Pull.Pull<InElem, InErr, InDone>
    ) => Effect.Effect<void, never, R>
  ): Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env | R> =>
    fromTransformBracket((upstream, scope, forkedScope) =>
      Effect.andThen(
        Effect.forkIn(input(upstream), forkedScope),
        toTransform(self)(Cause.done(), scope)
      )
    )
)

/**
 * Buffers individual output elements in a queue with the configured `capacity`
 * so a faster producer can progress independently of a slower consumer.
 *
 * **When to use**
 *
 * Use when output elements can be decoupled from downstream demand and the
 * configured backpressure or loss strategy is acceptable.
 *
 * **Details**
 *
 * Finite queues use the `strategy` option. The default `"suspend"` strategy
 * applies backpressure, while `"dropping"` and `"sliding"` can discard output
 * elements when the queue is full. `"unbounded"` capacity does not use a finite
 * capacity strategy.
 *
 * **Gotchas**
 *
 * Dropping and sliding strategies can lose output elements under backpressure.
 *
 * @see {@link bufferArray} for buffering elements from array outputs
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
  ): <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>
  ) => Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>
  <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
    options: { readonly capacity: "unbounded" } | {
      readonly capacity: number
      readonly strategy?: "dropping" | "sliding" | "suspend" | undefined
    }
  ): Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>
} = dual(2, <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>(
  self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
  options: { readonly capacity: "unbounded" } | {
    readonly capacity: number
    readonly strategy?: "dropping" | "sliding" | "suspend" | undefined
  }
): Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env> =>
  fromTransform(Effect.fnUntraced(function*(upstream, scope) {
    const pull = yield* toTransform(self)(upstream, scope)
    const queue = yield* Queue.make<OutElem, OutErr | Cause.Done<OutDone>>({
      capacity: options.capacity === "unbounded" ? undefined : options.capacity,
      strategy: options.capacity === "unbounded" ? undefined : options.strategy
    })
    yield* Scope.addFinalizer(scope, Queue.shutdown(queue))
    yield* pull.pipe(
      Effect.flatMap((value) => Queue.offer(queue, value)),
      Effect.forever({ disableYield: true }),
      Effect.onError((cause) => Queue.failCause(queue, cause)),
      Effect.forkIn(scope)
    )
    return Queue.take(queue)
  })))

/**
 * Buffers array output elements in a queue with the configured `capacity` so a
 * faster producer can progress independently of a slower consumer.
 *
 * **When to use**
 *
 * Use when emitted arrays are batches of elements and it is acceptable for
 * buffering to flatten and rebuild those batches.
 *
 * **Details**
 *
 * Finite queues use the `strategy` option. The default `"suspend"` strategy
 * applies backpressure, while `"dropping"` and `"sliding"` can discard output
 * elements when the queue is full. `"unbounded"` capacity does not use a finite
 * capacity strategy.
 *
 * **Gotchas**
 *
 * Input arrays are offered to the queue element-by-element and outputs are
 * rebuilt from the currently available queued elements, so upstream array
 * boundaries are not preserved.
 *
 * @see {@link buffer} for buffering output elements without flattening arrays
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
  ): <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>(
    self: Channel<Arr.NonEmptyReadonlyArray<OutElem>, OutErr, OutDone, InElem, InErr, InDone, Env>
  ) => Channel<Arr.NonEmptyReadonlyArray<OutElem>, OutErr, OutDone, InElem, InErr, InDone, Env>
  <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>(
    self: Channel<Arr.NonEmptyReadonlyArray<OutElem>, OutErr, OutDone, InElem, InErr, InDone, Env>,
    options: { readonly capacity: "unbounded" } | {
      readonly capacity: number
      readonly strategy?: "dropping" | "sliding" | "suspend" | undefined
    }
  ): Channel<Arr.NonEmptyReadonlyArray<OutElem>, OutErr, OutDone, InElem, InErr, InDone, Env>
} = dual(2, <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>(
  self: Channel<Arr.NonEmptyReadonlyArray<OutElem>, OutErr, OutDone, InElem, InErr, InDone, Env>,
  options: { readonly capacity: "unbounded" } | {
    readonly capacity: number
    readonly strategy?: "dropping" | "sliding" | "suspend" | undefined
  }
): Channel<Arr.NonEmptyReadonlyArray<OutElem>, OutErr, OutDone, InElem, InErr, InDone, Env> =>
  fromTransform(Effect.fnUntraced(function*(upstream, scope) {
    const pull = yield* toTransform(self)(upstream, scope)
    const queue = yield* Queue.make<OutElem, OutErr | Cause.Done<OutDone>>({
      capacity: options.capacity === "unbounded" ? undefined : options.capacity,
      strategy: options.capacity === "unbounded" ? undefined : options.strategy
    })
    yield* Scope.addFinalizer(scope, Queue.shutdown(queue))
    yield* pull.pipe(
      Effect.flatMap((value) => Queue.offerAll(queue, value)),
      Effect.forever({ disableYield: true }),
      Effect.onError((cause) => Queue.failCause(queue, cause)),
      Effect.forkIn(scope)
    )
    return Queue.takeAll(queue)
  })))

/**
 * Interrupts a channel when another effect completes.
 *
 * **When to use**
 *
 * Use to race channel execution against an external effect whose success can
 * become the channel's done value.
 *
 * **Details**
 *
 * If the effect completes first, its success value becomes the returned
 * channel's done value. If the channel completes first, the original channel's
 * done value is preserved.
 *
 * @category interruption
 * @since 2.0.0
 */
export const interruptWhen: {
  <OutDone2, OutErr2, Env2>(
    effect: Effect.Effect<OutDone2, OutErr2, Env2>
  ): <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>
  ) => Channel<OutElem, OutErr | OutErr2, OutDone | OutDone2, InElem, InErr, InDone, Env2 | Env>
  <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env, OutDone2, OutErr2, Env2>(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
    effect: Effect.Effect<OutDone2, OutErr2, Env2>
  ): Channel<OutElem, OutErr | OutErr2, OutDone | OutDone2, InElem, InErr, InDone, Env2 | Env>
} = dual(2, <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env, OutDone2, OutErr2, Env2>(
  self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
  effect: Effect.Effect<OutDone2, OutErr2, Env2>
): Channel<OutElem, OutErr | OutErr2, OutDone | OutDone2, InElem, InErr, InDone, Env2 | Env> =>
  merge(
    self,
    fromPull(Effect.succeed(Effect.flatMap(effect, Cause.done))),
    { haltStrategy: "either" }
  ))

/**
 * Stops a channel when the specified effect completes or fails.
 *
 * **Details**
 *
 * If the effect completes before the channel is done, its success value becomes
 * the returned channel's done value. If the effect fails, the returned channel
 * fails with that error. If the channel completes first, the channel's done
 * value is preserved.
 *
 * @category interruption
 * @since 4.0.0
 */
export const haltWhen: {
  <OutDone2, OutErr2, Env2>(
    effect: Effect.Effect<OutDone2, OutErr2, Env2>
  ): <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>
  ) => Channel<OutElem, OutErr | OutErr2, OutDone | OutDone2, InElem, InErr, InDone, Env2 | Env>
  <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env, OutDone2, OutErr2, Env2>(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
    effect: Effect.Effect<OutDone2, OutErr2, Env2>
  ): Channel<OutElem, OutErr | OutErr2, OutDone | OutDone2, InElem, InErr, InDone, Env2 | Env>
} = dual(2, <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env, OutDone2, OutErr2, Env2>(
  self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
  effect: Effect.Effect<OutDone2, OutErr2, Env2>
): Channel<OutElem, OutErr | OutErr2, OutDone | OutDone2, InElem, InErr, InDone, Env2 | Env> =>
  fromTransformBracket(Effect.fnUntraced(function*(upstream, scope, forkedScope) {
    const pull = yield* toTransform(self)(upstream, scope)
    const fiber = yield* Effect.forkIn(effect, forkedScope, { startImmediately: true })
    return Effect.suspend((): Pull.Pull<OutElem, OutErr | OutErr2, OutDone | OutDone2> => {
      const exit = fiber.pollUnsafe()
      return exit === undefined
        ? pull
        : Exit.match(exit, {
          onFailure: Effect.failCause,
          onSuccess: Cause.done
        })
    })
  })))

/**
 * Attaches a finalizer that runs only when the channel exits with failure.
 *
 * **Details**
 *
 * The finalizer receives the failure `Cause`. The original channel failure is
 * preserved. The finalizer itself must not fail.
 *
 * @category error handling
 * @since 4.0.0
 */
export const onError: {
  <OutDone, OutErr, Env2>(
    finalizer: (cause: Cause.Cause<OutErr>) => Effect.Effect<unknown, never, Env2>
  ): <OutElem, InElem, InErr, InDone, Env>(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>
  ) => Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env2 | Env>
  <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env, Env2>(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
    finalizer: (cause: Cause.Cause<OutErr>) => Effect.Effect<unknown, never, Env2>
  ): Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env2 | Env>
} = dual(2, <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env, Env2>(
  self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
  finalizer: (cause: Cause.Cause<OutErr>) => Effect.Effect<unknown, never, Env2>
): Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env2 | Env> =>
  onExit(self, (exit) => Exit.isFailure(exit) ? finalizer(exit.cause) : Effect.void))

/**
 * Returns a channel with an exit-aware finalizer that is guaranteed to run once
 * the channel begins execution, whether it succeeds or fails.
 *
 * **Example** (Running exit finalizers)
 *
 * ```ts import.meta.vitest
 * import { Channel, Data, Effect, Exit } from "effect"
 *
 * class ExitError extends Data.TaggedError("ExitError")<{
 *   readonly stage: string
 * }> {}
 *
 * // Create a channel
 * const dataChannel = Channel.fromIterable([1, 2, 3])
 *
 * // Attach exit handler
 * const exits: Array<Exit.Exit<void, ExitError>> = []
 * const channelWithExit = Channel.onExit(dataChannel, (exit) => {
 *   exits.push(exit)
 *   return Effect.void
 * })
 * const observed = [await Effect.runPromise(Channel.runCollect(channelWithExit)), exits] // => [[1, 2, 3], [Exit.void]]
 * ```
 *
 * @category resource management
 * @since 4.0.0
 */
export const onExit: {
  <OutDone, OutErr, Env2>(
    finalizer: (e: Exit.Exit<OutDone, OutErr>) => Effect.Effect<unknown, never, Env2>
  ): <OutElem, InElem, InErr, InDone, Env>(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>
  ) => Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env2 | Env>
  <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env, Env2>(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
    finalizer: (e: Exit.Exit<OutDone, OutErr>) => Effect.Effect<unknown, never, Env2>
  ): Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env2 | Env>
} = dual(2, <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env, Env2>(
  self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
  finalizer: (e: Exit.Exit<OutDone, OutErr>) => Effect.Effect<unknown, never, Env2>
): Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env2 | Env> =>
  fromTransformBracket((upstream, scope, forkedScope) =>
    Scope.addFinalizerExit(forkedScope, finalizer as any).pipe(
      Effect.andThen(toTransform(self)(upstream, scope))
    )
  ))

/**
 * Runs an effect before the channel starts.
 *
 * **Details**
 *
 * The effect's successful value is ignored. If the effect fails, the returned
 * channel fails before running the source channel.
 *
 * @category hooks
 * @since 4.0.0
 */
export const onStart: {
  <A, E, R>(
    onStart: Effect.Effect<A, E, R>
  ): <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>
  ) => Channel<OutElem, OutErr | E, OutDone, InElem, InErr, InDone, Env | R>
  <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env, A, E, R>(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
    onStart: Effect.Effect<A, E, R>
  ): Channel<OutElem, OutErr | E, OutDone, InElem, InErr, InDone, Env | R>
} = dual(2, <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env, A, E, R>(
  self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
  onStart: Effect.Effect<A, E, R>
): Channel<OutElem, OutErr | E, OutDone, InElem, InErr, InDone, Env | R> => unwrap(Effect.as(onStart, self)))

/**
 * Runs an effect the first time the channel emits an output element.
 *
 * **When to use**
 *
 * Use when initialization depends on the first output element rather than only
 * on channel startup.
 *
 * **Details**
 *
 * The effect receives the first emitted element. The first element is still
 * emitted unchanged. The effect is not run if the channel completes without
 * emitting an element.
 *
 * @category hooks
 * @since 4.0.0
 */
export const onFirst: {
  <OutElem, A, E, R>(
    onFirst: (element: Types.NoInfer<OutElem>) => Effect.Effect<A, E, R>
  ): <OutErr, OutDone, InElem, InErr, InDone, Env>(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>
  ) => Channel<OutElem, OutErr | E, OutDone, InElem, InErr, InDone, Env | R>
  <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env, A, E, R>(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
    onFirst: (element: Types.NoInfer<OutElem>) => Effect.Effect<A, E, R>
  ): Channel<OutElem, OutErr | E, OutDone, InElem, InErr, InDone, Env | R>
} = dual(2, <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env, A, E, R>(
  self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
  onFirst: (element: Types.NoInfer<OutElem>) => Effect.Effect<A, E, R>
): Channel<OutElem, OutErr | E, OutDone, InElem, InErr, InDone, Env | R> =>
  transformPull(self, (pull) =>
    Effect.sync(() => {
      let isFirst = true
      const pullFirst = Effect.tap(pull, (element) => {
        isFirst = false
        return onFirst(element)
      })
      return Effect.suspend(() => isFirst ? pullFirst : pull)
    })))

/**
 * Runs an effect when the channel completes successfully.
 *
 * **Details**
 *
 * The effect runs before the original done value is propagated. The effect is
 * not run when the channel fails. If the effect fails, the returned channel
 * fails with that error.
 *
 * @category hooks
 * @since 4.0.0
 */
export const onEnd: {
  <A, E, R>(
    onEnd: Effect.Effect<A, E, R>
  ): <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>
  ) => Channel<OutElem, OutErr | E, OutDone, InElem, InErr, InDone, Env | R>
  <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env, A, E, R>(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
    onEnd: Effect.Effect<A, E, R>
  ): Channel<OutElem, OutErr | E, OutDone, InElem, InErr, InDone, Env | R>
} = dual(2, <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env, A, E, R>(
  self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
  onEnd: Effect.Effect<A, E, R>
): Channel<OutElem, OutErr | E, OutDone, InElem, InErr, InDone, Env | R> =>
  transformPull(self, (pull) =>
    Effect.succeed(Pull.catchDone(
      pull,
      (leftover) => Effect.flatMap(onEnd, () => Cause.done(leftover as OutDone))
    ))))

/**
 * Returns a channel with a finalizer effect that is guaranteed to run once the
 * channel begins execution, whether it succeeds or fails.
 *
 * **Example** (Ensuring cleanup runs)
 *
 * ```ts import.meta.vitest
 * import { Channel, Data, Effect } from "effect"
 *
 * class EnsureError extends Data.TaggedError("EnsureError")<{
 *   readonly operation: string
 * }> {}
 *
 * // Create a channel
 * const dataChannel = Channel.fromIterable([1, 2, 3])
 *
 * // Ensure cleanup always runs
 * const events: Array<string> = []
 * const channelWithCleanup = Channel.ensuring(
 *   dataChannel,
 *   Effect.sync(() => events.push("cleanup"))
 * )
 * const observed = [await Effect.runPromise(Channel.runCollect(channelWithCleanup)), events] // => [[1, 2, 3], ["cleanup"]]
 * ```
 *
 * @category resource management
 * @since 2.0.0
 */
export const ensuring: {
  <Env2>(
    finalizer: Effect.Effect<unknown, never, Env2>
  ): <OutElem, OutDone, OutErr, InElem, InErr, InDone, Env>(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>
  ) => Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env2 | Env>
  <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env, Env2>(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
    finalizer: Effect.Effect<unknown, never, Env2>
  ): Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env2 | Env>
} = dual(2, <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env, Env2>(
  self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
  finalizer: Effect.Effect<unknown, never, Env2>
): Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env2 | Env> => onExit(self, (_) => finalizer))

const runWith = <
  OutElem,
  OutErr,
  OutDone,
  Env,
  EX,
  RX,
  AH = OutDone,
  EH = never,
  RH = never
>(
  self: Channel<OutElem, OutErr, OutDone, unknown, unknown, unknown, Env>,
  f: (pull: Pull.Pull<OutElem, OutErr, OutDone>) => Effect.Effect<void, EX, RX>,
  onHalt?: (leftover: OutDone) => Effect.Effect<AH, EH, RH>
): Effect.Effect<AH, Pull.ExcludeDone<EX> | EH, Env | RX | RH> =>
  Effect.suspend(() => {
    const scope = Scope.makeUnsafe()
    const makePull = toTransform(self)(Cause.done(), scope)
    return Pull.catchDone(Effect.flatMap(makePull, f), onHalt ? onHalt : Effect.succeed as any).pipe(
      Effect.onExit((exit) => Scope.close(scope, exit))
    ) as any
  })

/**
 * Creates a channel from the specified services.
 *
 * @category accessors
 * @since 2.0.0
 */
export const contextWith = <Env, OutElem, OutErr, OutDone, InElem, InErr, InDone, Env2>(
  f: (context: Context.Context<Env>) => Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env2>
): Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env | Env2> =>
  fromTransform((upstream, scope) =>
    Effect.contextWith((context: Context.Context<Env>) => toTransform(f(context))(upstream, scope))
  )

/**
 * Provides a `Context` to the channel, removing the corresponding service
 * requirements from the returned channel.
 *
 * @category providing services
 * @since 2.0.0
 */
export const provideContext: {
  <R2>(
    context: Context.Context<R2>
  ): <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>
  ) => Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Exclude<Env, R2>>
  <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env, R2>(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
    context: Context.Context<R2>
  ): Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Exclude<Env, R2>>
} = dual(2, <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env, R2>(
  self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
  context: Context.Context<R2>
): Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Exclude<Env, R2>> =>
  fromTransform((upstream, scope) =>
    Effect.map(
      Effect.provideContext(toTransform(self)(upstream, scope), context),
      Effect.provideContext(context)
    )
  ))

/**
 * Provides a concrete service for a context key, removing that service
 * requirement from the returned channel.
 *
 * @category providing services
 * @since 2.0.0
 */
export const provideService: {
  <I, S>(
    key: Context.Key<I, S>,
    service: NoInfer<S>
  ): <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>
  ) => Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Exclude<Env, I>>
  <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env, I, S>(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
    key: Context.Key<I, S>,
    service: NoInfer<S>
  ): Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Exclude<Env, I>>
} = dual(3, <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env, I, S>(
  self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
  key: Context.Key<I, S>,
  service: NoInfer<S>
): Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Exclude<Env, I>> =>
  fromTransform((upstream, scope) =>
    Effect.map(
      Effect.provideService(toTransform(self)(upstream, scope), key, service),
      Effect.provideService(key, service)
    )
  ))

/**
 * Provides a service to the channel after obtaining it from an effect.
 *
 * **When to use**
 *
 * Use to supply a channel dependency when constructing the service itself is
 * effectful or can fail.
 *
 * **Details**
 *
 * If the service effect fails, the returned channel fails. The provided service
 * removes the corresponding service requirement from the returned channel.
 *
 * @category providing services
 * @since 4.0.0
 */
export const provideServiceEffect: {
  <I, S, ES, RS>(
    key: Context.Key<I, S>,
    service: Effect.Effect<NoInfer<S>, ES, RS>
  ): <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>
  ) => Channel<OutElem, OutErr | ES, OutDone, InElem, InErr, InDone, Exclude<Env, I> | RS>
  <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env, I, S, ES, RS>(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
    key: Context.Key<I, S>,
    service: Effect.Effect<NoInfer<S>, ES, RS>
  ): Channel<OutElem, OutErr | ES, OutDone, InElem, InErr, InDone, Exclude<Env, I> | RS>
} = dual(3, <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env, I, S, ES, RS>(
  self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
  key: Context.Key<I, S>,
  service: Effect.Effect<NoInfer<S>, ES, RS>
): Channel<OutElem, OutErr | ES, OutDone, InElem, InErr, InDone, Exclude<Env, I> | RS> =>
  fromTransform((upstream, scope) =>
    Effect.flatMap(
      service,
      (s) => toTransform(provideService(self, key, s))(upstream, scope)
    )
  ))

/**
 * Provides a `Layer` or `Context` to the channel, removing the corresponding
 * service requirements.
 *
 * **Details**
 *
 * Providing a `Context` delegates to `provideContext`. Providing a `Layer`
 * builds the layer in the channel scope. Use `options.local` to build a fresh
 * layer instance for this provision.
 *
 * @category providing services
 * @since 4.0.0
 */
export const provide: {
  <A, E = never, R = never>(
    layer: Layer.Layer<A, E, R> | Context.Context<A>,
    options?: {
      readonly local?: boolean | undefined
    } | undefined
  ): <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>
  ) => Channel<OutElem, OutErr | E, OutDone, InElem, InErr, InDone, Exclude<Env, A> | R>
  <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env, A, E = never, R = never>(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
    layer: Layer.Layer<A, E, R> | Context.Context<A>,
    options?: {
      readonly local?: boolean | undefined
    } | undefined
  ): Channel<OutElem, OutErr | E, OutDone, InElem, InErr, InDone, Exclude<Env, A> | R>
} = dual((args) => isChannel(args[0]), <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env, A, E = never, R = never>(
  self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
  layer: Layer.Layer<A, E, R> | Context.Context<A>,
  options?: {
    readonly local?: boolean | undefined
  } | undefined
): Channel<OutElem, OutErr | E, OutDone, InElem, InErr, InDone, Exclude<Env, A> | R> =>
  Context.isContext(layer) ? provideContext(self, layer) : fromTransform((upstream, scope) =>
    Effect.flatMap(
      options?.local
        ? Layer.buildWithMemoMap(layer, Layer.makeMemoMapUnsafe(), scope)
        : Layer.buildWithScope(layer, scope),
      (context) =>
        Effect.map(
          Effect.provideContext(toTransform(self)(upstream, scope), context),
          Effect.provideContext(context)
        )
    )
  ))

/**
 * Transforms the current context before running the channel.
 *
 * **Details**
 *
 * The function receives the surrounding context and returns the context to
 * provide to the channel. The returned channel requires the services needed to
 * build that context.
 *
 * @category providing services
 * @since 4.0.0
 */
export const updateContext: {
  <Env, R2>(
    f: (context: Context.Context<R2>) => Context.Context<Env>
  ): <OutElem, OutErr, OutDone, InElem, InErr, InDone>(
    self: Channel<OutElem, InElem, OutErr, InErr, OutDone, InDone, Env>
  ) => Channel<OutElem, InElem, OutErr, InErr, OutDone, InDone, R2>
  <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env, R2>(
    self: Channel<OutElem, InElem, OutErr, InErr, OutDone, InDone, Env>,
    f: (context: Context.Context<R2>) => Context.Context<Env>
  ): Channel<OutElem, InElem, OutErr, InErr, OutDone, InDone, R2>
} = dual(2, <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env, R2>(
  self: Channel<OutElem, InElem, OutErr, InErr, OutDone, InDone, Env>,
  f: (context: Context.Context<R2>) => Context.Context<Env>
): Channel<OutElem, InElem, OutErr, InErr, OutDone, InDone, R2> =>
  fromTransform((upstream, scope) =>
    Effect.contextWith((context) => {
      const toProvide = f(context)
      return toTransform(provideContext(self, toProvide))(upstream, scope)
    })
  ))

/**
 * Updates a service in the current context before running the channel.
 *
 * **Details**
 *
 * The existing service is read from the context. The updated service is
 * provided to the channel under the same key.
 *
 * @category providing services
 * @since 2.0.0
 */
export const updateService: {
  <I, S>(
    key: Context.Key<I, S>,
    f: (service: NoInfer<S>) => S
  ): <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>(
    self: Channel<OutElem, InElem, OutErr, InErr, OutDone, InDone, Env>
  ) => Channel<OutElem, InElem, OutErr, InErr, OutDone, InDone, Env | I>
  <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env, I, S>(
    self: Channel<OutElem, InElem, OutErr, InErr, OutDone, InDone, Env>,
    service: Context.Key<I, S>,
    f: (service: NoInfer<S>) => S
  ): Channel<OutElem, InElem, OutErr, InErr, OutDone, InDone, Env | I>
} = dual(3, <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env, I, S>(
  self: Channel<OutElem, InElem, OutErr, InErr, OutDone, InDone, Env>,
  service: Context.Key<I, S>,
  f: (service: NoInfer<S>) => S
): Channel<OutElem, InElem, OutErr, InErr, OutDone, InDone, Env | I> =>
  updateContext(self, (context) =>
    Context.add(
      context,
      service,
      f(Context.get(context, service))
    )))

/**
 * Runs the channel inside a tracing span with the specified name and options.
 *
 * **Details**
 *
 * The created span is provided as the current parent span while the channel
 * runs. The span is ended with the channel's exit value.
 *
 * @category tracing
 * @since 2.0.0
 */
export const withSpan: {
  (
    name: string,
    options?: SpanOptions
  ): <OutElem, OutErr, OutDone, InElem, InErr, InDone, R>(
    self: Channel<OutElem, InElem, OutErr, InErr, OutDone, InDone, R>
  ) => Channel<OutElem, InElem, OutErr, InErr, OutDone, InDone, Exclude<R, ParentSpan>>
  <OutElem, OutErr, OutDone, InElem, InErr, InDone, R>(
    self: Channel<OutElem, InElem, OutErr, InErr, OutDone, InDone, R>,
    name: string,
    options?: SpanOptions
  ): Channel<OutElem, InElem, OutErr, InErr, OutDone, InDone, Exclude<R, ParentSpan>>
} = function() {
  const dataFirst = isChannel(arguments[0])
  const name = dataFirst ? arguments[1] : arguments[0]
  const options = addSpanStackTrace(dataFirst ? arguments[2] : arguments[1])
  if (dataFirst) {
    const self = arguments[0]
    return withSpanImpl(self, name, options)
  }
  return (self: any) => withSpanImpl(self, name, options)
} as any

const withSpanImpl = <OutElem, OutErr, OutDone, InElem, InErr, InDone, R>(
  self: Channel<OutElem, InElem, OutErr, InErr, OutDone, InDone, R>,
  name: string,
  options?: SpanOptions
): Channel<OutElem, InElem, OutErr, InErr, OutDone, InDone, Exclude<R, ParentSpan>> =>
  acquireUseRelease(
    Effect.makeSpan(name, options),
    (span) => provideService(self, ParentSpan, span),
    (span, exit) =>
      Effect.withFiber((fiber) => {
        const clock = fiber.getRef(ClockRef)
        const timingEnabled = fiber.getRef(TracerTimingEnabled)
        return endSpan(span, exit, clock, timingEnabled)
      })
  )

/**
 * The starting channel for Do notation, emitting an empty object.
 *
 * @category constructors
 * @since 4.0.0
 */
export const Do: Channel<{}> = succeed({})

const let_: {
  <N extends string, OutElem extends object, B>(
    name: Exclude<N, keyof OutElem>,
    f: (a: NoInfer<OutElem>) => B
  ): <OutErr, OutDone, InElem, InErr, InDone, R>(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, R>
  ) => Channel<
    { [K in N | keyof OutElem]: K extends keyof OutElem ? OutElem[K] : B },
    OutErr,
    OutDone,
    InElem,
    InErr,
    InDone,
    R
  >
  <OutElem extends object, OutErr, OutDone, InElem, InErr, InDone, R, N extends string, B>(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, R>,
    name: Exclude<N, keyof OutElem>,
    f: (a: NoInfer<OutElem>) => B
  ): Channel<
    { [K in N | keyof OutElem]: K extends keyof OutElem ? OutElem[K] : B },
    OutErr,
    OutDone,
    InElem,
    InErr,
    InDone,
    R
  >
} = dual(3, <OutElem extends object, OutErr, OutDone, InElem, InErr, InDone, R, N extends string, B>(
  self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, R>,
  name: Exclude<N, keyof OutElem>,
  f: (a: NoInfer<OutElem>) => B
): Channel<
  { [K in N | keyof OutElem]: K extends keyof OutElem ? OutElem[K] : B },
  OutErr,
  OutDone,
  InElem,
  InErr,
  InDone,
  R
> =>
  map(self, (elem) => (({
    ...elem,
    [name]: f(elem)
  }) as any)))
export {
  /**
   * Adds a computed field to each object emitted by a channel.
   *
   * @category mapping
   * @since 4.0.0
   */
  let_ as let
}

/**
 * Adds a field to each object emitted by a channel by running another channel
 * derived from that object.
 *
 * **Details**
 *
 * The field name must not already exist on the emitted object. The derived
 * channel's output becomes the value of the new field. `options.concurrency`
 * and `options.bufferSize` control how derived channels are flattened.
 *
 * @category sequencing
 * @since 4.0.0
 */
export const bind: {
  <N extends string, OutElem extends object, B, OutErr2, OutDone2, InElem2, InErr2, InDone2, Env2>(
    name: Exclude<N, keyof OutElem>,
    f: (a: NoInfer<OutElem>) => Channel<B, OutErr2, OutDone2, InElem2, InErr2, InDone2, Env2>,
    options?: {
      readonly concurrency?: Types.Concurrency | undefined
      readonly bufferSize?: number | undefined
    }
  ): <OutErr, OutDone, InElem, InErr, InDone, Env>(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>
  ) => Channel<
    { [K in N | keyof OutElem]: K extends keyof OutElem ? OutElem[K] : B },
    OutErr2 | OutErr,
    OutDone,
    InElem & InElem2,
    InErr & InErr2,
    InDone & InDone2,
    Env2 | Env
  >
  <
    OutElem extends object,
    OutErr,
    OutDone,
    InElem,
    InErr,
    InDone,
    Env,
    N extends string,
    B,
    OutErr2,
    OutDone2,
    InElem2,
    InErr2,
    InDone2,
    Env2
  >(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
    name: Exclude<N, keyof OutElem>,
    f: (a: NoInfer<OutElem>) => Channel<B, OutErr2, OutDone2, InElem2, InErr2, InDone2, Env2>,
    options?: {
      readonly concurrency?: Types.Concurrency | undefined
      readonly bufferSize?: number | undefined
    }
  ): Channel<
    { [K in N | keyof OutElem]: K extends keyof OutElem ? OutElem[K] : B },
    OutErr2 | OutErr,
    OutDone,
    InElem & InElem2,
    InErr & InErr2,
    InDone & InDone2,
    Env2 | Env
  >
} = dual((args) => isChannel(args[0]), <
  OutElem extends object,
  OutErr,
  OutDone,
  InElem,
  InErr,
  InDone,
  Env,
  N extends string,
  B,
  OutErr2,
  OutDone2,
  InElem2,
  InErr2,
  InDone2,
  Env2
>(
  self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
  name: Exclude<N, keyof OutElem>,
  f: (a: NoInfer<OutElem>) => Channel<B, OutErr2, OutDone2, InElem2, InErr2, InDone2, Env2>,
  options?: {
    readonly concurrency?: Types.Concurrency | undefined
    readonly bufferSize?: number | undefined
  }
): Channel<
  { [K in N | keyof OutElem]: K extends keyof OutElem ? OutElem[K] : B },
  OutErr2 | OutErr,
  OutDone,
  InElem & InElem2,
  InErr & InErr2,
  InDone & InDone2,
  Env2 | Env
> =>
  flatMap(
    self,
    (elem) => map(f(elem), (b) => ({ ...elem, [name]: b } as any)),
    options
  ))

/**
 * Wraps each output element in an object under the specified field name.
 *
 * **When to use**
 *
 * Use when you need to start a Channel Do-notation chain from an existing
 * output value by assigning that value to a field name.
 *
 * @see {@link Do} for starting Do notation from an empty object
 * @see {@link bind} for adding a field produced by another channel
 * @see {@link let_ let} for adding a computed field
 *
 * @category mapping
 * @since 4.0.0
 */
export const bindTo: {
  <N extends string>(name: N): <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>
  ) => Channel<
    { [K in N]: OutElem },
    OutErr,
    OutDone,
    InElem,
    InErr,
    InDone,
    Env
  >
  <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env, N extends string>(
    self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
    name: N
  ): Channel<
    { [K in N]: OutElem },
    OutErr,
    OutDone,
    InElem,
    InErr,
    InDone,
    Env
  >
} = dual(2, <OutElem, OutErr, OutDone, InElem, InErr, InDone, Env, N extends string>(
  self: Channel<OutElem, OutErr, OutDone, InElem, InErr, InDone, Env>,
  name: N
): Channel<
  { [K in N]: OutElem },
  OutErr,
  OutDone,
  InElem,
  InErr,
  InDone,
  Env
> => map(self, (elem) => ({ [name]: elem } as any)))

/**
 * Runs a channel and counts the number of elements it outputs.
 *
 * **Example** (Counting channel output)
 *
 * ```ts import.meta.vitest
 * import { Channel, Data, Effect } from "effect"
 *
 * class CountError extends Data.TaggedError("CountError")<{
 *   readonly reason: string
 * }> {}
 *
 * // Create a channel with multiple elements
 * const numbersChannel = Channel.fromIterable([1, 2, 3, 4, 5])
 *
 * // Count the elements
 * const countEffect = Channel.runCount(numbersChannel)
 *
 * Effect.runSync(countEffect) // => 5
 * ```
 *
 * @category running
 * @since 4.0.0
 */
export const runCount = <OutElem, OutErr, OutDone, Env>(
  self: Channel<OutElem, OutErr, OutDone, unknown, unknown, unknown, Env>
): Effect.Effect<number, OutErr, Env> => runFold(self, () => 0, (acc) => acc + 1)

/**
 * Runs a channel and discards all output elements, returning only the final result.
 *
 * **Example** (Draining channel output at runtime)
 *
 * ```ts import.meta.vitest
 * import { Channel, Data, Effect } from "effect"
 *
 * class DrainError extends Data.TaggedError("DrainError")<{
 *   readonly stage: string
 * }> {}
 *
 * // Create a channel that outputs elements and completes with a result
 * const resultChannel = Channel.fromIterable([1, 2, 3])
 * const completedChannel = Channel.concat(resultChannel, Channel.end("completed"))
 *
 * // Drain all elements and get only the final result
 * const drainEffect = Channel.runDrain(completedChannel)
 *
 * Effect.runSync(drainEffect) // => "completed"
 * ```
 *
 * @category running
 * @since 2.0.0
 */
export const runDrain = <OutElem, OutErr, OutDone, Env>(
  self: Channel<OutElem, OutErr, OutDone, unknown, unknown, unknown, Env>
): Effect.Effect<OutDone, OutErr, Env> => runWith(self, (pull) => Effect.forever(pull, { disableYield: true }))

/**
 * Runs a channel and applies an effect to each output element.
 *
 * **Example** (Running effects for each output)
 *
 * ```ts import.meta.vitest
 * import { Channel, Data, Effect } from "effect"
 *
 * class ForEachError extends Data.TaggedError("ForEachError")<{
 *   readonly element: unknown
 * }> {}
 *
 * // Create a channel with numbers
 * const numbersChannel = Channel.fromIterable([1, 2, 3])
 *
 * // Run forEach to process each element
 * const processed: Array<number> = []
 * const forEachEffect = Channel.runForEach(
 *   numbersChannel,
 *   (n) => Effect.sync(() => processed.push(n))
 * )
 *
 * await Effect.runPromise(forEachEffect)
 * processed // => [1, 2, 3]
 * ```
 *
 * @category running
 * @since 4.0.0
 */
export const runForEach: {
  <OutElem, EX, RX>(
    f: (o: OutElem) => Effect.Effect<void, EX, RX>
  ): <OutErr, OutDone, Env>(
    self: Channel<OutElem, OutErr, OutDone, unknown, unknown, unknown, Env>
  ) => Effect.Effect<OutDone, OutErr | EX, Env | RX>
  <OutElem, OutErr, OutDone, Env, EX, RX>(
    self: Channel<OutElem, OutErr, OutDone, unknown, unknown, unknown, Env>,
    f: (o: OutElem) => Effect.Effect<void, EX, RX>
  ): Effect.Effect<OutDone, OutErr | EX, Env | RX>
} = dual(
  2,
  <OutElem, OutErr, OutDone, Env, EX, RX>(
    self: Channel<OutElem, OutErr, OutDone, unknown, unknown, unknown, Env>,
    f: (o: OutElem) => Effect.Effect<void, EX, RX>
  ): Effect.Effect<OutDone, OutErr | EX, Env | RX> =>
    runWith(self, (pull) => Effect.forever(Effect.flatMap(pull, f), { disableYield: true }))
)

/**
 * Runs a channel and applies an effectful predicate to each output element
 * until the predicate returns `false`.
 *
 * **Details**
 *
 * Returning `true` continues consuming the channel. Returning `false` stops
 * consumption early. The returned effect completes with `void`.
 *
 * @category running
 * @since 4.0.0
 */
export const runForEachWhile: {
  <OutElem, EX, RX>(
    f: (o: OutElem) => Effect.Effect<boolean, EX, RX>
  ): <OutErr, OutDone, Env>(
    self: Channel<OutElem, OutErr, OutDone, unknown, unknown, unknown, Env>
  ) => Effect.Effect<void, OutErr | EX, Env | RX>
  <OutElem, OutErr, OutDone, Env, EX, RX>(
    self: Channel<OutElem, OutErr, OutDone, unknown, unknown, unknown, Env>,
    f: (o: OutElem) => Effect.Effect<boolean, EX, RX>
  ): Effect.Effect<void, OutErr | EX, Env | RX>
} = dual(
  2,
  <OutElem, OutErr, OutDone, Env, EX, RX>(
    self: Channel<OutElem, OutErr, OutDone, unknown, unknown, unknown, Env>,
    f: (o: OutElem) => Effect.Effect<boolean, EX, RX>
  ): Effect.Effect<void, OutErr | EX, Env | RX> =>
    runWith(self, (pull) =>
      pull.pipe(
        Effect.flatMap(f),
        Effect.flatMap((cont) => (cont ? Effect.void : Cause.done())),
        Effect.forever({ disableYield: true })
      ))
)

/**
 * Concatenates a channel's `Uint8Array` chunks into a single `Uint8Array`.
 *
 * **Gotchas**
 *
 * This materializes the full content in memory. The source channel must not
 * reuse or mutate emitted buffers, which are retained until collection completes.
 *
 * **Example** (Joining channel byte chunks)
 *
 * ```ts import.meta.vitest
 * import { Channel, Effect } from "effect"
 *
 * const channel = Channel.fromArray([
 *   [new Uint8Array([1, 2])],
 *   [new Uint8Array([3, 4])]
 * ] as const)
 *
 * const bytes = Effect.runSync(Channel.mkUint8Array(channel))
 * Array.from(bytes) // => [1, 2, 3, 4]
 * ```
 *
 * @category running
 * @since 4.0.0
 */
export const mkUint8Array = <OutErr, OutDone, Env>(
  self: Channel<Arr.NonEmptyReadonlyArray<Uint8Array>, OutErr, OutDone, unknown, unknown, unknown, Env>
): Effect.Effect<Uint8Array<ArrayBuffer>, OutErr, Env> =>
  Effect.map(
    runFold(
      self,
      (): {
        bytes: number
        readonly arrays: Array<Uint8Array>
      } => ({
        bytes: 0,
        arrays: []
      }),
      (acc, chunk) => {
        for (let i = 0; i < chunk.length; i++) {
          acc.bytes += chunk[i].length
          acc.arrays.push(chunk[i])
        }
        return acc
      }
    ),
    ({ arrays, bytes }) => {
      const result = new Uint8Array(bytes)
      let offset = 0
      for (let i = 0; i < arrays.length; i++) {
        const array = arrays[i]
        result.set(array, offset)
        offset += array.length
      }
      return result
    }
  )

/**
 * Runs a channel and collects all output elements into an array.
 *
 * **Example** (Collecting channel output)
 *
 * ```ts import.meta.vitest
 * import { Channel, Data, Effect } from "effect"
 *
 * class CollectError extends Data.TaggedError("CollectError")<{
 *   readonly reason: string
 * }> {}
 *
 * // Create a channel with elements
 * const numbersChannel = Channel.fromIterable([1, 2, 3, 4, 5])
 *
 * // Collect all elements into an array
 * const collectEffect = Channel.runCollect(numbersChannel)
 *
 * Effect.runSync(collectEffect) // => [1, 2, 3, 4, 5]
 * ```
 *
 * @category running
 * @since 2.0.0
 */
export const runCollect = <OutElem, OutErr, OutDone, Env>(
  self: Channel<OutElem, OutErr, OutDone, unknown, unknown, unknown, Env>
): Effect.Effect<Array<OutElem>, OutErr, Env> =>
  runFold(self, () => [] as Array<OutElem>, (acc, o) => {
    acc.push(o)
    return acc
  })

/**
 * Runs a channel until the first output element is available, returning it in
 * an `Option`.
 *
 * **Details**
 *
 * Returns `Option.some` with the first output element, or `Option.none` if the
 * channel completes without emitting output.
 *
 * @category running
 * @since 4.0.0
 */
export const runHead = <OutElem, OutErr, OutDone, Env>(
  self: Channel<OutElem, OutErr, OutDone, unknown, unknown, unknown, Env>
): Effect.Effect<Option.Option<OutElem>, OutErr, Env> =>
  Effect.suspend(() => {
    let head = Option.none<OutElem>()
    return runWith(self, (pull) =>
      pull.pipe(
        Effect.asSome,
        Effect.flatMap((head_) => {
          head = head_
          return Cause.done()
        })
      ), () => Effect.succeed(head))
  })

/**
 * Runs a channel to completion and returns the last output element in an
 * `Option`.
 *
 * **Details**
 *
 * Returns `Option.some` with the last emitted element, or `Option.none` if the
 * channel completes without emitting output.
 *
 * @category running
 * @since 4.0.0
 */
export const runLast = <OutElem, OutErr, OutDone, Env>(
  self: Channel<OutElem, OutErr, OutDone, unknown, unknown, unknown, Env>
): Effect.Effect<Option.Option<OutElem>, OutErr, Env> =>
  Effect.suspend(() => {
    const absent = Symbol() // Prevent boxing
    let last: typeof absent | OutElem = absent
    return runWith(
      self,
      (pull) =>
        Effect.forever(
          Effect.flatMap(pull, (item) => {
            last = item
            return Effect.void
          }),
          { disableYield: true }
        ),
      () => last === absent ? Effect.succeedNone : Effect.succeedSome(last)
    )
  })

/**
 * Runs a channel and folds over all output elements with an accumulator.
 *
 * **Example** (Folding channel output)
 *
 * ```ts import.meta.vitest
 * import { Channel, Data, Effect } from "effect"
 *
 * class FoldError extends Data.TaggedError("FoldError")<{
 *   readonly operation: string
 * }> {}
 *
 * // Create a channel with numbers
 * const numbersChannel = Channel.fromIterable([1, 2, 3, 4, 5])
 *
 * // Fold to calculate sum
 * const sumEffect = Channel.runFold(numbersChannel, () => 0, (acc, n) => acc + n)
 *
 * Effect.runSync(sumEffect) // => 15
 * ```
 *
 * @category running
 * @since 4.0.0
 */
export const runFold: {
  <Z, OutElem>(
    initial: LazyArg<Z>,
    f: (acc: Z, o: OutElem) => Z
  ): <OutErr, OutDone, Env>(
    self: Channel<OutElem, OutErr, OutDone, unknown, unknown, unknown, Env>
  ) => Effect.Effect<Z, OutErr, Env>
  <OutElem, OutErr, OutDone, Env, Z>(
    self: Channel<OutElem, OutErr, OutDone, unknown, unknown, unknown, Env>,
    initial: LazyArg<Z>,
    f: (acc: Z, o: OutElem) => Z
  ): Effect.Effect<Z, OutErr, Env>
} = dual(3, <OutElem, OutErr, OutDone, Env, Z>(
  self: Channel<OutElem, OutErr, OutDone, unknown, unknown, unknown, Env>,
  initial: LazyArg<Z>,
  f: (acc: Z, o: OutElem) => Z
): Effect.Effect<Z, OutErr, Env> =>
  Effect.suspend(() => {
    let state = initial()
    return runWith(
      self,
      (pull) =>
        Effect.whileLoop({
          while: constTrue,
          body: () => pull,
          step: (value) => {
            state = f(state, value)
          }
        }),
      () => Effect.succeed(state)
    )
  }))

/**
 * Runs a channel and effectfully folds all output elements with an accumulator.
 *
 * **When to use**
 *
 * Use when folding channel output needs effects, services, or an additional
 * failure channel during accumulation.
 *
 * **Details**
 *
 * The initial accumulator is evaluated lazily. Each output element is passed to
 * the effectful accumulator function. The returned effect succeeds with the
 * final accumulator value.
 *
 * @category running
 * @since 4.0.0
 */
export const runFoldEffect: {
  <OutElem, Z, E, R>(
    initial: LazyArg<Z>,
    f: (acc: Z, o: OutElem) => Effect.Effect<Z, E, R>
  ): <OutErr, OutDone, Env>(
    self: Channel<OutElem, OutErr, OutDone, unknown, unknown, unknown, Env>
  ) => Effect.Effect<Z, OutErr | E, Env | R>
  <OutElem, OutErr, OutDone, Env, Z, E, R>(
    self: Channel<OutElem, OutErr, OutDone, unknown, unknown, unknown, Env>,
    initial: LazyArg<Z>,
    f: (acc: Z, o: OutElem) => Effect.Effect<Z, E, R>
  ): Effect.Effect<Z, OutErr | E, Env | R>
} = dual(3, <OutElem, OutErr, OutDone, Env, Z, E, R>(
  self: Channel<OutElem, OutErr, OutDone, unknown, unknown, unknown, Env>,
  initial: LazyArg<Z>,
  f: (acc: Z, o: OutElem) => Effect.Effect<Z, E, R>
): Effect.Effect<Z, OutErr | E, Env | R> =>
  Effect.suspend(() => {
    let state = initial()
    return runWith(
      self,
      (pull) =>
        Effect.whileLoop({
          while: constTrue,
          body: constant(pull.pipe(
            Effect.flatMap((o) => f(state, o)),
            Effect.map((s) => {
              state = s
            })
          )),
          step: constVoid
        }),
      () => Effect.succeed(state)
    )
  }))

/**
 * Converts a channel to a scoped `Pull` for low-level consumption.
 *
 * **Details**
 *
 * The effect requires a `Scope`. The returned pull should be consumed only
 * while that scope remains open. Pulls are serialized so only one pull is
 * evaluated at a time.
 *
 * **Example** (Converting channels to pulls)
 *
 * ```ts import.meta.vitest
 * import { Channel, Data, Effect } from "effect"
 *
 * class PullError extends Data.TaggedError("PullError")<{
 *   readonly step: string
 * }> {}
 *
 * // Create a channel
 * const numbersChannel = Channel.fromIterable([1, 2, 3])
 *
 * const program = Effect.scoped(Effect.gen(function*() {
 *   const pull = yield* Channel.toPull(numbersChannel)
 *   return [yield* pull, yield* pull, yield* pull]
 * }))
 * await Effect.runPromise(program) // => [1, 2, 3]
 * ```
 *
 * @category destructors
 * @since 2.0.0
 */
export const toPull: <OutElem, OutErr, OutDone, Env>(
  self: Channel<OutElem, OutErr, OutDone, unknown, unknown, unknown, Env>
) => Effect.Effect<
  Pull.Pull<OutElem, OutErr, OutDone>,
  never,
  Env | Scope.Scope
> = Effect.fnUntraced(
  function*<OutElem, OutErr, OutDone, Env>(
    self: Channel<OutElem, OutErr, OutDone, unknown, unknown, unknown, Env>
  ) {
    const semaphore = Semaphore.makeUnsafe(1)
    const context = yield* Effect.context<Env | Scope.Scope>()
    const scope = Context.get(context, Scope.Scope)
    const pull = yield* toTransform(self)(Cause.done(), scope)
    return pull.pipe(
      Effect.provideContext(context),
      semaphore.withPermits(1)
    )
  },
  // ensure errors are redirected to the pull effect
  Effect.catchCause((cause) => Effect.succeed(Effect.failCause(cause)))
) as any

/**
 * Converts a channel to a Pull within an existing scope.
 *
 * **Example** (Converting channels to scoped pulls)
 *
 * ```ts import.meta.vitest
 * import { Channel, Data, Effect, Scope } from "effect"
 *
 * class ScopedPullError extends Data.TaggedError("ScopedPullError")<{
 *   readonly reason: string
 * }> {}
 *
 * // Create a channel
 * const numbersChannel = Channel.fromIterable([1, 2, 3])
 *
 * // Convert to Pull with explicit scope
 * const scopedPullEffect = Effect.gen(function*() {
 *   const scope = yield* Effect.scope
 *   const pull = yield* Channel.toPullScoped(numbersChannel, scope)
 *   return [yield* pull, yield* pull, yield* pull]
 * })
 * await Effect.runPromise(Effect.scoped(scopedPullEffect)) // => [1, 2, 3]
 * ```
 *
 * @category destructors
 * @since 4.0.0
 */
export const toPullScoped = <OutElem, OutErr, OutDone, Env>(
  self: Channel<OutElem, OutErr, OutDone, unknown, unknown, unknown, Env>,
  scope: Scope.Scope
): Effect.Effect<Pull.Pull<OutElem, OutErr, OutDone, Env>, never, Env> => toTransform(self)(Cause.done(), scope)

/**
 * Runs a channel and offers each output element into a queue.
 *
 * **Details**
 *
 * When the channel completes, the queue is ended. When the channel fails, the
 * queue is failed with the channel's cause. The returned effect itself
 * completes with `void`.
 *
 * @category destructors
 * @since 4.0.0
 */
export const runIntoQueue: {
  <OutElem, OutErr>(queue: Queue.Queue<OutElem, OutErr | Cause.Done>): <OutDone, Env>(
    self: Channel<OutElem, OutErr, OutDone, unknown, unknown, unknown, Env>
  ) => Effect.Effect<void, never, Env>
  <OutElem, OutErr, OutDone, Env>(
    self: Channel<OutElem, OutErr, OutDone, unknown, unknown, unknown, Env>,
    queue: Queue.Queue<OutElem, OutErr | Cause.Done>
  ): Effect.Effect<void, never, Env>
} = dual(
  (args) => isChannel(args[0]),
  <OutElem, OutErr, OutDone, Env>(
    self: Channel<OutElem, OutErr, OutDone, unknown, unknown, unknown, Env>,
    queue: Queue.Queue<OutElem, OutErr | Cause.Done>
  ): Effect.Effect<void, never, Env> =>
    Effect.uninterruptibleMask((restore) =>
      runForEach(self, (value) => Queue.offer(queue, value)).pipe(
        restore,
        Effect.exit,
        Effect.flatMap((exit) => {
          if (Exit.isSuccess(exit)) {
            Queue.endUnsafe(queue)
          } else {
            Queue.failCauseUnsafe(queue, exit.cause)
          }
          return Effect.void
        })
      )
    )
)

/**
 * Runs a channel that emits non-empty arrays and offers each array element into
 * a queue.
 *
 * **Details**
 *
 * When the channel completes, the queue is ended. When the channel fails, the
 * queue is failed with the channel's cause. The returned effect itself
 * completes with `void`.
 *
 * @category destructors
 * @since 4.0.0
 */
export const runIntoQueueArray: {
  <OutElem, OutErr>(queue: Queue.Queue<OutElem, OutErr | Cause.Done>): <OutDone, Env>(
    self: Channel<Arr.NonEmptyReadonlyArray<OutElem>, OutErr, OutDone, unknown, unknown, unknown, Env>
  ) => Effect.Effect<void, never, Env>
  <OutElem, OutErr, OutDone, Env>(
    self: Channel<Arr.NonEmptyReadonlyArray<OutElem>, OutErr, OutDone, unknown, unknown, unknown, Env>,
    queue: Queue.Queue<OutElem, OutErr | Cause.Done>
  ): Effect.Effect<void, never, Env>
} = dual(
  (args) => isChannel(args[0]),
  <OutElem, OutErr, OutDone, Env>(
    self: Channel<Arr.NonEmptyReadonlyArray<OutElem>, OutErr, OutDone, unknown, unknown, unknown, Env>,
    queue: Queue.Queue<OutElem, OutErr | Cause.Done>
  ): Effect.Effect<void, never, Env> =>
    Effect.uninterruptibleMask((restore) =>
      runForEach(self, (value) => Queue.offerAll(queue, value)).pipe(
        restore,
        Effect.exit,
        Effect.flatMap((exit) => {
          if (Exit.isSuccess(exit)) {
            Queue.endUnsafe(queue)
          } else {
            Queue.failCauseUnsafe(queue, exit.cause)
          }
          return Effect.void
        })
      )
    )
)

/**
 * Creates a scoped queue and forks the channel to feed it for concurrent
 * consumption.
 *
 * **Details**
 *
 * Output elements are offered to the queue. Channel completion and failure are
 * signaled through the queue. The queue is shut down when the surrounding scope
 * closes.
 *
 * **Example** (Converting channels to queues)
 *
 * ```ts import.meta.vitest
 * import { Channel, Data, Effect, Queue } from "effect"
 *
 * class QueueError extends Data.TaggedError("QueueError")<{
 *   readonly operation: string
 * }> {}
 *
 * // Create a channel with data
 * const dataChannel = Channel.fromIterable([1, 2, 3, 4, 5])
 *
 * // Convert to queue for concurrent processing
 * const program = Effect.scoped(Effect.gen(function*() {
 *   const queue = yield* Channel.toQueue(dataChannel, { capacity: 32 })
 *   return yield* Queue.takeBetween(queue, 5, 5)
 * }))
 * await Effect.runPromise(program) // => [1, 2, 3, 4, 5]
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
  ): <OutElem, OutErr, OutDone, Env>(
    self: Channel<OutElem, OutErr, OutDone, unknown, unknown, unknown, Env>
  ) => Effect.Effect<Queue.Dequeue<OutElem, OutErr | Cause.Done>, never, Env | Scope.Scope>
  <OutElem, OutErr, OutDone, Env>(
    self: Channel<OutElem, OutErr, OutDone, unknown, unknown, unknown, Env>,
    options: {
      readonly capacity: "unbounded"
    } | {
      readonly capacity: number
      readonly strategy?: "dropping" | "sliding" | "suspend" | undefined
    }
  ): Effect.Effect<Queue.Dequeue<OutElem, OutErr | Cause.Done>, never, Env | Scope.Scope>
} = dual(
  (args) => isChannel(args[0]),
  Effect.fnUntraced(function*<OutElem, OutErr, OutDone, Env>(
    self: Channel<OutElem, OutErr, OutDone, unknown, unknown, unknown, Env>,
    options: {
      readonly capacity: "unbounded"
    } | {
      readonly capacity: number
      readonly strategy?: "dropping" | "sliding" | "suspend" | undefined
    }
  ) {
    const scope = yield* Effect.scope
    const queue = yield* Queue.make<OutElem, OutErr | Cause.Done>({
      capacity: typeof options.capacity === "number" ? options.capacity : undefined,
      strategy: typeof options.capacity === "number" ? options.strategy : undefined
    })
    yield* Scope.addFinalizer(scope, Queue.shutdown(queue))
    yield* Effect.forkIn(runIntoQueue(self, queue), scope)
    return queue
  })
)

/**
 * Creates a scoped queue and forks an array-emitting channel to feed it.
 *
 * **Details**
 *
 * Each element inside emitted non-empty arrays is offered to the queue. Channel
 * completion and failure are signaled through the queue. The queue is shut down
 * when the surrounding scope closes.
 *
 * @category destructors
 * @since 4.0.0
 */
export const toQueueArray: {
  (
    options: {
      readonly capacity: "unbounded"
    } | {
      readonly capacity: number
      readonly strategy?: "dropping" | "sliding" | "suspend" | undefined
    }
  ): <OutElem, OutErr, OutDone, Env>(
    self: Channel<Arr.NonEmptyReadonlyArray<OutElem>, OutErr, OutDone, unknown, unknown, unknown, Env>
  ) => Effect.Effect<Queue.Dequeue<OutElem, OutErr | Cause.Done>, never, Env | Scope.Scope>
  <OutElem, OutErr, OutDone, Env>(
    self: Channel<Arr.NonEmptyReadonlyArray<OutElem>, OutErr, OutDone, unknown, unknown, unknown, Env>,
    options: {
      readonly capacity: "unbounded"
    } | {
      readonly capacity: number
      readonly strategy?: "dropping" | "sliding" | "suspend" | undefined
    }
  ): Effect.Effect<Queue.Dequeue<OutElem, OutErr | Cause.Done>, never, Env | Scope.Scope>
} = dual(
  (args) => isChannel(args[0]),
  Effect.fnUntraced(function*<OutElem, OutErr, OutDone, Env>(
    self: Channel<Arr.NonEmptyReadonlyArray<OutElem>, OutErr, OutDone, unknown, unknown, unknown, Env>,
    options: {
      readonly capacity: "unbounded"
    } | {
      readonly capacity: number
      readonly strategy?: "dropping" | "sliding" | "suspend" | undefined
    }
  ) {
    const scope = yield* Effect.scope
    const queue = yield* Queue.make<OutElem, OutErr | Cause.Done>({
      capacity: typeof options.capacity === "number" ? options.capacity : undefined,
      strategy: typeof options.capacity === "number" ? options.strategy : undefined
    })
    yield* Scope.addFinalizer(scope, Queue.shutdown(queue))
    yield* Effect.forkIn(runIntoQueueArray(self, queue), scope)
    return queue
  })
)

/**
 * Converts a channel to a PubSub for concurrent consumption.
 *
 * **Details**
 *
 * `shutdownOnEnd` indicates whether the PubSub should be shut down when the
 * channel ends. By default this is `true`.
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
  ): <OutElem, OutErr, OutDone, Env>(
    self: Channel<OutElem, OutErr, OutDone, unknown, unknown, unknown, Env>
  ) => Effect.Effect<PubSub.PubSub<OutElem>, never, Env | Scope.Scope>
  <OutElem, OutErr, OutDone, Env>(
    self: Channel<OutElem, OutErr, OutDone, unknown, unknown, unknown, Env>,
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
  ): Effect.Effect<PubSub.PubSub<OutElem>, never, Env | Scope.Scope>
} = dual(
  2,
  Effect.fnUntraced(function*<OutElem, OutErr, OutDone, Env>(
    self: Channel<OutElem, OutErr, OutDone, unknown, unknown, unknown, Env>,
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
  ) {
    const pubsub = yield* makePubSub<OutElem>(options)
    yield* Effect.forkScoped(runIntoPubSub(self, pubsub, {
      shutdownOnEnd: options.shutdownOnEnd !== false
    }))
    return pubsub
  })
)

/**
 * Runs a channel and publishes each output element to a `PubSub`.
 *
 * **Details**
 *
 * The channel's output values are published as individual PubSub messages. Use
 * `options.shutdownOnEnd` to shut down the PubSub when channel execution ends.
 *
 * @category destructors
 * @since 4.0.0
 */
export const runIntoPubSub: {
  <OutElem>(
    pubsub: PubSub.PubSub<OutElem>,
    options?: {
      readonly shutdownOnEnd?: boolean | undefined
    } | undefined
  ): <OutErr, OutDone, Env>(
    self: Channel<OutElem, OutErr, OutDone, unknown, unknown, unknown, Env>
  ) => Effect.Effect<void, never, Env>
  <OutElem, OutErr, OutDone, Env>(
    self: Channel<OutElem, OutErr, OutDone, unknown, unknown, unknown, Env>,
    pubsub: PubSub.PubSub<OutElem>,
    options?: {
      readonly shutdownOnEnd?: boolean | undefined
    } | undefined
  ): Effect.Effect<void, never, Env>
} = dual(
  (args) => isChannel(args[0]),
  <OutElem, OutErr, OutDone, Env>(
    self: Channel<OutElem, OutErr, OutDone, unknown, unknown, unknown, Env>,
    pubsub: PubSub.PubSub<OutElem>,
    options?: {
      readonly shutdownOnEnd?: boolean | undefined
    } | undefined
  ) =>
    runForEach(self, (value) => PubSub.publish(pubsub, value)).pipe(
      options?.shutdownOnEnd === true ? Effect.ensuring(PubSub.shutdown(pubsub)) : identity_
    )
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
 * Converts an array-emitting channel to a scoped `PubSub` for concurrent
 * consumption.
 *
 * **Details**
 *
 * Each element inside emitted non-empty arrays is published as an individual
 * PubSub message. `shutdownOnEnd` indicates whether the PubSub should be shut
 * down when the channel ends. By default this is `true`.
 *
 * @category destructors
 * @since 4.0.0
 */
export const toPubSubArray: {
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
  ): <OutElem, OutErr, OutDone, Env>(
    self: Channel<Arr.NonEmptyReadonlyArray<OutElem>, OutErr, OutDone, unknown, unknown, unknown, Env>
  ) => Effect.Effect<PubSub.PubSub<OutElem>, never, Env | Scope.Scope>
  <OutElem, OutErr, OutDone, Env>(
    self: Channel<Arr.NonEmptyReadonlyArray<OutElem>, OutErr, OutDone, unknown, unknown, unknown, Env>,
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
  ): Effect.Effect<PubSub.PubSub<OutElem>, never, Env | Scope.Scope>
} = dual(
  2,
  Effect.fnUntraced(function*<OutElem, OutErr, OutDone, Env>(
    self: Channel<Arr.NonEmptyReadonlyArray<OutElem>, OutErr, OutDone, unknown, unknown, unknown, Env>,
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
  ) {
    const pubsub = yield* makePubSub<OutElem>(options)
    yield* Effect.forkScoped(runIntoPubSubArray(self, pubsub, {
      shutdownOnEnd: options.shutdownOnEnd !== false
    }))
    return pubsub
  })
)

/**
 * Runs an array-emitting channel and publishes each array element to a
 * `PubSub`.
 *
 * **Details**
 *
 * Each element inside emitted non-empty arrays is published as an individual
 * PubSub message. Use `options.shutdownOnEnd` to shut down the PubSub when
 * channel execution ends.
 *
 * @category destructors
 * @since 4.0.0
 */
export const runIntoPubSubArray: {
  <OutElem>(
    pubsub: PubSub.PubSub<OutElem>,
    options?: {
      readonly shutdownOnEnd?: boolean | undefined
    } | undefined
  ): <OutErr, OutDone, Env>(
    self: Channel<Arr.NonEmptyReadonlyArray<OutElem>, OutErr, OutDone, unknown, unknown, unknown, Env>
  ) => Effect.Effect<OutDone, OutErr, Env>
  <OutElem, OutErr, OutDone, Env>(
    self: Channel<Arr.NonEmptyReadonlyArray<OutElem>, OutErr, OutDone, unknown, unknown, unknown, Env>,
    pubsub: PubSub.PubSub<OutElem>,
    options?: {
      readonly shutdownOnEnd?: boolean | undefined
    } | undefined
  ): Effect.Effect<OutDone, OutErr, Env>
} = dual(
  (args) => isChannel(args[0]),
  <OutElem, OutErr, OutDone, Env>(
    self: Channel<Arr.NonEmptyReadonlyArray<OutElem>, OutErr, OutDone, unknown, unknown, unknown, Env>,
    pubsub: PubSub.PubSub<OutElem>,
    options?: {
      readonly shutdownOnEnd?: boolean | undefined
    } | undefined
  ) =>
    runForEach(self, (value) => PubSub.publishAll(pubsub, value)).pipe(
      options?.shutdownOnEnd === true ? Effect.ensuring(PubSub.shutdown(pubsub)) : identity_
    )
)

/**
 * Converts a channel to a scoped `PubSub` of `Take` values.
 *
 * **Details**
 *
 * Emitted non-empty arrays are published as output `Take` values. When the
 * channel ends, the `PubSub` is ended with its final `Exit`, so every
 * subscriber, including one that subscribes later, observes completion or
 * failure once it has consumed its buffered values.
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
  ): <OutElem, OutErr, OutDone, Env>(
    self: Channel<Arr.NonEmptyReadonlyArray<OutDone>, OutErr, OutDone, unknown, unknown, unknown, Env>
  ) => Effect.Effect<
    PubSub.PubSub<Take.Take<OutElem, OutErr, OutDone>>,
    never,
    Env | Scope.Scope
  >
  <OutElem, OutErr, OutDone, Env>(
    self: Channel<Arr.NonEmptyReadonlyArray<OutElem>, OutErr, OutDone, unknown, unknown, unknown, Env>,
    options: {
      readonly capacity: "unbounded"
      readonly replay?: number | undefined
    } | {
      readonly capacity: number
      readonly strategy?: "dropping" | "sliding" | "suspend" | undefined
      readonly replay?: number | undefined
    }
  ): Effect.Effect<
    PubSub.PubSub<Take.Take<OutElem, OutErr, OutDone>>,
    never,
    Env | Scope.Scope
  >
} = dual(
  2,
  Effect.fnUntraced(function*<OutElem, OutErr, OutDone, Env>(
    self: Channel<Arr.NonEmptyReadonlyArray<OutElem>, OutErr, OutDone, unknown, unknown, unknown, Env>,
    options: {
      readonly capacity: "unbounded"
      readonly replay?: number | undefined
    } | {
      readonly capacity: number
      readonly strategy?: "dropping" | "sliding" | "suspend" | undefined
      readonly replay?: number | undefined
    }
  ) {
    const pubsub = yield* makePubSub<Take.Take<OutElem, OutErr, OutDone>>(options)
    yield* runForEach(self, (value) => PubSub.publish(pubsub, value)).pipe(
      Effect.onExit((exit) => PubSub.end(pubsub, exit)),
      Effect.forkScoped
    )
    return pubsub
  })
)
