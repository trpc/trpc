import type * as BunFileSystem from "@effect/platform-bun/BunFileSystem"
import * as BunHttpPlatform from "@effect/platform-bun/BunHttpPlatform"
import { assert, describe, it } from "@effect/vitest"
import * as ByteSize from "effect/ByteSize"
import * as Effect from "effect/Effect"
import type * as HttpBody from "effect/http/HttpBody"
import * as HttpPlatform from "effect/http/HttpPlatform"
import * as HttpServerResponse from "effect/http/HttpServerResponse"
import { afterEach, beforeEach, vi } from "vitest"

const readBody = (body: HttpBody.HttpBody) => {
  assert.strictEqual(body._tag, "Raw")
  return Effect.promise(() => new Response((body as HttpBody.Raw).body as BodyInit).text())
}

// Bun sets Content-Length when sending the raw file, so inspect the HTTP response.
const readResponse = (response: HttpServerResponse.HttpServerResponse) =>
  Effect.acquireUseRelease(
    Effect.sync(() =>
      Bun.serve({
        hostname: "127.0.0.1",
        port: 0,
        fetch: () => HttpServerResponse.toWeb(response)
      })
    ),
    (server) =>
      Effect.promise(async (signal) => {
        const response = await fetch(server.url, { signal })
        return { contentLength: response.headers.get("content-length"), body: await response.text() }
      }),
    (server) =>
      Effect.promise(async () => {
        await server.stop(true)
      })
  )

describe("BunHttpPlatform", { concurrent: false }, () => {
  for (
    const { name, offset, bytesToRead, expected } of [
      { name: "clamps bytesToRead beyond EOF", offset: 1, bytesToRead: 10, expected: "bcd" },
      { name: "returns an empty body at EOF", offset: 4, bytesToRead: undefined, expected: "" },
      { name: "returns an empty body past EOF", offset: 9, bytesToRead: undefined, expected: "" },
      { name: "clamps bytesToRead at EOF", offset: 4, bytesToRead: 10, expected: "" },
      { name: "clamps bytesToRead past EOF", offset: 9, bytesToRead: 10, expected: "" }
    ]
  ) {
    it.effect(`fileWebResponse ${name}`, () =>
      Effect.gen(function*() {
        const platform = yield* HttpPlatform.HttpPlatform
        const file = new File(["abcd"], "file.txt", { type: "text/plain", lastModified: 0 })
        const response = yield* platform.fileWebResponse(file, { offset, bytesToRead })
        assert.deepStrictEqual(
          yield* readResponse(response),
          { contentLength: String(expected.length), body: expected }
        )
      }).pipe(Effect.provide(BunHttpPlatform.layer)))
  }

  for (
    const { name, offsetFromEnd, bytesToRead } of [
      { name: "clamps bytesToRead beyond EOF", offsetFromEnd: -5, bytesToRead: 100 },
      { name: "returns an empty body at EOF", offsetFromEnd: 0, bytesToRead: undefined },
      { name: "returns an empty body past EOF", offsetFromEnd: 5, bytesToRead: undefined },
      { name: "clamps bytesToRead at EOF", offsetFromEnd: 0, bytesToRead: 100 },
      { name: "clamps bytesToRead past EOF", offsetFromEnd: 5, bytesToRead: 100 }
    ]
  ) {
    it.effect(`fileResponse ${name}`, () =>
      Effect.gen(function*() {
        const platform = yield* HttpPlatform.HttpPlatform
        const file = Bun.file(import.meta.filename)
        const contents = yield* Effect.promise(() => file.text())
        const expected = offsetFromEnd < 0 ? contents.slice(offsetFromEnd) : ""
        const response = yield* platform.fileResponse(import.meta.filename, {
          offset: ByteSize.bytes(file.size + offsetFromEnd),
          bytesToRead: bytesToRead === undefined ? undefined : ByteSize.bytes(bytesToRead)
        })
        assert.deepStrictEqual(
          yield* readResponse(response),
          { contentLength: String(expected.length), body: expected }
        )
      }).pipe(Effect.provide(BunHttpPlatform.layer)))
  }

  it.effect("fileWebResponse honors offset and bytesToRead including zero", () =>
    Effect.gen(function*() {
      const platform = yield* HttpPlatform.HttpPlatform
      const file = new File(["abcd"], "file.txt", { type: "text/plain", lastModified: 0 })
      const sliced = yield* platform.fileWebResponse(file, { offset: 1, bytesToRead: 2 })
      const empty = yield* platform.fileWebResponse(file, { offset: 1, bytesToRead: 0 })

      assert.deepStrictEqual(
        { sliced: yield* readBody(sliced.body), empty: yield* readBody(empty.body) },
        { sliced: "bc", empty: "" }
      )
    }).pipe(Effect.provide(BunHttpPlatform.layer)))

  it.effect("fileResponse supports exact and empty ranges", () =>
    Effect.gen(function*() {
      const platform = yield* HttpPlatform.HttpPlatform
      const exact = yield* platform.fileResponse(import.meta.filename, {
        bytesToRead: ByteSize.bytes(6)
      })
      const empty = yield* platform.fileResponse(import.meta.filename, {
        offset: ByteSize.bytes(1),
        bytesToRead: ByteSize.zero
      })

      assert.deepStrictEqual(
        { exact: yield* readBody(exact.body), empty: yield* readBody(empty.body) },
        { exact: "import", empty: "" }
      )
    }).pipe(Effect.provide(BunHttpPlatform.layer)))
})

