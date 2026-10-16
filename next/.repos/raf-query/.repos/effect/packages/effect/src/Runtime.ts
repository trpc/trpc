/**
 * Helpers for turning an `Effect` program into a host application's main entry
 * point. This module is the low-level layer used by platform adapters to run a
 * main effect, observe its fiber, report unhandled failures, and translate the
 * resulting `Exit` into an application or process exit code. It provides
 * `makeRunMain`, the default teardown behavior, and error markers for custom
 * exit codes and already-reported failures. Application code usually calls the
 * platform-provided runner instead of using this module directly.
 *
 * @since 4.0.0
 */
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import { constVoid, dual } from "effect/Function"
import type * as Fiber from "./Fiber.ts"

/**
 * Represents a teardown function that handles program completion and determines the exit code.
 *
 * **When to use**
 *
 * Use when integrating {@link makeRunMain} with a host platform that needs to
 * translate an Effect `Exit` into a process, worker, or application exit code.
 *
 * **Details**
 *
 * A teardown function is called when an Effect program completes, either
 * successfully or with a failure. It determines the appropriate exit code and
 * can perform cleanup before invoking the supplied `onExit` callback.
 *
 * **Example** (Customizing teardown behavior)
 *
 * ```ts import.meta.vitest
 * import { Effect, Exit, Runtime } from "effect"
 *
 * // Custom teardown that maps completion status to an exit code
 * const customTeardown: Runtime.Teardown = (exit, onExit) => {
 *   onExit(Exit.isSuccess(exit) ? 0 : 1)
 * }
 *
 * const completed = new Promise<readonly [Exit.Exit<unknown, unknown>, number]>((resolve) => {
 * // Use with makeRunMain
 *   const runMain = Runtime.makeRunMain(({ fiber, teardown }) => {
 *     fiber.addObserver((exit) => {
 *       teardown(exit, (code) => resolve([exit, code]))
 *     })
 *   })
 *
 *   const program = Effect.succeed("Hello, World!")
 *   runMain(program, { teardown: customTeardown })
 * })
 *
 * await completed // => [Exit.succeed("Hello, World!"), 0]
 * ```
 *
 * @category models
 * @since 4.0.0
 */
export interface Teardown {
  <E, A>(exit: Exit.Exit<E, A>, onExit: (code: number) => void): void
}

/**
 * The default teardown function that determines exit codes from an Effect exit.
 *
 * **When to use**
 *
 * Use as the standard teardown for main programs with conventional process
 * exit codes and support for {@link errorExitCode}.
 *
 * **Details**
 *
 * This teardown follows these exit-code rules:
 *
 * - `0` for successful completion.
 * - `130` for interruption-only failures.
 * - The squashed error's {@link errorExitCode} value for other failures when
 *   present.
 * - `1` for other failures.
 *
 * **Gotchas**
 *
 * The `130` code is used only when the Cause contains interruptions and no
 * other failure reasons. Mixed causes use the squashed error path instead.
 *
 * **Example** (Referencing default teardown)
 *
 * ```ts import.meta.vitest
 * import { Exit, Runtime } from "effect"
 *
 * const exitCodes: Array<number> = []
 * const collectExitCode = (exit: Exit.Exit<any, any>) =>
 *   Runtime.defaultTeardown(exit, (code) => exitCodes.push(code))
 *
 * collectExitCode(Exit.succeed(42))
 * collectExitCode(Exit.fail("error"))
 * collectExitCode(Exit.interrupt(123))
 *
 * exitCodes // => [0, 1, 130]
 * ```
 *
 * @see {@link errorExitCode} for customizing failure exit codes
 *
 * @category running
 * @since 4.0.0
 */
export const defaultTeardown: Teardown = <E, A>(
  exit: Exit.Exit<E, A>,
  onExit: (code: number) => void
) => {
  if (Exit.isSuccess(exit)) return onExit(0)
  if (Cause.hasInterruptsOnly(exit.cause)) return onExit(130)
  return onExit(getErrorExitCode(Cause.squash(exit.cause)))
}

