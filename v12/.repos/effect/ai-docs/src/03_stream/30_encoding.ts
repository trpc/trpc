/**
 * @title Decoding and encoding streams
 *
 * Use `Stream.pipeThroughChannel` with the `Ndjson` and `SchemaBinary` modules to
 * decode and encode streams of structured data.
 */
import { DateTime, Schema, Stream } from "effect"
import { Ndjson, SchemaBinary } from "effect/encoding"

// SchemaBinary derives a framed binary decoder directly from a schema.
export const schemaBinaryDecoder = SchemaBinary.decode(Schema.Struct({
  id: Schema.Int,
  name: Schema.String
}))()

// ---------------------------------------------------------------------------
// Domain
// ---------------------------------------------------------------------------

// A log entry schema representing structured log events. In practice these
// would come from a file, HTTP body, or socket connection.
// `DateTimeUtcFromString` decodes an ISO-8601 string into a `DateTime.Utc`.
class LogEntry extends Schema.Class<LogEntry>("LogEntry")({
  timestamp: Schema.DateTimeUtcFromString,
  level: Schema.Literals(["info", "warn", "error"]),
  message: Schema.String
}) {}

// ---------------------------------------------------------------------------
// Decoding NDJSON strings → objects
// ---------------------------------------------------------------------------

// Suppose we receive raw NDJSON text from a file or network socket.
// `Ndjson.decodeString()` is a Channel that splits incoming strings on
// newlines and `JSON.parse`s each line.
// Pipe the stream through the channel with `Stream.pipeThroughChannel`.
export const decodeUntyped = Stream.make(
  "{\"timestamp\":\"2025-06-01T00:00:00Z\",\"level\":\"info\",\"message\":\"start\"}\n" +
    "{\"timestamp\":\"2025-06-01T00:00:01Z\",\"level\":\"error\",\"message\":\"oops\"}\n"
).pipe(
  Stream.pipeThroughChannel(Ndjson.decodeString()),
  Stream.runCollect
)

// When you need schema validation on top of the raw JSON parse, use
// `Ndjson.decodeSchemaString(Schema)()`. This decodes each line, parses the
// JSON, and then validates each value against the schema — all in one channel.
export const decodeTyped = Stream.make(
  "{\"timestamp\":\"2025-06-01T00:00:00Z\",\"level\":\"info\",\"message\":\"start\"}\n" +
    "{\"timestamp\":\"2025-06-01T00:00:01Z\",\"level\":\"error\",\"message\":\"oops\"}\n"
).pipe(
  Stream.pipeThroughChannel(Ndjson.decodeSchemaString(LogEntry)()),
  Stream.runCollect
)

// ---------------------------------------------------------------------------
// Encoding objects → NDJSON strings
// ---------------------------------------------------------------------------

// `Ndjson.encodeString()` serialises each value to a JSON line.
// The resulting stream emits ready-to-write NDJSON strings.
export const encodeUntyped = Stream.make(
  { timestamp: "2025-06-01T00:00:00Z", level: "info", message: "start" },
  { timestamp: "2025-06-01T00:00:01Z", level: "error", message: "oops" }
).pipe(
  Stream.pipeThroughChannel(Ndjson.encodeString()),
  Stream.runCollect
)

// `Ndjson.encodeSchemaString(Schema)()` encodes each value through the schema
// first (applying any transformations such as date formatting), then
// serialises it to an NDJSON line.
export const encodeTyped = Stream.make(
  new LogEntry({
    timestamp: DateTime.makeUnsafe("2025-06-01T00:00:00Z"),
    level: "info",
    message: "start"
  }),
  new LogEntry({
    timestamp: DateTime.makeUnsafe("2025-06-01T00:00:01Z"),
    level: "error",
    message: "oops"
  })
).pipe(
  Stream.pipeThroughChannel(Ndjson.encodeSchemaString(LogEntry)()),
  Stream.runCollect
)

// ---------------------------------------------------------------------------
// Binary (Uint8Array) variants
// ---------------------------------------------------------------------------

// When working with binary I/O (e.g. TCP sockets, file descriptors) use the
// non-string variants. `Ndjson.decode()` expects `Uint8Array` chunks and
// handles text decoding internally. `Ndjson.encode()` produces `Uint8Array`
// output.
const enc = new TextEncoder()

export const decodeBinary = Stream.make(
  enc.encode("{\"level\":\"info\",\"message\":\"binary\"}\n")
).pipe(
  Stream.pipeThroughChannel(Ndjson.decode()),
  Stream.runCollect
)

export const encodeBinary = Stream.make(
  { level: "info", message: "binary" }
).pipe(
  Stream.pipeThroughChannel(Ndjson.encode()),
  Stream.runCollect
)

// ---------------------------------------------------------------------------
// Handling empty lines
// ---------------------------------------------------------------------------

// NDJSON files sometimes contain blank lines (e.g. trailing newlines or
// pretty-printed output). Pass `{ ignoreEmptyLines: true }` to skip them
// instead of raising an `NdjsonError`.
export const decodeIgnoringBlanks = Stream.make(
  "{\"ok\":true}\n\n{\"ok\":false}\n"
).pipe(
  Stream.pipeThroughChannel(Ndjson.decodeString({ ignoreEmptyLines: true })),
  Stream.runCollect
)

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

// `Ndjson.NdjsonError` is raised when encoding (`kind: "Pack"`) or decoding
// (`kind: "Unpack"`) fails. You can catch it with `Stream.catchTag` or
// `Effect.catchTag`.
export const handleDecodeErrors = Stream.make("not-valid-json\n").pipe(
  Stream.pipeThroughChannel(Ndjson.decodeString()),
  Stream.catchTag("NdjsonError", (err) =>
    // The `kind` field indicates whether the error occurred during
    // encoding ("Pack") or decoding ("Unpack"), and `cause` contains
    // the underlying exception.
    Stream.succeed({ recovered: true, kind: err.kind })),
  Stream.runCollect
)

// ---------------------------------------------------------------------------
// Realistic pipeline: decode → transform → re-encode
// ---------------------------------------------------------------------------

// A common pattern is to read NDJSON, transform each record, and write it
// back as NDJSON. This example filters error-level log entries and re-encodes
// them.
const ndjsonInput = "{\"timestamp\":\"2025-06-01T00:00:00Z\",\"level\":\"info\",\"message\":\"ok\"}\n" +
  "{\"timestamp\":\"2025-06-01T00:00:01Z\",\"level\":\"error\",\"message\":\"fail\"}\n" +
  "{\"timestamp\":\"2025-06-01T00:00:02Z\",\"level\":\"warn\",\"message\":\"slow\"}\n"

export const filterAndReencode = Stream.make(ndjsonInput).pipe(
  // Decode each line into a validated LogEntry
  Stream.pipeThroughChannel(Ndjson.decodeSchemaString(LogEntry)()),
  // Keep only error-level entries
  Stream.filter((entry) => entry.level === "error"),
  // Re-encode the filtered entries back to NDJSON strings
  Stream.pipeThroughChannel(Ndjson.encodeSchemaString(LogEntry)()),
  Stream.runCollect
)
