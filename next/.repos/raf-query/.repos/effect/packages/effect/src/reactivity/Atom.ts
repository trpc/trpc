/**
 * Reactive state primitives for values managed by an `AtomRegistry`.
 *
 * An `Atom` describes how to produce or update one piece of reactive state. The
 * registry runs atom reads, remembers current values, tracks dependencies
 * between atoms, starts effects and streams, and cleans up atoms that are no
 * longer used. This module includes the atom constructors and update helpers
 * used for cached values, effect-backed values, streams, browser state, stored
 * values, and server-rendered values.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Arr from "../Array.ts"
import * as Cause from "../Cause.ts"
import * as Channel from "../Channel.ts"
import * as Context from "../Context.ts"
import * as Duration from "../Duration.ts"
import * as Effect from "../Effect.ts"
import * as Exit from "../Exit.ts"
import * as Fiber from "../Fiber.ts"
import type { LazyArg } from "../Function.ts"
import { constant, constTrue, constVoid, dual, pipe } from "../Function.ts"
import type * as Inspectable from "../Inspectable.ts"
import { PipeInspectableProto } from "../internal/core.ts"
import { getStackTraceLimit } from "../internal/stackTraceLimit.ts"
import * as Layer from "../Layer.ts"
import * as MutableHashMap from "../MutableHashMap.ts"
import * as Option from "../Option.ts"
import * as KeyValueStore from "../persistence/KeyValueStore.ts"
import type { Pipeable } from "../Pipeable.ts"
import { hasProperty } from "../Predicate.ts"
import * as Pull from "../Pull.ts"
import type { ReadonlyRecord } from "../Record.ts"
import * as Scheduler from "../Scheduler.ts"
import * as Schema from "../Schema.ts"
import * as Scope from "../Scope.ts"
import * as Stream from "../Stream.ts"
import * as SubscriptionRef from "../SubscriptionRef.ts"
import type { Mutable, NoInfer } from "../Types.ts"
import * as AsyncResult from "./AsyncResult.ts"
import { AtomRegistry } from "./AtomRegistry.ts"
import * as Registry from "./AtomRegistry.ts"
import * as Reactivity from "./Reactivity.ts"

/**
 * Type-level identifier used to recognize `Atom` values.
 *
 * @stability unstable
 * @category type IDs
 * @since 4.0.0
 */
export type TypeId = "~effect/reactivity/Atom"

/**
 * Runtime identifier attached to `Atom` values and used by `isAtom`.
 *
 * @stability unstable
 * @category type IDs
 * @since 4.0.0
 */
export const TypeId: TypeId = "~effect/reactivity/Atom"

/**
 * Reactive value read by an `AtomRegistry`, with metadata controlling caching, laziness, refresh behavior, and initial value targeting.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Atom<A> extends Pipeable, Inspectable.Inspectable {
  readonly [TypeId]: TypeId
  readonly keepAlive: boolean
  readonly lazy: boolean
  readonly read: (get: AtomContext) => A
  equals(value: A, next: A): boolean
  readonly refresh?: (f: <A>(atom: Atom<A>) => void) => void
  readonly label?: readonly [name: string, stack: string]
  readonly idleTTL?: number
  readonly initialValueTarget?: Atom<A>
}

/**
 * Returns `true` when a value is an `Atom`.
 *
 * @stability unstable
 * @category guards
 * @since 4.0.0
 */
export const isAtom = (u: unknown): u is Atom<any> => hasProperty(u, TypeId)

/**
 * Extracts the value type produced by an `Atom`.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type Type<T extends Atom<any>> = T extends Atom<infer A> ? A : never

/**
 * Extracts the success value type from an atom whose value is an `AsyncResult`.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type Success<T extends Atom<any>> = T extends Atom<AsyncResult.AsyncResult<infer A, infer _>> ? A : never

/**
 * Extracts the item type from an atom whose value is a `PullResult`.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type PullSuccess<T extends Atom<any>> = T extends Atom<PullResult<infer A, infer _>> ? A : never

/**
 * Extracts the failure error type from an atom whose value is an `AsyncResult`.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type Failure<T extends Atom<any>> = T extends Atom<AsyncResult.AsyncResult<infer _, infer E>> ? E : never

/**
 * Returns an atom type without serializable metadata, preserving `Writable` read and write types when the input atom is writable.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type WithoutSerializable<T extends Atom<any>> = T extends Writable<infer R, infer W> ? Writable<R, W>
  : Atom<Type<T>>

/**
 * Runtime identifier attached to writable atoms and used by `isWritable`.
 *
 * @stability unstable
 * @category type IDs
 * @since 4.0.0
 */
export const WritableTypeId: WritableTypeId = "~effect/reactivity/Atom/Writable"

/**
 * Type-level identifier used to recognize writable atoms.
 *
 * @stability unstable
 * @category type IDs
 * @since 4.0.0
 */
export type WritableTypeId = "~effect/reactivity/Atom/Writable"

/**
 * Atom that can also be written to, using a `WriteContext` and an input value to update reactive state.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Writable<R, W = R> extends Atom<R> {
  readonly [WritableTypeId]: WritableTypeId
  readonly write: (ctx: WriteContext<R>, value: W) => void
}

/**
 * Context passed to atom read functions for reading dependencies, awaiting `AsyncResult` or `Option` values, managing subscriptions and finalizers, refreshing atoms, and updating writable atoms.
 *
 * @stability unstable
 * @category context
 * @since 4.0.0
 */
export interface AtomContext {
  <A>(atom: Atom<A>): A
  get<A>(this: AtomContext, atom: Atom<A>): A
  result<A, E>(this: AtomContext, atom: Atom<AsyncResult.AsyncResult<A, E>>, options?: {
    readonly suspendOnWaiting?: boolean | undefined
  }): Effect.Effect<A, E>
  resultOnce<A, E>(this: AtomContext, atom: Atom<AsyncResult.AsyncResult<A, E>>, options?: {
    readonly suspendOnWaiting?: boolean | undefined
  }): Effect.Effect<A, E>
  once<A>(this: AtomContext, atom: Atom<A>): A
  addFinalizer(this: AtomContext, f: () => void): void
  mount<A>(this: AtomContext, atom: Atom<A>): void
  refresh<A>(this: AtomContext, atom: Atom<A>): void
  refreshSelf(this: AtomContext): void
  self<A>(this: AtomContext): Option.Option<A>
  setSelf<A>(this: AtomContext, a: A): void
  set<R, W>(this: AtomContext, atom: Writable<R, W>, value: W): void
  setResult<A, E, W>(this: AtomContext, atom: Writable<AsyncResult.AsyncResult<A, E>, W>, value: W): Effect.Effect<A, E>
  some<A>(this: AtomContext, atom: Atom<Option.Option<A>>): Effect.Effect<A>
  someOnce<A>(this: AtomContext, atom: Atom<Option.Option<A>>): Effect.Effect<A>
  stream<A>(this: AtomContext, atom: Atom<A>, options?: {
    readonly withoutInitialValue?: boolean
    readonly bufferSize?: number
  }): Stream.Stream<A>
  streamResult<A, E>(this: AtomContext, atom: Atom<AsyncResult.AsyncResult<A, E>>, options?: {
    readonly withoutInitialValue?: boolean
    readonly bufferSize?: number
  }): Stream.Stream<A, E>
  subscribe<A>(this: AtomContext, atom: Atom<A>, f: (_: A) => void, options?: {
    readonly immediate?: boolean
  }): void
  readonly registry: Registry.AtomRegistry
}

/**
 * Context passed to writable atom write functions for reading atoms, refreshing or setting the current atom, and writing to other writable atoms.
 *
 * @stability unstable
 * @category context
 * @since 4.0.0
 */
export interface WriteContext<A> {
  get<T>(this: WriteContext<A>, atom: Atom<T>): T
  refreshSelf(this: WriteContext<A>): void
  setSelf(this: WriteContext<A>, a: A): void
  set<R, W>(this: WriteContext<A>, atom: Writable<R, W>, value: W): void
}

/**
 * Returns a copy of an atom with an idle time-to-live: finite durations dispose it after inactivity, while an infinite duration keeps it alive.
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const setIdleTTL: {
  (duration: Duration.Input): <A extends Atom<any>>(self: A) => A
  <A extends Atom<any>>(self: A, duration: Duration.Input): A
} = dual<
  (duration: Duration.Input) => <A extends Atom<any>>(self: A) => A,
  <A extends Atom<any>>(self: A, duration: Duration.Input) => A
>(2, (self, durationInput) => {
  const duration = Duration.fromInputUnsafe(durationInput)
  const isFinite = Duration.isFinite(duration)
  return Object.assign(Object.create(Object.getPrototypeOf(self)), {
    ...self,
    keepAlive: !isFinite,
    idleTTL: isFinite ? Duration.toMillis(duration) : undefined
  })
})

const removeTtl = setIdleTTL(0)

const AtomProto = {
  [TypeId]: TypeId,
  equals: Object.is,
  ...PipeInspectableProto,
  toJSON(this: Atom<any>) {
    return {
      _id: "Atom",
      keepAlive: this.keepAlive,
      lazy: this.lazy,
      label: this.label
    }
  }
} as const

const RuntimeProto = {
  ...AtomProto,
  atom(this: AtomRuntime<any, any>, arg: any, options?: {
    readonly initialValue?: unknown
    readonly uninterruptible?: boolean | undefined
  }) {
    const read = makeRead(arg, options)
    return readable((get) => {
      const previous = get.self<AsyncResult.AsyncResult<any, any>>()
      const runtimeResult = get(this)
      if (runtimeResult._tag !== "Success") {
        return AsyncResult.replacePrevious(runtimeResult, previous)
      }
      return read(get, runtimeResult.value)
    })
  },

  fn(this: AtomRuntime<any, any>, arg: any, options?: {
    readonly initialValue?: unknown
    readonly reactivityKeys?: ReadonlyArray<unknown> | ReadonlyRecord<string, ReadonlyArray<unknown>> | undefined
    readonly concurrent?: boolean | undefined
  }) {
    if (arguments.length === 0) {
      return (arg: any, options?: {}) => makeFnRuntime(this, arg, options)
    }
    return makeFnRuntime(this, arg, options)
  },

  pull(this: AtomRuntime<any, any>, arg: any, options?: {
    readonly disableAccumulation?: boolean
    readonly initialValue?: ReadonlyArray<any>
  }) {
    const pullSignal = removeTtl(state(0))
    const pullAtom = readable((get) => {
      const previous = get.self<AsyncResult.AsyncResult<any, any>>()
      const runtimeResult = get(this)
      if (runtimeResult._tag !== "Success") {
        return AsyncResult.replacePrevious(runtimeResult, previous)
      }
      return makeEffect(
        get,
        makeStreamPullEffect(get, pullSignal, arg, options),
        AsyncResult.initial(true),
        runtimeResult.value
      )
    })
    return makeStreamPull(pullSignal, pullAtom)
  },

  subscriptionRef(this: AtomRuntime<any, any>, ref: any) {
    return makeSubRef(
      removeTtl(readable((get) => {
        const previous = get.self<AsyncResult.AsyncResult<any, any>>()
        const runtimeResult = get(this)
        if (runtimeResult._tag !== "Success") {
          return AsyncResult.replacePrevious(runtimeResult, previous)
        }
        const value = typeof ref === "function" ? ref(get) : ref
        return SubscriptionRef.isSubscriptionRef(value)
          ? value
          : makeEffect(get, value, AsyncResult.initial(true), runtimeResult.value)
      })),
      (get, ref) => {
        const runtime = AsyncResult.getOrThrow(get(this))
        return readSubscriptionRef(get, ref, runtime)
      }
    )
  }
}

const makeFnRuntime = (
  self: AtomRuntime<any, any>,
  arg: (
    arg: any,
    get: FnContext
  ) =>
    | Effect.Effect<any, any, Scope.Scope | AtomRegistry>
    | Stream.Stream<any, any, AtomRegistry>,
  options?: {
    readonly initialValue?: unknown
    readonly reactivityKeys?: ReadonlyArray<unknown> | ReadonlyRecord<string, ReadonlyArray<unknown>> | undefined
  }
) => {
  const [read, write, argAtom] = makeResultFn(
    options?.reactivityKeys ?
      ((a: any, get: FnContext) => {
        const effect = arg(a, get)
        return Effect.isEffect(effect)
          ? Reactivity.mutation(effect, options.reactivityKeys!)
          : Stream.ensuring(effect, Reactivity.invalidate(options.reactivityKeys!))
      }) as any :
      arg,
    options
  )
  return writable((get) => {
    get.get(argAtom)
    const previous = get.self<AsyncResult.AsyncResult<any, any>>()
    const runtimeResult = get.get(self)
    if (runtimeResult._tag !== "Success") {
      return AsyncResult.replacePrevious(runtimeResult, previous)
    }
    return read(get, runtimeResult.value)
  }, write)
}

const WritableProto = {
  ...AtomProto,
  [WritableTypeId]: WritableTypeId
} as const

/**
 * Returns `true` when an atom is writable.
 *
 * @stability unstable
 * @category guards
 * @since 4.0.0
 */