/**
 * Creates a platform-specific main program runner that handles Effect execution lifecycle.
 *
 * **When to use**
 *
 * Use when building a runtime adapter for a host platform.
 *
 * **Details**
 *
 * The runner executes Effect programs as main entry points. The provided
 * function receives a forked fiber and a teardown callback so it can install
 * platform-specific signal handling, fiber observers, and final exit behavior.
 *
 * Most applications should use a platform-provided runner, such as
 * `NodeRuntime.runMain`, rather than constructing one directly.
 *
 * `disableErrorReporting` disables the automatic log emitted for unreported
 * non-interruption failures. It does not change exit-code calculation or the
 * custom teardown callback.
 *
 * **Gotchas**
 *
 * The setup function is responsible for observing the fiber and eventually
 * invoking teardown. `makeRunMain` also tries to keep the host process alive
 * with a long interval while the main fiber is running; if the host blocks
 * timers, the runner still starts but cannot use that keep-alive fallback.
 *
 * **Example** (Creating platform runners)
 *
 * ```ts import.meta.vitest
 * import { Effect, Exit, Runtime } from "effect"
 *
 * const events: Array<string> = []
 * const completed = new Promise<readonly [Exit.Exit<unknown, unknown>, number]>((resolve) => {
 * // Create a simple runner for a hypothetical platform
 *   const runMain = Runtime.makeRunMain(({ fiber, teardown }) => {
 *     // Handle fiber completion
 *     fiber.addObserver((exit) => {
 *       teardown(exit, (code) => resolve([exit, code]))
 *     })
 *   })
 *
 *   // Use the runner
 *   const program = Effect.sync(() => {
 *     events.push("Starting program", "Program completed")
 *     return "success"
 *   })
 *
 *   runMain(program, {
 *     teardown: (exit, onExit) => {
 *       events.push("Custom teardown logic")
 *       Runtime.defaultTeardown(exit, onExit)
 *     }
 *   })
 * })
 *
 * const result = await completed
 * result // => [Exit.succeed("success"), 0]
 * events // => ["Starting program", "Program completed", "Custom teardown logic"]
 * ```
 *
 * @category running
 * @since 4.0.0
 */
export const makeRunMain = (
  f: <E, A>(
    options: {
      readonly fiber: Fiber.Fiber<A, E>
      readonly teardown: Teardown
    }
  ) => void
): {
  (
    options?: {
      readonly disableErrorReporting?: boolean | undefined
      readonly teardown?: Teardown | undefined
    }
  ): <E, A>(effect: Effect.Effect<A, E>) => void
  <E, A>(
    effect: Effect.Effect<A, E>,
    options?: {
      readonly disableErrorReporting?: boolean | undefined
      readonly teardown?: Teardown | undefined
    }
  ): void
} =>
  dual((args) => Effect.isEffect(args[0]), (effect: Effect.Effect<any, any>, options?: {
    readonly disableErrorReporting?: boolean | undefined
    readonly teardown?: Teardown | undefined
  }) => {
    const fiber = options?.disableErrorReporting === true
      ? Effect.runFork(effect)
      : Effect.runFork(
        Effect.tapCause(effect, (cause) => {
          if (Cause.hasInterruptsOnly(cause)) return Effect.void
          const isReported = getErrorReported(Cause.squash(cause))
          return isReported ? Effect.logError(cause) : Effect.void
        })
      )
    try {
      const keepAlive = globalThis.setInterval(constVoid, 2_147_483_647)
      fiber.addObserver(() => {
        clearInterval(keepAlive)
      })
    } catch {}
    const teardown = options?.teardown ?? defaultTeardown
    return f({ fiber, teardown })
  })

declare global {
  interface Error {
    readonly [errorExitCode]?: number
    readonly [errorReported]?: boolean
  }
}

/**
 * Type-level key for the `Runtime.errorExitCode` marker.
 *
 * **When to use**
 *
 * Use to type properties keyed by `Runtime.errorExitCode` on custom error
 * values.
 *
 * @category symbols
 * @since 4.0.0
 */
export type errorExitCode = "~effect/Runtime/errorExitCode"

