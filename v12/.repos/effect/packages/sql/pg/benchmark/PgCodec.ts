import * as PgProtocol from "@effect/sql-pg/PgProtocol"
import * as PgTypes from "@effect/sql-pg/PgTypes"
import * as Result from "effect/Result"
import assert from "node:assert/strict"
import { Buffer } from "node:buffer"
import postgres from "postgres"
import { Bench } from "tinybench"

const postgresSql = postgres({ max: 0 })
const postgresSerializers = postgresSql.options.serializers
const postgresParsers = postgresSql.options.parsers

const success = <A, E>(result: Result.Result<A, E>): A => {
  if (Result.isFailure(result)) throw result.failure
  return result.success
}

const makeParameter = (oid: number, value: unknown): PgTypes.Parameter => {
  const parameter = { oid, value } as PgTypes.Parameter
  Object.defineProperty(parameter, PgTypes.ParameterTypeId, { value: PgTypes.ParameterTypeId })
  return parameter
}

const jsonValue = { active: true, tags: ["effect", "postgres"] }
const byteaValue = Uint8Array.from({ length: 32 }, (_, index) => index)

const payload = [
  { oid: PgTypes.OID.int4, value: 42, text: "42" },
  { oid: PgTypes.OID.bool, value: true, text: "t" },
  { oid: PgTypes.OID.float8, value: 1234.5, text: "1234.5" },
  { oid: PgTypes.OID.text, value: "codec benchmark: hello \\ world", text: "codec benchmark: hello \\ world" },
  { oid: PgTypes.OID.jsonb, value: jsonValue, text: JSON.stringify(jsonValue) },
  { oid: PgTypes.OID.bytea, value: byteaValue, text: `\\x${Buffer.from(byteaValue).toString("hex")}` }
] as const

const effectEncoded = payload.map(({ oid, value }) => success(PgTypes.encode(value, oid)))
const postgresTextParsers = payload.map(({ oid }) => postgresParsers[oid] ?? ((value: string) => value))

const encodeEffect = () => payload.map(({ oid, value }) => success(PgTypes.encode(value, oid)))
const encodePostgresJs = () => payload.map(({ oid, value }) => postgresSerializers[oid]?.(value) ?? String(value))

const decodeEffect = () => payload.map(({ oid }, index) => success(PgTypes.decode(effectEncoded[index], oid, 1)))
const decodePostgresJs = () => payload.map(({ text }, index) => postgresTextParsers[index](text))

const normalize = (values: ReadonlyArray<unknown>) =>
  values.map((value) => value instanceof Uint8Array ? Array.from(value) : value)

assert.deepStrictEqual(normalize(decodeEffect()), normalize(decodePostgresJs()))

const makeDataRow = (fields: ReadonlyArray<string | Uint8Array>): Uint8Array => {
  const encoded = fields.map((field) => typeof field === "string" ? Buffer.from(field, "utf8") : Buffer.from(field))
  const length = 4 + 2 + encoded.reduce((total, field) => total + 4 + field.length, 0)
  const frame = Buffer.allocUnsafe(1 + length)
  frame[0] = 0x44
  frame.writeInt32BE(length, 1)
  frame.writeInt16BE(encoded.length, 5)
  let offset = 7
  for (const field of encoded) {
    frame.writeInt32BE(field.length, offset)
    offset += 4
    field.copy(frame, offset)
    offset += field.length
  }
  return frame
}

const rowsPerParserRun = 100
const dataRow = makeDataRow(payload.map(({ text }) => text))
const parserPayload = new Uint8Array(dataRow.length * rowsPerParserRun)
for (let index = 0; index < rowsPerParserRun; index++) {
  parserPayload.set(dataRow, index * dataRow.length)
}
const parserChunks = Array.from(
  { length: Math.ceil(parserPayload.length / 64) },
  (_, index) => parserPayload.subarray(index * 64, (index + 1) * 64)
)
const effectSingleParser = PgProtocol.makeParser()
const effectChunkedParser = PgProtocol.makeParser()