export const isWritable = <R, W>(atom: Atom<R>): atom is Writable<R, W> => WritableTypeId in atom

/**
 * Creates a read-only atom from a read function and an optional custom refresh registration callback.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const readable = <A>(
  read: (get: AtomContext) => A,
  refresh?: (f: <A>(atom: Atom<A>) => void) => void
): Atom<A> => {
  const self = Object.create(AtomProto)
  self.keepAlive = false
  self.lazy = true
  self.read = read
  self.refresh = refresh
  return self
}

/**
 * Creates a writable atom from read and write functions, with an optional custom refresh registration callback.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const writable = <R, W>(
  read: (get: AtomContext) => R,
  write: (ctx: WriteContext<R>, value: W) => void,
  refresh?: (f: <A>(atom: Atom<A>) => void) => void
): Writable<R, W> => {
  const self = Object.create(WritableProto)
  self.keepAlive = false
  self.lazy = true
  self.read = read
  self.write = write
  self.refresh = refresh
  return self
}

function constSetSelf<A>(ctx: WriteContext<A>, value: A) {
  ctx.setSelf(value)
}

// -----------------------------------------------------------------------------
// constructors
// -----------------------------------------------------------------------------

/**
 * Creates an atom from a synchronous value or read function, or from an `Effect` or `Stream` whose state is exposed as an `AsyncResult`; plain values create writable state atoms.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const make: {
  <A, E>(create: (get: AtomContext) => Effect.Effect<A, E, Scope.Scope | AtomRegistry>, options?: {
    readonly initialValue?: A | undefined
    readonly uninterruptible?: boolean | undefined
  }): Atom<AsyncResult.AsyncResult<A, E>>
  <A, E>(effect: Effect.Effect<A, E, Scope.Scope | AtomRegistry>, options?: {
    readonly initialValue?: A
    readonly uninterruptible?: boolean | undefined
  }): Atom<AsyncResult.AsyncResult<A, E>>
  <A, E>(create: (get: AtomContext) => Stream.Stream<A, E, AtomRegistry>, options?: {
    readonly initialValue?: A
  }): Atom<AsyncResult.AsyncResult<A, E | Cause.NoSuchElementError>>
  <A, E>(stream: Stream.Stream<A, E, AtomRegistry>, options?: {
    readonly initialValue?: A
  }): Atom<AsyncResult.AsyncResult<A, E | Cause.NoSuchElementError>>
  <A>(create: (get: AtomContext) => A): Atom<A>
  <A>(initialValue: A): Writable<A>
} = (arg: any, options?: {
  readonly initialValue?: unknown
  readonly uninterruptible?: boolean | undefined
}) => {
  const readOrAtom = makeRead(arg, options)
  if (TypeId in readOrAtom) {
    return readOrAtom as any
  }
  return readable(readOrAtom)
}

// -----------------------------------------------------------------------------
// constructors - effect
// -----------------------------------------------------------------------------

const makeRead: {
  <A, E>(effect: Effect.Effect<A, E, Scope.Scope | AtomRegistry>, options?: {
    readonly initialValue?: A
    readonly uninterruptible?: boolean | undefined
  }): (get: AtomContext, services?: Context.Context<any>) => AsyncResult.AsyncResult<A, E>
  <A, E>(create: (get: AtomContext) => Effect.Effect<A, E, Scope.Scope | AtomRegistry>, options?: {
    readonly initialValue?: A
    readonly uninterruptible?: boolean | undefined
  }): (get: AtomContext, services?: Context.Context<any>) => AsyncResult.AsyncResult<A, E>
  <A, E>(stream: Stream.Stream<A, E, AtomRegistry>, options?: {
    readonly initialValue?: A
    readonly uninterruptible?: boolean | undefined
  }): (get: AtomContext, services?: Context.Context<any>) => AsyncResult.AsyncResult<A, E | Cause.NoSuchElementError>
  <A, E>(create: (get: AtomContext) => Stream.Stream<A, E, AtomRegistry>, options?: {
    readonly initialValue?: A
    readonly uninterruptible?: boolean | undefined
  }): (get: AtomContext, services?: Context.Context<any>) => AsyncResult.AsyncResult<A, E | Cause.NoSuchElementError>
  <A>(create: (get: AtomContext) => A): (get: AtomContext, services?: Context.Context<any>) => A
  <A>(initialValue: A): Writable<A>
} = <A, E>(
  arg:
    | Effect.Effect<A, E, Scope.Scope | AtomRegistry>
    | ((get: AtomContext) => Effect.Effect<A, E, Scope.Scope | AtomRegistry>)
    | Stream.Stream<A, E, AtomRegistry>
    | ((get: AtomContext) => Stream.Stream<A, E, AtomRegistry>)
    | ((get: AtomContext) => A)
    | A,
  options?: {
    readonly initialValue?: unknown
    readonly uninterruptible?: boolean | undefined
  }
) => {
  if (typeof arg === "function" && !Effect.isEffect(arg) && !Stream.isStream(arg)) {
    const create = arg as (get: AtomContext) => any
    return function(get: AtomContext, providedServices?: Context.Context<any>) {
      const value = create(get)
      switch (typeof value) {
        case "function":
        case "object": {
          if (value === null) return value
          else if (EffectTypeId in value) {
            return effect(get, value as any, options, providedServices)
          } else if (StreamTypeId in value) {
            return stream(get, value as any, options, providedServices)
          }
          return value
        }
        default:
          return value
      }
    }
  } else if (Effect.isEffect(arg)) {
    return function(get: AtomContext, providedServices?: Context.Context<any>) {
      return effect(get, arg as any, options, providedServices)
    }
  } else if (Stream.isStream(arg)) {
    return function(get: AtomContext, providedServices?: Context.Context<any>) {
      return stream(get, arg as any, options, providedServices)
    }
  }

  return state(arg) as any
}

const EffectTypeId: keyof Effect.Effect<any> = "~effect/Effect"
const StreamTypeId: keyof Stream.Stream<any> = "~effect/Stream"

const state = <A>(
  initialValue: A
): Writable<A> =>
  writable(function(_get) {
    return initialValue
  }, constSetSelf)

const effect = <A, E>(
  get: AtomContext,
  effect: Effect.Effect<A, E, Scope.Scope | AtomRegistry>,
  options?: {
    readonly initialValue?: A
    readonly uninterruptible?: boolean | undefined
  },
  services?: Context.Context<any>
): AsyncResult.AsyncResult<A, E> => {
  const initialValue = options?.initialValue !== undefined
    ? AsyncResult.success<A, E>(options.initialValue)
    : AsyncResult.initial<A, E>()
  return makeEffect(get, effect, initialValue, services, options?.uninterruptible)
}

function makeEffect<A, E>(
  ctx: AtomContext,
  effect: Effect.Effect<A, E, Scope.Scope | AtomRegistry>,
  initialValue: AsyncResult.AsyncResult<A, E>,
  services = Context.empty(),
  uninterruptible = false
): AsyncResult.AsyncResult<A, E> {
  const previous = ctx.self<AsyncResult.AsyncResult<A, E>>()
  const scope = Scope.makeUnsafe()
  ctx.addFinalizer(() => {
    Effect.runForkWith(services)(Scope.close(scope, Exit.void))
  })
  let syncResult: AsyncResult.AsyncResult<A, E> | undefined
  let isAsync = false
  const cancel = runCallbackSync(
    services.pipe(
      Context.add(Scope.Scope, scope),
      Context.add(AtomRegistry, ctx.registry),
      Context.add(Scheduler.Scheduler, ctx.registry.scheduler)
    ),
    effect,
    function(exit) {
      syncResult = AsyncResult.fromExitWithPrevious(exit, previous)
      if (isAsync) {
        ctx.setSelf(syncResult)
      }
    },
    uninterruptible
  )
  isAsync = true
  if (cancel !== undefined) {
    ctx.addFinalizer(cancel)
  }
  if (syncResult !== undefined) {
    return syncResult
  } else if (previous._tag === "Some") {
    return AsyncResult.waitingFrom(previous)
  }
  return AsyncResult.waiting(initialValue)
}

function runCallbackSync<R, A, E, ER = never>(
  services: Context.Context<R>,
  effect: Effect.Effect<A, E, R>,
  onExit: (exit: Exit.Exit<A, E | ER>) => void,
  uninterruptible = false
): (() => void) | undefined {
  if (Exit.isExit(effect)) {
    onExit(effect as any)
    return undefined
  }
  const runFork = Effect.runForkWith(services)
  const fiber = runFork(effect)
  fiber.currentDispatcher?.flush()
  const result = fiber.pollUnsafe()
  if (result) {
    onExit(result)
    return undefined
  }
  const remove = fiber.addObserver(onExit)
  function cancel() {
    remove()
    if (!uninterruptible) {
      fiber.interruptUnsafe()
    }
  }
  return cancel
}

// -----------------------------------------------------------------------------
// context
// -----------------------------------------------------------------------------

/**
 * Atom that builds a `Context` from a `Layer` and exposes constructors for atoms, functions, pulls, and subscription refs that run with that context.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface AtomRuntime<R, ER = never> extends Atom<AsyncResult.AsyncResult<Context.Context<R>, ER>> {
  readonly factory: RuntimeFactory

  readonly layer: Atom<Layer.Layer<R, ER>>

  readonly atom: {
    <A, E>(
      create: (get: AtomContext) => Effect.Effect<A, E, Scope.Scope | R | AtomRegistry | Reactivity.Reactivity>,
      options?: {
        readonly initialValue?: A
        readonly uninterruptible?: boolean | undefined
      }
    ): Atom<AsyncResult.AsyncResult<A, E | ER>>
    <A, E>(effect: Effect.Effect<A, E, Scope.Scope | R | AtomRegistry | Reactivity.Reactivity>, options?: {
      readonly initialValue?: A
      readonly uninterruptible?: boolean | undefined
    }): Atom<AsyncResult.AsyncResult<A, E | ER>>
    <A, E>(create: (get: AtomContext) => Stream.Stream<A, E, AtomRegistry | Reactivity.Reactivity | R>, options?: {
      readonly initialValue?: A
    }): Atom<AsyncResult.AsyncResult<A, E | ER | Cause.NoSuchElementError>>
    <A, E>(stream: Stream.Stream<A, E, AtomRegistry | Reactivity.Reactivity | R>, options?: {
      readonly initialValue?: A
    }): Atom<AsyncResult.AsyncResult<A, E | ER | Cause.NoSuchElementError>>
  }

  readonly fn: {
    <Arg>(): {
      <E, A>(
        fn: (arg: Arg, get: FnContext) => Effect.Effect<A, E, Scope.Scope | AtomRegistry | Reactivity.Reactivity | R>,
        options?: {
          readonly initialValue?: A | undefined
          readonly reactivityKeys?: ReadonlyArray<unknown> | ReadonlyRecord<string, ReadonlyArray<unknown>> | undefined
          readonly concurrent?: boolean | undefined
        }
      ): AtomResultFn<Arg, A, E | ER>
      <E, A>(
        fn: (arg: Arg, get: FnContext) => Stream.Stream<A, E, AtomRegistry | Reactivity.Reactivity | R>,
        options?: {
          readonly initialValue?: A | undefined
          readonly reactivityKeys?: ReadonlyArray<unknown> | ReadonlyRecord<string, ReadonlyArray<unknown>> | undefined
          readonly concurrent?: boolean | undefined
        }
      ): AtomResultFn<Arg, A, E | ER | Cause.NoSuchElementError>
    }
    <E, A, Arg = void>(
      fn: (arg: Arg, get: FnContext) => Effect.Effect<A, E, Scope.Scope | AtomRegistry | Reactivity.Reactivity | R>,
      options?: {
        readonly initialValue?: A | undefined
        readonly reactivityKeys?: ReadonlyArray<unknown> | ReadonlyRecord<string, ReadonlyArray<unknown>> | undefined
        readonly concurrent?: boolean | undefined
      }
    ): AtomResultFn<Arg, A, E | ER>
    <E, A, Arg = void>(
      fn: (arg: Arg, get: FnContext) => Stream.Stream<A, E, AtomRegistry | Reactivity.Reactivity | R>,
      options?: {
        readonly initialValue?: A | undefined
        readonly reactivityKeys?: ReadonlyArray<unknown> | ReadonlyRecord<string, ReadonlyArray<unknown>> | undefined
        readonly concurrent?: boolean | undefined
      }
    ): AtomResultFn<Arg, A, E | ER | Cause.NoSuchElementError>
  }

  readonly pull: <A, E>(
    create:
      | ((get: AtomContext) => Stream.Stream<A, E, R | AtomRegistry | Reactivity.Reactivity>)
      | Stream.Stream<A, E, R | AtomRegistry | Reactivity.Reactivity>,
    options?: {
      readonly disableAccumulation?: boolean
      readonly initialValue?: ReadonlyArray<A>
    }
  ) => Writable<PullResult<A, E | ER>, void>

  readonly subscriptionRef: <A, E>(
    create:
      | Effect.Effect<SubscriptionRef.SubscriptionRef<A>, E, Scope.Scope | R | AtomRegistry | Reactivity.Reactivity>
      | ((
        get: AtomContext
      ) => Effect.Effect<SubscriptionRef.SubscriptionRef<A>, E, Scope.Scope | R | AtomRegistry | Reactivity.Reactivity>)
  ) => Writable<AsyncResult.AsyncResult<A, E>, A>
}

/**
 * Factory for `AtomRuntime` values that share a set of global layers.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface RuntimeFactory {
  <R, E>(
    create:
      | Layer.Layer<R, E, AtomRegistry | Reactivity.Reactivity>
      | ((get: AtomContext) => Layer.Layer<R, E, AtomRegistry | Reactivity.Reactivity>)
  ): AtomRuntime<R, E>
  readonly addGlobalLayer: <A, E>(layer: Layer.Layer<A, E, AtomRegistry | Reactivity.Reactivity>) => void

  /**
   * Uses the `Reactivity` service from the runtime to refresh the atom whenever
   * the keys change.
   */
  readonly withReactivity: (
    keys: ReadonlyArray<unknown> | ReadonlyRecord<string, ReadonlyArray<unknown>>
  ) => <A extends Atom<any>>(atom: A) => A
}

