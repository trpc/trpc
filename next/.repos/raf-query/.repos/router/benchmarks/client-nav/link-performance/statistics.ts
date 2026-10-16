const critical95 = [
  12.7062, 4.3027, 3.1824, 2.7764, 2.5706, 2.4469, 2.3646, 2.306, 2.2622,
  2.2281,
]

export function mean(values: ReadonlyArray<number>) {
  if (!values.length || values.some((value) => !Number.isFinite(value))) {
    throw new Error('Expected finite, nonempty samples')
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export function summarizeRatios(ratios: ReadonlyArray<number>) {
  if (
    ratios.length < 2 ||
    ratios.length > 11 ||
    ratios.some((value) => value <= 0)
  ) {
    throw new Error('Expected 2-11 independent positive process-replica ratios')
  }
  const logs = ratios.map(Math.log)
  const center = mean(logs)
  const variance =
    logs.reduce((sum, value) => sum + (value - center) ** 2, 0) /
    (logs.length - 1)
  // Replicas, not the many correlated batches inside a worker, are the samples.
  const margin =
    critical95[logs.length - 2]! * Math.sqrt(variance / logs.length)
  const percent = (value: number) => (Math.exp(value) - 1) * 100
  return {
    changePercent: percent(center),
    low95: percent(center - margin),
    high95: percent(center + margin),
    replicas: ratios.length,
  }
}

export function classify(
  cpu: ReturnType<typeof summarizeRatios>,
  wall: ReturnType<typeof summarizeRatios>,
) {
  if (cpu.low95 > 0 && wall.low95 > 0) {
    return 'slower'
  }
  if (cpu.high95 < 0 && wall.high95 < 0) {
    return 'faster'
  }
  if (
    cpu.low95 >= -2 &&
    cpu.high95 <= 2 &&
    wall.low95 >= -2 &&
    wall.high95 <= 2
  ) {
    return 'within-2%'
  }
  return 'inconclusive'
}
