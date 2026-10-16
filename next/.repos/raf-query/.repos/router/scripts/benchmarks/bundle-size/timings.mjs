// Timings are diagnostics only; never include them in cacheable size metrics.
export function createTimings(write = (line) => process.stderr.write(line)) {
  function record(phase, durationMs, scenario) {
    write(
      `[bundle-size:timing] ${JSON.stringify({
        phase,
        ...(scenario ? { scenario } : {}),
        durationMs: Math.round(durationMs * 1000) / 1000,
      })}\n`,
    )
  }

  return {
    record,
    start(phase, scenario) {
      const started = performance.now()
      return () => record(phase, performance.now() - started, scenario)
    },
  }
}