/**
 * A `RuntimeFactory` backed by an atom whose memo map is scoped to each registry.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface RegistryRuntimeFactory extends RuntimeFactory {
  readonly memoMap: Atom<Layer.MemoMap>
}

/**
 * A `RuntimeFactory` backed by a concrete memo map shared across registries.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface SharedRuntimeFactory extends RuntimeFactory {
  readonly memoMap: Layer.MemoMap
}

/**
 * Creates a `RuntimeFactory` backed by a registry-scoped memo map by default,
 * or by the supplied atom or concrete `Layer.MemoMap`.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export function context(): RegistryRuntimeFactory
/**
 * @stability unstable
 */
export function context(options: { readonly memoMap: Atom<Layer.MemoMap> }): RegistryRuntimeFactory
/**
 * @stability unstable
 */
export function context(options: { readonly memoMap: Layer.MemoMap }): SharedRuntimeFactory
/**
 * @stability unstable
 */
export function context(options?: {
  readonly memoMap: Atom<Layer.MemoMap> | Layer.MemoMap
}): RegistryRuntimeFactory | SharedRuntimeFactory {
  const memoMap = options?.memoMap ?? removeTtl(make(() => Layer.makeMemoMapUnsafe()))
  const resolveMemoMap = (get: AtomContext): Layer.MemoMap => isAtom(memoMap) ? get(memoMap) : memoMap
  let globalLayer: Layer.Layer<any, any, AtomRegistry> = Reactivity.layer
  function factory<E, R>(
    create:
      | Layer.Layer<R, E, AtomRegistry | Reactivity.Reactivity>
      | ((get: AtomContext) => Layer.Layer<R, E, AtomRegistry | Reactivity.Reactivity>)
  ): AtomRuntime<R, E> {
    const self = Object.create(RuntimeProto)
    self.keepAlive = false
    self.lazy = true
    self.refresh = undefined
    self.factory = factory

    const layerAtom = keepAlive(
      typeof create === "function"
        ? readable((get) => Layer.provideMerge(create(get), globalLayer))
        : readable(() => Layer.provideMerge(create, globalLayer))
    )
    self.layer = layerAtom

    self.read = function read(get: AtomContext) {
      const layer = get(layerAtom)
      const build = Effect.flatMap(Effect.scope, (scope) => Layer.buildWithMemoMap(layer, resolveMemoMap(get), scope))
      return effect(get, build, { uninterruptible: true })
    }

    return self
  }
  factory.memoMap = memoMap
  factory.addGlobalLayer = (layer: Layer.Layer<any, any, AtomRegistry | Reactivity.Reactivity>) => {
    globalLayer = Layer.provideMerge(globalLayer, Layer.provide(layer, Reactivity.layer))
  }
  const reactivityAtom = removeTtl(
    make((get) =>
      Effect.contextWith((services: Context.Context<Scope.Scope>) =>
        Layer.buildWithMemoMap(Reactivity.layer, resolveMemoMap(get), Context.get(services, Scope.Scope))
      ).pipe(
        Effect.map(Context.get(Reactivity.Reactivity))
      )
    )
  )
  factory.withReactivity =
    (keys: ReadonlyArray<unknown> | ReadonlyRecord<string, ReadonlyArray<unknown>>) =>
    <A extends Atom<any>>(atom: A): A =>
      transform(atom, (get) => {
        const reactivity = AsyncResult.getOrThrow(get(reactivityAtom))
        get.addFinalizer(reactivity.registerUnsafe(keys, () => {
          get.refresh(atom)
        }))
        get.subscribe(atom, (value) => get.setSelf(value))
        return get.once(atom)
      }, { initialValueTarget: atom }) as any as A
  return factory as any
}

/**
 * Default registry-scoped `RuntimeFactory`.
 *
 * @stability unstable
 * @category context
 * @since 4.0.0
 */
export const runtime: RegistryRuntimeFactory = context()

/**
 * Returns `Rx.runtime.withReactivity` for refreshing an atom whenever the
 * keys change in the `Reactivity` service.
 *
 * **When to use**
 *
 * Use to refresh an atom whenever one or more invalidation keys change in the
 * default reactivity runtime.
 *
 * @stability unstable
 * @category reactivity
 * @since 4.0.0
 */
export const withReactivity: (
  keys: ReadonlyArray<unknown> | ReadonlyRecord<string, ReadonlyArray<unknown>>
) => <A extends Atom<any>>(atom: A) => A = runtime.withReactivity

// -----------------------------------------------------------------------------
// constructors - stream
// -----------------------------------------------------------------------------

const stream = <A, E>(
  get: AtomContext,
  stream: Stream.Stream<A, E, AtomRegistry>,
  options?: {
    readonly initialValue?: A
  },
  services?: Context.Context<any>
): AsyncResult.AsyncResult<A, E | Cause.NoSuchElementError> => {
  const initialValue = options?.initialValue !== undefined
    ? AsyncResult.success<A, E>(options.initialValue)
    : AsyncResult.initial<A, E>()
  return makeStream(get, stream, initialValue, services)
}

function makeStream<A, E>(
  ctx: AtomContext,
  stream: Stream.Stream<A, E, AtomRegistry>,
  initialValue: AsyncResult.AsyncResult<A, E | Cause.NoSuchElementError>,
  services = Context.empty()
): AsyncResult.AsyncResult<A, E | Cause.NoSuchElementError> {
  const previous = ctx.self<AsyncResult.AsyncResult<A, E | Cause.NoSuchElementError>>()
  services = Context.add(services, AtomRegistry, ctx.registry)

  const run = Effect.scopedWith((scope) =>
    Effect.flatMap(Channel.toPullScoped(stream.channel, scope), (pull) =>
      Effect.whileLoop({
        while: constTrue,
        body: () => pull,
        step(arr) {
          ctx.setSelf(AsyncResult.success(Arr.lastNonEmpty(arr), {
            waiting: true
          }))
        }
      }))
  ).pipe(
    Effect.catchCause((cause) => {
      if (Pull.isDoneCause(cause)) {
        pipe(
          ctx.self<AsyncResult.AsyncResult<A, E | Cause.NoSuchElementError>>(),
          Option.flatMap(AsyncResult.value),
          Option.match({
            onNone: () =>
              ctx.setSelf(
                AsyncResult.failWithPrevious(new Cause.NoSuchElementError(), {
                  previous: ctx.self<AsyncResult.AsyncResult<A, E | Cause.NoSuchElementError>>()
                })
              ),
            onSome: (a) => ctx.setSelf(AsyncResult.success(a))
          })
        )
      } else {
        ctx.setSelf(AsyncResult.failureWithPrevious(cause as Cause.Cause<E>, {
          previous: ctx.self<AsyncResult.AsyncResult<A, E | Cause.NoSuchElementError>>()
        }))
      }
      return Effect.void
    })
  )

  const cancel = runCallbackSync(
    services.pipe(
      Context.add(AtomRegistry, ctx.registry),
      Context.add(Scheduler.Scheduler, ctx.registry.scheduler)
    ),
    run,
    constVoid,
    false
  )
  if (cancel !== undefined) {
    ctx.addFinalizer(cancel)
  }

  if (previous._tag === "Some") {
    return AsyncResult.waitingFrom(previous)
  }
  return AsyncResult.waiting(initialValue)
}

// -----------------------------------------------------------------------------
// constructors - subscription ref
// -----------------------------------------------------------------------------

