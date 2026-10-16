/**
 * Resolves data requests made with `Effect.request`.
 *
 * A `Request` describes what a fiber needs, while a `RequestResolver` describes
 * how to collect request entries, group them into batches, run backend work,
 * and complete each waiting entry. This module includes constructors for common
 * resolver shapes and tools for controlling batching, grouping, delays,
 * tracing, caching, racing, hooks around resolver execution, and persistence.
 *
 * @since 2.0.0
 */
import type { NonEmptyArray } from "./Array.ts"
import * as Arr from "./Array.ts"
import * as Cache from "./Cache.ts"
import * as Context from "./Context.ts"
import type * as Duration from "./Duration.ts"
import * as Effect from "./Effect.ts"
import * as Exit from "./Exit.ts"
import { constTrue, dual, identity } from "./Function.ts"
import { exitSucceed } from "./internal/core.ts"
import * as Count from "./internal/count.ts"
import * as effect from "./internal/effect.ts"
import * as internal from "./internal/request.ts"
import * as Iterable from "./Iterable.ts"
import * as MutableHashMap from "./MutableHashMap.ts"
import type * as Persistable from "./persistence/Persistable.ts"
import * as Persistence from "./persistence/Persistence.ts"
import { type Pipeable, pipeArguments } from "./Pipeable.ts"
import { hasProperty } from "./Predicate.ts"
import type * as Request from "./Request.ts"
import type * as Schema from "./Schema.ts"
import type { Scope } from "./Scope.ts"
import * as Tracer from "./Tracer.ts"
import type * as Types from "./Types.ts"

const TypeId = "~effect/RequestResolver"

/**
 * A resolver that executes and completes batched `Request` entries.
 *
 * **Details**
 *
 * A resolver controls how requests are grouped, delayed, optionally
 * pre-checked, and finally run. Its `runAll` method receives a non-empty batch
 * of `Request.Entry` values for a single batch key and must complete every
 * received entry, usually by calling `completeUnsafe` or one of the `Request`
 * completion helpers.
 *
 * **Gotchas**
 *
 * If a resolver finishes without completing an entry, the waiting request fails
 * because the resolver did not supply a result.
 *
 * **Example** (Defining a request resolver)
 *
 * ```ts import.meta.vitest
 * import { Effect, Exit, Request, RequestResolver } from "effect"
 *
 * interface GetUserRequest extends Request.Request<string, Error> {
 *   readonly _tag: "GetUserRequest"
 *   readonly id: number
 * }
 * const GetUserRequest = Request.tagged<GetUserRequest>("GetUserRequest")
 *
 * // In practice, you would typically use RequestResolver.make() instead
 * const resolver = RequestResolver.make<GetUserRequest>((entries) =>
 *   Effect.sync(() => {
 *     for (const entry of entries) {
 *       entry.completeUnsafe(Exit.succeed(`User ${entry.request.id}`))
 *     }
 *   })
 * )
 *
 * const program = Effect.request(GetUserRequest({ id: 1 }), resolver)
 * await Effect.runPromise(program) // => "User 1"
 * ```
 *
 * @category models
 * @since 2.0.0
 */
export interface RequestResolver<in A extends Request.Any> extends RequestResolver.Variance<A>, Pipeable {
  readonly delay: Effect.Effect<void>

  /**
   * Get a batch key for the given request.
   */
  batchKey(entry: Request.Entry<A>): unknown

  /**
   * An optional pre-check function that can be used to filter requests before
   * they are added to a batch. If the function returns `false`, the request
   * will not be processed.
   */
  readonly preCheck: ((entry: Request.Entry<A>) => boolean) | undefined

  /**
   * Should the resolver continue collecting requests? Otherwise, it will
   * immediately execute the collected requests cutting the delay short.
   */
  collectWhile(entries: ReadonlySet<Request.Entry<A>>): boolean

  /**
   * Execute a collection of requests.
   */
  runAll(entries: NonEmptyArray<Request.Entry<A>>, key: unknown): Effect.Effect<void, Request.Error<A>>
}

/**
 * Namespace containing type-level helpers associated with `RequestResolver`.
 *
 * @since 2.0.0
 */
export declare namespace RequestResolver {
  /**
   * Variance marker carried by every `RequestResolver`.
   *
   * **Details**
   *
   * This marker preserves the request type accepted by the resolver for
   * Effect's type-level machinery. Users normally do not implement it directly.
   *
   * @category models
   * @since 2.0.0
   */
  export interface Variance<in A> {
    readonly [TypeId]: {
      readonly _A: Types.Contravariant<A>
    }
  }
}

const RequestResolverProto = {
  [TypeId]: {
    _A: identity,
    _R: identity
  },
  pipe() {
    return pipeArguments(this, arguments)
  }
}

/**
 * Returns `true` if the specified value is a `RequestResolver`, `false` otherwise.
 *
 * **When to use**
 *
 * Use to narrow unknown values before passing them to APIs that require a
 * `RequestResolver`.
 *
 * @see {@link RequestResolver} for the type narrowed by this guard
 *
 * @category guards
 * @since 2.0.0
 */
export const isRequestResolver = (u: unknown): u is RequestResolver<any> => hasProperty(u, TypeId)

/**
 * Creates a request resolver with fine-grained
 * control over its behavior.
 *
 * **When to use**
 *
 * Use when you need to supply the resolver batching primitives directly,
 * including the batch key, optional pre-check, delay effect, collection cutoff,
 * and batch runner.
 *
 * **Details**
 *
 * `batchKey` groups request entries, `delay` schedules batch execution,
 * `collectWhile` can end collection early, and `runAll` receives a non-empty
 * batch for one key.
 *
 * **Gotchas**
 *
 * Accepted entries must be completed. If `runAll` succeeds with incomplete
 * entries, waiting requests fail. If `preCheck` returns `false`, the entry is
 * not batched, so it must be completed or linked to another completion path.
 *
 * @see {@link make} for constructing a resolver from a batch runner
 * @see {@link makeGrouped} for constructing a resolver that groups requests by key
 *
 * @category constructors
 * @since 4.0.0
 */
