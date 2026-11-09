import { Optic, Schema } from "effect"
import { Bench } from "tinybench"

// Batching bounds sample storage and keeps sub-microsecond timings above timer resolution.
const batchSize = 1_000
const bench = new Bench({
  iterations: 1_000,
  time: 0,
  warmupIterations: 100,
  warmupTime: 0,
  timestampProvider: "hrtimeNow"
})
let sink: unknown

const batch = <A>(run: () => A) => () => {
  let value = run()
  for (let index = 1; index < batchSize; index++) {
    value = run()
  }
  sink = value
}

// Define a class with nested properties
class User extends Schema.Class<User>("User")({
  id: Schema.Number,
  profile: Schema.Struct({
    name: Schema.String,
    email: Schema.String,
    address: Schema.Struct({
      street: Schema.String,
      city: Schema.String,
      country: Schema.String
    })
  })
}) {}

// Create a user instance
const user = User.make({
  id: 1,
  profile: {
    name: "John Doe",
    email: "john@example.com",
    address: {
      street: "123 Main St",
      city: "New York",
      country: "USA"
    }
  }
})

const iso = Schema.toIso(User).key("profile").key("address").key("street")
const optic = Optic.id<typeof User["Type"]>().key("profile").key("address").key("street")

bench
  .add("iso get", batch(() => iso.get(user)))
  .add("optic get", batch(() => optic.get(user)))
  .add("direct get", batch(() => user.profile.address.street))
  .add("iso replace", batch(() => iso.replace("Updated", user)))
  .add(
    "direct replace",
    batch(() =>
      new User({
        ...user,
        profile: {
          ...user.profile,
          address: {
            ...user.profile.address,
            street: "Updated"
          }
        }
      })
    )
  )

await bench.run()

if (sink === undefined) {
  throw new Error("Benchmark did not run")
}

console.table(bench.table((task) => {
  const result = task.result
  if (result?.state === "errored") {
    return {
      "Task name": task.name,
      Error: result.error.message
    }
  }
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
