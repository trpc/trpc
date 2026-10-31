import { assert, describe, it } from "@effect/vitest"
import * as ByteSize from "effect/ByteSize"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import { HttpEffect, HttpPlatform, HttpServerRequest, HttpServerResponse, HttpStaticServer } from "effect/http"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import * as Stream from "effect/Stream"

const services = Layer.mergeAll(
  Path.layer,
  FileSystem.layerNoop({
    stat: () => Effect.succeed({ type: "File", size: ByteSize.bytes(10) } as FileSystem.File.Info)
  }),
  Layer.succeed(
    HttpPlatform.HttpPlatform,
    HttpPlatform.HttpPlatform.of({
      platform: "web",
      compression: { algorithms: new Set(), compressResponse: Effect.succeed },
      fileResponse: () => Effect.succeed(HttpServerResponse.text("0123456789")),
      fileWebResponse: () => Effect.die("unused")
    })
  )
)

describe("HttpStaticServer", () => {
  it.effect("preserves the JavaScript MIME type through toWebHandler", () => {
    const fileSystem = FileSystem.layerNoop({
      stat: () =>
        Effect.succeed({
          type: "File",
          size: ByteSize.zero,
          mtime: Option.none()
        } as FileSystem.File.Info),
      stream: () => Stream.empty
    })
    const layer = Layer.mergeAll(
      Path.layer,
      fileSystem,
      HttpPlatform.layer.pipe(Layer.provide(fileSystem))
    )
    return Effect.gen(function*() {
      const app = yield* HttpStaticServer.make({ root: "/root" })
      const response = yield* Effect.promise(() =>
        HttpEffect.toWebHandler(app)(new Request("http://localhost/script.js"))
      )
      yield* Effect.promise(() => response.arrayBuffer())

      assert.strictEqual(response.headers.get("content-type"), "text/javascript; charset=utf-8")
    }).pipe(Effect.provide(layer))
  })

  it.effect("ignores Range on HEAD requests", () =>
    Effect.gen(function*() {
      const app = yield* HttpStaticServer.make({ root: "/root" })
      const response = yield* Effect.promise(() =>
        HttpEffect.toWebHandler(app)(
          new Request("http://localhost/file.txt", {
            method: "HEAD",
            headers: { Range: "bytes=20-24" }
          })
        )
      )

      assert.strictEqual(response.status, 200)
      assert.strictEqual(response.headers.get("content-length"), "10")
      assert.strictEqual(response.headers.get("content-range"), null)
    }).pipe(Effect.provide(services)))
})

describe("HttpStaticServer conditional requests", () => {
  const lastModified = "Sun, 06 Nov 1994 10:00:00 GMT"
  const services = Layer.mergeAll(
    Path.layer,
    FileSystem.layerNoop({
      stat: () => Effect.succeed({ type: "File", size: ByteSize.bytes(10) } as FileSystem.File.Info)
    }),
    Layer.succeed(
      HttpPlatform.HttpPlatform,
      HttpPlatform.HttpPlatform.of({
        platform: "web",
        compression: { algorithms: new Set(), compressResponse: Effect.succeed },
        fileResponse: () =>
          Effect.succeed(
            HttpServerResponse.text("0123456789").pipe(
              HttpServerResponse.setHeader("ETag", "\"v1\""),
              HttpServerResponse.setHeader("Last-Modified", lastModified)
            )
          ),
        fileWebResponse: () => Effect.die("unused")
      })
    )
  )

  it.effect("evaluates preconditions before cache validators and ranges", () =>
    Effect.gen(function*() {
      const app = yield* HttpStaticServer.make({ root: "/root" })
      const handler = HttpEffect.toWebHandler(app)
      const earlier = "Sat, 05 Nov 1994 10:00:00 GMT"
      for (
        const [headers, status] of [
          [{ "If-Match": "\"stale\"", "If-None-Match": "\"v1\"", Range: "bytes=2-5" }, 412],
          [{ "If-Match": "W/\"v1\"" }, 412],
          [{ "If-Match": "w/\"v1\"" }, 412],
          [{ "If-Match": "\"other\", \"v1\"", "If-None-Match": "\"v1\"" }, 304],
          [{ "If-Unmodified-Since": earlier, "If-None-Match": "\"v1\"", Range: "bytes=2-5" }, 412],
          [{ "If-Unmodified-Since": lastModified }, 200],
          [{ "If-Unmodified-Since": "invalid" }, 200],
          [{ "If-Match": "\"v1\"", "If-Unmodified-Since": earlier }, 200]
        ] as const
      ) {
        const response = yield* Effect.promise(() => handler(new Request("http://localhost/file.txt", { headers })))
        assert.strictEqual(response.status, status, JSON.stringify(headers))
        if (status === 412) {
          assert.strictEqual(yield* Effect.promise(() => response.text()), "")
          assert.strictEqual(response.headers.get("content-range"), null)
        }
      }
    }).pipe(Effect.provide(services)))

  it.effect("reads an asctime If-Modified-Since as UTC, whatever the process time zone", () =>
    Effect.gen(function*() {
      const app = yield* HttpStaticServer.make({ root: "/root" })
      const handler = HttpEffect.toWebHandler(app)
      const previousTimeZone = process.env.TZ
      process.env.TZ = "America/New_York"
      try {
        // 08:49:37 UTC is before the Last-Modified of 10:00:00 UTC, so the
        // file has changed and must be served in full
        const response = yield* Effect.promise(() =>
          handler(
            new Request("http://localhost/file.txt", {
              headers: { "If-Modified-Since": "Sun Nov  6 08:49:37 1994" }
            })
          )
        )
        assert.strictEqual(response.status, 200)
      } finally {
        if (previousTimeZone === undefined) {
          delete process.env.TZ
        } else {
          process.env.TZ = previousTimeZone
        }
      }
    }).pipe(Effect.provide(services)))
})