export const makeWith = <A extends Request.Any>(options: {
  readonly batchKey: (request: Request.Entry<A>) => unknown
  readonly preCheck?: ((entry: Request.Entry<A>) => boolean) | undefined
  readonly delay: Effect.Effect<void>
  readonly collectWhile: (requests: ReadonlySet<Request.Entry<A>>) => boolean
  readonly runAll: (entries: NonEmptyArray<Request.Entry<A>>, key: unknown) => Effect.Effect<void, Request.Error<A>>
}): RequestResolver<A> => {
  const self = Object.create(RequestResolverProto)
  self.batchKey = options.batchKey
  self.preCheck = options.preCheck
  self.delay = options.delay
  self.collectWhile = options.collectWhile
  self.runAll = options.runAll
  return self
}

const defaultKeyObject = {}
const defaultKey = (_request: unknown): unknown => defaultKeyObject

/**
 * Constructs a request resolver with the specified method to run requests.
 *
 * **Example** (Creating a request resolver)
 *
 * ```ts import.meta.vitest
 * import { Effect, Exit, Request, RequestResolver } from "effect"
 *
 * // Define a request type
 * interface GetUserRequest extends Request.Request<string, Error> {
 *   readonly _tag: "GetUserRequest"
 *   readonly id: number
 * }
 * const GetUserRequest = Request.tagged<GetUserRequest>("GetUserRequest")
 *
 * // Create a resolver that handles the requests
 * const UserResolver = RequestResolver.make<GetUserRequest>((entries) =>
 *   Effect.sync(() => {
 *     for (const entry of entries) {
 *       // Complete each request with a result
 *       entry.completeUnsafe(Exit.succeed(`User ${entry.request.id}`))
 *     }
 *   })
 * )
 *
 * // Use the resolver to handle requests
 * const getUserEffect = Effect.request(GetUserRequest({ id: 123 }), UserResolver)
 * await Effect.runPromise(getUserEffect) // => "User 123"
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const make = <A extends Request.Any>(
  runAll: (entries: NonEmptyArray<Request.Entry<A>>, key: unknown) => Effect.Effect<void, Request.Error<A>>
): RequestResolver<A> =>
  makeWith({
    batchKey: defaultKey,
    delay: Effect.yieldNow,
    collectWhile: constTrue,
    runAll
  })

/**
 * Constructs a request resolver with the requests grouped by a calculated key.
 *
 * **Details**
 *
 * The key can use the Equal trait to determine if two keys are equal.
 *
 * **Example** (Grouping requests by key)
 *
 * ```ts import.meta.vitest
 * import { Effect, Exit, Request, RequestResolver } from "effect"
 *
 * interface GetUserByRole extends Request.Request<string, Error> {
 *   readonly _tag: "GetUserByRole"
 *   readonly role: string
 *   readonly id: number
 * }
 * const GetUserByRole = Request.tagged<GetUserByRole>("GetUserByRole")
 *
 * const batches: Array<[role: string, size: number]> = []
 *
 * // Group requests by role for efficient batch processing
 * const UserByRoleResolver = RequestResolver.makeGrouped<GetUserByRole, string>({
 *   key: ({ request }) => request.role,
 *   resolver: (entries, role) =>
 *     Effect.sync(() => {
 *       batches.push([role, entries.length])
 *       for (const entry of entries) {
 *         entry.completeUnsafe(
 *           Exit.succeed(`User ${entry.request.id} with role ${role}`)
 *         )
 *       }
 *     })
 * })
 *
 * const program = Effect.all([
 *   Effect.request<GetUserByRole>(GetUserByRole({ role: "admin", id: 1 }), UserByRoleResolver),
 *   Effect.request<GetUserByRole>(GetUserByRole({ role: "admin", id: 2 }), UserByRoleResolver)
 * ] as const, { concurrency: "unbounded" })
 * const result = await Effect.runPromise(program)
 *
 * batches // => [["admin", 2]]
 * result // => ["User 1 with role admin", "User 2 with role admin"]
 * ```
 *
 * @category constructors
 * @since 4.0.0
 */
export const makeGrouped = <A extends Request.Any, K>(options: {
  readonly key: (entry: Request.Entry<A>) => K
  readonly resolver: (entries: NonEmptyArray<Request.Entry<A>>, key: K) => Effect.Effect<void, Request.Error<A>>
}): RequestResolver<A> =>
  makeWith({
    batchKey: hashGroupKey(options.key),
    delay: Effect.yieldNow,
    collectWhile: constTrue,
    runAll: options.resolver as any
  })

const hashGroupKey = <A, K>(get: (entry: Request.Entry<A>) => K) => {
  const groupKeys = MutableHashMap.empty<K, K>()
  return (entry: Request.Entry<A>): unknown => {
    const key = get(entry)
    const okey = MutableHashMap.get(groupKeys, key)
    if (okey._tag === "Some") {
      return okey.value
    }
    MutableHashMap.set(groupKeys, key, key)
    return key
  }
}

