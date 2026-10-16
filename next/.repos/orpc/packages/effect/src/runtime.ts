import { AbortError } from '@orpc/shared'
import { Cause, Effect, Exit } from 'effect'

export interface RunPromiseOptions {
  signal?: undefined | AbortSignal
}

/**
 * Runs an Effect as a Promise and throws the most meaningful errors.
 */
export async function runPromise<T>(effect: Effect.Effect<T, unknown>, options: RunPromiseOptions = {}): Promise<T> {
  const exit = await Effect.runPromiseExit(effect, options)

  if (Exit.isSuccess(exit)) {
    return exit.value
  }

  // Use AbortError for interruption-only failures.
  // This is more meaningful than the generic
  // `Error("All fibers interrupted without error")` from Cause.squash.
  if (Cause.hasInterruptsOnly(exit.cause)) {
    if (options.signal?.aborted) {
      throw options.signal.reason
    }

    throw new AbortError('All fibers interrupted without error')
  }

  throw Cause.squash(exit.cause)
}