/**
 * Creates a writable atom backed by a `SubscriptionRef`, or by an effect that produces one, updating from ref changes and writing atom updates back to the ref.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const subscriptionRef: {
  <A>(ref: SubscriptionRef.SubscriptionRef<A> | ((get: AtomContext) => SubscriptionRef.SubscriptionRef<A>)): Writable<A>
  <A, E>(
    effect:
      | Effect.Effect<SubscriptionRef.SubscriptionRef<A>, E, Scope.Scope | AtomRegistry>
      | ((get: AtomContext) => Effect.Effect<SubscriptionRef.SubscriptionRef<A>, E, Scope.Scope | AtomRegistry>)
  ): Writable<AsyncResult.AsyncResult<A, E>, A>
} = (
  ref:
    | SubscriptionRef.SubscriptionRef<any>
    | ((get: AtomContext) => SubscriptionRef.SubscriptionRef<any>)
    | Effect.Effect<SubscriptionRef.SubscriptionRef<any>, any, Scope.Scope | AtomRegistry>
    | ((get: AtomContext) => Effect.Effect<SubscriptionRef.SubscriptionRef<any>, any, Scope.Scope | AtomRegistry>)
) =>
  makeSubRef(
    readable((get) => {
      const value = typeof ref === "function" ? ref(get) : ref
      return SubscriptionRef.isSubscriptionRef(value)
        ? value
        : makeEffect(get, value, AsyncResult.initial(true))
    }),
    readSubscriptionRef
  ) as any

const readSubscriptionRef = (
  get: AtomContext,
  sub:
    | SubscriptionRef.SubscriptionRef<any>
    | AsyncResult.AsyncResult<SubscriptionRef.SubscriptionRef<any>, any>,
  services = Context.empty()
) => {
  if (SubscriptionRef.isSubscriptionRef(sub)) {
    get.addFinalizer(
      SubscriptionRef.changes(sub).pipe(
        Stream.runForEachArray((arr) => {
          for (let i = 0; i < arr.length; i++) {
            get.setSelf(arr[i])
          }
          return Effect.void
        }),
        Effect.runCallbackWith(services)
      )
    )
    return Effect.runSyncWith(services)(SubscriptionRef.get(sub))
  } else if (sub._tag !== "Success") {
    return sub
  }
  return makeStream(get, SubscriptionRef.changes(sub.value), AsyncResult.initial(true), services)
}

const makeSubRef = (
  refAtom: Atom<
    SubscriptionRef.SubscriptionRef<any> | AsyncResult.AsyncResult<SubscriptionRef.SubscriptionRef<any>, any>
  >,
  read: (
    get: AtomContext,
    ref: SubscriptionRef.SubscriptionRef<any> | AsyncResult.Success<SubscriptionRef.SubscriptionRef<any>, any>
  ) => any
) => {
  function write(ctx: WriteContext<SubscriptionRef.SubscriptionRef<any>>, value: any) {
    const ref = ctx.get(refAtom)
    if (SubscriptionRef.isSubscriptionRef(ref)) {
      Effect.runSync(SubscriptionRef.set(ref, value))
    } else if (AsyncResult.isSuccess(ref)) {
      Effect.runSync(SubscriptionRef.set(ref.value, value))
    }
  }
  return writable((get) => {
    const ref = get(refAtom)
    if (SubscriptionRef.isSubscriptionRef(ref)) {
      return read(get, ref)
    } else if (AsyncResult.isSuccess(ref)) {
      return read(get, ref)
    }
    return ref
  }, write)
}

// -----------------------------------------------------------------------------
// constructors - functions
// -----------------------------------------------------------------------------

/**
 * Context passed to `fn` and `fnSync` computations for reading atoms, awaiting results, registering finalizers, refreshing atoms, subscribing to changes, and writing updates.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface FnContext {
  <A>(atom: Atom<A>): A
  result<A, E>(this: FnContext, atom: Atom<AsyncResult.AsyncResult<A, E>>, options?: {
    readonly suspendOnWaiting?: boolean | undefined
  }): Effect.Effect<A, E>
  addFinalizer(this: FnContext, f: () => void): void
  mount<A>(this: FnContext, atom: Atom<A>): void
  refresh<A>(this: FnContext, atom: Atom<A>): void
  self<A>(this: FnContext): Option.Option<A>
  setSelf<A>(this: FnContext, a: A): void
  set<R, W>(this: FnContext, atom: Writable<R, W>, value: W): void
  setResult<A, E, W>(this: FnContext, atom: Writable<AsyncResult.AsyncResult<A, E>, W>, value: W): Effect.Effect<A, E>
  some<A>(this: FnContext, atom: Atom<Option.Option<A>>): Effect.Effect<A>
  stream<A>(this: FnContext, atom: Atom<A>, options?: {
    readonly withoutInitialValue?: boolean
    readonly bufferSize?: number
  }): Stream.Stream<A>
  streamResult<A, E>(this: FnContext, atom: Atom<AsyncResult.AsyncResult<A, E>>, options?: {
    readonly withoutInitialValue?: boolean
    readonly bufferSize?: number
  }): Stream.Stream<A, E>
  subscribe<A>(this: FnContext, atom: Atom<A>, f: (_: A) => void, options?: {
    readonly immediate?: boolean
  }): void
  readonly registry: Registry.AtomRegistry
}

/**
 * Creates a writable atom for a synchronous function; writing an argument re-runs the function, returning `Option.none` before the first call unless an initial value is supplied.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const fnSync: {
  <Arg>(): {
    <A>(
      f: (arg: Arg, get: FnContext) => A
    ): Writable<Option.Option<A>, Arg>
    <A>(
      f: (arg: Arg, get: FnContext) => A,
      options: { readonly initialValue: A }
    ): Writable<A, Arg>
  }
  <A, Arg = void>(
    f: (arg: Arg, get: FnContext) => A
  ): Writable<Option.Option<A>, Arg>
  <A, Arg = void>(
    f: (arg: Arg, get: FnContext) => A,
    options: { readonly initialValue: A }
  ): Writable<A, Arg>
} = function(...args: ReadonlyArray<any>) {
  if (args.length === 0) {
    return makeFnSync
  }
  return makeFnSync(...args as [any, any]) as any
}

const makeFnSync = <Arg, A>(f: (arg: Arg, get: FnContext) => A, options?: {
  readonly initialValue?: A
}): Writable<Option.Option<A> | A, Arg> => {
  const argAtom = removeTtl(state<[number, Arg]>([0, undefined as any]))
  const hasInitialValue = options?.initialValue !== undefined
  return writable(function(get) {
    ;(get as any).isFn = true
    const [counter, arg] = get.get(argAtom)
    if (counter === 0) {
      return hasInitialValue ? options.initialValue : Option.none()
    }
    return hasInitialValue ? f(arg, get) : Option.some(f(arg, get))
  }, function(ctx, arg) {
    batch(() => {
      ctx.set(argAtom, [ctx.get(argAtom)[0] + 1, arg as Arg])
      ctx.refreshSelf()
    })
  })
}

/**
 * Writable async function atom whose value is an `AsyncResult` and whose writes accept function arguments plus `Reset` and `Interrupt` controls.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface AtomResultFn<Arg, A, E = never>
  extends Writable<AsyncResult.AsyncResult<A, E>, Arg | Reset | Interrupt>
{}

/**
 * Defines the control symbol that can be written to an `AtomResultFn` to reset it to its initial state.
 *
 * **When to use**
 *
 * Use when you need an `AtomResultFn` write value that clears the current async
 * result and returns it to the initial state.
 *
 * @stability unstable
 * @category symbols
 * @since 4.0.0
 */
export const Reset = Symbol.for("effect/reactivity/atom/Atom/Reset")

/**
 * Type of the `Reset` control symbol accepted by `AtomResultFn` writes.
 *
 * @stability unstable
 * @category symbols
 * @since 4.0.0
 */
export type Reset = typeof Reset

/**
 * Defines the control symbol that can be written to an `AtomResultFn` to interrupt the current asynchronous computation.
 *
 * **When to use**
 *
 * Use when you need an `AtomResultFn` write value that interrupts the currently
 * running async computation.
 *
 * @stability unstable
 * @category symbols
 * @since 4.0.0
 */
export const Interrupt = Symbol.for("effect/reactivity/atom/Atom/Interrupt")

/**
 * Type of the `Interrupt` control symbol accepted by `AtomResultFn` writes.
 *
 * @stability unstable
 * @category symbols
 * @since 4.0.0
 */
export type Interrupt = typeof Interrupt