/**
 * Constructs a request resolver from a pure function.
 *
 * **Example** (Creating a resolver from a pure function)
 *
 * ```ts import.meta.vitest
 * import { Effect, Request, RequestResolver } from "effect"
 *
 * interface GetSquareRequest extends Request.Request<number> {
 *   readonly _tag: "GetSquareRequest"
 *   readonly value: number
 * }
 * const GetSquareRequest = Request.tagged<GetSquareRequest>("GetSquareRequest")
 *
 * // Create a resolver from a pure function
 * const SquareResolver = RequestResolver.fromFunction<GetSquareRequest>(
 *   (entry) => entry.request.value * entry.request.value
 * )
 *
 * // Usage
 * const getSquareEffect = Effect.request(
 *   GetSquareRequest({ value: 5 }),
 *   SquareResolver
 * )
 * await Effect.runPromise(getSquareEffect) // => 25
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const fromFunction = <A extends Request.Any>(
  f: (entry: Request.Entry<A>) => Request.Success<A>
): RequestResolver<A> =>
  make(
    (entries) =>
      Effect.sync(() => {
        for (let i = 0; i < entries.length; i++) {
          const entry = entries[i]
          entry.completeUnsafe(exitSucceed(f(entry)))
        }
      })
  )

/**
 * Constructs a request resolver from a pure function that takes a list of requests
 * and returns a list of results of the same size. Each item in the result
 * list must correspond to the item at the same index in the request list.
 *
 * **Example** (Batching pure request handling)
 *
 * ```ts import.meta.vitest
 * import { Effect, Request, RequestResolver } from "effect"
 *
 * interface GetDoubleRequest extends Request.Request<number> {
 *   readonly _tag: "GetDoubleRequest"
 *   readonly value: number
 * }
 * const GetDoubleRequest = Request.tagged<GetDoubleRequest>("GetDoubleRequest")
 *
 * // Create a resolver that processes multiple requests in a batch
 * const DoubleResolver = RequestResolver.fromFunctionBatched<GetDoubleRequest>(
 *   (entries) => entries.map((entry) => entry.request.value * 2)
 * )
 *
 * // Usage with multiple requests
 * const effects = [1, 2, 3].map((value) =>
 *   Effect.request(GetDoubleRequest({ value }), DoubleResolver)
 * )
 * const batchedEffect = Effect.all(effects)
 * await Effect.runPromise(batchedEffect) // => [2, 4, 6]
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const fromFunctionBatched = <A extends Request.Any>(
  f: (entries: NonEmptyArray<Request.Entry<A>>) => Iterable<Request.Success<A>>
): RequestResolver<A> =>
  make(
    (entries) =>
      Effect.sync(() => {
        let i = 0
        for (const result of f(entries)) {
          const entry = entries[i++]
          entry.completeUnsafe(exitSucceed(result))
        }
      })
  )

/**
 * Constructs a request resolver from an effectual function.
 *
 * **Example** (Creating a resolver from an effectful function)
 *
 * ```ts import.meta.vitest
 * import { Effect, Request, RequestResolver } from "effect"
 *
 * interface GetUserFromAPIRequest extends Request.Request<string> {
 *   readonly _tag: "GetUserFromAPIRequest"
 *   readonly id: number
 * }
 * const GetUserFromAPIRequest = Request.tagged<GetUserFromAPIRequest>(
 *   "GetUserFromAPIRequest"
 * )
 *
 * // Create a resolver that uses effects (like HTTP calls)
 * const UserAPIResolver = RequestResolver.fromEffect<GetUserFromAPIRequest>(
 *   (entry) => Effect.succeed(`User ${entry.request.id} from API`)
 * )
 *
 * // Usage
 * const getUserEffect = Effect.request(
 *   GetUserFromAPIRequest({ id: 123 }),
 *   UserAPIResolver
 * )
 * await Effect.runPromise(getUserEffect) // => "User 123 from API"
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const fromEffect = <A extends Request.Any>(
  f: (entry: Request.Entry<A>) => Effect.Effect<Request.Success<A>, Request.Error<A>>
): RequestResolver<A> => {
  effect.interruptChildrenPatch() // ensure middleware is registered
  return make((entries) =>
    Effect.callback<void>((resume) => {
      const parent = effect.getCurrentFiber()!
      let done = 0
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i]
        const fiber = effect.forkUnsafe(parent as any, f(entry), true)
        fiber.addObserver((exit) => {
          entry.completeUnsafe(exit)
          done++
          if (done === entries.length) {
            resume(effect.void)
          }
        })
      }
    })
  )
}

/**
 * Constructs a request resolver from a list of tags paired to functions, that takes
 * a list of requests and returns a list of results of the same size. Each item
 * in the result list must correspond to the item at the same index in the
 * request list.
 *
 * **Example** (Handling tagged request batches)
 *
 * ```ts import.meta.vitest
 * import { Effect, Request, RequestResolver } from "effect"
 *
 * interface GetUser extends Request.Request<string, Error> {
 *   readonly _tag: "GetUser"
 *   readonly id: number
 * }
 *
 * interface GetPost extends Request.Request<string, Error> {
 *   readonly _tag: "GetPost"
 *   readonly id: number
 * }
 *
 * type MyRequest = GetUser | GetPost
 * const GetUser = Request.tagged<GetUser>("GetUser")
 * const GetPost = Request.tagged<GetPost>("GetPost")
 *
 * // Create a resolver that handles different request types
 * const MyResolver = RequestResolver.fromEffectTagged<MyRequest>()({
 *   GetUser: (requests) =>
 *     Effect.succeed(requests.map((req) => `User ${req.request.id}`)),
 *   GetPost: (requests) =>
 *     Effect.succeed(requests.map((req) => `Post ${req.request.id}`))
 * })
 *
 * const program = Effect.all([
 *   Effect.request<GetUser>(GetUser({ id: 1 }), MyResolver),
 *   Effect.request<GetPost>(GetPost({ id: 2 }), MyResolver)
 * ] as const)
 * await Effect.runPromise(program) // => ["User 1", "Post 2"]
 * ```
 *
 * @category constructors
 * @since 2.0.0
 */