/**
 * Allows associating an exit code with an error for determining the process
 * exit code on failure.
 *
 * **When to use**
 *
 * Use when error classes should map failures to a specific process exit code
 * when handled by {@link defaultTeardown}.
 *
 * **Details**
 *
 * Attach this marker as a readonly property on an error object. When the main
 * program fails, {@link defaultTeardown} squashes the Cause and reads the marker
 * from the resulting error value.
 *
 * **Gotchas**
 *
 * The marker is read from the squashed failure value. If a Cause contains
 * multiple failures, the selected squashed error determines the exit code.
 *
 * **Example** (Setting a process exit code)
 *
 * ```ts import.meta.vitest
 * import { Data, Runtime } from "effect"
 *
 * class MyError extends Data.TaggedError("MyError") {
 *   readonly [Runtime.errorExitCode] = 42
 * }
 *
 * Runtime.getErrorExitCode(new MyError()) // => 42
 * ```
 *
 * @see {@link errorReported} for controlling automatic error logging
 * @see {@link defaultTeardown} for the default failure exit-code rules that read this marker
 * @see {@link getErrorExitCode} for reading the marker from unknown error values
 *
 * @category symbols
 * @since 4.0.0
 */
export const errorExitCode: errorExitCode = "~effect/Runtime/errorExitCode"

/**
 * Reads the runtime exit-code marker from an unknown error value.
 *
 * **When to use**
 *
 * Use to read a custom failure exit code from an unknown error value, falling
 * back to the default failure code.
 *
 * **Details**
 *
 * Returns the numeric `[Runtime.errorExitCode]` property when it is present on
 * an object. Otherwise returns `1`, the default failure exit code used by
 * `defaultTeardown`.
 *
 * **Gotchas**
 *
 * Non-object values, missing markers, and non-number marker values all return
 * `1`.
 *
 * @see {@link errorExitCode} for the marker read by this function
 *
 * @category getters
 * @since 4.0.0
 */
export const getErrorExitCode = (u: unknown): number => {
  if (typeof u === "object" && u !== null && errorExitCode in u) {
    const code = u[errorExitCode]
    if (typeof code === "number") {
      return code
    }
  }
  return 1
}

/**
 * Type-level key for the `Runtime.errorReported` marker.
 *
 * **When to use**
 *
 * Use to type properties keyed by `Runtime.errorReported` on custom error
 * values.
 *
 * @category symbols
 * @since 4.0.0
 */
export type errorReported = "~effect/Runtime/errorReported"

/**
 * Defines the runtime marker that controls default `runMain` error logging for an error.
 *
 * **When to use**
 *
 * Use when you need error classes reported by application code to avoid being
 * logged again by the default main runner.
 *
 * **Details**
 *
 * Set `[Runtime.errorReported]` to `false` on an error object to suppress the
 * runtime log because the error has already been reported. Omitted or
 * non-boolean values are treated as `true`, so failures are logged by default.
 *
 * **Gotchas**
 *
 * This marker controls only automatic error logging. It does not change the
 * failure Cause or the process exit code.
 * `makeRunMain` reads the marker from `Cause.squash(cause)`, so for causes
 * with multiple failures, the squashed error determines whether default logging
 * is suppressed.
 *
 * **Example** (Suppressing error reporting)
 *
 * ```ts import.meta.vitest
 * import { Data, Runtime } from "effect"
 *
 * class MyError extends Data.TaggedError("MyError") {
 *   readonly [Runtime.errorReported] = false
 * }
 *
 * Runtime.getErrorReported(new MyError()) // => false
 * ```
 *
 * @see {@link errorExitCode} for controlling failure exit codes
 * @see {@link getErrorReported} for reading the marker from unknown error values
 *
 * @category symbols
 * @since 4.0.0
 */
export const errorReported: errorReported = "~effect/Runtime/errorReported"

/**
 * Reads the runtime error-reporting marker from an unknown error value.
 *
 * **When to use**
 *
 * Use to read whether an unknown error value should be treated as already
 * reported by the default main runner.
 *
 * **Details**
 *
 * Returns a boolean `[Runtime.errorReported]` property when it is present on an
 * object. Otherwise returns `true`, so failures are logged by default.
 *
 * **Gotchas**
 *
 * Non-object values, missing markers, and non-boolean marker values all return
 * `true`.
 *
 * @see {@link errorReported} for the marker read by this function
 *
 * @category getters
 * @since 4.0.0
 */
export const getErrorReported = (u: unknown): boolean => {
  if (typeof u === "object" && u !== null && errorReported in u) {
    const isReported = u[errorReported]
    if (typeof isReported === "boolean") {
      return isReported
    }
  }
  return true
}