const parseEffectSingle = () => effectSingleParser.push(parserPayload).length
const parseEffectChunked = () => {
  let count = 0
  for (const chunk of parserChunks) {
    count += effectChunkedParser.push(chunk).length
  }
  return count
}
assert.equal(parseEffectSingle(), rowsPerParserRun)
assert.equal(parseEffectChunked(), rowsPerParserRun)

// End to end: JavaScript values in, a complete Bind frame out. This is the
// comparison the type-encode table cannot make because it includes framing.

const bindEffect = () =>
  success(PgProtocol.encodeBind({
    portal: "",
    statement: "s1",
    parameters: payload.map(({ oid, value }) => success(PgTypes.encode(value, oid)))
  }))

// The same job with the values written straight into the frame, which is what
// a client should use: no array per parameter, no copy out of one.
const bindParameters = payload.map(({ oid, value }) => makeParameter(oid, value))
const encodeBindFused = PgProtocol.makeBindEncoder(PgTypes.writeParameter)
const bindEffectFused = () => success(encodeBindFused({ portal: "", statement: "s1", parameters: bindParameters }))

// Array parameters, where the win is much larger: every element used to be
// encoded into an array of its own before being copied into the frame.
const arrayRow = [
  makeParameter(PgTypes.OID.int4Array, Array.from({ length: 16 }, (_, index) => index)),
  makeParameter(PgTypes.OID.textArray, Array.from({ length: 8 }, (_, index) => `tag-${index}`))
]
const bindArrayEffectFused = () => success(encodeBindFused({ portal: "", statement: "s2", parameters: arrayRow }))
const bindArrayEffect = () =>
  success(PgProtocol.encodeBind({
    portal: "",
    statement: "s2",
    parameters: arrayRow.map((parameter) => success(PgTypes.encodeParameter(parameter)))
  }))
// End to end: DataRow frames in, JavaScript values out. Each library reads its
// own wire format, so the frames the binary codec sees carry binary fields.
const binaryDataRow = makeDataRow(effectEncoded)
const binaryRowsPayload = new Uint8Array(binaryDataRow.length * rowsPerParserRun)
for (let index = 0; index < rowsPerParserRun; index++) {
  binaryRowsPayload.set(binaryDataRow, index * binaryDataRow.length)
}

// Fields read through the field reader are plain array reads, so unlike the
// codec calls the other suites make they need somewhere to land to survive.
let fieldSink: unknown

// The same rows read through a parser that decodes each field where it lies,
// with no view per column. This is what a client should use: the view is a
// fixed cost per field, so it dominates exactly when the columns are cheap.
const binaryColumns = payload.map(({ oid }) => ({ dataTypeOid: oid, format: 1 }))
const fusedRowParser = PgProtocol.makeParser({ readField: success(PgTypes.makeFieldReader(binaryColumns)) })

const decodeRowsFused = () => {
  let count = 0
  for (const message of fusedRowParser.push(binaryRowsPayload)) {
    if (message._tag !== "DataRow") continue
    for (let index = 0; index < message.values.length; index++) {
      fieldSink = message.values[index]
    }
    count++
  }
  return count
}

// A wide row of cheap columns, where the view per field is most of the work.
const wideColumnCount = 20
const wideOid = PgTypes.OID.int4
const wideEncoded = Array.from(
  { length: wideColumnCount },
  (_, index) => success(PgTypes.encode(index * 7, wideOid))
)
const wideRow = makeDataRow(wideEncoded)
const wideRowsPayload = new Uint8Array(wideRow.length * rowsPerParserRun)
for (let index = 0; index < rowsPerParserRun; index++) {
  wideRowsPayload.set(wideRow, index * wideRow.length)
}
const wideParser = PgProtocol.makeParser()
const wideFusedParser = PgProtocol.makeParser({
  readField: success(PgTypes.makeFieldReader(wideEncoded.map(() => ({ dataTypeOid: wideOid, format: 1 }))))
})

const decodeWideRows = () => {
  let count = 0
  for (const message of wideParser.push(wideRowsPayload)) {
    if (message._tag !== "DataRow") continue
    for (let index = 0; index < message.values.length; index++) {
      const field = message.values[index]
      if (field !== null) fieldSink = success(PgTypes.decode(field, wideOid, 1))
    }
    count++
  }
  return count
}