/**
 * Creates a writable atom for an `Effect` or `Stream` function; writing an argument starts the computation and exposes its state as an `AsyncResult`.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const fn: {
  <Arg>(): <E, A>(fn: (arg: Arg, get: FnContext) => Effect.Effect<A, E, Scope.Scope | AtomRegistry>, options?: {
    readonly initialValue?: A | undefined
    readonly concurrent?: boolean | undefined
  }) => AtomResultFn<Arg, A, E>
  <E, A, Arg = void>(fn: (arg: Arg, get: FnContext) => Effect.Effect<A, E, Scope.Scope | AtomRegistry>, options?: {
    readonly initialValue?: A | undefined
    readonly concurrent?: boolean | undefined
  }): AtomResultFn<Arg, A, E>
  <Arg>(): <E, A>(fn: (arg: Arg, get: FnContext) => Stream.Stream<A, E, AtomRegistry>, options?: {
    readonly initialValue?: A | undefined
    readonly concurrent?: boolean | undefined
  }) => AtomResultFn<Arg, A, E | Cause.NoSuchElementError>
  <E, A, Arg = void>(fn: (arg: Arg, get: FnContext) => Stream.Stream<A, E, AtomRegistry>, options?: {
    readonly initialValue?: A | undefined
    readonly concurrent?: boolean | undefined
  }): AtomResultFn<Arg, A, E | Cause.NoSuchElementError>
} = function(...args: ReadonlyArray<any>) {
  if (args.length === 0) {
    return makeFn
  }
  return makeFn(...args as [any, any]) as any
}

const makeFn = <Arg, E, A>(
  f: (arg: Arg, get: FnContext) => Stream.Stream<A, E, AtomRegistry> | Effect.Effect<A, E, Scope.Scope | AtomRegistry>,
  options?: {
    readonly initialValue?: A | undefined
    readonly concurrent?: boolean | undefined
  }
): AtomResultFn<Arg, A, E | Cause.NoSuchElementError> => {
  const [read, write] = makeResultFn(f, options)
  return writable(read, write) as any
}

function makeResultFn<Arg, E, A>(
  f: (arg: Arg, get: FnContext) => Effect.Effect<A, E, Scope.Scope | AtomRegistry> | Stream.Stream<A, E, AtomRegistry>,
  options?: {
    readonly initialValue?: A
    readonly concurrent?: boolean | undefined
  }
) {
  const argAtom = removeTtl(state<[number, Arg | Interrupt]>([0, undefined as any]))
  const initialValue = options?.initialValue !== undefined
    ? AsyncResult.success<A, E>(options.initialValue)
    : AsyncResult.initial<A, E>()
  const fibersAtom = options?.concurrent
    ? removeTtl(readable((get) => {
      const fibers = new Set<Fiber.Fiber<any, any>>()
      get.addFinalizer(() => fibers.forEach((f) => f.interruptUnsafe()))
      return fibers
    }))
    : undefined

  function read(
    get: AtomContext,
    services?: Context.Context<any>
  ): AsyncResult.AsyncResult<A, E | Cause.NoSuchElementError> {
    const fibers = fibersAtom ? get(fibersAtom) : undefined
    ;(get as any).isFn = true
    const [counter, arg] = get.get(argAtom)
    if (counter === 0) {
      return initialValue
    } else if (arg === Interrupt) {
      return AsyncResult.failureWithPrevious(Cause.interrupt(), { previous: get.self() })
    }
    let value = f(arg, get)
    if (EffectTypeId in value) {
      if (fibers) {
        const eff = value as Effect.Effect<A, E, Scope.Scope | AtomRegistry>
        value = Effect.flatMap(
          Effect.forkDetach(eff, { startImmediately: true }),
          (fiber) => {
            fibers.add(fiber)
            const runningFibers = Array.from(fibers)
            fiber.addObserver(() => fibers.delete(fiber))
            return Effect.map(Fiber.joinAll(runningFibers), (arr) => arr[0])
          }
        )
      }
      return makeEffect(get, value as any, initialValue, services, false)
    }
    return makeStream(get, value as any, initialValue, services)
  }
  function write(
    ctx: WriteContext<AsyncResult.AsyncResult<A, E | Cause.NoSuchElementError>>,
    arg: Arg | Reset | Interrupt
  ) {
    batch(() => {
      if (arg === Reset) {
        ctx.set(argAtom, [0, undefined as any])
      } else if (arg === Interrupt) {
        ctx.set(argAtom, [ctx.get(argAtom)[0] + 1, Interrupt])
      } else {
        ctx.set(argAtom, [ctx.get(argAtom)[0] + 1, arg])
      }
      ctx.refreshSelf()
    })
  }
  return [read, write, argAtom] as const
}

/**
 * `AsyncResult` produced by `pull`, containing a non-empty batch of pulled items and a `done` flag, or `NoSuchElementError` when the stream completes without items.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type PullResult<A, E = never> = AsyncResult.AsyncResult<{
  readonly done: boolean
  readonly items: Arr.NonEmptyArray<A>
}, E | Cause.NoSuchElementError>

/**
 * Creates a writable atom that pulls an initial chunk from a stream and then pulls the next chunk whenever it is written to, accumulating items unless `disableAccumulation` is enabled.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const pull = <A, E>(
  create: ((get: AtomContext) => Stream.Stream<A, E, AtomRegistry>) | Stream.Stream<A, E, AtomRegistry>,
  options?: {
    readonly disableAccumulation?: boolean | undefined
  }
): Writable<PullResult<A, E>, void> => {
  const pullSignal = removeTtl(state(0))
  const pullAtom = readable(makeRead(function(get) {
    return makeStreamPullEffect(get, pullSignal, create, options)
  }))
  return makeStreamPull(pullSignal, pullAtom)
}

const makeStreamPullEffect = <A, E>(
  get: AtomContext,
  pullSignal: Atom<number>,
  create: Stream.Stream<A, E, AtomRegistry> | ((get: AtomContext) => Stream.Stream<A, E, AtomRegistry>),
  options?: {
    readonly disableAccumulation?: boolean | undefined
  }
): Effect.Effect<
  { readonly done: boolean; readonly items: Arr.NonEmptyArray<A> },
  E | Cause.NoSuchElementError,
  Scope.Scope | AtomRegistry
> =>
  Effect.flatMap(
    Stream.toPull(typeof create === "function" ? create(get) : create),
    (pullChunk) => {
      const fiber = Fiber.getCurrent()!
      const services = fiber.context as Context.Context<AtomRegistry | Scope.Scope>
      let acc: ReadonlyArray<A> = Arr.empty<A>()
      const pull: Effect.Effect<
        {
          done: boolean
          items: Arr.NonEmptyArray<A>
        },
        Cause.NoSuchElementError | E,
        Registry.AtomRegistry
      > = Effect.matchCauseEffect(pullChunk, {
        onFailure(cause): Effect.Effect<
          { done: boolean; items: Arr.NonEmptyArray<A> },
          Cause.NoSuchElementError | E
        > {
          if (Pull.isDoneCause(cause)) {
            if (!Arr.isReadonlyArrayNonEmpty(acc)) {
              return Effect.fail(new Cause.NoSuchElementError(`Atom.pull: no items`))
            }
            return Effect.succeed({ done: true, items: acc as Arr.NonEmptyArray<A> })
          }
          return Effect.failCause(cause as Cause.Cause<E>)
        },
        onSuccess(chunk) {
          let items: Arr.NonEmptyArray<A>
          if (options?.disableAccumulation) {
            items = chunk as any
          } else {
            items = Arr.appendAll(acc, chunk)
            acc = items
          }
          return Effect.succeed({ done: false, items })
        }
      })

      const cancels = new Set<() => void>()
      get.addFinalizer(() => {
        for (const cancel of cancels) cancel()
      })
      get.once(pullSignal)
      get.subscribe(pullSignal, () => {
        get.setSelf(AsyncResult.waitingFrom(get.self<PullResult<A, E>>()))
        let cancel: (() => void) | undefined
        // eslint-disable-next-line prefer-const
        cancel = runCallbackSync(services, pull, (exit) => {
          if (cancel) cancels.delete(cancel)
          const result = AsyncResult.fromExitWithPrevious(exit, get.self())
          const pending = cancels.size > 0
          get.setSelf(pending ? AsyncResult.waiting(result) : result)
        })
        if (cancel) cancels.add(cancel)
      })

      return pull
    }
  )

const makeStreamPull = <A, E>(
  pullSignal: Writable<number>,
  pullAtom: Atom<PullResult<A, E>>
) =>
  writable(pullAtom.read, function(ctx, _) {
    ctx.set(pullSignal, ctx.get(pullSignal) + 1)
  })

/**
 * Creates a memoized atom factory that returns the same object for the same argument, using weak references for cached values when the platform supports them.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const family = typeof WeakRef === "undefined" || typeof FinalizationRegistry === "undefined" ?
  <Arg, T extends object>(
    f: (arg: Arg) => T
  ): (arg: Arg) => T => {
    const atoms = MutableHashMap.empty<Arg, T>()
    return function(arg) {
      const atomEntry = MutableHashMap.get(atoms, arg)
      if (atomEntry._tag === "Some") {
        return atomEntry.value
      }
      const newAtom = f(arg)
      MutableHashMap.set(atoms, arg, newAtom)
      return newAtom
    }
  } :
  <Arg, T extends object>(
    f: (arg: Arg) => T
  ): (arg: Arg) => T => {
    const atoms = MutableHashMap.empty<Arg, WeakRef<T>>()
    const registry = new FinalizationRegistry<Arg>((arg) => {
      const entry = MutableHashMap.get(atoms, arg)
      if (entry._tag === "Some" && entry.value.deref() === undefined) {
        MutableHashMap.remove(atoms, arg)
      }
    })
    return function(arg) {
      const atomEntry = MutableHashMap.get(atoms, arg).pipe(
        Option.flatMapNullishOr((ref) => ref.deref())
      )

      if (atomEntry._tag === "Some") {
        return atomEntry.value
      }
      const newAtom = f(arg)
      MutableHashMap.set(atoms, arg, new WeakRef(newAtom))
      registry.register(newAtom, arg)
      return newAtom
    }
  }

/**
 * Uses a fallback `AsyncResult` atom while the primary atom is `Initial`, marking the fallback result as waiting until the primary atom produces a non-initial result.
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const withFallback: {
  <E2, A2>(
    fallback: Atom<AsyncResult.AsyncResult<A2, E2>>
  ): <R extends Atom<AsyncResult.AsyncResult<any, any>>>(
    self: R
  ) => [R] extends [Writable<infer _, infer RW>] ? Writable<
      AsyncResult.AsyncResult<
        AsyncResult.AsyncResult.Success<Type<R>> | A2,
        AsyncResult.AsyncResult.Failure<Type<R>> | E2
      >,
      RW
    >
    : Atom<
      AsyncResult.AsyncResult<
        AsyncResult.AsyncResult.Success<Type<R>> | A2,
        AsyncResult.AsyncResult.Failure<Type<R>> | E2
      >
    >
  <R extends Atom<AsyncResult.AsyncResult<any, any>>, A2, E2>(
    self: R,
    fallback: Atom<AsyncResult.AsyncResult<A2, E2>>
  ): [R] extends [Writable<infer _, infer RW>] ? Writable<
      AsyncResult.AsyncResult<
        AsyncResult.AsyncResult.Success<Type<R>> | A2,
        AsyncResult.AsyncResult.Failure<Type<R>> | E2
      >,
      RW
    >
    : Atom<
      AsyncResult.AsyncResult<
        AsyncResult.AsyncResult.Success<Type<R>> | A2,
        AsyncResult.AsyncResult.Failure<Type<R>> | E2
      >
    >
} = dual(2, <R extends Atom<AsyncResult.AsyncResult<any, any>>, A2, E2>(
  self: R,
  fallback: Atom<AsyncResult.AsyncResult<A2, E2>>
): [R] extends [Writable<infer _, infer RW>] ? Writable<
    AsyncResult.AsyncResult<
      AsyncResult.AsyncResult.Success<Type<R>> | A2,
      AsyncResult.AsyncResult.Failure<Type<R>> | E2
    >,
    RW
  >
  : Atom<
    AsyncResult.AsyncResult<
      AsyncResult.AsyncResult.Success<Type<R>> | A2,
      AsyncResult.AsyncResult.Failure<Type<R>> | E2
    >
  > =>
{
  function withFallback(get: AtomContext) {
    const result = get(self)
    if (result._tag === "Initial") {
      return AsyncResult.waiting(get(fallback))
    }
    return result
  }
  return isWritable(self)
    ? writable(
      withFallback,
      function(ctx, value) {
        ctx.set(self, value)
      },
      self.refresh ?? function(refresh) {
        refresh(self)
      }
    ) as any
    : readable(
      withFallback,
      self.refresh ?? function(refresh) {
        refresh(self)
      }
    ) as any
})

/**
 * Returns a copy of an atom that remains cached and mounted even when no subscribers are using it.
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const keepAlive = <A extends Atom<any>>(self: A): A =>
  Object.assign(Object.create(Object.getPrototypeOf(self)), {
    ...self,
    keepAlive: true
  })

/**
 * Allows a reactive value to be disposed of when it is not in use.
 *
 * **Details**
 *
 * Atoms have this behavior by default, so use this to undo `keepAlive` on a copied atom.
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const autoDispose = <A extends Atom<any>>(self: A): A =>
  Object.assign(Object.create(Object.getPrototypeOf(self)), {
    ...self,
    keepAlive: false
  })

/**
 * Sets whether an atom should be lazy.
 *
 * **Details**
 *
 * Lazy atoms defer recomputation while they have no active listeners or active
 * non-lazy dependents, rebuilding the next time their value is observed.
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const setLazy: {
  (lazy: boolean): <A extends Atom<any>>(self: A) => A
  <A extends Atom<any>>(self: A, lazy: boolean): A
} = dual(2, <A extends Atom<any>>(self: A, lazy: boolean) =>
  Object.assign(Object.create(Object.getPrototypeOf(self)), {
    ...self,
    lazy
  }))

/**
 * Returns a copy of an atom that uses a custom equality function to detect
 * value changes.
 *
 * **Details**
 *
 * When an atom's value is rebuilt or written, the registry compares the new
 * value against the current one to decide whether dependents and listeners
 * should be notified. By default the comparison uses `Object.is`, so a
 * structurally equal but referentially distinct value still triggers
 * notifications. Providing an equality function lets the atom skip updates
 * when the new value is equal to the current one.
 *
 * **Example** (Comparing values structurally)
 *
 * ```ts import.meta.vitest
 * import { Atom } from "effect/reactivity"
 *
 * const point = Atom.make({ x: 0, y: 0 }).pipe(
 *   Atom.withEquality<{ x: number; y: number }>((a, b) => a.x === b.x && a.y === b.y)
 * )
 * point.equals({ x: 1, y: 2 }, { x: 1, y: 2 }) // => true
 * ```
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const withEquality: {
  <A>(equals: (value: A, next: A) => boolean): <T extends Atom<A>>(self: T) => T
  <T extends Atom<any>>(self: T, equals: (value: Type<T>, next: Type<T>) => boolean): T
} = dual(
  2,
  <T extends Atom<any>>(self: T, equals: (value: Type<T>, next: Type<T>) => boolean): T =>
    Object.assign(Object.create(Object.getPrototypeOf(self)), {
      ...self,
      equals
    })
)

/**
 * Attaches a diagnostic label to an atom.
 *
 * **Details**
 *
 * The label is used for inspection and debugging metadata and does not change the
 * atom's read or write behavior.
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const withLabel: {
  (name: string): <A extends Atom<any>>(self: A) => A
  <A extends Atom<any>>(self: A, name: string): A
} = dual<
  (name: string) => <A extends Atom<any>>(self: A) => A,
  <A extends Atom<any>>(self: A, name: string) => A
>(2, (self, name) =>
  Object.assign(Object.create(Object.getPrototypeOf(self)), {
    ...self,
    label: [name, getStackTraceLimit() === 0 ? "" : new Error().stack?.split("\n")[5] ?? ""]
  }))

/**
 * Pairs an atom with an initial value for registry initialization.
 *
 * **When to use**
 *
 * Use to preload an atom value when constructing or seeding a registry.
 *
 * **Details**
 *
 * The returned tuple can be supplied to `AtomRegistry` initial values so the atom
 * starts with the provided value before it is first rebuilt.
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const initialValue: {
  <A>(initialValue: A): (self: Atom<A>) => readonly [Atom<A>, A]
  <A>(self: Atom<A>, initialValue: A): readonly [Atom<A>, A]
} = dual<
  <A>(initialValue: A) => (self: Atom<A>) => readonly [Atom<A>, A],
  <A>(self: Atom<A>, initialValue: A) => readonly [Atom<A>, A]
>(2, (self, initialValue) => [self, initialValue])

/**
 * Creates a derived atom by reading another atom with a custom `AtomContext`
 * function.
 *
 * **Details**
 *
 * If the source is writable, the derived atom keeps the source write input and
 * forwards writes to the source. `initialValueTarget` controls which atom receives
 * preloaded initial values for the derived atom.
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const transform: {
  <R extends Atom<any>, B>(
    f: (get: AtomContext, atom: R) => B,
    options?: {
      readonly initialValueTarget?: Atom<B> | undefined
    }
  ): (self: R) => [R] extends [Writable<infer _, infer RW>] ? Writable<B, RW> : Atom<B>
  <R extends Atom<any>, B>(
    self: R,
    f: (get: AtomContext, atom: R) => B,
    options?: {
      readonly initialValueTarget?: Atom<B> | undefined
    }
  ): [R] extends [Writable<infer _, infer RW>] ? Writable<B, RW> : Atom<B>
} = dual(
  (args) => isAtom(args[0]),
  (<A, B>(
    self: Atom<A>,
    f: (get: AtomContext, atom: Atom<A>, options?: {
      readonly initialValueTarget?: Atom<B> | undefined
    }) => B,
    options?: {
      readonly initialValueTarget?: Atom<B> | undefined
    }
  ): Atom<B> => {
    const atom = removeTtl(
      isWritable(self)
        ? writable(
          (get) => f(get, self),
          function(ctx, value) {
            ctx.set(self, value)
          },
          self.refresh ?? function(refresh) {
            refresh(self)
          }
        )
        : readable(
          (get) => f(get, self),
          self.refresh ?? function(refresh) {
            refresh(self)
          }
        )
    )
    if (options?.initialValueTarget) {
      ;(atom as Mutable<Atom<B>>).initialValueTarget = getInitialValueTarget(options.initialValueTarget)
    }
    return atom
  }) as any
)

const getInitialValueTarget = <A>(atom: Atom<A>): Atom<A> => {
  let target = atom
  while (target.initialValueTarget) {
    target = target.initialValueTarget
  }
  return target
}

/**
 * Maps the current value of an atom with a pure function.
 *
 * **Details**
 *
 * When the source atom is writable, the returned atom remains writable and keeps
 * the source atom's write input type.
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const map: {
  <R extends Atom<any>, B>(
    f: (_: Type<R>) => B
  ): (self: R) => [R] extends [Writable<infer _, infer RW>] ? Writable<B, RW> : Atom<B>
  <R extends Atom<any>, B>(
    self: R,
    f: (_: Type<R>) => B
  ): [R] extends [Writable<infer _, infer RW>] ? Writable<B, RW> : Atom<B>
} = dual(
  2,
  <A, B>(self: Atom<A>, f: (_: A) => B): Atom<B> => transform(self, (get) => f(get(self)))
)

/**
 * Maps the successful value inside an `AsyncResult` atom.
 *
 * **Details**
 *
 * Initial and failure states are preserved, and writable source atoms keep their
 * original write input type.
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const mapResult: {
  <R extends Atom<AsyncResult.AsyncResult<any, any>>, B>(
    f: (_: AsyncResult.AsyncResult.Success<Type<R>>) => B
  ): (
    self: R
  ) => [R] extends [Writable<infer _, infer RW>] ?
    Writable<AsyncResult.AsyncResult<B, AsyncResult.AsyncResult.Failure<Type<R>>>, RW>
    : Atom<AsyncResult.AsyncResult<B, AsyncResult.AsyncResult.Failure<Type<R>>>>
  <R extends Atom<AsyncResult.AsyncResult<any, any>>, B>(
    self: R,
    f: (_: AsyncResult.AsyncResult.Success<Type<R>>) => B
  ): [R] extends [Writable<infer _, infer RW>] ?
    Writable<AsyncResult.AsyncResult<B, AsyncResult.AsyncResult.Failure<Type<R>>>, RW>
    : Atom<AsyncResult.AsyncResult<B, AsyncResult.AsyncResult.Failure<Type<R>>>>
} = dual(2, <R extends Atom<AsyncResult.AsyncResult<any, any>>, B>(
  self: R,
  f: (_: AsyncResult.AsyncResult.Success<Type<R>>) => B
): [R] extends [Writable<infer _, infer RW>] ?
  Writable<AsyncResult.AsyncResult<B, AsyncResult.AsyncResult.Failure<Type<R>>>, RW>
  : Atom<AsyncResult.AsyncResult<B, AsyncResult.AsyncResult.Failure<Type<R>>>> => map(self, AsyncResult.map(f)))

/**
 * Creates an atom that publishes source changes only after the source has stopped
 * changing for the specified duration.
 *
 * **Details**
 *
 * The current source value is used immediately, and any pending debounce timer is
 * cleared when the derived atom is disposed.
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const debounce: {
  (duration: Duration.Input): <A extends Atom<any>>(self: A) => WithoutSerializable<A>
  <A extends Atom<any>>(self: A, duration: Duration.Input): WithoutSerializable<A>
} = dual(
  2,
  <A>(self: Atom<A>, duration: Duration.Input): Atom<A> => {
    const millis = Duration.toMillis(Duration.fromInputUnsafe(duration))
    return transform(self, function(get) {
      let timeout: number | undefined
      let value = get.once(self)
      function update() {
        timeout = undefined
        get.setSelf(value)
      }
      get.addFinalizer(function() {
        if (timeout) clearTimeout(timeout)
      })
      get.subscribe(self, function(val) {
        value = val
        if (timeout) clearTimeout(timeout)
        timeout = setTimeout(update, millis) as any
      })
      return value
    }, { initialValueTarget: self })
  }
)

/**
 * Creates a derived atom that reads the source and schedules a refresh after the
 * specified duration.
 *
 * **Details**
 *
 * The scheduled refresh is canceled when the derived atom's lifetime is disposed.
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const withRefresh: {
  (duration: Duration.Input): <A extends Atom<any>>(self: A) => WithoutSerializable<A>
  <A extends Atom<any>>(self: A, duration: Duration.Input): WithoutSerializable<A>
} = dual(
  2,
  <A>(self: Atom<A>, duration: Duration.Input): Atom<A> => {
    const millis = Duration.toMillis(Duration.fromInputUnsafe(duration))
    return transform(self, function(get) {
      const handle = setTimeout(() => get.refresh(self), millis) as any
      get.addFinalizer(() => clearTimeout(handle))
      return get(self)
    }, { initialValueTarget: self })
  }
)

/**
 * Adds stale-while-revalidate refresh behavior to an async result atom.
 *
 * **Details**
 *
 * Returns the current result and defers stale-source revalidation until after the read.
 * Skips revalidation if the source becomes fresh or the atom is disposed.
 * Manual refreshes still forward to the source. `revalidateOnMount` controls
 * initial stale refreshes; `revalidateOnFocus` controls focus refreshes
 * (`true` respects `staleTime`, `"always"` forces refresh).
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const swr: {
  (
    options: {
      readonly staleTime: Duration.Input
      readonly revalidateOnMount?: boolean | undefined
      readonly revalidateOnFocus?: boolean | "always" | undefined
      readonly focusSignal?: Atom<any> | undefined
    }
  ): <R extends Atom<AsyncResult.AsyncResult<any, any>>>(self: R) => WithoutSerializable<R>
  <R extends Atom<AsyncResult.AsyncResult<any, any>>>(
    self: R,
    options: {
      readonly staleTime: Duration.Input
      readonly revalidateOnMount?: boolean | undefined
      readonly revalidateOnFocus?: boolean | "always" | undefined
      readonly focusSignal?: Atom<any> | undefined
    }
  ): WithoutSerializable<R>
} = dual(
  2,
  <A, E>(
    self: Atom<AsyncResult.AsyncResult<A, E>>,
    options: {
      readonly staleTime: Duration.Input
      readonly revalidateOnMount?: boolean | undefined
      readonly revalidateOnFocus?: boolean | "always" | undefined
      readonly focusSignal?: Atom<any> | undefined
    }
  ): Atom<AsyncResult.AsyncResult<A, E>> => {
    const staleTime = Duration.toMillis(Duration.fromInputUnsafe(options.staleTime))
    return transform(self, (get) => {
      const current = get.once(self)
      get.subscribe(self, (value) => {
        get.setSelf(value)
      })
      if (options.revalidateOnFocus && options.focusSignal) {
        get.once(options.focusSignal)
        get.subscribe(
          options.focusSignal,
          options.revalidateOnFocus === "always" ? () => get.refresh(self) : () => {
            const current = get.once(self)
            if (shouldRevalidateSWR(current, staleTime)) {
              get.refresh(self)
            }
          }
        )
      }
      const firstRead = Option.isNone(get.self<AsyncResult.AsyncResult<A, E>>())
      if (firstRead && options.revalidateOnMount === false) {
        return current
      }
      if (shouldRevalidateSWR(current, staleTime)) {
        let active = true
        get.addFinalizer(() => {
          active = false
        })
        get.registry.schedulerAsync.makeDispatcher().scheduleTask(() => {
          if (active && shouldRevalidateSWR(get.once(self), staleTime)) {
            get.refresh(self)
          }
        }, 0)
      }
      return current
    }, { initialValueTarget: self })
  }
) as any

const swrTimestamp = <A, E>(result: AsyncResult.AsyncResult<A, E>): Option.Option<number> => {
  if (result._tag === "Success") {
    return Option.some(result.timestamp)
  }
  if (result._tag === "Failure") {
    return Option.map(result.previousSuccess, (success) => success.timestamp)
  }
  return Option.none()
}

const isFreshWithin = (timestamp: number, staleTime: number, now: number): boolean => now - timestamp < staleTime

const shouldRevalidateSWR = <A, E>(result: AsyncResult.AsyncResult<A, E>, staleTime: number): boolean => {
  if (result.waiting) {
    return false
  }
  const timestamp = Option.getOrUndefined(swrTimestamp(result))
  if (timestamp === undefined) {
    return result._tag !== "Initial"
  }
  return !isFreshWithin(timestamp, staleTime, Date.now())
}

/**
 * Wraps an atom in a writable optimistic atom.
 *
 * **Details**
 *
 * Writes accept transition atoms containing `AsyncResult` values. Waiting
 * successes are shown optimistically while transitions run; when successful
 * transitions finish, the source atom is refreshed, and failures roll the value
 * back to the latest source value.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const optimistic = <A>(self: Atom<A>): Writable<A, Atom<AsyncResult.AsyncResult<A, unknown>>> => {
  let counter = 0
  const writeAtom = removeTtl(state(
    [
      counter,
      undefined as any as Atom<AsyncResult.AsyncResult<A, unknown>>
    ] as const
  ))
  return writable(
    (get) => {
      let lastValue = get.once(self)
      let needsRefresh = false
      get.subscribe(self, (value) => {
        lastValue = value
        if (transitions.size > 0) {
          return
        }
        needsRefresh = false
        if (!AsyncResult.isAsyncResult(value)) {
          return get.setSelf(value)
        }
        const current = Option.getOrUndefined(get.self<AsyncResult.AsyncResult<any, any>>())!
        switch (value._tag) {
          case "Initial": {
            if (AsyncResult.isInitial(current)) {
              get.setSelf(value)
            }
            return
          }
          case "Success": {
            if (AsyncResult.isSuccess(current)) {
              if (!value.waiting && value.timestamp >= current.timestamp) {
                get.setSelf(value)
              }
            } else {
              get.setSelf(value)
            }
            return
          }
          case "Failure": {
            return get.setSelf(value)
          }
        }
      })
      const transitions = new Set<Atom<AsyncResult.AsyncResult<A, unknown>>>()
      const cancels = new Set<() => void>()
      get.subscribe(writeAtom, ([, atom]) => {
        if (transitions.has(atom)) return
        transitions.add(atom)
        let cancel: (() => void) | undefined
        // eslint-disable-next-line prefer-const
        cancel = get.registry.subscribe(atom, (result) => {
          if (AsyncResult.isSuccess(result) && result.waiting) {
            return get.setSelf(result.value)
          }
          transitions.delete(atom)
          if (cancel) {
            cancels.delete(cancel)
            cancel()
          }
          if (!needsRefresh && !AsyncResult.isFailure(result)) {
            needsRefresh = true
          }
          if (transitions.size === 0) {
            if (needsRefresh) {
              needsRefresh = false
              get.refresh(self)
            } else {
              get.setSelf(lastValue)
            }
          }
        }, { immediate: true })
        if (transitions.has(atom)) {
          cancels.add(cancel)
        } else {
          cancel()
        }
      })
      get.addFinalizer(() => {
        for (const cancel of cancels) cancel()
        transitions.clear()
        cancels.clear()
      })
      return lastValue
    },
    (ctx, atom) => ctx.set(writeAtom, [++counter, atom]),
    (refresh) => refresh(self)
  )
}

/**
 * Creates an `AtomResultFn` that applies an optimistic update before running the
 * underlying mutation.
 *
 * **Details**
 *
 * The reducer computes the provisional value from the current value and mutation
 * input. The wrapped function result then completes the transition or updates the
 * optimistic value through the provided setter callback.
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const optimisticFn: {
  <A, W, XA, XE, OW = void>(
    options: {
      readonly reducer: (current: NoInfer<A>, update: OW) => NoInfer<W>
      readonly fn:
        | AtomResultFn<OW, XA, XE>
        | ((set: (result: NoInfer<W>) => void) => AtomResultFn<OW, XA, XE>)
    }
  ): (
    self: Writable<A, Atom<AsyncResult.AsyncResult<W, unknown>>>
  ) => AtomResultFn<OW, XA, XE>
  <A, W, XA, XE, OW = void>(
    self: Writable<A, Atom<AsyncResult.AsyncResult<W, unknown>>>,
    options: {
      readonly reducer: (current: NoInfer<A>, update: OW) => NoInfer<W>
      readonly fn:
        | AtomResultFn<OW, XA, XE>
        | ((set: (result: NoInfer<W>) => void) => AtomResultFn<OW, XA, XE>)
    }
  ): AtomResultFn<OW, XA, XE>
} = dual(2, <A, W, XA, XE, OW = void>(
  self: Writable<A, Atom<AsyncResult.AsyncResult<W, unknown>>>,
  options: {
    readonly reducer: (current: NoInfer<A>, update: OW) => NoInfer<W>
    readonly fn:
      | AtomResultFn<OW, XA, XE>
      | ((set: (result: NoInfer<W>) => void) => AtomResultFn<OW, XA, XE>)
  }
): AtomResultFn<OW, XA, XE> => {
  const transition = removeTtl(state<AsyncResult.AsyncResult<W, unknown>>(AsyncResult.initial()))
  return fn((arg: OW, get) => {
    let value = options.reducer(get(self), arg)
    if (AsyncResult.isAsyncResult(value)) {
      value = AsyncResult.waiting(value, { touch: true })
    }
    get.set(transition, AsyncResult.success(value, { waiting: true }))
    get.set(self, transition)
    const fn = typeof options.fn === "function"
      ? autoDispose(options.fn((value) =>
        get.set(
          transition,
          AsyncResult.success(AsyncResult.isAsyncResult(value) ? AsyncResult.waiting(value) : value, { waiting: true })
        )
      ))
      : options.fn
    get.set(fn, arg)
    return Effect.callback<XA, XE>((resume) => {
      get.subscribe(fn, (result) => {
        if (result._tag === "Initial" || result.waiting) return
        get.set(transition, AsyncResult.map(result, () => value))
        resume(AsyncResult.toExit(result) as any)
      }, { immediate: true })
    })
  })
})

/**
 * Runs synchronous atom updates as a batch.
 *
 * **Details**
 *
 * Stale nodes are rebuilt and listeners are notified after the callback completes,
 * so dependent updates observe the final batched state.
 *
 * @stability unstable
 * @category batching
 * @since 4.0.0
 */