export const fromEffectTagged = <A extends Request.Any & { readonly _tag: string }>() =>
<
  Fns extends {
    readonly [Tag in A["_tag"]]: [Extract<A, { readonly _tag: Tag }>] extends [infer Req]
      ? Req extends Request.Request<infer ReqA, infer ReqE, infer _ReqR> ?
        (requests: Array<Request.Entry<Req>>) => Effect.Effect<Iterable<ReqA>, ReqE>
      : never
      : never
  }
>(
  fns: Fns
): RequestResolver<A> =>
  make<A>(
    (entries): Effect.Effect<void> => {
      const grouped = new Map<A["_tag"], Array<Request.Entry<A>>>()
      for (let i = 0, len = entries.length; i < len; i++) {
        const group = grouped.get(entries[i].request._tag)
        if (group) {
          group.push(entries[i])
        } else {
          grouped.set(entries[i].request._tag, [entries[i]])
        }
      }
      return Effect.forEach(
        grouped,
        ([tag, requests]) =>
          Effect.matchCause((fns[tag] as any)(requests) as Effect.Effect<Iterable<any>, unknown, unknown>, {
            onFailure: (cause) => {
              for (let i = 0; i < requests.length; i++) {
                const entry = requests[i]
                entry.completeUnsafe(Exit.failCause(cause) as any)
              }
            },
            onSuccess: (res) => {
              let i = 0
              for (const result of res) {
                const entry = requests[i++]
                entry.completeUnsafe(exitSucceed(result) as any)
              }
            }
          }),
        { concurrency: "unbounded", discard: true }
      ) as Effect.Effect<void>
    }
  ) as any

/**
 * Sets the batch delay effect for this request resolver.
 *
 * **Example** (Setting an effectful batch delay)
 *
 * ```ts import.meta.vitest
 * import { Effect, Exit, Request, RequestResolver } from "effect"
 *
 * interface GetDataRequest extends Request.Request<string> {
 *   readonly _tag: "GetDataRequest"
 * }
 * const GetDataRequest = Request.tagged<GetDataRequest>("GetDataRequest")
 *
 * const resolver = RequestResolver.make<GetDataRequest>((entries) =>
 *   Effect.sync(() => {
 *     for (const entry of entries) {
 *       entry.completeUnsafe(Exit.succeed("data"))
 *     }
 *   })
 * )
 *
 * let delayRan = false
 *
 * // Set a custom delay effect
 * const resolverWithCustomDelay = RequestResolver.setDelayEffect(
 *   resolver,
 *   Effect.sync(() => {
 *     delayRan = true
 *   })
 * )
 *
 * await Effect.runPromise(resolverWithCustomDelay.delay)
 * Array.of(delayRan, RequestResolver.isRequestResolver(resolverWithCustomDelay)) // => [true, true]
 * ```
 *
 * @category delays & timeouts
 * @since 4.0.0
 */
export const setDelayEffect: {
  (delay: Effect.Effect<void>): <A extends Request.Any>(self: RequestResolver<A>) => RequestResolver<A>
  <A extends Request.Any>(self: RequestResolver<A>, delay: Effect.Effect<void>): RequestResolver<A>
} = dual(
  2,
  <A extends Request.Any>(self: RequestResolver<A>, delay: Effect.Effect<void>): RequestResolver<A> =>
    makeWith({
      ...self,
      delay
    })
)

/**
 * Sets the batch delay window for this request resolver to the specified duration.
 *
 * **Example** (Setting a batch delay)
 *
 * ```ts import.meta.vitest
 * import { Effect, Exit, Request, RequestResolver } from "effect"
 *
 * interface GetDataRequest extends Request.Request<string> {
 *   readonly _tag: "GetDataRequest"
 * }
 * const GetDataRequest = Request.tagged<GetDataRequest>("GetDataRequest")
 *
 * const resolver = RequestResolver.make<GetDataRequest>((entries) =>
 *   Effect.sync(() => {
 *     for (const entry of entries) {
 *       entry.completeUnsafe(Exit.succeed("data"))
 *     }
 *   })
 * )
 *
 * // Add a 100ms delay to batch requests together
 * const delayedResolver = RequestResolver.setDelay(resolver, "100 millis")
 *
 * const program = Effect.request(GetDataRequest(), delayedResolver)
 * await Effect.runPromise(program) // => "data"
 * ```
 *
 * @category delays & timeouts
 * @since 4.0.0
 */
export const setDelay: {
  (duration: Duration.Input): <A extends Request.Any>(self: RequestResolver<A>) => RequestResolver<A>
  <A extends Request.Any>(self: RequestResolver<A>, duration: Duration.Input): RequestResolver<A>
} = dual(
  2,
  <A extends Request.Any>(self: RequestResolver<A>, duration: Duration.Input): RequestResolver<A> =>
    makeWith({
      ...self,
      delay: Effect.sleep(duration)
    })
)

/**
 * Wraps request resolver execution between `before` and `after` effects.
 *
 * **Example** (Running effects around request resolution)
 *
 * ```ts import.meta.vitest
 * import { Effect, Exit, Request, RequestResolver } from "effect"
 *
 * interface GetDataRequest extends Request.Request<string> {
 *   readonly _tag: "GetDataRequest"
 * }
 * const GetDataRequest = Request.tagged<GetDataRequest>("GetDataRequest")
 *
 * const events: Array<string> = []
 *
 * const resolver = RequestResolver.make<GetDataRequest>((entries) =>
 *   Effect.sync(() => {
 *     for (const entry of entries) {
 *       entry.completeUnsafe(Exit.succeed("data"))
 *     }
 *   })
 * )
 *
 * // Add setup and cleanup around request execution
 * const resolverWithAround = RequestResolver.around(
 *   resolver,
 *   (entries) =>
 *     Effect.gen(function*() {
 *       events.push(`Starting batch of ${entries.length} requests`)
 *       return entries.length
 *     }),
 *   (entries, initialSize) =>
 *     Effect.sync(() => {
 *       events.push(`Batch completed with ${entries.length} requests (started with ${initialSize})`)
 *     })
 * )
 *
 * const program = Effect.request(GetDataRequest(), resolverWithAround)
 * const result = await Effect.runPromise(program)
 *
 * events // => ["Starting batch of 1 requests", "Batch completed with 1 requests (started with 1)"]
 * result // => "data"
 * ```
 *
 * @category combinators
 * @since 2.0.0
 */