const decodeWideRowsFused = () => {
  let count = 0
  for (const message of wideFusedParser.push(wideRowsPayload)) {
    if (message._tag !== "DataRow") continue
    for (let index = 0; index < message.values.length; index++) {
      fieldSink = message.values[index]
    }
    count++
  }
  return count
}

const effectRowParser = PgProtocol.makeParser()
const decodeRowsEffect = () => {
  let count = 0
  for (const message of effectRowParser.push(binaryRowsPayload)) {
    if (message._tag !== "DataRow") continue
    for (let index = 0; index < message.values.length; index++) {
      const field = message.values[index]
      if (field !== null) success(PgTypes.decode(field, payload[index].oid, 1))
    }
    count++
  }
  return count
}

assert.equal(decodeRowsEffect(), rowsPerParserRun)
assert.equal(decodeRowsFused(), rowsPerParserRun)
assert.equal(decodeWideRows(), rowsPerParserRun)
assert.equal(decodeWideRowsFused(), rowsPerParserRun)
assert.ok(bindEffect().length > 0)
assert.deepStrictEqual(Array.from(bindEffectFused()), Array.from(bindEffect()))
assert.deepStrictEqual(Array.from(bindArrayEffectFused()), Array.from(bindArrayEffect()))

// Arrays are the one place a value's cost is paid per element, so they get a
// suite of their own.
const int4ArrayLength = 16
const int4ArrayValue = Array.from({ length: int4ArrayLength }, (_, index) => index * 1000)
const int4ArrayEncoded = success(PgTypes.encode(int4ArrayValue, PgTypes.OID.int4Array))
// postgres.js has no array parser to compare against: it leaves array columns
// as their text.
const decodeArrayEffect = () => success(PgTypes.decode(int4ArrayEncoded, PgTypes.OID.int4Array, 1))

assert.deepStrictEqual(decodeArrayEffect(), int4ArrayValue)

// Column names are the one place the parser decodes text, and the existing
// payload has none: every field of a `DataRow` stays raw bytes.
const columnNames = ["id", "email", "created_at", "balance", "metadata", "is_active"]
const makeRowDescription = (names: ReadonlyArray<string>): Uint8Array => {
  const encoded = names.map((name) => Buffer.from(name, "utf8"))
  const length = 4 + 2 + encoded.reduce((total, name) => total + name.length + 1 + 18, 0)
  const frame = Buffer.allocUnsafe(1 + length)
  frame[0] = 0x54
  frame.writeInt32BE(length, 1)
  frame.writeInt16BE(names.length, 5)
  let offset = 7
  for (const name of encoded) {
    name.copy(frame, offset)
    offset += name.length
    frame[offset++] = 0
    frame.writeInt32BE(0, offset)
    frame.writeInt16BE(0, offset + 4)
    frame.writeInt32BE(23, offset + 6)
    frame.writeInt16BE(4, offset + 10)
    frame.writeInt32BE(-1, offset + 12)
    frame.writeInt16BE(1, offset + 16)
    offset += 18
  }
  return frame
}

const descriptionsPerRun = 100
const rowDescription = makeRowDescription(columnNames)
const descriptionPayload = new Uint8Array(rowDescription.length * descriptionsPerRun)
for (let index = 0; index < descriptionsPerRun; index++) {
  descriptionPayload.set(rowDescription, index * rowDescription.length)
}
const effectDescriptionParser = PgProtocol.makeParser()
const parseDescriptionEffect = () => effectDescriptionParser.push(descriptionPayload).length

assert.equal(parseDescriptionEffect(), descriptionsPerRun)

// `numeric` is the one builtin whose text is built a digit group at a time, and
// the existing payload has no column of that type either.
// Neither `pg` nor postgres.js has anything to compare against here: both hand
// back the text PostgreSQL sent without looking at it, while the binary codec
// has to build that text out of base-10000 digit groups.
const numericValues = ["0.00", "12345.6789", "-1", "9".repeat(20) + "." + "1".repeat(10), "NaN"]
const numericEncoded = numericValues.map((value) => success(PgTypes.encode(value, PgTypes.OID.numeric)))
const decodeNumericEffect = () => numericEncoded.map((bytes) => success(PgTypes.decode(bytes, PgTypes.OID.numeric, 1)))