export const batch: (f: () => void) => void = Registry.batch

// -----------------------------------------------------------------------------
// Focus
// -----------------------------------------------------------------------------

/**
 * Creates a browser-only signal atom that increments when the document becomes visible.
 *
 * **Details**
 *
 * It listens for `visibilitychange` events on `window` and removes the listener
 * when the atom is disposed.
 *
 * @stability unstable
 * @category constants
 * @since 4.0.0
 */
export const windowFocusSignal: Atom<number> = readable((get) => {
  let count = 0
  function update() {
    if (document.visibilityState === "visible") {
      get.setSelf(++count)
    }
  }
  window.addEventListener("visibilitychange", update)
  get.addFinalizer(() => {
    window.removeEventListener("visibilitychange", update)
  })
  return count
})

/**
 * Creates a combinator that refreshes an atom whenever the supplied signal atom
 * changes.
 *
 * **Details**
 *
 * The derived atom also subscribes to the source atom so normal source updates are
 * forwarded to its own value.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const makeRefreshOnSignal = <_>(signal: Atom<_>) => <A extends Atom<any>>(self: A): WithoutSerializable<A> =>
  transform(self, (get) => {
    get.once(signal)
    get.subscribe(signal, (_) => get.refresh(self))
    get.subscribe(self, (value) => get.setSelf(value))
    return get.once(self)
  }, { initialValueTarget: self }) as any

/**
 * Refreshes an atom whenever `windowFocusSignal` changes.
 *
 * **Details**
 *
 * This helper is browser-only because `windowFocusSignal` depends on `window` and
 * `document.visibilityState`.
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const refreshOnWindowFocus: <A extends Atom<any>>(self: A) => WithoutSerializable<A> = makeRefreshOnSignal(
  windowFocusSignal
)

// -----------------------------------------------------------------------------
// KeyValueStore
// -----------------------------------------------------------------------------

/**
 * Creates a writable atom backed by a `KeyValueStore` entry.
 *
 * **Details**
 *
 * Values are encoded and decoded with the supplied schema. In sync mode the atom
 * exposes the decoded value and writes the default value when the key is missing;
 * in async mode it exposes an `AsyncResult` of the decoded value.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const kvs = <S extends Schema.ConstraintCodec<any, any>, const Mode extends "sync" | "async" = never>(options: {
  readonly runtime: AtomRuntime<KeyValueStore.KeyValueStore, any>
  readonly key: string
  readonly schema: S
  readonly defaultValue: LazyArg<S["Type"]>
  readonly mode?: Mode | undefined
}): Writable<"async" extends Mode ? AsyncResult.AsyncResult<S["Type"]> : S["Type"], S["Type"]> => {
  const setAtom = options.runtime.fn(
    (value: S["Type"]) =>
      KeyValueStore.KeyValueStore.use((store) =>
        KeyValueStore.toSchemaStore(store, options.schema).set(options.key, value)
      )
  )
  const resultAtom = options.runtime.atom(
    KeyValueStore.KeyValueStore.use((store) => KeyValueStore.toSchemaStore(store, options.schema).get(options.key))
  )
  return writable(
    options.mode === "async" ?
      (get) => {
        get.mount(setAtom)
        const mapper = AsyncResult.map<Option.Option<S["Type"]>, S["Type"]>(
          Option.getOrElse(() => {
            const value = options.defaultValue()
            get.set(setAtom, value)
            return value
          })
        )
        get.subscribe(resultAtom, (result) => get.setSelf(mapper(result)))
        return mapper(get.once(resultAtom))
      } :
      (get) => {
        get.mount(setAtom)
        get.subscribe(resultAtom, (result) => {
          if (!AsyncResult.isSuccess(result)) return
          if (Option.isSome(result.value)) {
            get.setSelf(result.value.value)
          } else {
            const value = Option.getOrElse(get.self<S["Type"]>(), options.defaultValue)
            get.setSelf(value)
            get.set(setAtom, value)
          }
        }, { immediate: true })
        return Option.getOrElse(get.self<S["Type"]>(), options.defaultValue)
      },
    (ctx, value: S["Type"]) => {
      ctx.set(setAtom, value as any)
      ctx.setSelf(options.mode === "async" ? AsyncResult.success(value) : value)
    }
  ) as any
}

// -----------------------------------------------------------------------------
// URL search params
// -----------------------------------------------------------------------------

/**
 * Creates an atom that reads and writes a URL search parameter.
 *
 * **Gotchas**
 *
 * If you pass a schema, it has to be synchronous and have no context.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const searchParam = <S extends Schema.ConstraintCodec<any, string> = never>(
  name: string,
  options?: {
    readonly schema?: S | undefined
  }
): Writable<[S] extends [never] ? string : Option.Option<S["Type"]>> => {
  const decode = options?.schema && Schema.decodeExit(options.schema)
  const encode = options?.schema && Schema.encodeExit(options.schema)
  return writable(
    (get) => {
      if (typeof window === "undefined") {
        return decode ? Option.none() : ""
      }
      const handleUpdate = () => {
        if (searchParamState.updating) return
        const searchParams = new URLSearchParams(window.location.search)
        const newValue = searchParams.get(name) || ""
        if (decode) {
          get.setSelf(Exit.getSuccess(decode(newValue)))
        } else if (newValue !== Option.getOrUndefined(get.self())) {
          get.setSelf(newValue)
        }
      }
      window.addEventListener("popstate", handleUpdate)
      window.addEventListener("pushstate", handleUpdate)
      get.addFinalizer(() => {
        window.removeEventListener("popstate", handleUpdate)
        window.removeEventListener("pushstate", handleUpdate)
      })
      const value = new URLSearchParams(window.location.search).get(name) || ""
      return decode ? Exit.getSuccess(decode(value)) : value as any
    },
    (ctx, value: any) => {
      if (typeof window === "undefined") {
        ctx.setSelf(value)
        return
      }

      if (encode) {
        const encoded = Option.flatMap(value, (v) => Exit.getSuccess(encode(v as S["Type"])))
        searchParamState.updates.set(name, Option.getOrElse(encoded, () => ""))
        value = Option.zipRight(encoded, value)
      } else {
        searchParamState.updates.set(name, value)
      }
      ctx.setSelf(value)
      if (searchParamState.timeout) {
        clearTimeout(searchParamState.timeout)
      }
      searchParamState.timeout = setTimeout(updateSearchParams, 500) as any
    }
  )
}

const searchParamState = {
  timeout: undefined as number | undefined,
  updates: new Map<string, string>(),
  updating: false
}

function updateSearchParams() {
  searchParamState.timeout = undefined
  searchParamState.updating = true
  const searchParams = new URLSearchParams(window.location.search)
  for (const [key, value] of searchParamState.updates.entries()) {
    if (value.length > 0) {
      searchParams.set(key, value)
    } else {
      searchParams.delete(key)
    }
  }
  searchParamState.updates.clear()
  const newUrl = `${window.location.pathname}?${searchParams.toString()}`
  window.history.pushState({}, "", newUrl)
  searchParamState.updating = false
}

// -----------------------------------------------------------------------------
// conversions
// -----------------------------------------------------------------------------

/**
 * Converts an atom into a stream using the `AtomRegistry` service.
 *
 * **Details**
 *
 * The stream emits the atom's current value immediately and then emits subsequent
 * changes until the stream scope is closed.
 *
 * @stability unstable
 * @category converting
 * @since 4.0.0
 */
