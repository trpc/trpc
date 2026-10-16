/**
 * Worker-side primitives for worker-like runtimes.
 *
 * A `WorkerRunner` receives messages tagged by a numeric port id, sends replies
 * back through the same transport, and can expose disconnect notifications. The
 * module also defines the small platform message shape and the
 * `WorkerRunnerPlatform` service that starts a platform-specific runner.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Context from "../Context.ts"
import type * as Effect from "../Effect.ts"
import type * as Queue from "../Queue.ts"
import type { WorkerError } from "./WorkerError.ts"

/**
 * Platform-neutral worker runner that receives inbound messages by port ID,
 * sends outbound messages, and optionally exposes disconnect notifications.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface WorkerRunner<O = unknown, I = unknown> {
  readonly run: <A, E, R>(
    handler: (portId: number, message: I) => Effect.Effect<A, E, R> | void
  ) => Effect.Effect<void, WorkerError, R>
  readonly send: (
    portId: number,
    message: O,
    transfers?: ReadonlyArray<unknown>
  ) => Effect.Effect<void>
  readonly sendUnsafe: (
    portId: number,
    message: O,
    transfers?: ReadonlyArray<unknown>
  ) => void
  readonly disconnects?: Queue.Dequeue<number> | undefined
}

/**
 * Wire protocol message used by worker platforms: a request carrying input or a
 * close signal.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type PlatformMessage<I> = readonly [request: 0, I] | readonly [close: 1]

/**
 * Context service that starts a platform-specific `WorkerRunner`.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class WorkerRunnerPlatform extends Context.Service<WorkerRunnerPlatform, {
  readonly start: <O = unknown, I = unknown>() => Effect.Effect<WorkerRunner<O, I>, WorkerError>
}>()("effect/workers/WorkerRunner/WorkerRunnerPlatform") {}