type FileOptions = Parameters<HttpPlatform.HttpPlatform["Service"]["fileResponse"]>[1]

const precisionServices = (size: bigint, calls: Array<{ path: string; options: FileOptions }>) =>
  Layer.mergeAll(
    Path.layer,
    FileSystem.layerNoop({
      stat: (path) =>
        Effect.succeed({
          type: path === "/root/directory" ? "Directory" : "File",
          size: ByteSize.bytes(size)
        } as FileSystem.File.Info)
    }),
    Layer.succeed(
      HttpPlatform.HttpPlatform,
      HttpPlatform.HttpPlatform.of({
        platform: "web",
        compression: { algorithms: new Set(), compressResponse: Effect.succeed },
        fileResponse: (path, options) => {
          calls.push({ path, options })
          return Effect.succeed(HttpServerResponse.empty({ status: options?.status ?? 200 }))
        },
        fileWebResponse: () => Effect.die("unused")
      })
    )
  )

describe("HttpStaticServer precision", () => {
  const size = 9007199254740993n
  for (
    const [url, range, start, end] of [
      ["/file.bin", "bytes=0-0", 0n, 0n],
      ["/file.bin", "bytes=-2", size - 2n, size - 1n],
      ["/directory/", "bytes=1-", 1n, size - 1n]
    ] as const
  ) {
    it.effect(`preserves ${range} and the exact total for ${url}`, () => {
      const calls: Array<{ path: string; options: FileOptions }> = []
      return Effect.gen(function*() {
        const app = yield* HttpStaticServer.make({ root: "/root" })
        const response = yield* app.pipe(Effect.provideService(
          HttpServerRequest.HttpServerRequest,
          HttpServerRequest.fromWeb(new Request(`http://localhost${url}`, { headers: { Range: range } }))
        ))
        assert.strictEqual(response.status, 206)
        assert.strictEqual(response.headers["content-range"], `bytes ${start}-${end}/${size}`)
        assert.deepStrictEqual(calls, [{
          path: url === "/directory/" ? "/root/directory/index.html" : "/root/file.bin",
          options: { status: 206, offset: start, bytesToRead: end - start + 1n }
        }])
      }).pipe(Effect.provide(precisionServices(size, calls)))
    })
  }

  it.effect("preserves the exact total in a 416 response", () => {
    const calls: Array<{ path: string; options: FileOptions }> = []
    return Effect.gen(function*() {
      const app = yield* HttpStaticServer.make({ root: "/root" })
      const response = yield* app.pipe(Effect.provideService(
        HttpServerRequest.HttpServerRequest,
        HttpServerRequest.fromWeb(new Request("http://localhost/file.bin", { headers: { Range: "bytes=-0" } }))
      ))
      assert.strictEqual(response.status, 416)
      assert.strictEqual(response.headers["content-range"], `bytes */${size}`)
      assert.deepStrictEqual(calls, [])
    }).pipe(Effect.provide(precisionServices(size, calls)))
  })
})

describe("HttpStaticServer paths", () => {
  it.effect("serves a path with repeated leading slashes from the root", () => {
    const calls: Array<{ path: string; options: FileOptions }> = []
    return Effect.gen(function*() {
      const app = yield* HttpStaticServer.make({ root: "/root" })
      const response = yield* app.pipe(Effect.provideService(
        HttpServerRequest.HttpServerRequest,
        HttpServerRequest.fromWeb(new Request("http://localhost//nested/file.txt"))
      ))
      assert.strictEqual(response.status, 200)
      assert.deepStrictEqual(calls.map((call) => call.path), ["/root/nested/file.txt"])
    }).pipe(Effect.provide(precisionServices(10n, calls)))
  })
})
