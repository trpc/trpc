export function isMemoryInstrumented() {
  return (
    process.env.CODSPEED_ENV !== undefined &&
    process.env.CODSPEED_RUNNER_MODE === 'memory'
  )
}

// CodSpeed calls beforeEach before its forced GC and measurement marker. End
// the previous warmup's job so WeakRef targets can be released by that GC.
export function endMemoryTurn() {
  return new Promise<void>((resolve) => setImmediate(resolve))
}
