import { assert, describe, it } from "@effect/vitest"
import * as ByteSize from "effect/ByteSize"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import {
  HttpEffect,
  HttpPlatform,
  HttpRouter,
  HttpServerError,
  HttpServerRequest,
  HttpServerResponse,
  HttpStaticServer
} from "effect/http"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import * as PlatformError from "effect/PlatformError"

const root = "/root"
const filePath = `${root}/file.txt`
const fileBody = "hello static"
const lastModified = "Wed, 01 Jan 2025 00:00:00 GMT"

const notFoundError = (path: string) =>
  PlatformError.systemError({
    _tag: "NotFound",
    module: "FileSystem",
    method: "stat",
    description: "No such file or directory",
    pathOrDescriptor: path
  })

const permissionDeniedError = (path: string) =>
  PlatformError.systemError({
    _tag: "PermissionDenied",
    module: "FileSystem",
    method: "stat",
    description: "Operation not permitted",
    pathOrDescriptor: path
  })

const fileInfo: FileSystem.File.Info = {
  type: "File",
  mtime: Option.some(new Date(lastModified)),
  atime: Option.none(),
  birthtime: Option.none(),
  dev: 0,
  ino: Option.none(),
  mode: 0,
  nlink: Option.none(),
  uid: Option.none(),
  gid: Option.none(),
  rdev: Option.none(),
  size: ByteSize.bytes(fileBody.length),
  blksize: Option.none(),
  blocks: Option.none()
}

const stubCompression: HttpPlatform.Compression = {
  algorithms: new Set(),
  compressResponse: Effect.succeed
}

const makeHandler = async () => {
  const fileSystem = FileSystem.makeNoop({
    stat: (path) => path === filePath ? Effect.succeed(fileInfo) : Effect.fail(notFoundError(path))
  })

  const httpPlatform = HttpPlatform.HttpPlatform.of({
    platform: "node",
    compression: stubCompression,
    fileResponse: (_path, options) =>
      Effect.succeed(HttpServerResponse.text(fileBody, {
        status: options?.status,
        headers: {
          ETag: "\"etag-value\"",
          "Last-Modified": lastModified
        }
      })),
    fileWebResponse: () => Effect.die("not implemented")
  })

  const app = await Effect.runPromise(
    HttpStaticServer.make({
      root,
      cacheControl: "public, max-age=60"
    }).pipe(
      Effect.provide(Path.layer),
      Effect.provideService(FileSystem.FileSystem, fileSystem),
      Effect.provideService(HttpPlatform.HttpPlatform, httpPlatform)
    )
  )

  return HttpEffect.toWebHandler(app)
}

const makeFailingApp = async (options: {
  readonly statError?: PlatformError.PlatformError
  readonly fileResponseError?: PlatformError.PlatformError
}) => {
  const fileSystem = FileSystem.makeNoop({
    stat: (path) => {
      if (options.statError !== undefined) {
        return Effect.fail(options.statError)
      }
      return path === filePath ? Effect.succeed(fileInfo) : Effect.fail(notFoundError(path))
    }
  })

  const httpPlatform = HttpPlatform.HttpPlatform.of({
    platform: "node",
    compression: stubCompression,
    fileResponse: (_path, fileOptions) => {
      if (options.fileResponseError !== undefined) {
        return Effect.fail(options.fileResponseError)
      }
      return Effect.succeed(HttpServerResponse.text(fileBody, {
        status: fileOptions?.status,
        headers: {
          ETag: "\"etag-value\"",
          "Last-Modified": lastModified
        }
      }))
    },
    fileWebResponse: () => Effect.die("not implemented")
  })

  return Effect.runPromise(
    HttpStaticServer.make({ root }).pipe(
      Effect.provide(Path.layer),
      Effect.provideService(FileSystem.FileSystem, fileSystem),
      Effect.provideService(HttpPlatform.HttpPlatform, httpPlatform)
    )
  )
}

const makeLayerHandler = (options: {
  readonly statError?: PlatformError.PlatformError
  readonly fileResponseError?: PlatformError.PlatformError
}) => {
  const fileSystem = FileSystem.makeNoop({
    stat: (path) => {
      if (options.statError !== undefined) {
        return Effect.fail(options.statError)
      }
      return path === filePath ? Effect.succeed(fileInfo) : Effect.fail(notFoundError(path))
    }
  })
  const httpPlatform = HttpPlatform.HttpPlatform.of({
    platform: "node",
    compression: stubCompression,
    fileResponse: () =>
      options.fileResponseError !== undefined
        ? Effect.fail(options.fileResponseError)
        : Effect.succeed(HttpServerResponse.text(fileBody)),
    fileWebResponse: () => Effect.die("not implemented")
  })

  const dependencies = Layer.mergeAll(
    Path.layer,
    Layer.succeed(FileSystem.FileSystem, fileSystem),
    Layer.succeed(HttpPlatform.HttpPlatform, httpPlatform)
  )

  return HttpRouter.toWebHandler(
    HttpStaticServer.layer({ root }).pipe(Layer.provideMerge(dependencies)),
    { disableLogger: true }
  )
}