export const around: {
  <A extends Request.Any, A2, X>(
    before: (entries: NonEmptyArray<Request.Entry<NoInfer<A>>>) => Effect.Effect<A2, Request.Error<A>>,
    after: (entries: NonEmptyArray<Request.Entry<NoInfer<A>>>, a: A2) => Effect.Effect<X, Request.Error<A>>
  ): (self: RequestResolver<A>) => RequestResolver<A>
  <A extends Request.Any, A2, X>(
    self: RequestResolver<A>,
    before: (entries: NonEmptyArray<Request.Entry<NoInfer<A>>>) => Effect.Effect<A2, Request.Error<A>>,
    after: (entries: NonEmptyArray<Request.Entry<NoInfer<A>>>, a: A2) => Effect.Effect<X, Request.Error<A>>
  ): RequestResolver<A>
} = dual(3, <A extends Request.Any, A2, X>(
  self: RequestResolver<A>,
  before: (entries: NonEmptyArray<Request.Entry<NoInfer<A>>>) => Effect.Effect<A2, Request.Error<A>>,
  after: (entries: NonEmptyArray<Request.Entry<NoInfer<A>>>, a: A2) => Effect.Effect<X, Request.Error<A>>
): RequestResolver<A> =>
  makeWith({
    ...self,
    runAll: (entries, key) =>
      Effect.acquireUseRelease(
        before(entries),
        () => self.runAll(entries, key),
        (a) => after(entries, a)
      )
  }))

/**
 * Creates a request resolver that never executes requests.
 *
 * **When to use**
 *
 * Use as a resolver value for request types that are statically impossible and
 * should never be issued.
 *
 * **Gotchas**
 *
 * If this resolver is used for an actual request, the request waits forever
 * unless the fiber is interrupted.
 *
 * @see {@link make} for constructing a resolver that executes batches and completes request entries
 *
 * @category constructors
 * @since 2.0.0
 */
export const never: RequestResolver<never> = make(() => Effect.never)

/**
 * Returns a request resolver that collects at most `n` requests into each
 * batch.
 *
 * **Details**
 *
 * When more than `n` requests are waiting for the same resolver and batch key,
 * the current batch is run and additional requests are collected into later
 * batches. Finite fractional values of `n` are rounded down. `NaN` and
 * non-positive values are treated as `1` so that every batch remains non-empty.
 *
 * **Example** (Limiting parallel request batches)
 *
 * ```ts import.meta.vitest
 * import { Effect, Exit, Request, RequestResolver } from "effect"
 *
 * interface GetDataRequest extends Request.Request<string> {
 *   readonly _tag: "GetDataRequest"
 *   readonly id: number
 * }
 * const GetDataRequest = Request.tagged<GetDataRequest>("GetDataRequest")
 *
 * const batchSizes: Array<number> = []
 *
 * const resolver = RequestResolver.make<GetDataRequest>((entries) =>
 *   Effect.sync(() => {
 *     batchSizes.push(entries.length)
 *     for (const entry of entries) {
 *       entry.completeUnsafe(Exit.succeed(`data-${entry.request.id}`))
 *     }
 *   })
 * )
 *
 * // Limit batches to maximum 5 requests
 * const limitedResolver = RequestResolver.batchN(resolver, 5)
 *
 * // When more than 5 requests are made, they'll be split into multiple batches
 * const requests = Array.from(
 *   { length: 12 },
 *   (_, i) => Effect.request(GetDataRequest({ id: i }), limitedResolver)
 * )
 *
 * const result = await Effect.runPromise(Effect.all(requests, { concurrency: "unbounded" }))
 * batchSizes // => [5, 5, 2]
 *
 * result.length // => 12
 *
 * Array.of(result[0], result[11]) // => ["data-0", "data-11"]
 * ```
 *
 * @category combinators
 * @since 2.0.0
 */
export const batchN: {
  (n: number): <A extends Request.Any>(self: RequestResolver<A>) => RequestResolver<A>
  <A extends Request.Any>(self: RequestResolver<A>, n: number): RequestResolver<A>
} = dual(2, <A extends Request.Any>(self: RequestResolver<A>, n: number): RequestResolver<A> => {
  const size = Count.normalizeNonEmpty(n)
  return makeWith({
    ...self,
    collectWhile: (requests) => requests.size < size
  })
})

/**
 * Transforms a request resolver by grouping requests using the specified key
 * function.
 *
 * **Example** (Grouping resolver requests)
 *
 * ```ts import.meta.vitest
 * import { Effect, Exit, Request, RequestResolver } from "effect"
 *
 * interface GetUserRequest extends Request.Request<string> {
 *   readonly _tag: "GetUserRequest"
 *   readonly userId: number
 *   readonly department: string
 * }
 * const GetUserRequest = Request.tagged<GetUserRequest>("GetUserRequest")
 *
 * const batchSizes: Array<number> = []
 *
 * const resolver = RequestResolver.make<GetUserRequest>((entries) =>
 *   Effect.sync(() => {
 *     batchSizes.push(entries.length)
 *     for (const entry of entries) {
 *       entry.completeUnsafe(Exit.succeed(`User ${entry.request.userId}`))
 *     }
 *   })
 * )
 *
 * // Group requests by department for more efficient processing
 * const groupedResolver = RequestResolver.grouped(
 *   resolver,
 *   ({ request }) => request.department
 * )
 *
 * // Requests for the same department will be batched together
 * const requests = [
 *   Effect.request(
 *     GetUserRequest({ userId: 1, department: "Engineering" }),
 *     groupedResolver
 *   ),
 *   Effect.request(
 *     GetUserRequest({ userId: 2, department: "Engineering" }),
 *     groupedResolver
 *   ),
 *   Effect.request(
 *     GetUserRequest({ userId: 3, department: "Marketing" }),
 *     groupedResolver
 *   )
 * ]
 *
 * const result = await Effect.runPromise(Effect.all(requests, { concurrency: "unbounded" }))
 * batchSizes.sort()
 *
 * batchSizes // => [1, 2]
 *
 * result // => ["User 1", "User 2", "User 3"]
 * ```
 *
 * @category combinators
 * @since 4.0.0
 */
