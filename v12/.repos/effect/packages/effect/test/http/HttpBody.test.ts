import { assert, it } from "@effect/vitest"
import { ByteSize, Effect, FileSystem, Stream } from "effect"
import { HttpBody } from "effect/http"

const maxSafe = BigInt(Number.MAX_SAFE_INTEGER)
const oversized = 9007199254740993n
const fileInfo = (size: bigint): FileSystem.File.Info => ({ size: ByteSize.bytes(size) }) as FileSystem.File.Info
const fromInfo = (size: bigint, options?: Parameters<typeof HttpBody.fileFromInfo>[2]) =>
  HttpBody.fileFromInfo("x", fileInfo(size), options).pipe(
    Effect.provideService(FileSystem.FileSystem, FileSystem.makeNoop({ stream: () => Stream.empty }))
  )

it.each([
  { name: "maximum safe final length", size: oversized, options: { offset: 2 }, expected: Number.MAX_SAFE_INTEGER },
  {
    name: "exact subtraction before clamping",
    size: oversized + 3n,
    options: { offset: oversized, bytesToRead: 4 },
    expected: 3
  },
  { name: "safe byte count on an oversized file", size: oversized, options: { bytesToRead: 2 }, expected: 2 },
  { name: "oversized byte count clamped to a small file", size: 6n, options: { bytesToRead: oversized }, expected: 6 },
  { name: "offset at EOF", size: 6n, options: { offset: 6 }, expected: 0 },
  { name: "offset past EOF", size: 6n, options: { offset: 7, bytesToRead: 2 }, expected: 0 },
  { name: "zero byte count", size: oversized, options: { bytesToRead: 0 }, expected: 0 }
])("fileFromInfo handles $name", async ({ expected, options, size }) => {
  const body = await Effect.runPromise(fromInfo(size, options))
  assert.strictEqual(body.contentLength, expected)
})

it.each([
  { name: "first unsafe final length", size: maxSafe + 1n, options: {} },
  {
    name: "unsafe length after applying both bounds",
    size: oversized + 3n,
    options: { offset: 1, bytesToRead: oversized }
  },
  // Bypass the input type to exercise runtime validation.
  { name: "malformed byte count", size: 6n, options: { bytesToRead: "garbage" as ByteSize.Input } },
  { name: "negative offset with zero bytes requested", size: 6n, options: { offset: -1n, bytesToRead: 0 } },
  { name: "negative byte count at EOF", size: 6n, options: { offset: 6, bytesToRead: -1 } },
  { name: "fractional offset", size: 6n, options: { offset: 1.5 } },
  { name: "non-finite byte count", size: 6n, options: { bytesToRead: Infinity } },
  { name: "unsafe numeric offset", size: 6n, options: { offset: Number.MAX_SAFE_INTEGER + 1 } },
  { name: "unsafe numeric byte count", size: 6n, options: { bytesToRead: Number.MAX_SAFE_INTEGER + 1 } }
])("fileFromInfo rejects $name with typed BadArgument", async ({ options, size }) => {
  const error = await Effect.runPromise(fromInfo(size, options).pipe(Effect.flip))
  assert.strictEqual(error._tag, "PlatformError")
  assert.strictEqual(error.reason._tag, "BadArgument")
  assert.strictEqual(error.reason.method, "fileFromInfo")
})

for (const constructor of ["file", "fileFromInfo"] as const) {
  it(`${constructor} defers range validation and filesystem access until evaluation`, async () => {
    let reads = 0
    let statCalls = 0
    const options = {
      get offset() {
        reads++
        // Bypass the input type to exercise deferred runtime validation.
        return "garbage" as ByteSize.Input
      }
    }
    // Construct outside Effect.gen so eager validation fails the test.
    const info = fileInfo(6n)
    const body = (constructor === "file" ? HttpBody.file("x", options) : HttpBody.fileFromInfo("x", info, options))
      .pipe(
        Effect.provideService(
          FileSystem.FileSystem,
          FileSystem.makeNoop({
            stat: () => {
              statCalls++
              return Effect.succeed(info)
            },
            stream: () => assert.fail("invalid ranges must fail before creating a stream")
          })
        )
      )
    assert.strictEqual(reads, 0)
    assert.strictEqual(statCalls, 0)
    const error = await Effect.runPromise(body.pipe(Effect.flip))
    assert.strictEqual(error._tag, "PlatformError")
    assert.strictEqual(error.reason._tag, "BadArgument")
    assert.strictEqual(error.reason.method, constructor)
    assert.isAbove(reads, 0)
    assert.strictEqual(statCalls, constructor === "file" ? 1 : 0)
  })
}

it("fileFromInfo preserves a small selected range and stream options", async () => {
  const options = { offset: "2 B", bytesToRead: ByteSize.bytes(2), contentType: "text/plain", chunkSize: 2 } as const
  const body = await Effect.runPromise(
    HttpBody.fileFromInfo("x", fileInfo(6n), options).pipe(
      Effect.provideService(
        FileSystem.FileSystem,
        FileSystem.makeNoop({
          stream: (path, range) => {
            assert.strictEqual(path, "x")
            assert.deepStrictEqual(range, options)
            return Stream.succeed(new Uint8Array([3, 4]))
          }
        })
      )
    )
  )
  const bytes = await Effect.runPromise(Stream.mkUint8Array(body.stream))
  assert.deepStrictEqual(Array.from(bytes), [3, 4])
  assert.strictEqual(body.contentLength, bytes.length)
  assert.strictEqual(body.contentType, "text/plain")
})

it("identifies HTTP body errors", () => {
  assert.isTrue(HttpBody.isHttpBodyError(new HttpBody.HttpBodyError({ reason: { _tag: "JsonError" } })))
  assert.isFalse(HttpBody.isHttpBodyError({ _tag: "HttpBodyError" }))
  assert.isFalse(HttpBody.isHttpBodyError(null))
})
