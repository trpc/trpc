const assertFiniteNumbers = (values, label) => {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error(`${label} must be a non-empty array`)
  }
  for (const value of values) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`${label} must contain finite positive numbers`)
    }
  }
}

export const median = (values) => {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error("values must be a non-empty array")
  }
  const sorted = values.slice().sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle]
}

export const percentile = (values, probability) => {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error("values must be a non-empty array")
  }
  if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
    throw new Error("probability must be between 0 and 1")
  }
  const sorted = values.slice().sort((a, b) => a - b)
  const index = (sorted.length - 1) * probability
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  if (lower === upper) return sorted[lower]
  const weight = index - lower
  return sorted[lower] * (1 - weight) + sorted[upper] * weight
}

const makeRandom = (seed) => {
  let state = seed >>> 0
  return () => {
    state += 0x6d2b79f5
    let value = state
    value = Math.imul(value ^ value >>> 15, value | 1)
    value ^= value + Math.imul(value ^ value >>> 7, value | 61)
    return ((value ^ value >>> 14) >>> 0) / 4294967296
  }
}

export const aggregate = (values) => {
  assertFiniteNumbers(values, "values")
  const center = median(values)
  return {
    median: center,
    min: Math.min(...values),
    max: Math.max(...values),
    mad: median(values.map((value) => Math.abs(value - center)))
  }
}

export const bootstrapMedianLogRatio = (
  ratios,
  { confidence = 0.95, iterations = 10_000, seed = 0x5eed1234 } = {}
) => {
  assertFiniteNumbers(ratios, "ratios")
  if (!Number.isInteger(iterations) || iterations <= 0) {
    throw new Error("iterations must be a positive integer")
  }
  if (!Number.isFinite(confidence) || confidence <= 0 || confidence >= 1) {
    throw new Error("confidence must be between 0 and 1")
  }
  if (!Number.isInteger(seed)) {
    throw new Error("seed must be an integer")
  }

  const logRatios = ratios.map(Math.log)
  const random = makeRandom(seed)
  const samples = new Array(iterations)
  const resample = new Array(logRatios.length)
  for (let iteration = 0; iteration < iterations; iteration++) {
    for (let index = 0; index < logRatios.length; index++) {
      resample[index] = logRatios[Math.floor(random() * logRatios.length)]
    }
    samples[iteration] = median(resample)
  }
  const tail = (1 - confidence) / 2
  return {
    ratio: Math.exp(median(logRatios)),
    lowRatio: Math.exp(percentile(samples, tail)),
    highRatio: Math.exp(percentile(samples, 1 - tail)),
    confidence,
    iterations,
    seed
  }
}

export const analyzePairs = (
  base,
  head,
  {
    confidence = 0.95,
    iterations = 10_000,
    seed = 0x5eed1234,
    minImprovementPercent = 2,
    maxRegressionPercent = 5
  } = {}
) => {
  assertFiniteNumbers(base, "base")
  assertFiniteNumbers(head, "head")
  if (base.length !== head.length) {
    throw new Error("base and head must contain the same number of observations")
  }
  const ratios = base.map((value, index) => head[index] / value)
  const interval = bootstrapMedianLogRatio(ratios, { confidence, iterations, seed })
  const deltaPercent = (interval.ratio - 1) * 100
  const lowPercent = (interval.lowRatio - 1) * 100
  const highPercent = (interval.highRatio - 1) * 100
  const status = interval.highRatio < 1 - minImprovementPercent / 100
    ? "improvement"
    : interval.lowRatio > 1 + maxRegressionPercent / 100
    ? "regression"
    : "inconclusive"
  return {
    ratios,
    deltaPercent,
    lowPercent,
    highPercent,
    status,
    ...interval
  }
}