export const grouped: {
  <A extends Request.Any, K>(f: (entry: Request.Entry<A>) => K): (self: RequestResolver<A>) => RequestResolver<A>
  <A extends Request.Any, K>(self: RequestResolver<A>, f: (entry: Request.Entry<A>) => K): RequestResolver<A>
} = dual(
  2,
  <A extends Request.Any, K>(self: RequestResolver<A>, f: (entry: Request.Entry<A>) => K): RequestResolver<A> =>
    makeWith({
      ...self,
      batchKey: hashGroupKey(f)
    })
)

/**
 * Returns a request resolver that sends each batch to both resolvers and
 * completes with the first resolver to finish.
 *
 * **Details**
 *
 * The losing resolver run is interrupted after the winning resolver completes
 * the batch.
 *
 * **Example** (Racing request resolvers)
 *
 * ```ts import.meta.vitest
 * import { Effect, Exit, Request, RequestResolver } from "effect"
 *
 * interface GetDataRequest extends Request.Request<string> {
 *   readonly _tag: "GetDataRequest"
 *   readonly id: number
 * }
 * const GetDataRequest = Request.tagged<GetDataRequest>("GetDataRequest")
 *
 * // Fast resolver (simulating cache)
 * const fastResolver = RequestResolver.make<GetDataRequest>((entries) =>
 *   Effect.gen(function*() {
 *     yield* Effect.sleep("10 millis")
 *     for (const entry of entries) {
 *       entry.completeUnsafe(Exit.succeed(`fast-${entry.request.id}`))
 *     }
 *   })
 * )
 *
 * // Slow resolver (simulating database)
 * const slowResolver = RequestResolver.make<GetDataRequest>((entries) =>
 *   Effect.gen(function*() {
 *     yield* Effect.sleep("100 millis")
 *     for (const entry of entries) {
 *       entry.completeUnsafe(Exit.succeed(`slow-${entry.request.id}`))
 *     }
 *   })
 * )
 *
 * // Race resolvers - will use whichever completes first
 * const racingResolver = RequestResolver.race(fastResolver, slowResolver)
 * const program = Effect.request(GetDataRequest({ id: 1 }), racingResolver)
 * await Effect.runPromise(program) // => "fast-1"
 * ```
 *
 * @category combinators
 * @since 2.0.0
 */
export const race: {
  <A2 extends Request.Any>(
    that: RequestResolver<A2>
  ): <A extends Request.Any>(self: RequestResolver<A>) => RequestResolver<A2 & A>
  <A extends Request.Any, A2 extends Request.Any>(
    self: RequestResolver<A>,
    that: RequestResolver<A2>
  ): RequestResolver<A & A2>
} = dual(2, <A extends Request.Any, A2 extends Request.Any>(
  self: RequestResolver<A>,
  that: RequestResolver<A2>
): RequestResolver<A & A2> =>
  make(
    (requests, key) => effect.race(self.runAll(requests, key), that.runAll(requests, key))
  ))

/**
 * Adds a tracing span to the request resolver, which will also add any span
 * links from the request's.
 *
 * **Example** (Adding a tracing span)
 *
 * ```ts import.meta.vitest
 * import { Effect, Exit, Request, RequestResolver } from "effect"
 *
 * interface GetDataRequest extends Request.Request<string> {
 *   readonly _tag: "GetDataRequest"
 *   readonly id: number
 * }
 * const GetDataRequest = Request.tagged<GetDataRequest>("GetDataRequest")
 *
 * const resolver = RequestResolver.make<GetDataRequest>((entries) =>
 *   Effect.sync(() => {
 *     for (const entry of entries) {
 *       entry.completeUnsafe(Exit.succeed(`data-${entry.request.id}`))
 *     }
 *   })
 * )
 *
 * // Add tracing span with custom name and attributes
 * const tracedResolver = RequestResolver.withSpan(
 *   resolver,
 *   "user-data-resolver",
 *   {
 *     attributes: {
 *       "resolver.type": "user-data",
 *       "resolver.version": "1.0"
 *     }
 *   }
 * )
 *
 * // Spans will automatically include batch size and request links
 * const effect = Effect.request(GetDataRequest({ id: 123 }), tracedResolver)
 * await Effect.runPromise(effect) // => "data-123"
 * ```
 *
 * @category combinators
 * @since 4.0.0
 */
