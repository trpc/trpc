const turn = () => new Promise<void>((resolve) => setImmediate(resolve))

export async function settleHydration(
  committed: Promise<void>,
  isIdle: () => boolean,
  describeProgress: () => string,
  timeoutMs = 60_000,
) {
  let timeoutError: Error | undefined
  let watchdog: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    watchdog = setTimeout(() => {
      timeoutError = new Error(
        `Hydration did not settle within ${timeoutMs}ms: ${describeProgress()}`,
      )
      reject(timeoutError)
    }, timeoutMs)
  })
  try {
    // Concurrent hydration can need many more scheduler turns under CPU
    // instrumentation. Await its commit instead of limiting successful work
    // to an arbitrary number of event-loop polls.
    await Promise.race([committed, timeout])
    let idleTurns = 0
    while (idleTurns < 2) {
      await turn()
      if (timeoutError) {
        throw timeoutError
      }
      idleTurns = isIdle() ? idleTurns + 1 : 0
    }
  } finally {
    clearTimeout(watchdog)
  }
}
