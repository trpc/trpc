/**
 * Redis support shared by persistence modules.
 *
 * This module defines a `Redis` service that can send Redis commands, subscribe
 * to pub/sub channels, and run Lua scripts. It does not create a Redis client
 * itself; callers provide the client-specific operations. The module also
 * provides helpers for describing Lua scripts, loading them once, and running
 * them later by their cached Redis id.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Cache from "../Cache.ts"
import type * as Cause from "../Cause.ts"
import * as Context from "../Context.ts"
import * as Duration from "../Duration.ts"
import * as Effect from "../Effect.ts"
import * as Equal from "../Equal.ts"
import * as Exit from "../Exit.ts"
import { constant, identity } from "../Function.ts"
import * as Hash from "../Hash.ts"
import * as Queue from "../Queue.ts"
import * as Schema from "../Schema.ts"
import * as Scope from "../Scope.ts"

/**
 * A message received from a Redis pub/sub channel.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface RedisMessage {
  readonly channel: string
  readonly message: string
}

/**
 * Service for sending Redis commands, subscribing to channels, and evaluating
 * cached Lua scripts.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class Redis extends Context.Service<Redis, {
  readonly send: <A = unknown>(command: string, ...args: ReadonlyArray<string>) => Effect.Effect<A, RedisError>

  /**
   * Subscribes to a Redis pub/sub channel for the lifetime of the current
   * scope. Node and Deno subscribers reconnect and re-subscribe after an
   * interruption, so messages published during recovery appear as delivery
   * gaps. Bun subscribers do not reconnect: a dropped connection fails the
   * dequeue, and the caller must subscribe again.
   */
  readonly subscribe: (
    channel: string
  ) => Effect.Effect<Queue.Dequeue<RedisMessage, RedisError>, never, Scope.Scope>

  readonly eval: <
    Config extends {
      readonly params: ReadonlyArray<unknown>
      readonly result: unknown
    }
  >(script: Script<Config>) => (...params: Config["params"]) => Effect.Effect<Config["result"], RedisError>
}>()("effect/persistence/Redis") {}

/**
 * Creates a `Redis` service from raw command and subscription operations.
 *
 * **Details**
 *
 * Lua scripts are loaded through `SCRIPT LOAD`, cached, and then invoked with
 * `EVALSHA`.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const make = Effect.fnUntraced(function*(
  options: {
    readonly send: <A = unknown>(command: string, ...args: ReadonlyArray<string>) => Effect.Effect<A, RedisError>
    readonly subscribe: (
      channel: string,
      onMessage: (message: RedisMessage) => void
    ) => Effect.Effect<Effect.Effect<void, RedisError>, RedisError, Scope.Scope>
  }
) {
  const scriptCache = yield* Cache.makeWith(
    (script: Script<any>) => options.send<string>("SCRIPT", "LOAD", script.lua),
    {
      capacity: Number.POSITIVE_INFINITY,
      timeToLive: (exit) => Exit.isSuccess(exit) ? Duration.infinity : Duration.zero
    }
  )

  const eval_ = <
    Config extends {
      readonly params: ReadonlyArray<unknown>
      readonly result: unknown
    }
  >(
    script: Script<Config>
  ) =>
  (...params: Config["params"]): Effect.Effect<Config["result"], RedisError> => {
    const evalSha = (sha: string) =>
      options.send<Config["result"]>(
        "EVALSHA",
        sha,
        script.numberOfKeys(...params).toString(),
        ...script.params(...params).map((param) => String(param))
      )
    return Cache.get(scriptCache, script).pipe(
      Effect.flatMap(evalSha),
      Effect.catchIf(
        (error) => String(error.cause).includes("NOSCRIPT"),
        () => Cache.refresh(scriptCache, script).pipe(Effect.flatMap(evalSha))
      )
    )
  }

  const subscribe = Effect.fnUntraced(function*(channel: string) {
    const queue = yield* Queue.unbounded<RedisMessage, RedisError>()
    yield* Scope.addFinalizer(yield* Effect.scope, Queue.shutdown(queue))
    const onFailure = (cause: Cause.Cause<RedisError>) => Queue.failCause(queue, cause).pipe(Effect.asVoid)
    yield* options.subscribe(channel, (message) => {
      Queue.offerUnsafe(queue, message)
    }).pipe(
      Effect.flatMap((listen) => Effect.forkScoped(Effect.catchCause(listen, onFailure))),
      Effect.catchCause(onFailure)
    )
    return queue
  })

  return identity<Redis["Service"]>({
    send: options.send,
    subscribe,
    eval: eval_
  })
})

type ErrorTypeId = "~effect/persistence/Redis/RedisError"
const ErrorTypeId: ErrorTypeId = "~effect/persistence/Redis/RedisError"

/**
 * Error raised by Redis command or script execution.
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class RedisError extends Schema.Error<RedisError>(ErrorTypeId)({
  _tag: Schema.tag("RedisError"),
  cause: Schema.Defect()
}) {
  /**
   * Marks this value as a Redis persistence error for runtime guards.
   *
   * @stability unstable
   * @since 4.0.0
   */
  readonly [ErrorTypeId]: ErrorTypeId = ErrorTypeId
}

type ScriptTypeId = "~effect/persistence/Redis/Script"
const ScriptTypeId: ScriptTypeId = "~effect/persistence/Redis/Script"

/**
 * Typed descriptor for a Redis Lua script.
 *
 * **Details**
 *
 * It defines the Lua source, parameter-to-argument mapping, Redis key count,
 * and result type used by `Redis.eval`.
 *
 * @stability unstable
 * @category scripting
 * @since 4.0.0
 */
export interface Script<
  Config extends {
    readonly params: ReadonlyArray<unknown>
    readonly result: unknown
  }
> {
  readonly [ScriptTypeId]: {
    readonly params: Config["params"]
    readonly result: Config["result"]
  }
  readonly lua: string
  readonly params: (...params: Config["params"]) => ReadonlyArray<unknown>
  readonly numberOfKeys: (...params: Config["params"]) => number

  /**
   * Set the return type of the script.
   */
  withReturnType<Result>(): Script<{
    params: Config["params"]
    result: Result
  }>
}

const ScriptProto = {
  [ScriptTypeId]: {
    params: identity,
    result: identity
  },
  withReturnType() {
    return this
  },
  [Equal.symbol](that: unknown): boolean {
    return this === that
  },
  [Hash.symbol](): number {
    return Hash.random(this)
  }
}

/**
 * Constructs a typed Redis Lua script descriptor.
 *
 * **Details**
 *
 * The result type defaults to `void` and can be refined with
 * `withReturnType`.
 *
 * @stability unstable
 * @category scripting
 * @since 4.0.0
 */
export const script = <Params extends ReadonlyArray<any>>(
  f: (...params: Params) => ReadonlyArray<unknown>,
  options: {
    readonly lua: string
    readonly numberOfKeys: number | ((...params: Params) => number)
  }
): Script<{
  params: Params
  result: void
}> =>
  Object.setPrototypeOf({
    ...options,
    params: f,
    numberOfKeys: typeof options.numberOfKeys === "number" ? constant(options.numberOfKeys) : options.numberOfKeys
  }, ScriptProto)