export const withSpan: {
  <A extends Request.Any>(
    name: string,
    options?: Tracer.SpanOptions | ((entries: NonEmptyArray<Request.Entry<A>>) => Tracer.SpanOptions) | undefined
  ): (self: RequestResolver<A>) => RequestResolver<A>
  <A extends Request.Any>(
    self: RequestResolver<A>,
    name: string,
    options?: Tracer.SpanOptions | ((entries: NonEmptyArray<Request.Entry<A>>) => Tracer.SpanOptions) | undefined
  ): RequestResolver<A>
} = dual((args) => isRequestResolver(args[0]), <A extends Request.Any>(
  self: RequestResolver<A>,
  name: string,
  options?: Tracer.SpanOptions | ((entries: NonEmptyArray<Request.Entry<A>>) => Tracer.SpanOptions) | undefined
): RequestResolver<A> =>
  makeWith({
    ...self,
    runAll: (entries, key) =>
      Effect.suspend(() => {
        const opts = typeof options === "function" ? options(entries) : options
        const links = opts?.links ? opts.links.slice() : []
        const seen = new Set<Tracer.AnySpan>()
        for (const entry of entries) {
          const span = Context.getOption(entry.context, Tracer.ParentSpan)
          if (span._tag === "None" || seen.has(span.value)) continue
          seen.add(span.value)
          links.push({ span: span.value, attributes: {} })
        }
        return Effect.withSpan(self.runAll(entries, key), name, {
          ...options,
          links,
          attributes: {
            batchSize: entries.length,
            ...opts?.attributes
          }
        })
      })
  }))

/**
 * Wraps a request resolver in a cache, allowing it to cache results up to a
 * specified capacity and optional time-to-live.
 *
 * **When to use**
 *
 * Use to turn a request resolver into a first-class `Cache` when callers need
 * cache lookup, refresh, invalidation, or inspection around request results.
 *
 * **Details**
 *
 * The request value is the cache key. Cache misses run the resolver via
 * `Effect.request`, `timeToLive` receives the request `Exit` and the request,
 * and `requireServicesAt` controls whether services are required at lookup time
 * or construction time.
 *
 * **Gotchas**
 *
 * Cache hits depend on the request value's equality semantics.
 *
 * @see {@link withCache} for keeping caching behind a resolver used with `Effect.request`
 * @see {@link persisted} for storing persistable request results outside process memory
 * @see {@link Cache.Cache} for operations available on the returned cache
 *
 * @category caching
 * @since 4.0.0
 */
export const asCache: {
  <
    A extends Request.Any,
    ServiceMode extends "lookup" | "construction" = never
  >(options: {
    readonly capacity: number
    readonly timeToLive?: ((exit: Request.Result<A>, request: A) => Duration.Input) | undefined
    readonly requireServicesAt?: ServiceMode | undefined
  }): (self: RequestResolver<A>) => Effect.Effect<
    Cache.Cache<
      A,
      Request.Success<A>,
      Request.Error<A>,
      "construction" extends ServiceMode ? never : Request.Services<A>
    >,
    never,
    "construction" extends ServiceMode ? Request.Services<A> : never
  >
  <
    A extends Request.Any,
    ServiceMode extends "lookup" | "construction" = never
  >(self: RequestResolver<A>, options: {
    readonly capacity: number
    readonly timeToLive?: ((exit: Request.Result<A>, request: A) => Duration.Input) | undefined
    readonly requireServicesAt?: ServiceMode | undefined
  }): Effect.Effect<
    Cache.Cache<
      A,
      Request.Success<A>,
      Request.Error<A>,
      "construction" extends ServiceMode ? never : Request.Services<A>
    >,
    never,
    "construction" extends ServiceMode ? Request.Services<A> : never
  >
} = dual(2, <
  A extends Request.Any,
  ServiceMode extends "lookup" | "construction" = never
>(self: RequestResolver<A>, options: {
  readonly capacity: number
  readonly timeToLive?: ((exit: Request.Result<A>, request: A) => Duration.Input) | undefined
  readonly requireServicesAt?: ServiceMode | undefined
}): Effect.Effect<
  Cache.Cache<
    A,
    Request.Success<A>,
    Request.Error<A>,
    "construction" extends ServiceMode ? never : Request.Services<A>
  >,
  never,
  "construction" extends ServiceMode ? Request.Services<A> : never
> =>
  Cache.makeWith((req: A) => internal.request(req, self), {
    capacity: options.capacity,
    timeToLive: options.timeToLive as any,
    requireServicesAt: options.requireServicesAt ?? "lookup" as ServiceMode
  }) as any)

/**
 * Adds a bounded in-memory cache to a request resolver.
 *
 * **When to use**
 *
 * Use to reuse completed results for repeated equal request values while still
 * passing a `RequestResolver` to `Effect.request`.
 *
 * **Details**
 *
 * Running the returned effect creates the cache and returns a wrapped resolver.
 * The cache stores completed success or failure results by request equality up
 * to `capacity`. The `strategy` option controls eviction order and defaults to
 * `"lru"`; `"fifo"` keeps insertion order.
 *
 * **Gotchas**
 *
 * Entries do not expire by time, and completed failures without interruptions
 * are cached the same as successes. Results containing interruptions are not
 * cached. Request equality controls cache hits.
 *
 * @see {@link asCache} for exposing the resolver as a `Cache` with time-to-live and service lookup controls
 * @see {@link persisted} for backing persistable requests with the configured persistence store
 *
 * @category caching
 * @since 4.0.0
 */
