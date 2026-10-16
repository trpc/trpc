import * as NodeHttpPlatform from "@effect/platform-node/NodeHttpPlatform"
import { assert, describe, it } from "@effect/vitest"
import * as ByteSize from "effect/ByteSize"
import * as Effect from "effect/Effect"
import * as Etag from "effect/http/Etag"
import * as HttpPlatform from "effect/http/HttpPlatform"
import * as HttpServerResponse from "effect/http/HttpServerResponse"
import * as Layer from "effect/Layer"
import * as Fs from "node:fs"
import { Readable } from "node:stream"
import { afterEach, beforeEach, vi } from "vitest"
import { fileSystemLayer } from "../../node-shared/test/HttpPlatform.test-utils.ts"

const readResponse = (response: HttpServerResponse.HttpServerResponse) =>
  Effect.promise(() => HttpServerResponse.toWeb(response).text())

describe("NodeHttpPlatform", { concurrent: false }, () => {
  it.effect("fileWebResponse prefers File.type over the extension", () =>
    Effect.gen(function*() {
      const platform = yield* HttpPlatform.HttpPlatform
      const response = yield* platform.fileWebResponse(new File([], "script.js", { type: "application/custom" }))
      assert.strictEqual(response.headers["content-type"], "application/custom")
    }).pipe(Effect.provide(NodeHttpPlatform.layer)))

  it.effect("fileResponse reads exact bytesToRead", () =>
    Effect.gen(function*() {
      const platform = yield* HttpPlatform.HttpPlatform
      const response = yield* platform.fileResponse(`${__dirname}/fixtures/text.txt`, {
        offset: ByteSize.bytes(6),
        bytesToRead: ByteSize.bytes(5)
      })

      assert.strictEqual(response.headers["content-length"], "5")
      assert.strictEqual(response.headers["content-type"], "text/plain")
      const text = yield* readResponse(response)
      assert.strictEqual(text, "ipsum")
    }).pipe(Effect.provide(NodeHttpPlatform.layer)))

  for (
    const { name, offset, bytesToRead, expected } of [
      { name: "clamps bytesToRead beyond EOF", offset: 22, bytesToRead: 100, expected: "amet\n" },
      { name: "returns an empty body at EOF", offset: 27, bytesToRead: undefined, expected: "" },
      { name: "returns an empty body past EOF", offset: 50, bytesToRead: undefined, expected: "" },
      { name: "clamps bytesToRead at EOF", offset: 27, bytesToRead: 100, expected: "" },
      { name: "clamps bytesToRead past EOF", offset: 50, bytesToRead: 100, expected: "" }
    ]
  ) {
    it.effect(`fileResponse ${name}`, () =>
      Effect.gen(function*() {
        const platform = yield* HttpPlatform.HttpPlatform
        const response = yield* platform.fileResponse(`${__dirname}/fixtures/text.txt`, {
          offset: ByteSize.bytes(offset),
          bytesToRead: bytesToRead === undefined ? undefined : ByteSize.bytes(bytesToRead)
        })

        const text = yield* readResponse(response)
        assert.deepStrictEqual(
          { contentLength: response.headers["content-length"], body: text },
          { contentLength: String(expected.length), body: expected }
        )
      }).pipe(Effect.provide(NodeHttpPlatform.layer)))
  }

  it.effect("fileResponse supports zero bytesToRead", () =>
    Effect.gen(function*() {
      const platform = yield* HttpPlatform.HttpPlatform
      const response = yield* platform.fileResponse(`${__dirname}/fixtures/text.txt`, {
        offset: ByteSize.bytes(6),
        bytesToRead: ByteSize.zero
      })

      assert.strictEqual(response.headers["content-length"], "0")
      const text = yield* readResponse(response)
      assert.strictEqual(text, "")
    }).pipe(Effect.provide(NodeHttpPlatform.layer)))

  it.effect("fileWebResponse looks up content types case-insensitively", () =>
    Effect.gen(function*() {
      const platform = yield* HttpPlatform.HttpPlatform
      const response = yield* platform.fileWebResponse(new File(["<h1>Effect</h1>"], "INDEX.HTML"))

      assert.strictEqual(response.headers["content-type"], "text/html")
    }).pipe(Effect.provide(NodeHttpPlatform.layer)))
})

vi.mock("node:fs", async (importOriginal) => {
  const original = await importOriginal<typeof Fs>()
  return { ...original, createReadStream: vi.fn(original.createReadStream) }
})

describe("NodeHttpPlatform precision", { concurrent: false }, () => {
  beforeEach(() => {
    vi.mocked(Fs.createReadStream).mockImplementation(() => Readable.from([]) as Fs.ReadStream)
  })
  afterEach(() => {
    vi.mocked(Fs.createReadStream).mockReset()
  })

  const layer = Layer.effect(HttpPlatform.HttpPlatform)(NodeHttpPlatform.make).pipe(
    Layer.provide(fileSystemLayer),
    Layer.provide(Etag.layer)
  )

  it.effect("passes a safe range to the runtime with the correct end bound", () =>
    Effect.gen(function*() {
      const maxSafe = Number.MAX_SAFE_INTEGER
      const platform = yield* HttpPlatform.HttpPlatform
      const response = yield* platform.fileResponse("precision.bin", { offset: maxSafe - 1, bytesToRead: 1 })
      yield* readResponse(response)
      assert.deepStrictEqual(vi.mocked(Fs.createReadStream).mock.calls, [["precision.bin", {
        start: maxSafe - 1,
        end: maxSafe - 1
      }]])
    }).pipe(Effect.provide(layer)))

  it.effect("serves a whole oversized file with an exact content length and no end offset", () =>
    Effect.gen(function*() {
      const platform = yield* HttpPlatform.HttpPlatform
      const response = yield* platform.fileResponse("precision.bin")
      assert.strictEqual(response.status, 200)
      assert.strictEqual(response.headers["content-length"], "9007199254740993")
      yield* readResponse(response)
      assert.deepStrictEqual(vi.mocked(Fs.createReadStream).mock.calls, [["precision.bin", {
        start: 0,
        end: undefined
      }]])
    }).pipe(Effect.provide(layer)))
})