export const toStream = <A>(self: Atom<A>): Stream.Stream<A, never, AtomRegistry> =>
  Stream.unwrap(AtomRegistry.use((r) => Effect.succeed(Registry.toStream(r, self))))

/**
 * Converts an `AsyncResult` atom into a stream using the `AtomRegistry` service.
 *
 * **Details**
 *
 * Initial results are skipped, successes are emitted as stream values, and
 * failures fail the stream with the result cause.
 *
 * @stability unstable
 * @category converting
 * @since 4.0.0
 */
export const toStreamResult = <A, E>(self: Atom<AsyncResult.AsyncResult<A, E>>): Stream.Stream<A, E, AtomRegistry> =>
  Stream.unwrap(AtomRegistry.use((r) => Effect.succeed(Registry.toStreamResult(r, self))))

/**
 * Reads an atom's current value from the `AtomRegistry` service.
 *
 * @stability unstable
 * @category converting
 * @since 4.0.0
 */
export const get = <A>(self: Atom<A>): Effect.Effect<A, never, AtomRegistry> =>
  AtomRegistry.use((r) => Effect.succeed(r.get(self)))

/**
 * Reads a writable atom, computes a return value and next write value, writes the
 * next value, and returns the computed result.
 *
 * @stability unstable
 * @category converting
 * @since 4.0.0
 */
