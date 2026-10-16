export async function waitFor(fn: () => void, { timeout = 1000, interval = 50 } = {}) {
  const deadline = Date.now() + timeout
  let lastError: unknown
  while (Date.now() < deadline) {
    try {
      await fn()
      return
    }
    catch (e) {
      lastError = e
      await Bun.sleep(interval)
    }
  }
  throw lastError
}
