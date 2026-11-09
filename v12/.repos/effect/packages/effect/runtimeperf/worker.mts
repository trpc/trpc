import { pathToFileURL } from "node:url"
import { Bench } from "tinybench"
import { median } from "./stats.mts"

let sink

const args = process.argv.slice(2)
const readOption = (name) => {
  const index = args.indexOf(name)
  if (index === -1) return undefined
  const value = args[index + 1]
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`Missing value for ${name}`)
  }
  return value
}

const readPositiveNumber = (name, fallback) => {
  const raw = readOption(name)
  if (raw === undefined) return fallback
  const value = Number(raw)
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number`)
  }
  return value
}

const isPromiseLike = (value) =>
  value !== null &&
  (typeof value === "object" || typeof value === "function") &&
  typeof value.then === "function"

const loadCase = async (fixturePath, exportName) => {
  const fixture = await import(`${pathToFileURL(fixturePath).href}?runtimeperf=${process.pid}`)
  const factory = fixture[exportName]
  if (typeof factory !== "function") {
    throw new Error(`Fixture export ${exportName} is not a function`)
  }
  const runtimeCase = factory()
  if (
    runtimeCase === null ||
    typeof runtimeCase !== "object" ||
    typeof runtimeCase.run !== "function" ||
    typeof runtimeCase.validate !== "function"
  ) {
    throw new Error(`Fixture export ${exportName} did not return a RuntimePerfCase`)
  }
  const validationResult = runtimeCase.run()
  if (isPromiseLike(validationResult)) {
    throw new Error(`Fixture export ${exportName} returned a Promise`)
  }
  runtimeCase.validate(validationResult)
  sink = validationResult
  return runtimeCase
}

const runBatch = (run, batchSize) => {
  let value
  for (let index = 0; index < batchSize; index++) {
    value = run()
  }
  if (isPromiseLike(value)) {
    throw new Error("Synchronous runtimeperf task returned a Promise")
  }
  sink = value
}

const calibrate = (runtimeCase, targetBatchTimeNs, maxBatchSize) => {
  const warnings = []
  let batchSize = 1
  while (true) {
    const samples = new Array(5)
    for (let attempt = 0; attempt < samples.length; attempt++) {
      const start = process.hrtime.bigint()
      runBatch(runtimeCase.run, batchSize)
      samples[attempt] = Number(process.hrtime.bigint() - start)
    }
    if (median(samples) >= targetBatchTimeNs || batchSize >= maxBatchSize) {
      if (batchSize >= maxBatchSize && median(samples) < targetBatchTimeNs) {
        warnings.push(`Maximum batch size ${maxBatchSize} did not reach ${targetBatchTimeNs} ns`)
      }
      return { batchSize, warnings }
    }
    batchSize = Math.min(batchSize * 2, maxBatchSize)
  }
}

const measure = (runtimeCase, batchSize, timeMs, warmupTimeMs) => {
  const bench = new Bench({
    iterations: 1,
    time: timeMs,
    warmup: true,
    warmupIterations: 1,
    warmupTime: warmupTimeMs,
    timestampProvider: "hrtimeNow"
  })
  bench.add("runtimeperf", () => runBatch(runtimeCase.run, batchSize), { async: false })
  bench.runSync()
  const task = bench.tasks[0]
  const result = task.result
  if (result?.state !== "completed") {
    throw new Error(`Tinybench task did not complete: ${result?.state ?? "missing result"}`)
  }
  const latencyToNs = (value) => value * 1_000_000 / batchSize
  return {
    nsPerOp: result.totalTime * 1_000_000 / (task.runs * batchSize),
    runs: task.runs,
    batchSize,
    totalTimeMs: result.totalTime,
    latency: {
      p50Ns: latencyToNs(result.latency.p50),
      p99Ns: latencyToNs(result.latency.p99),
      minNs: latencyToNs(result.latency.min),
      maxNs: latencyToNs(result.latency.max),
      rme: result.latency.rme,
      samplesCount: result.latency.samplesCount
    },
    runtime: result.runtime,
    runtimeVersion: result.runtimeVersion,
    timestampProviderName: result.timestampProviderName
  }
}

const main = async () => {
  const mode = readOption("--mode")
  const fixturePath = readOption("--fixture")
  const exportName = readOption("--export")
  if (mode !== "calibrate" && mode !== "measure") {
    throw new Error("--mode must be calibrate or measure")
  }
  if (fixturePath === undefined || exportName === undefined) {
    throw new Error("--fixture and --export are required")
  }
  const runtimeCase = await loadCase(fixturePath, exportName)
  const output = mode === "calibrate"
    ? calibrate(
      runtimeCase,
      readPositiveNumber("--target-batch-time-ns", 100_000),
      readPositiveNumber("--max-batch-size", 1_048_576)
    )
    : measure(
      runtimeCase,
      readPositiveNumber("--batch-size", 1),
      readPositiveNumber("--time-ms", 500),
      readPositiveNumber("--warmup-time-ms", 150)
    )
  runtimeCase.validate(sink)
  process.stdout.write(`${JSON.stringify({ ok: true, mode, ...output })}\n`)
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
  process.exitCode = 1
})
