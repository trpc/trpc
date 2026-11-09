import { Effect, Exit, Schema } from "effect"
import { Rpc, RpcSerialization } from "effect/rpc"
import assert from "node:assert/strict"
import { cpus } from "node:os"
import { Bench } from "tinybench"

const User = Schema.Struct({
  id: Schema.String,
  displayName: Schema.String,
  email: Schema.String,
  active: Schema.Boolean,
  roles: Schema.Array(Schema.String)
})

const SearchUsers = Rpc.make("SearchUsers", {
  payload: Schema.Struct({
    organizationId: Schema.String,
    query: Schema.String,
    page: Schema.Number,
    pageSize: Schema.Number,
    filters: Schema.Struct({
      active: Schema.optional(Schema.Boolean),
      roles: Schema.Array(Schema.String)
    })
  }),
  success: Schema.Array(User),
  error: Schema.Struct({
    code: Schema.String,
    message: Schema.String
  })
})

const Event = Schema.Struct({
  sequence: Schema.Number,
  timestamp: Schema.Date,
  level: Schema.Literals(["info", "warning", "error"]),
  message: Schema.String,
  attributes: Schema.Record(Schema.String, Schema.String)
})

const searchPayload = {
  organizationId: "org-effect",
  query: "schema binary",
  page: 3,
  pageSize: 25,
  filters: {
    active: true,
    roles: ["maintainer", "contributor"]
  }
}

const users = Array.from({ length: 12 }, (_, index) => ({
  id: `user-${index.toString().padStart(3, "0")}`,
  displayName: `Benchmark User ${index}`,
  email: `benchmark-${index}@example.com`,
  active: index % 4 !== 0,
  roles: index % 3 === 0 ? ["maintainer", "contributor"] : ["contributor"]
}))

const makeEvent = (index: number) => ({
  sequence: index + 1,
  timestamp: new Date(1_756_000_000_000 + index * 1_000),
  level: index % 11 === 0 ? "warning" as const : "info" as const,
  message: `Processed RPC event ${index + 1}`,
  attributes: {
    region: ["eu-west-1", "us-east-1", "ap-southeast-2"][index % 3]!,
    worker: `worker-${index % 8}`,
    attempt: String(index % 3 + 1)
  }
})

const events = [
  makeEvent(0),
  ...Array.from({ length: 31 }, (_, index) => makeEvent(index + 1))
] satisfies Schema.NonEmptyArray<typeof Event>["Type"]

interface BenchmarkCase {
  readonly name: string
  readonly schema: Schema.Codec<unknown, unknown>
  readonly value: unknown
  readonly envelope: (hole: unknown) => unknown
  readonly hole: (envelope: unknown) => unknown
}

const getHole = (key: PropertyKey) => (envelope: unknown): unknown => {
  assert(typeof envelope === "object" && envelope !== null && key in envelope)
  return (envelope as Record<PropertyKey, unknown>)[key]
}

const cases: ReadonlyArray<BenchmarkCase> = [
  {
    name: "request / nested search payload",
    schema: SearchUsers.payloadSchema,
    value: searchPayload,
    envelope: (payload) => ({
      _tag: "Request",
      id: 1,
      tag: SearchUsers._tag,
      payload,
      headers: [
        ["authorization", "Bearer benchmark-token"],
        ["x-request-id", "benchmark-request-0001"]
      ],
      traceId: "0123456789abcdef0123456789abcdef",
      spanId: "0123456789abcdef",
      sampled: true
    }),
    hole: getHole("payload")
  },
  {
    name: "exit / 12-user success",
    schema: Rpc.exitSchema(SearchUsers),
    value: Exit.succeed(users),
    envelope: (exit) => ({
      _tag: "Exit",
      requestId: 1,
      exit
    }),
    hole: getHole("exit")
  },
  {
    name: "chunk / 32 events",
    schema: Schema.NonEmptyArray(Event),
    value: events,
    envelope: (values) => ({
      _tag: "Chunk",
      requestId: 1,
      values
    }),
    hole: getHole("values")
  }
]

const schemaBinary = Effect.runSync(
  RpcSerialization.RpcSerialization.pipe(Effect.provide(RpcSerialization.layerSchemaBinary()))
)

const formats = [
  { name: "NDJSON", serialization: RpcSerialization.ndjson },
  { name: "SchemaBinary", serialization: schemaBinary }
] as const

const warmupIterations = 500
const iterations = 5_000
// A serialization may carry state from one frame to the next, so the decode
// task walks a stream in order and never feeds the same frame twice.
const streamLength = warmupIterations + iterations + 1
// Frames a connection sends before its serialization has settled.
const warmupFrames = 8

interface Prepared {
  readonly caseName: string
  readonly formatName: string
  readonly firstFrameSize: number
  readonly steadyFrameSize: number
  readonly encode: () => unknown
  readonly decode: () => unknown
}