export const modify: {
  <R, W, A>(
    f: (_: R) => [returnValue: A, nextValue: W]
  ): (self: Writable<R, W>) => Effect.Effect<A, never, AtomRegistry>
  <R, W, A>(self: Writable<R, W>, f: (_: R) => [returnValue: A, nextValue: W]): Effect.Effect<A, never, AtomRegistry>
} = dual(
  2,
  <R, W, A>(self: Writable<R, W>, f: (_: R) => [returnValue: A, nextValue: W]): Effect.Effect<A, never, AtomRegistry> =>
    Effect.map(AtomRegistry, (_) => _.modify(self, f))
)

/**
 * Writes a value to a writable atom through the `AtomRegistry` service.
 *
 * @stability unstable
 * @category converting
 * @since 4.0.0
 */
export const set: {
  <W>(value: W): <R>(self: Writable<R, W>) => Effect.Effect<void, never, AtomRegistry>
  <R, W>(self: Writable<R, W>, value: W): Effect.Effect<void, never, AtomRegistry>
} = dual(
  2,
  <R, W>(self: Writable<R, W>, value: W): Effect.Effect<void, never, AtomRegistry> =>
    Effect.map(AtomRegistry, (_) => _.set(self, value))
)

/**
 * Updates a writable atom by reading its current value from the registry and
 * writing the value returned by the update function.
 *
 * @stability unstable
 * @category converting
 * @since 4.0.0
 */
export const update: {
  <R, W>(f: (_: R) => W): (self: Writable<R, W>) => Effect.Effect<void, never, AtomRegistry>
  <R, W>(self: Writable<R, W>, f: (_: R) => W): Effect.Effect<void, never, AtomRegistry>
} = dual(
  2,
  <R, W>(self: Writable<R, W>, f: (_: R) => W): Effect.Effect<void, never, AtomRegistry> =>
    Effect.map(AtomRegistry, (_) => _.update(self, f))
)

/**
 * Reads an `AsyncResult` atom as an effect through the `AtomRegistry` service.
 *
 * **Details**
 *
 * The effect waits while the result is `Initial`, and also while it is waiting
 * when `suspendOnWaiting` is enabled. Successes succeed with the value and
 * failures fail with the result cause.
 *
 * @stability unstable
 * @category converting
 * @since 4.0.0
 */
export const getResult = <A, E>(
  self: Atom<AsyncResult.AsyncResult<A, E>>,
  options?: { readonly suspendOnWaiting?: boolean | undefined }
): Effect.Effect<A, E, AtomRegistry> => AtomRegistry.use(Registry.getResult(self, options))

/**
 * Runs a refresh request for an atom through the `AtomRegistry` service.
 *
 * **When to use**
 *
 * Use to invalidate and recompute an atom from an Effect that has access to the
 * active registry.
 *
 * @stability unstable
 * @category converting
 * @since 4.0.0
 */
export const refresh = <A>(self: Atom<A>): Effect.Effect<void, never, AtomRegistry> =>
  Effect.map(AtomRegistry, (_) => _.refresh(self))

/**
 * Mounts an atom in the `AtomRegistry` for the lifetime of the current scope.
 *
 * **Details**
 *
 * Mounting keeps the atom subscribed with a no-op listener until the scope
 * finalizer releases it.
 *
 * @stability unstable
 * @category converting
 * @since 4.0.0
 */
export const mount = <A>(self: Atom<A>): Effect.Effect<void, never, AtomRegistry | Scope.Scope> =>
  AtomRegistry.use((r) => Registry.mount(r, self))

// -----------------------------------------------------------------------------
// Serializable
// -----------------------------------------------------------------------------

/**
 * The type id used to mark atoms that carry serialization metadata.
 *
 * @stability unstable
 * @category type IDs
 * @since 4.0.0
 */
export const SerializableTypeId: SerializableTypeId = "~effect-atom/atom/Atom/Serializable"

/**
 * The literal type of the serializable atom marker.
 *
 * @stability unstable
 * @category type IDs
 * @since 4.0.0
 */
export type SerializableTypeId = "~effect-atom/atom/Atom/Serializable"

/**
 * Serialization metadata attached to an atom.
 *
 * **Details**
 *
 * The key identifies the atom in dehydrated state, and the encode/decode
 * functions convert between the atom value and the schema encoded value.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Serializable<S extends Schema.Constraint> {
  readonly [SerializableTypeId]: {
    readonly key: string
    readonly encode: (value: S["Type"]) => S["Encoded"]
    readonly decode: (value: S["Encoded"]) => S["Type"]
  }
}

/**
 * Returns `true` when an atom carries `Serializable` metadata.
 *
 * @stability unstable
 * @category guards
 * @since 4.0.0
 */
export const isSerializable = (self: Atom<any>): self is Atom<any> & Serializable<any> => SerializableTypeId in self

/**
 * Attaches serialization metadata to an atom using a schema and stable key.
 *
 * **Details**
 *
 * The schema is converted to a JSON codec for synchronous encode/decode, and the
 * key is also used as the atom label when the atom does not already have one.
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const serializable: {
  <R extends Atom<any>, S extends Schema.ConstraintCodec<Type<R>, any>>(options: {
    readonly key: string
    readonly schema: S
  }): (self: R) => R & Serializable<S>
  <R extends Atom<any>, S extends Schema.ConstraintCodec<Type<R>, any>>(self: R, options: {
    readonly key: string
    readonly schema: S
  }): R & Serializable<S>
} = dual(2, <R extends Atom<any>, A, I>(self: R, options: {
  readonly key: string
  readonly schema: Schema.ConstraintCodec<A, I>
}): R & Serializable<any> => {
  const codecJson = Schema.toCodecJson(options.schema)
  return Object.assign(Object.create(Object.getPrototypeOf(self)), {
    ...self,
    label: self.label ?? [options.key, getStackTraceLimit() === 0 ? "" : new Error().stack?.split("\n")[5] ?? ""],
    [SerializableTypeId]: {
      key: options.key,
      encode: Schema.encodeSync(codecJson),
      decode: Schema.decodeSync(codecJson)
    }
  })
})

/**
 * The type id used to mark atoms with a server-side read override.
 *
 * @stability unstable
 * @category type IDs
 * @since 4.0.0
 */
export const ServerValueTypeId = "~effect-atom/atom/Atom/ServerValue" as const

/**
 * Sets the value of an Atom when read on the server.
 *
 * @stability unstable
 * @category transforming
 * @since 4.0.0
 */
export const withServerValue: {
  <A extends Atom<any>>(read: (get: <A>(atom: Atom<A>) => A) => Type<A>): (self: A) => A
  <A extends Atom<any>>(self: A, read: (get: <A>(atom: Atom<A>) => A) => Type<A>): A
} = dual(
  2,
  <A extends Atom<any>>(self: A, read: (get: <A>(atom: Atom<A>) => A) => Type<A>): A =>
    Object.assign(Object.create(Object.getPrototypeOf(self)), {
      ...self,
      [ServerValueTypeId]: read
    })
)

/**
 * Sets an `AsyncResult` atom's server-side value to
 * `AsyncResult.initial(true)`.
 *
 * @stability unstable
 * @category transforming
 * @since 4.0.0
 */
export const withServerValueInitial = <A extends Atom<AsyncResult.AsyncResult<any, any>>>(self: A): A =>
  withServerValue(self, constant(AsyncResult.initial(true)) as any)

/**
 * Reads an atom from a registry, using its server-side read override when one is
 * present.
 *
 * **Details**
 *
 * Nested reads performed by the override are resolved against the same registry.
 *
 * @stability unstable
 * @category getters
 * @since 4.0.0
 */
export const getServerValue: {
  (registry: Registry.AtomRegistry): <A>(self: Atom<A>) => A
  <A>(self: Atom<A>, registry: Registry.AtomRegistry): A
} = dual(
  2,
  <A>(self: Atom<A>, registry: Registry.AtomRegistry): A =>
    ServerValueTypeId in self
      ? (self as any)[ServerValueTypeId]((atom: Atom<any>) => registry.get(atom))
      : registry.get(self)
)
