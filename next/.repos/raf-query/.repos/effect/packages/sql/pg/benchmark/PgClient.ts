import { PgClient } from "@effect/sql-pg"
import { PostgreSqlContainer } from "@testcontainers/postgresql"
import { Effect, Redacted } from "effect"
import * as Reactivity from "effect/reactivity/Reactivity"
import { execFileSync } from "node:child_process"
import { cpus } from "node:os"
import { Bench } from "tinybench"

const externalUrl = process.env.PGCLIENT_BENCHMARK_URL
const resource = externalUrl === undefined
  ? await new PostgreSqlContainer("postgres:alpine").start().then((container) => ({
    container,
    url: container.getConnectionUri()
  }))
  : { container: undefined, url: externalUrl }
const { container, url } = resource

let sink = 0

const multiplex = process.env.PGCLIENT_BENCHMARK_MULTIPLEX === "1"

const run = Effect.gen(function*() {
  const sql = yield* PgClient.make({
    url: Redacted.make(url),
    applicationName: "pgclient-benchmark",
    maxConnections: 10,
    ...(multiplex ? { multiplex: true } : {})
  })

  // A table for the transaction workload to write into.
  yield* sql.unsafe("DROP TABLE IF EXISTS pgclient_benchmark")
  yield* sql.unsafe("CREATE UNLOGGED TABLE pgclient_benchmark (value int4)")

  const workloads = [
    {
      name: "parameterized SELECT (1 row)",
      unitsPerOperation: 1,
      unit: "queries/s",
      effect: sql.unsafe("SELECT $1::int4 AS value, $2::text AS label", [42, "effect"]).pipe(
        Effect.map((rows) => rows.length)
      )
    },
    {
      name: "generate_series (100 rows x 3 columns)",
      unitsPerOperation: 100,
      unit: "rows/s",
      effect: sql.unsafe(
        "SELECT value, value * 2 AS doubled, value::text AS label FROM generate_series(1, 100) AS value"
      ).pipe(Effect.map((rows) => rows.length))
    },
    {
      name: "generate_series (100 rows x 20 columns)",
      unitsPerOperation: 100,
      unit: "rows/s",
      effect: sql.unsafe(
        `SELECT ${
          Array.from({ length: 20 }, (_, index) => `value + ${index} AS column_${index}`).join(", ")
        } FROM generate_series(1, 100) AS value`
      ).pipe(Effect.map((rows) => rows.length))
    },
    {
      // Transactions run their BEGIN, COMMIT, and SAVEPOINT statements through
      // a different path from the body, so a change to one is invisible here
      // without a shape that exercises both.
      name: "transaction (1 INSERT)",
      unitsPerOperation: 1,
      unit: "transactions/s",
      effect: sql.withTransaction(
        sql.unsafe("INSERT INTO pgclient_benchmark (value) VALUES ($1::int4)", [1])
      ).pipe(Effect.map((rows) => rows.length + 1))
    },
    {
      name: "20 concurrent parameterized SELECTs",
      unitsPerOperation: 20,
      unit: "queries/s",
      effect: Effect.all(
        Array.from(
          { length: 20 },
          (_, index) => sql.unsafe("SELECT $1::int4 AS value", [index])
        ),
        { concurrency: "unbounded" }
      ).pipe(Effect.map((results) => results.flat().length))
    }
  ]

  // Open the pool and prepare the statements before Tinybench starts timing.
  for (const workload of workloads) {
    yield* workload.effect
  }

  for (const workload of workloads) {
    const bench = new Bench({
      iterations: 16,
      time: 2_000,
      warmupIterations: 8,
      warmupTime: 500,
      timestampProvider: "hrtimeNow"
    })

    bench.add(workload.name, async () => {
      const result = await Effect.runPromise(workload.effect)
      sink += result
    })

    yield* Effect.promise(() => bench.run())
    console.table(bench.table((task) => {
      const result = task.result
      if (result?.state !== "completed") {
        return { Workload: task.name, State: result?.state ?? "missing result" }
      }
      return {
        Workload: task.name,
        "operations/s": Math.round(result.throughput.mean),
        [workload.unit]: Math.round(result.throughput.mean * workload.unitsPerOperation),
        "latency (ms)": result.latency.mean.toFixed(3),
        RME: `${result.latency.rme.toFixed(2)}%`,
        Samples: result.latency.samplesCount
      }
    }))
  }
}).pipe(
  Effect.scoped,
  Effect.provide(Reactivity.layer)
)

try {
  const revision = execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim()
  // Results get compared across machines, and the container makes that
  // especially misleading off Linux, so every run says where it came from.
  console.log(
    `PgClient benchmark at ${revision} (${externalUrl === undefined ? "Testcontainers" : "external PostgreSQL"}${
      multiplex ? ", multiplex" : ""
    })`
  )
  console.log(
    `  ${process.platform}/${process.arch}, node ${process.versions.node}, ${cpus()[0]?.model ?? "unknown CPU"}`
  )
  await Effect.runPromise(run)
  if (sink === 0) throw new Error("Benchmark did not run")
} finally {
  await container?.stop()
}