export const withCache: {
  <A extends Request.Any>(options: {
    readonly capacity: number
    readonly strategy?: "lru" | "fifo" | undefined
  }): (self: RequestResolver<A>) => Effect.Effect<RequestResolver<A>>
  <A extends Request.Any>(self: RequestResolver<A>, options: {
    readonly capacity: number
    readonly strategy?: "lru" | "fifo" | undefined
  }): Effect.Effect<RequestResolver<A>>
} = dual(2, <A extends Request.Any>(self: RequestResolver<A>, options: {
  readonly capacity: number
  readonly strategy?: "lru" | "fifo" | undefined
}): Effect.Effect<RequestResolver<A>> =>
  Effect.sync(() => {
    const strategy = options.strategy ?? "lru"
    const cache = MutableHashMap.empty<A, {
      readonly entry: Request.Entry<A>
      exit: Request.Result<A> | undefined
    }>()
    return makeWith({
      ...self,
      runAll(entries, key) {
        return Effect.onExit(self.runAll(entries, key), () => {
          let toRemove = MutableHashMap.size(cache) - options.capacity
          if (toRemove <= 0) return Effect.void
          for (const k of MutableHashMap.keys(cache)) {
            MutableHashMap.remove(cache, k)
            toRemove--
            if (toRemove <= 0) break
          }
          return Effect.void
        })
      },
      preCheck(entry) {
        const ocached = MutableHashMap.get(cache, entry.request)
        if (ocached._tag === "None") {
          const cached = { entry, exit: undefined as Request.Result<A> | undefined }
          MutableHashMap.set(cache, entry.request, cached)
          const prevComplete = entry.completeUnsafe
          entry.completeUnsafe = function(exit) {
            if (Exit.hasInterrupts(exit)) {
              if (cached.exit === undefined) {
                const current = MutableHashMap.get(cache, entry.request)
                if (current._tag === "Some" && current.value === cached) {
                  MutableHashMap.remove(cache, entry.request)
                }
              }
            } else {
              cached.exit = exit as any
            }
            prevComplete(exit)
          }
          return true
        }
        const cached = ocached.value
        if (cached.exit) {
          if (strategy === "lru") {
            MutableHashMap.remove(cache, cached.entry.request)
            MutableHashMap.set(cache, cached.entry.request, cached)
          }
          entry.completeUnsafe(cached.exit as any)
        } else {
          cached.entry.uninterruptible = true
          const prevComplete = cached.entry.completeUnsafe
          cached.entry.completeUnsafe = function(exit) {
            prevComplete(exit)
            entry.completeUnsafe(exit)
          }
        }
        return false
      }
    })
  }))

/**
 * Wraps a request resolver with persistent storage for persistable requests.
 *
 * **When to use**
 *
 * Use to keep a `RequestResolver` interface while reusing completed
 * `Persistable` request results through a `Persistence` store.
 *
 * **Details**
 *
 * Cached results are loaded from the configured persistence store before
 * running the underlying resolver. Missing entries are resolved normally and
 * written back to the store. Entries marked stale by `staleWhileRevalidate`
 * receive the stored result and are also resolved again so the refreshed result
 * can be written back to the store. Creating the persisted resolver requires
 * `Persistence.Persistence` and `Scope`.
 *
 * @see {@link withCache} for in-memory resolver caching that does not require persistable request values or a persistence store
 * @see {@link asCache} for exposing resolver results through a `Cache` instead of returning another resolver
 *
 * @category caching
 * @since 4.0.0
 */
export const persisted: {
  <A extends Request.Request<any, Persistence.PersistenceError | Schema.SchemaError, any> & Persistable.Any>(
    options: {
      readonly storeId: string
      readonly timeToLive?: ((exit: Request.Result<A>, request: A) => Duration.Input) | undefined
      readonly staleWhileRevalidate?: ((exit: Request.Result<A>, request: A) => boolean) | undefined
    }
  ): (self: RequestResolver<A>) => Effect.Effect<
    RequestResolver<A>,
    never,
    Persistence.Persistence | Scope
  >
  <
    A extends Request.Request<any, Persistence.PersistenceError | Schema.SchemaError, any> & Persistable.Any
  >(
    self: RequestResolver<A>,
    options: {
      readonly storeId: string
      readonly timeToLive?: ((exit: Request.Result<A>, request: A) => Duration.Input) | undefined
      readonly staleWhileRevalidate?: ((exit: Request.Result<A>, request: A) => boolean) | undefined
    }
  ): Effect.Effect<
    RequestResolver<A>,
    never,
    Persistence.Persistence | Scope
  >
} = dual(
  2,
  Effect.fnUntraced(function*<
    A extends Request.Request<any, Persistence.PersistenceError | Schema.SchemaError, any> & Persistable.Any
  >(
    self: RequestResolver<A>,
    options: {
      readonly storeId: string
      readonly timeToLive?: ((exit: Request.Result<A>, request: A) => Duration.Input) | undefined
      readonly staleWhileRevalidate?: ((exit: Request.Result<A>, request: A) => boolean) | undefined
    }
  ) {
    const store = yield* (yield* Persistence.Persistence).make(options as any)
    return makeWith<A>({
      ...self,
      runAll: Effect.fnUntraced(function*(entries, key) {
        const results = yield* (store.getMany(Iterable.map(entries, (_) => _.request)).pipe(
          Effect.provideContext(entries[0].context)
        ) as Effect.Effect<
          Array<Exit.Exit<unknown, unknown> | undefined>,
          Request.Error<A>
        >)
        const leftover: Array<Request.Entry<A>> = []
        const toPersist = new Map<A, Request.Result<A>>()
        const completed = new Set<Request.Entry<A>>()
        for (let i = 0; i < results.length; i++) {
          const entry = entries[i]
          const exit = results[i]
          if (
            exit === undefined ||
            (options.staleWhileRevalidate && options.staleWhileRevalidate(exit as any, entry.request))
          ) {
            const prevComplete = entry.completeUnsafe
            entry.completeUnsafe = function(exit) {
              completed.add(entry)
              toPersist.set(entry.request, exit as any)
              prevComplete(exit)
            }
            leftover.push(entry)
            if (exit === undefined) continue
          }
          entry.completeUnsafe(exit as any)
        }
        if (!Arr.isArrayNonEmpty(leftover)) {
          return
        }
        yield* Effect.catchCause(Effect.suspend(() => self.runAll(leftover, key)), (cause) => {
          for (let i = 0; i < leftover.length; i++) {
            const entry = leftover[i]
            if (completed.has(entry)) continue
            entry.completeUnsafe(Exit.failCause(cause) as any)
          }
          return Effect.void
        })
        yield* (store.setMany(toPersist).pipe(
          Effect.provideContext(entries[0].context)
        ) as Effect.Effect<void, Request.Error<A>>)
      })
    })
  })
)
