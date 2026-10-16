import { Duration, Effect, Schedule } from "effect"
import { sqlCleanupBatchSize } from "effect/internal/persistence"
import { TestClock } from "effect/testing"

export const expiredEntryCount = sqlCleanupBatchSize + 1
export const expiredAtEpoch = 0
export const futureExpiresAt = Number.MAX_SAFE_INTEGER
export const cleanupBatchDelay = Duration.millis(10)
export const testTimeout = 30_000

export const waitForCount = <E, R>(
  effect: Effect.Effect<number, E, R>,
  predicate: (count: number) => boolean
) =>
  effect.pipe(
    Effect.repeat({
      until: predicate,
      schedule: Schedule.spaced(cleanupBatchDelay)
    }),
    Effect.timeout(Duration.millis(testTimeout)),
    TestClock.withLive
  )
