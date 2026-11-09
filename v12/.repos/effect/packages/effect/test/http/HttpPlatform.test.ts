import { assert, describe, it } from "@effect/vitest"
import { ByteSize, Effect, FileSystem, Layer, Option, Stream } from "effect"
import { HttpPlatform } from "effect/http"

describe("HttpPlatform", () => {
  const oversized = 9007199254740993n
  const layer = HttpPlatform.layer.pipe(Layer.provide(FileSystem.layerNoop({
    stat: () =>
      Effect.succeed({
        type: "File",
        size: ByteSize.bytes(oversized),
        mtime: Option.none()
      } as FileSystem.File.Info),
    stream: () => Stream.empty
  })))

  it.effect("fileResponse infers the content type from the extension", () =>
    Effect.gen(function*() {
      const platform = yield* HttpPlatform.HttpPlatform
      const response = yield* platform.fileResponse("script.js")
      assert.strictEqual(response.headers["content-type"], "text/javascript")
    }).pipe(Effect.provide(layer)))

  it.effect("fileResponse honors contentType over a conflicting header", () =>
    Effect.gen(function*() {
      const platform = yield* HttpPlatform.HttpPlatform
      const response = yield* platform.fileResponse("script.js", {
        contentType: "application/custom",
        headers: { "content-type": "application/header" }
      })
      assert.strictEqual(response.headers["content-type"], "application/custom")
    }).pipe(Effect.provide(layer)))

  it.effect("fileWebResponse honors contentType over the file type", () =>
    Effect.gen(function*() {
      const platform = yield* HttpPlatform.HttpPlatform
      const response = yield* platform.fileWebResponse(new File([], "script.js", { type: "text/plain" }), {
        contentType: "text/javascript"
      })
      assert.strictEqual(response.headers["content-type"], "text/javascript")
    }).pipe(Effect.provide(layer)))

  it.effect("serves a whole oversized file with an exact content-length header", () =>
    Effect.gen(function*() {
      const platform = yield* HttpPlatform.HttpPlatform
      const response = yield* platform.fileResponse("file.bin")
      assert.strictEqual(response.headers["content-length"], oversized.toString())
    }).pipe(Effect.provide(layer)))

  for (
    const [name, options] of [
      ["unsafe bigint offset", { offset: oversized }],
      ["unsafe end from safe bounds", { offset: Number.MAX_SAFE_INTEGER, bytesToRead: 2 }],
      ["unsafe number offset", { offset: Number.MAX_SAFE_INTEGER + 1 }],
      ["unsafe number byte count", { bytesToRead: Number.MAX_SAFE_INTEGER + 1 }]
    ] as const
  ) {
    it.effect(`rejects ${name} with BadArgument`, () =>
      Effect.gen(function*() {
        const platform = yield* HttpPlatform.HttpPlatform
        const error = yield* Effect.flip(platform.fileResponse("file.bin", options))
        assert.strictEqual(error.reason._tag, "BadArgument")
      }).pipe(Effect.provide(layer)))
  }

  const file = {
    name: "file.bin",
    lastModified: 0,
    size: 4,
    type: "application/octet-stream",
    stream: () => new Blob([new Uint8Array([1, 2, 3, 4])]).stream()
  }

  it.effect("honors Web file offset and byte count", () =>
    Effect.gen(function*() {
      const platform = yield* HttpPlatform.HttpPlatform
      const response = yield* platform.fileWebResponse(file, { offset: 1, bytesToRead: 2 })
      assert.strictEqual(response.body._tag, "Stream")
      if (response.body._tag === "Stream") {
        assert.strictEqual(response.body.contentLength, 2)
        const bytes = yield* Stream.mkUint8Array(response.body.stream)
        assert.deepStrictEqual(Array.from(bytes), [2, 3])
      }
    }).pipe(
      Effect.provide(HttpPlatform.layer),
      Effect.provideService(FileSystem.FileSystem, {} as any)
    ))

  for (
    const { name, offset, bytesToRead, expected } of [
      { name: "clamps bytesToRead beyond EOF", offset: 1, bytesToRead: 10, expected: [2, 3, 4] },
      { name: "returns an empty body at EOF", offset: 4, bytesToRead: undefined, expected: [] },
      { name: "returns an empty body past EOF", offset: 9, bytesToRead: undefined, expected: [] },
      { name: "clamps bytesToRead at EOF", offset: 4, bytesToRead: 10, expected: [] },
      { name: "clamps bytesToRead past EOF", offset: 9, bytesToRead: 10, expected: [] }
    ]
  ) {
    it.effect(`fileWebResponse ${name}`, () =>
      Effect.gen(function*() {
        const platform = yield* HttpPlatform.HttpPlatform
        const response = yield* platform.fileWebResponse(file, { offset, bytesToRead })
        assert.strictEqual(response.body._tag, "Stream")
        if (response.body._tag === "Stream") {
          const bytes = yield* Stream.mkUint8Array(response.body.stream)
          assert.deepStrictEqual(
            {
              contentLength: response.body.contentLength,
              header: response.headers["content-length"],
              body: Array.from(bytes)
            },
            { contentLength: expected.length, header: String(expected.length), body: expected }
          )
        }
      }).pipe(
        Effect.provide(HttpPlatform.layer),
        Effect.provideService(FileSystem.FileSystem, {} as any)
      ))
  }

  it.effect("honors Web file chunk size", () =>
    Effect.gen(function*() {
      const platform = yield* HttpPlatform.HttpPlatform
      const response = yield* platform.fileWebResponse(file, { offset: 0, bytesToRead: 4, chunkSize: 2 })
      assert.strictEqual(response.body._tag, "Stream")
      if (response.body._tag === "Stream") {
        assert.strictEqual(response.body.contentLength, 4)
        const chunks = yield* Stream.runCollect(response.body.stream)
        assert.deepStrictEqual(chunks.map((chunk) => Array.from(chunk)), [[1, 2], [3, 4]])
      }
    }).pipe(
      Effect.provide(HttpPlatform.layer),
      Effect.provideService(FileSystem.FileSystem, {} as any)
    ))

  it.effect("keeps the source chunking by default", () =>
    Effect.gen(function*() {
      const platform = yield* HttpPlatform.HttpPlatform
      const response = yield* platform.fileWebResponse(file)
      assert.strictEqual(response.body._tag, "Stream")
      if (response.body._tag === "Stream") {
        const chunks = yield* Stream.runCollect(response.body.stream)
        assert.deepStrictEqual(chunks.map((chunk) => Array.from(chunk)), [[1, 2, 3, 4]])
      }
    }).pipe(
      Effect.provide(HttpPlatform.layer),
      Effect.provideService(FileSystem.FileSystem, {} as any)
    ))
})