const precision = vi.hoisted(() => ({ enabled: false }))

vi.mock("@effect/platform-bun/BunFileSystem", async (importOriginal) => {
  const original = await importOriginal<typeof BunFileSystem>()
  const { Layer, Effect } = await import("effect")
  const { fileSystemLayer } = await import("../../node-shared/test/HttpPlatform.test-utils.ts")
  return { layer: Layer.unwrap(Effect.sync(() => precision.enabled ? fileSystemLayer : original.layer)) }
})

describe("BunHttpPlatform precision", { concurrent: false }, () => {
  const slice = vi.fn((_start?: number, _end?: number) => new Blob([]))

  beforeEach(() => {
    precision.enabled = true
    slice.mockClear()
    vi.spyOn(Bun, "file").mockReturnValue({ slice } as unknown as ReturnType<typeof Bun.file>)
  })
  afterEach(() => {
    precision.enabled = false
    vi.restoreAllMocks()
  })

  it.effect("passes a safe range to the runtime with the correct end bound", () =>
    Effect.gen(function*() {
      const maxSafe = Number.MAX_SAFE_INTEGER
      const platform = yield* HttpPlatform.HttpPlatform
      yield* platform.fileResponse("precision.bin", { offset: maxSafe - 1, bytesToRead: 1 })
      assert.deepStrictEqual(slice.mock.calls, [[maxSafe - 1, maxSafe]])
    }).pipe(Effect.provide(BunHttpPlatform.layer)))

  it.effect("serves a whole oversized file without slicing it", () =>
    Effect.gen(function*() {
      const platform = yield* HttpPlatform.HttpPlatform
      const response = yield* platform.fileResponse("precision.bin")
      assert.strictEqual(response.status, 200)
      assert.strictEqual(response.headers["content-length"], "9007199254740993")
      assert.strictEqual(response.body._tag, "Raw")
      if (response.body._tag === "Raw") {
        assert.strictEqual(response.body.body, vi.mocked(Bun.file).mock.results[0].value)
      }
      assert.strictEqual(vi.mocked(Bun.file).mock.calls.length, 1)
      assert.deepStrictEqual(slice.mock.calls, [])
    }).pipe(Effect.provide(BunHttpPlatform.layer)))
})