assert.deepStrictEqual(decodeNumericEffect(), numericValues)

const codecRowsPerRun = 100
let sink: unknown

const batch = (run: () => unknown, rows = codecRowsPerRun) => () => {
  let value: unknown
  for (let index = 0; index < rows; index++) {
    value = run()
  }
  sink = value
}

const options = {
  iterations: 64,
  time: 1_000,
  warmupIterations: 16,
  warmupTime: 250,
  timestampProvider: "hrtimeNow" as const
}

const runSuite = async (
  name: string,
  rowsPerRun: number,
  tasks: ReadonlyArray<readonly [name: string, run: () => unknown]>,
  shape = `${payload.length} columns per row`
) => {
  const bench = new Bench(options)
  for (const [taskName, run] of tasks) {
    bench.add(taskName, run)
  }
  await bench.run()
  console.log(`\n${name} (${shape})`)
  console.table(bench.table((task) => {
    const result = task.result
    if (result?.state !== "completed") {
      return { Implementation: task.name, State: result?.state ?? "missing result" }
    }
    return {
      Implementation: task.name,
      "Rows/s": Math.round(result.throughput.mean * rowsPerRun),
      "Latency (ns/row)": (result.latency.mean * 1_000_000 / rowsPerRun).toFixed(2),
      RME: `${result.latency.rme.toFixed(2)}%`,
      Samples: result.latency.samplesCount
    }
  }))
}

await runSuite("type encode", codecRowsPerRun, [
  ["@effect/sql-pg binary", batch(encodeEffect)],
  ["postgres.js text", batch(encodePostgresJs)]
])

await runSuite("type decode", codecRowsPerRun, [
  ["@effect/sql-pg binary", batch(decodeEffect)],
  ["postgres.js text", batch(decodePostgresJs)]
])

await runSuite("int4[] decode", codecRowsPerRun, [
  ["@effect/sql-pg binary", batch(decodeArrayEffect)]
], `${int4ArrayLength} elements per array`)

await runSuite("Bind frame from JavaScript values", codecRowsPerRun, [
  ["@effect/sql-pg binary, value sink", batch(bindEffectFused)],
  ["@effect/sql-pg binary, encoded parameters", batch(bindEffect)]
])

await runSuite(
  "Bind frame from array parameters",
  codecRowsPerRun,
  [
    ["@effect/sql-pg binary, value sink", batch(bindArrayEffectFused)],
    ["@effect/sql-pg binary, encoded parameters", batch(bindArrayEffect)]
  ],
  "int4[16] and text[8] per row"
)

await runSuite("DataRow frames to JavaScript values", rowsPerParserRun, [
  ["@effect/sql-pg binary, field reader", decodeRowsFused],
  ["@effect/sql-pg binary, view per field", decodeRowsEffect]
])

await runSuite("DataRow frames to JavaScript values, wide rows", rowsPerParserRun, [
  ["@effect/sql-pg binary, field reader", decodeWideRowsFused],
  ["@effect/sql-pg binary, view per field", decodeWideRows]
], `${wideColumnCount} int4 columns per row`)

await runSuite("numeric decode", codecRowsPerRun, [
  ["@effect/sql-pg binary", batch(decodeNumericEffect)]
], `${numericValues.length} values per row`)

await runSuite("protocol RowDescription parser", descriptionsPerRun, [
  ["@effect/sql-pg", parseDescriptionEffect]
], `${columnNames.length} columns per description`)

await runSuite("protocol DataRow parser, one chunk", rowsPerParserRun, [
  ["@effect/sql-pg", parseEffectSingle]
])

await runSuite("protocol DataRow parser, 64-byte chunks", rowsPerParserRun, [
  ["@effect/sql-pg", parseEffectChunked]
])

if (sink === undefined || fieldSink === undefined) {
  throw new Error("Benchmark did not run")
}

await postgresSql.end()