const toBytes = (encoded: Uint8Array | string | undefined): Uint8Array<ArrayBuffer> => {
  assert(encoded instanceof Uint8Array)
  return encoded.slice()
}

const prepared = cases.flatMap((testCase): ReadonlyArray<Prepared> =>
  formats.map(({ name, serialization }) => {
    const encodeHole = Schema.encodeUnknownSync(serialization.codecFor(testCase.schema))
    const decodeHole = Schema.decodeUnknownSync(serialization.codecFor(testCase.schema))
    // A binary serialization fills the hole with bytes; a JSON-shaped one fills
    // it with the value itself.
    const encodedHole = encodeHole(testCase.value)
    const hole = encodedHole instanceof Uint8Array ? encodedHole.slice() : encodedHole
    const encoder = serialization.makeUnsafe()
    const encode = () => encoder.encode(testCase.envelope(encodeHole(testCase.value)))
    const firstFrame = toBytes(encode())
    let steadyFrame = firstFrame
    for (let i = 0; i < warmupFrames; i++) steadyFrame = toBytes(encode())

    const streamWriter = serialization.makeUnsafe()
    const stream = Array.from(
      { length: streamLength },
      () => toBytes(streamWriter.encode(testCase.envelope(hole)) as Uint8Array)
    )
    let decoder = serialization.makeUnsafe()
    let index = 0
    const decode = () => {
      if (index === stream.length) {
        decoder = serialization.makeUnsafe()
        index = 0
      }
      const envelopes = decoder.decode(stream[index++])
      assert.strictEqual(envelopes.length, 1)
      return decodeHole(testCase.hole(envelopes[0]))
    }

    assert.deepStrictEqual(decode(), testCase.value)

    return {
      caseName: testCase.name,
      formatName: name,
      firstFrameSize: firstFrame.length,
      steadyFrameSize: steadyFrame.length,
      encode,
      decode
    }
  })
)

console.log(`${process.platform} ${process.arch}; ${cpus()[0]?.model ?? "unknown CPU"}; Node ${process.version}`)
console.log(
  "End-to-end operations include the payload codec plus RPC envelope framing; codec construction is excluded."
)
console.log("SchemaBinary fingerprints envelopes only and keeps every frame independently decodable.")
console.log(
  "First-frame sizes use a fresh serializer; steady sizes and throughput reuse one as on a long-lived connection, and decode walks a stream in frame order."
)
console.log(
  `${warmupIterations.toLocaleString()} warmup operations and ${iterations.toLocaleString()} measured operations per case, format, and direction.`
)

console.table(prepared.map((entry) => ({
  Case: entry.caseName,
  Format: entry.formatName,
  "First frame bytes": entry.firstFrameSize,
  "Steady frame bytes": entry.steadyFrameSize
})))

const bench = new Bench({
  iterations,
  time: 0,
  warmupIterations,
  warmupTime: 0,
  timestampProvider: "hrtimeNow"
})
const labels = new Map<string, {
  readonly caseName: string
  readonly formatName: string
  readonly direction: string
}>()
let sink: unknown

for (const entry of prepared) {
  for (const [direction, run] of [["encode", entry.encode], ["decode", entry.decode]] as const) {
    const name = `${entry.caseName} / ${entry.formatName} / ${direction}`
    labels.set(name, {
      caseName: entry.caseName,
      formatName: entry.formatName,
      direction
    })
    bench.add(name, () => {
      sink = run()
    })
  }
}

await bench.run()
assert.notStrictEqual(sink, undefined)

const ndjsonThroughput = new Map<string, number>()
for (const task of bench.tasks) {
  const label = labels.get(task.name)!
  if (label.formatName === "NDJSON" && task.result?.state === "completed") {
    ndjsonThroughput.set(`${label.caseName}/${label.direction}`, task.result.throughput.mean)
  }
}

console.table(bench.tasks.map((task) => {
  const label = labels.get(task.name)!
  const result = task.result
  if (result?.state === "errored") {
    return {
      Case: label.caseName,
      Format: label.formatName,
      Direction: label.direction,
      Error: result.error.message
    }
  }
  if (result?.state !== "completed") {
    return {
      Case: label.caseName,
      Format: label.formatName,
      Direction: label.direction,
      State: result?.state ?? "missing result"
    }
  }
  const baseline = ndjsonThroughput.get(`${label.caseName}/${label.direction}`)!
  return {
    Case: label.caseName,
    Format: label.formatName,
    Direction: label.direction,
    "Throughput avg (ops/s)": Math.round(result.throughput.mean),
    "vs NDJSON": `${(result.throughput.mean / baseline).toFixed(2)}x`,
    "Latency med (us/op)": (result.latency.p50 * 1_000).toFixed(2),
    "Latency RME": `${result.latency.rme.toFixed(2)}%`,
    Samples: result.latency.samplesCount
  }
}))