describe("HttpStaticServer", () => {
  it("304 with If-None-Match exact, weak, and wildcard", async () => {
    const handler = await makeHandler()
    const warmupResponse = await handler(new Request("http://localhost/file.txt"))
    const etag = warmupResponse.headers.get("etag")
    assert.strictEqual(etag, "\"etag-value\"")
    if (etag === null) {
      throw new Error("expected ETag header")
    }

    const exact = await handler(new Request("http://localhost/file.txt", { headers: { "If-None-Match": etag } }))
    const weak = await handler(new Request("http://localhost/file.txt", { headers: { "If-None-Match": `W/${etag}` } }))
    const list = await handler(
      new Request("http://localhost/file.txt", { headers: { "If-None-Match": `"other", W/${etag}` } })
    )
    const any = await handler(new Request("http://localhost/file.txt", { headers: { "If-None-Match": "*" } }))

    assert.deepStrictEqual([exact.status, weak.status, list.status, any.status], [304, 304, 304, 304])
    assert.strictEqual(exact.headers.get("etag"), "\"etag-value\"")
    assert.strictEqual(exact.headers.get("cache-control"), "public, max-age=60")
    assert.strictEqual(exact.headers.get("last-modified"), lastModified)
    assert.strictEqual(exact.headers.get("content-type"), null)
    assert.strictEqual(exact.headers.get("content-length"), null)
  })

  it("304 with If-Modified-Since and no If-None-Match", async () => {
    const handler = await makeHandler()

    const notModified = await handler(
      new Request("http://localhost/file.txt", {
        headers: {
          "If-Modified-Since": lastModified
        }
      })
    )
    const modified = await handler(
      new Request("http://localhost/file.txt", {
        headers: {
          "If-Modified-Since": "Tue, 31 Dec 2024 23:59:59 GMT"
        }
      })
    )
    const invalidDate = await handler(
      new Request("http://localhost/file.txt", {
        headers: {
          "If-Modified-Since": "not-a-date"
        }
      })
    )

    assert.strictEqual(notModified.status, 304)
    assert.strictEqual(modified.status, 200)
    assert.strictEqual(invalidDate.status, 200)
  })

  it("If-None-Match takes precedence over If-Modified-Since", async () => {
    const handler = await makeHandler()

    const response = await handler(
      new Request("http://localhost/file.txt", {
        headers: {
          "If-None-Match": "\"different\"",
          "If-Modified-Since": "Thu, 02 Jan 2025 00:00:00 GMT"
        }
      })
    )

    assert.strictEqual(response.status, 200)
  })

  it("matched If-None-Match takes precedence over Range", async () => {
    const handler = await makeHandler()

    const response = await handler(
      new Request("http://localhost/file.txt", {
        headers: {
          "If-None-Match": "\"etag-value\"",
          "If-Range": "\"stale\"",
          Range: "bytes=1000-1001"
        }
      })
    )

    assert.strictEqual(response.status, 304)
    assert.strictEqual(response.headers.get("etag"), "\"etag-value\"")
    assert.strictEqual(response.headers.get("cache-control"), "public, max-age=60")
    assert.strictEqual(response.headers.get("last-modified"), lastModified)
    assert.strictEqual(response.headers.get("content-range"), null)
    assert.strictEqual(response.headers.get("accept-ranges"), null)
    assert.strictEqual(response.headers.get("content-type"), null)
    assert.strictEqual(response.headers.get("content-length"), null)
  })

  it("wraps missing routes as HttpServerError RouteNotFound", async () => {
    const app = await makeFailingApp({})
    const error = await Effect.runPromise(
      app.pipe(
        Effect.provideService(
          HttpServerRequest.HttpServerRequest,
          HttpServerRequest.fromWeb(new Request("http://localhost/missing.txt"))
        ),
        Effect.flip
      )
    )

    assert.instanceOf(error, HttpServerError.HttpServerError)
    assert.strictEqual(error.reason._tag, "RouteNotFound")
  })

  it("maps non-NotFound platform failures to HttpServerError InternalError", async () => {
    const statError = permissionDeniedError(filePath)
    const app = await makeFailingApp({ statError })
    const error = await Effect.runPromise(
      app.pipe(
        Effect.provideService(
          HttpServerRequest.HttpServerRequest,
          HttpServerRequest.fromWeb(new Request("http://localhost/file.txt"))
        ),
        Effect.flip
      )
    )

    assert.instanceOf(error, HttpServerError.HttpServerError)
    assert.strictEqual(error.reason._tag, "InternalError")
    assert.strictEqual(error.reason.cause, statError)
  })

  it("layer renders InternalError responses as 500", async () => {
    const { handler, dispose } = makeLayerHandler({
      fileResponseError: permissionDeniedError(filePath)
    })
    try {
      const response = await handler(new Request("http://localhost/file.txt"))
      assert.strictEqual(response.status, 500)
    } finally {
      await dispose()
    }
  })
})
