import { Schema, SchemaIssue } from "effect"
import { Bench } from "tinybench"

const batchSize = 1_000
const bench = new Bench({
  iterations: 1_000,
  time: 0,
  warmupIterations: 100,
  warmupTime: 0,
  timestampProvider: "hrtimeNow"
})
const issue = new SchemaIssue.InvalidValue({ message: "Expected string" })
let sink: Schema.SchemaError | undefined

bench.add("SchemaError construction", () => {
  let error = new Schema.SchemaError(issue)
  for (let index = 1; index < batchSize; index++) {
    error = new Schema.SchemaError(issue)
  }
  sink = error
})

await bench.run()

if (sink === undefined) {
  throw new Error("Benchmark did not run")
}

console.table(bench.table((task) => {
  const result = task.result
  if (result?.state !== "completed") {
    return {
      "Task name": task.name,
      State: result?.state ?? "missing result"
    }
  }
  const latencyToNs = (value: number) => value * 1_000_000 / batchSize
  return {
    "Task name": task.name,
    "Latency avg (ns/op)": latencyToNs(result.latency.mean).toFixed(2),
    "Latency med (ns/op)": latencyToNs(result.latency.p50).toFixed(2),
    "Latency RME": `${result.latency.rme.toFixed(2)}%`,
    "Throughput avg (ops/s)": Math.round(result.throughput.mean * batchSize),
    Samples: result.latency.samplesCount
  }
}))
