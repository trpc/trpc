import * as DenoHttpServer from "@effect/platform-deno/DenoHttpServer"
import { assert, describe, it } from "@effect/vitest"
import * as ByteSize from "effect/ByteSize"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import * as HttpApiError from "effect/http-api/HttpApiError"
import * as Cookies from "effect/http/Cookies"
import * as Etag from "effect/http/Etag"
import * as FetchHttpClient from "effect/http/FetchHttpClient"
import * as HttpBody from "effect/http/HttpBody"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpClientRequest from "effect/http/HttpClientRequest"
import * as HttpClientResponse from "effect/http/HttpClientResponse"
import * as HttpPlatform from "effect/http/HttpPlatform"
import * as HttpRouter from "effect/http/HttpRouter"
import * as HttpServer from "effect/http/HttpServer"
import * as HttpServerRequest from "effect/http/HttpServerRequest"
import * as HttpServerRespondable from "effect/http/HttpServerRespondable"
import * as HttpServerResponse from "effect/http/HttpServerResponse"
import * as Multipart from "effect/http/Multipart"
import * as UrlParams from "effect/http/UrlParams"
import * as Latch from "effect/Latch"
import * as Layer from "effect/Layer"
import * as ManagedRuntime from "effect/ManagedRuntime"
import type * as NetAddress from "effect/net/NetAddress"
import * as Queue from "effect/Queue"
import * as Schema from "effect/Schema"
import type * as Scope from "effect/Scope"
import type * as Socket from "effect/socket/Socket"
import * as Stream from "effect/Stream"
import * as Tracer from "effect/Tracer"

const Todo = Schema.Struct({
  id: Schema.Number,
  title: Schema.String
})
const IdParams = Schema.Struct({
  id: Schema.FiniteFromString
})
const todoResponse = HttpServerResponse.schemaJson(Todo)
const fixture = `${import.meta.dirname}/fixtures/text.txt`

describe("DenoHttpServer", () => {
  describe("body omission", () => {
    for (const status of [204, 205, 304]) {
      for (const bodyKind of ["text", "stream"]) {
        it.live(`omits ${bodyKind} bodies for status ${status}`, () =>
          Effect.gen(function*() {
            let finalized = false
            let streamStarted = false
            yield* HttpServer.serveEffect(Effect.gen(function*() {
              yield* Effect.addFinalizer(() =>
                Effect.sync(() => {
                  finalized = true
                })
              )
              const options = { status, contentType: "text/plain", contentLength: 4 }
              return bodyKind === "text"
                ? HttpServerResponse.text("body", options)
                : HttpServerResponse.stream(
                  Stream.fromEffect(Effect.sync(() => {
                    streamStarted = true
                    return new TextEncoder().encode("body")
                  })),
                  options
                )
            }))
            const response = yield* HttpClient.get("/")
            assert.strictEqual(response.status, status)
            assert.strictEqual(yield* response.text, "")
            assert.strictEqual(streamStarted, false)
            assert.strictEqual(finalized, true)
            if (status === 304) {
              assert.strictEqual(response.headers["content-type"], "text/plain")
            }
          }).pipe(
            Effect.timeout("2 seconds"),
            Effect.provide(DenoHttpServer.layerTest)
          ), 5000)
      }
    }

    for (const [method, status] of [["HEAD", 200], ["GET", 204], ["GET", 205], ["GET", 304]] as const) {
      it.live(`cancels raw streams for ${method} status ${status}`, () =>
        Effect.gen(function*() {
          let cancelled = false
          const body = new ReadableStream<Uint8Array>({
            pull(controller) {
              controller.enqueue(new TextEncoder().encode("body"))
              controller.close()
            },
            cancel() {
              cancelled = true
            }
          }, { highWaterMark: 0 })
          yield* Effect.addFinalizer(() => Effect.ignoreCause(Effect.promise(() => body.cancel())))
          yield* HttpServer.serveEffect(Effect.succeed(HttpServerResponse.raw(body, {
            status,
            contentType: "text/plain",
            contentLength: 4
          })))
          const response = yield* (method === "HEAD" ? HttpClient.head("/") : HttpClient.get("/"))
          assert.strictEqual(response.status, status)
          assert.strictEqual(yield* response.text, "")
          assert.strictEqual(cancelled, true)
          if (method === "HEAD") {
            assert.strictEqual(response.headers["content-length"], "4")
          }
          if (method === "HEAD" || status === 304) {
            assert.strictEqual(response.headers["content-type"], "text/plain")
          }
        }).pipe(
          Effect.timeout("2 seconds"),
          Effect.provide(DenoHttpServer.layerTest)
        ), 5000)
    }
  })

  it.effect("schema", () =>
    Effect.gen(function*() {
      yield* HttpRouter.add(
        "GET",
        "/todos/:id",
        Effect.flatMap(HttpRouter.schemaParams(IdParams), ({ id }) => todoResponse({ id, title: "test" }))
      ).pipe(HttpRouter.serve, Layer.build)
      const todo = yield* HttpClient.get("/todos/1").pipe(
        Effect.flatMap(HttpClientResponse.schemaBodyJson(Todo))
      )
      assert.deepStrictEqual(todo, { id: 1, title: "test" })
    }).pipe(Effect.provide(DenoHttpServer.layerTest)))

  it.effect("exports a weak ETag generator", () =>
    Effect.gen(function*() {
      const generator = yield* Etag.Generator
      const etag = yield* generator.fromFileWeb(new File(["test"], "test.txt", { lastModified: 0 }))
      assert.strictEqual(etag._tag, "Weak")
    }).pipe(Effect.provide(DenoHttpServer.layerHttpServices)))

  it.effect("formData", () =>
    Effect.gen(function*() {
      yield* HttpRouter.add(
        "POST",
        "/upload",
        Effect.gen(function*() {
          const request = yield* HttpServerRequest.HttpServerRequest
          const formData = yield* request.multipart
          const part = formData.file
          assert(typeof part !== "string")
          const file = part[0]
          assert(typeof file !== "string")
          assert(file.path.endsWith("/test.txt"))
          assert.strictEqual(file.contentType, "text/plain")
          assert.strictEqual(yield* Effect.promise(() => Deno.readTextFile(file.path)), "test")
          return yield* HttpServerResponse.json({ ok: "file" in formData })
        })
      ).pipe(HttpRouter.serve, Layer.build)
      const formData = new FormData()
      formData.append("file", new Blob(["test"], { type: "text/plain" }), "test.txt")
      const response = yield* HttpClient.post("/upload", { body: HttpBody.formData(formData) })
      assert.deepStrictEqual(yield* response.json, { ok: true })
    }).pipe(Effect.provide(DenoHttpServer.layerTest)))

  it.effect("multipartStream", () =>
    Effect.gen(function*() {
      yield* HttpRouter.add(
        "POST",
        "/upload",
        Effect.gen(function*() {
          const request = yield* HttpServerRequest.HttpServerRequest
          const parts = yield* Stream.runCollect(request.multipartStream)
          assert.strictEqual(parts.length, 2)
          const field = parts[0]
          const file = parts[1]
          assert(Multipart.isField(field))
          assert.deepStrictEqual({ key: field.key, value: field.value }, { key: "name", value: "value" })
          assert(Multipart.isFile(file))
          assert.deepStrictEqual(
            { key: file.key, name: file.name, contentType: file.contentType },
            { key: "file", name: "test.txt", contentType: "text/plain" }
          )
          assert.strictEqual(new TextDecoder().decode(yield* file.contentEffect), "test")
          return HttpServerResponse.empty()
        })
      ).pipe(HttpRouter.serve, Layer.build)
      const formData = new FormData()
      formData.append("name", "value")
      formData.append("file", new Blob(["test"], { type: "text/plain" }), "test.txt")
      const response = yield* HttpClient.post("/upload", { body: HttpBody.formData(formData) })
      assert.strictEqual(response.status, 204)
    }).pipe(Effect.provide(DenoHttpServer.layerTest)))

  it.effect("schemaBodyForm", () =>
    Effect.gen(function*() {
      yield* HttpRouter.add(
        "POST",
        "/upload",
        Effect.gen(function*() {
          const files = yield* HttpServerRequest.schemaBodyForm(Schema.Struct({
            file: Multipart.FilesSchema,
            test: Schema.String
          }))
          assert("file" in files)
          assert.strictEqual(files.test, "test")
          return HttpServerResponse.empty()
        })
      ).pipe(HttpRouter.serve, Layer.build)
      const formData = new FormData()
      formData.append("file", new Blob(["test"], { type: "text/plain" }), "test.txt")
      formData.append("test", "test")
      const response = yield* HttpClient.post("/upload", { body: HttpBody.formData(formData) })
      assert.strictEqual(response.status, 204)
    }).pipe(Effect.provide(DenoHttpServer.layerTest)))

  it.effect("formData withMaxFileSize", () =>
    Effect.gen(function*() {
      yield* HttpRouter.add(
        "POST",
        "/upload",
        Effect.gen(function*() {
          const request = yield* HttpServerRequest.HttpServerRequest
          yield* request.multipart
          return HttpServerResponse.empty()
        }).pipe(Effect.catchTag("MultipartError", (error) =>
          error.reason._tag === "FileTooLarge"
            ? Effect.succeed(HttpServerResponse.empty({ status: 413 }))
            : Effect.fail(error)))
      ).pipe(
        HttpRouter.serve,
        Layer.build,
        Effect.provideService(Multipart.MaxFileSize, ByteSize.bytes(100))
      )
      const formData = new FormData()
      formData.append("file", new Blob([new Uint8Array(1000)], { type: "text/plain" }), "test.txt")
      const response = yield* HttpClient.post("/upload", { body: HttpBody.formData(formData) })
      assert.strictEqual(response.status, 413)
    }).pipe(Effect.provide(DenoHttpServer.layerTest)))

  it.effect("formData withMaxFieldSize", () =>
    Effect.gen(function*() {
      yield* HttpRouter.add(
        "POST",
        "/upload",
        Effect.gen(function*() {
          const request = yield* HttpServerRequest.HttpServerRequest
          yield* request.multipart
          return HttpServerResponse.empty()
        }).pipe(Effect.catchTag("MultipartError", (error) =>
          error.reason._tag === "FieldTooLarge"
            ? Effect.succeed(HttpServerResponse.empty({ status: 413 }))
            : Effect.fail(error)))
      ).pipe(
        HttpRouter.serve,
        Layer.build,
        Effect.provideService(Multipart.MaxFieldSize, ByteSize.bytes(100))
      )
      const formData = new FormData()
      formData.append("file", "x".repeat(1000))
      const response = yield* HttpClient.post("/upload", { body: HttpBody.formData(formData) })
      assert.strictEqual(response.status, 413)
    }).pipe(Effect.provide(DenoHttpServer.layerTest)))

  it.effect("mountApp", () =>
    Effect.gen(function*() {
      const child = Effect.map(HttpServerRequest.HttpServerRequest, (_) => HttpServerResponse.text(_.url))
      yield* HttpRouter.use((router) => router.prefixed("/child").add("*", "*", child)).pipe(
        HttpRouter.serve,
        Layer.build
      )
      assert.strictEqual(yield* HttpClient.get("/child/1").pipe(Effect.flatMap((_) => _.text)), "/1")
      assert.strictEqual(yield* HttpClient.get("/child").pipe(Effect.flatMap((_) => _.text)), "/")
      assert.strictEqual(yield* HttpClient.get("/child?foo=bar").pipe(Effect.flatMap((_) => _.text)), "?foo=bar")
      assert.strictEqual(yield* HttpClient.get("/child/").pipe(Effect.flatMap((_) => _.text)), "/")
      assert.strictEqual(
        yield* HttpClient.get("/child1/", { urlParams: { foo: "bar" } }).pipe(Effect.map((_) => _.status)),
        404
      )
    }).pipe(Effect.provide(DenoHttpServer.layerTest)))

  it.effect("file", () =>
    Effect.gen(function*() {
      yield* (yield* HttpServerResponse.file(fixture).pipe(
        Effect.updateService(HttpPlatform.HttpPlatform, (_) => ({
          ..._,
          fileResponse: (path, options) =>
            Effect.map(_.fileResponse(path, options), (response) => {
              ;(response as any).headers.etag = "\"etag\""
              return response
            })
        }))
      )).pipe(Effect.succeed, HttpServer.serveEffect())
      const response = yield* HttpClient.get("/", {
        headers: { "accept-encoding": "identity" }
      })
      assert.strictEqual(response.status, 200)
      assert.strictEqual(response.headers["content-type"], "text/plain; charset=UTF-8")
      assert.strictEqual(response.headers.etag, "\"etag\"")
      assert.strictEqual((yield* response.text).trim(), "lorem ipsum dolar sit amet")
    }).pipe(Effect.provide(DenoHttpServer.layerTest)))

  it.effect("fileWeb", () =>
    Effect.gen(function*() {
      const now = new Date()
      const file = new File([new TextEncoder().encode("test")], "test.txt", {
        type: "text/plain",
        lastModified: now.getTime()
      })
      yield* HttpServerResponse.fileWeb(file).pipe(
        Effect.updateService(HttpPlatform.HttpPlatform, (_) => ({
          ..._,
          fileWebResponse: (file, options) =>
            Effect.map(_.fileWebResponse(file, options), (response) => ({
              ...response,
              headers: { ...response.headers, etag: "W/\"etag\"" }
            }))
        })),
        HttpServer.serveEffect()
      )
      const response = yield* HttpClient.get("/")
      assert.strictEqual(response.status, 200)
      assert.strictEqual(response.headers["content-type"], "text/plain")
      assert.strictEqual(response.headers["last-modified"], now.toUTCString())
      assert.strictEqual(response.headers.etag, "W/\"etag\"")
      assert.strictEqual(yield* response.text, "test")
    }).pipe(Effect.provide(DenoHttpServer.layerTest)))

  it.effect("schemaBodyUrlParams", () =>
    Effect.gen(function*() {
      yield* HttpRouter.add(
        "POST",
        "/todos",
        Effect.flatMap(
          HttpServerRequest.schemaBodyUrlParams(Schema.Struct({
            id: Schema.FiniteFromString,
            title: Schema.String
          })),
          ({ id, title }) => todoResponse({ id, title })
        )
      ).pipe(HttpRouter.serve, Layer.build)
      const todo = yield* HttpClientRequest.post("/todos").pipe(
        HttpClientRequest.bodyUrlParams({ id: "1", title: "test" }),
        HttpClient.execute,
        Effect.flatMap(HttpClientResponse.schemaBodyJson(Todo))
      )
      assert.deepStrictEqual(todo, { id: 1, title: "test" })
    }).pipe(Effect.provide(DenoHttpServer.layerTest)))

  it.effect("schemaBodyUrlParams error", () =>
    Effect.gen(function*() {
      yield* HttpRouter.add(
        "GET",
        "/todos",
        Effect.flatMap(
          HttpServerRequest.schemaBodyUrlParams(Schema.Struct({
            id: Schema.FiniteFromString,
            title: Schema.String
          })),
          ({ id, title }) => todoResponse({ id, title })
        ).pipe(Effect.catchTag("SchemaError", (error) =>
          Effect.succeed(HttpServerResponse.jsonUnsafe({ error }, { status: 400 }))))
      ).pipe(HttpRouter.serve, Layer.build)
      assert.strictEqual((yield* HttpClient.get("/todos")).status, 400)
    }).pipe(Effect.provide(DenoHttpServer.layerTest)))

  it.effect("schemaBodyFormJson", () =>
    Effect.gen(function*() {
      yield* HttpRouter.add(
        "POST",
        "/upload",
        Effect.gen(function*() {
          const result = yield* HttpServerRequest.schemaBodyFormJson(Schema.Struct({ test: Schema.String }))("json")
          assert.strictEqual(result.test, "content")
          return HttpServerResponse.empty()
        })
      ).pipe(HttpRouter.serve, Layer.build)
      const formData = new FormData()
      formData.append("json", JSON.stringify({ test: "content" }))
      assert.strictEqual((yield* HttpClient.post("/upload", { body: HttpBody.formData(formData) })).status, 204)
    }).pipe(Effect.provide(DenoHttpServer.layerTest)))

  it.effect("schemaBodyFormJson file", () =>
    Effect.gen(function*() {
      yield* HttpRouter.add(
        "POST",
        "/upload",
        Effect.gen(function*() {
          const result = yield* HttpServerRequest.schemaBodyFormJson(Schema.Struct({ test: Schema.String }))("json")
          assert.strictEqual(result.test, "content")
          return HttpServerResponse.empty()
        })
      ).pipe(HttpRouter.serve, Layer.build)
      const formData = new FormData()
      formData.append(
        "json",
        new Blob([JSON.stringify({ test: "content" })], { type: "application/json" }),
        "test.json"
      )
      assert.strictEqual((yield* HttpClient.post("/upload", { body: HttpBody.formData(formData) })).status, 204)
    }).pipe(Effect.provide(DenoHttpServer.layerTest)))

  it.effect("schemaBodyFormJson url encoded", () =>
    Effect.gen(function*() {
      yield* HttpRouter.add(
        "POST",
        "/upload",
        Effect.gen(function*() {
          const result = yield* HttpServerRequest.schemaBodyFormJson(Schema.Struct({ test: Schema.String }))("json")
          assert.strictEqual(result.test, "content")
          return HttpServerResponse.empty()
        })
      ).pipe(HttpRouter.serve, Layer.build)
      const response = yield* HttpClient.post("/upload", {
        body: HttpBody.urlParams(UrlParams.fromInput({ json: JSON.stringify({ test: "content" }) }))
      })
      assert.strictEqual(response.status, 204)
    }).pipe(Effect.provide(DenoHttpServer.layerTest)))

  it.effect("tracing", () =>
    Effect.gen(function*() {
      yield* HttpRouter.add(
        "GET",
        "/",
        Effect.flatMap(Effect.currentSpan, (_) => HttpServerResponse.json({ spanId: _.spanId, parent: _.parent }))
      ).pipe(HttpRouter.serve, Layer.build)
      const requestSpan = yield* Effect.makeSpan("client request")
      const body = yield* HttpClient.get("/").pipe(
        Effect.flatMap((response) => response.json),
        Effect.provideService(
          Tracer.Tracer,
          Tracer.make({
            span(options) {
              assert.strictEqual(options.name, "http.client GET")
              assert.strictEqual(options.kind, "client")
              assert(options.parent._tag === "Some")
              if (options.parent.value._tag !== "Span") throw new Error("Expected span parent")
              assert.strictEqual(options.parent.value.name, "request parent")
              return requestSpan
            }
          })
        ),
        Effect.withSpan("request parent"),
        Effect.repeat({ times: 2 })
      )
      assert.strictEqual((body as any).parent._tag, "Some")
      assert.strictEqual((body as any).parent.value.spanId, requestSpan.spanId)
    }).pipe(Effect.provide(DenoHttpServer.layerTest)))

  it.effect("html", () =>
    Effect.gen(function*() {
      yield* HttpRouter.addAll([
        HttpRouter.route("GET", "/home", HttpServerResponse.html("<html />")),
        HttpRouter.route(
          "GET",
          "/about",
          HttpServerResponse.html`<html>${Effect.succeed("<body />")}</html>`
        ),
        HttpRouter.route(
          "GET",
          "/stream",
          HttpServerResponse.htmlStream`<html>${Stream.make("<body />", 123, "hello")}</html>`
        )
      ]).pipe(HttpRouter.serve, Layer.build)
      assert.strictEqual(yield* HttpClient.get("/home").pipe(Effect.flatMap((_) => _.text)), "<html />")
      assert.strictEqual(yield* HttpClient.get("/about").pipe(Effect.flatMap((_) => _.text)), "<html><body /></html>")
      assert.strictEqual(
        yield* HttpClient.get("/stream").pipe(Effect.flatMap((_) => _.text)),
        "<html><body />123hello</html>"
      )
    }).pipe(Effect.provide(DenoHttpServer.layerTest)))

  it.effect("setCookie", () =>
    Effect.gen(function*() {
      yield* HttpRouter.add(
        "GET",
        "/home",
        HttpServerResponse.empty().pipe(
          HttpServerResponse.setCookieUnsafe("test", "value"),
          HttpServerResponse.setCookieUnsafe("test2", "value2", {
            httpOnly: true,
            secure: true,
            sameSite: "lax",
            partitioned: true,
            path: "/",
            domain: "example.com",
            expires: new Date(2022, 1, 1),
            maxAge: "5 minutes"
          })
        )
      ).pipe(HttpRouter.serve, Layer.build)
      const response = yield* HttpClient.get("/home")
      assert.deepStrictEqual(
        response.cookies.toJSON(),
        Cookies.fromReadonlyRecord({
          test: Cookies.makeCookieUnsafe("test", "value"),
          test2: Cookies.makeCookieUnsafe("test2", "value2", {
            httpOnly: true,
            secure: true,
            sameSite: "lax",
            partitioned: true,
            path: "/",
            domain: "example.com",
            expires: new Date(2022, 1, 1),
            maxAge: Duration.minutes(5)
          })
        }).toJSON()
      )
    }).pipe(Effect.provide(DenoHttpServer.layerTest)))

  it.live("uninterruptible routes", () =>
    Effect.gen(function*() {
      yield* HttpRouter.add(
        "GET",
        "/home",
        Effect.gen(function*() {
          const fiber = Fiber.getCurrent()!
          setTimeout(() => fiber.interruptUnsafe(fiber.id), 10)
          yield* Effect.sleep(50)
          return HttpServerResponse.empty()
        }),
        { uninterruptible: true }
      ).pipe(HttpRouter.serve, Layer.build)
      assert.strictEqual((yield* HttpClient.get("/home")).status, 204)
    }).pipe(Effect.provide(DenoHttpServer.layerTest)))

  it.live("disposes after a client aborts a handler awaiting an upstream request", () =>
    Effect.gen(function*() {
      const upstreamStarted = Latch.makeUnsafe()
      const upstream = yield* Effect.acquireRelease(
        Effect.sync(() => {
          const controller = new AbortController()
          const server = Deno.serve(
            { hostname: "127.0.0.1", port: 0, onListen: () => {}, signal: controller.signal },
            (request) => {
              upstreamStarted.openUnsafe()
              return new Promise<Response>((resolve) => {
                request.signal.addEventListener("abort", () => resolve(new Response()), { once: true })
                controller.signal.addEventListener("abort", () => resolve(new Response()), { once: true })
              })
            }
          )
          return { controller, server }
        }),
        ({ controller, server }) =>
          Effect.sync(() => controller.abort()).pipe(Effect.andThen(Effect.promise(() => server.finished)))
      )
      const upstreamPort = (upstream.server.addr as Deno.NetAddr).port
      const router = HttpRouter.use((router) =>
        router.add(
          "GET",
          "/",
          Effect.gen(function*() {
            yield* HttpClient.head(`http://127.0.0.1:${upstreamPort}`)
            return HttpServerResponse.empty()
          })
        )
      )
      const serverLayer = DenoHttpServer.layer({
        hostname: "127.0.0.1",
        port: 0,
        onListen: () => {},
        gracefulShutdownTimeout: "100 millis"
      })
      const services = Layer.merge(serverLayer, FetchHttpClient.layer)
      const runtime = yield* Effect.acquireRelease(
        Effect.sync(() =>
          ManagedRuntime.make(Layer.merge(
            services,
            HttpRouter.serve(router).pipe(Layer.provide(services))
          ))
        ),
        (runtime) => Effect.promise(() => runtime.dispose())
      )
      yield* Effect.promise(() => runtime.context())
      const downstreamServer = yield* Effect.promise(() => runtime.runPromise(HttpServer.HttpServer))
      const downstreamPort = (downstreamServer.address as NetAddress.InetAddress).port

      const controller = new AbortController()
      const downstream = fetch(`http://127.0.0.1:${downstreamPort}`, {
        signal: controller.signal
      }).catch(() => undefined)
      yield* upstreamStarted.await
      controller.abort()
      yield* Effect.promise(() => downstream)

      const disposed = yield* Effect.promise(() => runtime.dispose()).pipe(Effect.timeoutOption("2 seconds"))
      assert.strictEqual(disposed._tag, "Some")
    }))

  describe("HttpServerRespondable", () => {
    it.effect("error/schema", () =>
      Effect.gen(function*() {
        class CustomError extends Schema.Error<CustomError>("CustomError")({
          _tag: Schema.tag("CustomError"),
          name: Schema.String
        }) {
          [HttpServerRespondable.symbol]() {
            return HttpServerResponse.schemaJson(CustomError)(this, { status: 599 })
          }
        }
        yield* HttpRouter.add("GET", "/home", new CustomError({ name: "test" })).pipe(
          HttpRouter.serve,
          Layer.build
        )
        const response = yield* HttpClient.get("/home")
        assert.strictEqual(response.status, 599)
        assert.deepStrictEqual(
          yield* HttpClientResponse.schemaBodyJson(CustomError)(response),
          new CustomError({ name: "test" })
        )
      }).pipe(Effect.provide(DenoHttpServer.layerTest)))

    it.effect("httpapi error", () =>
      Effect.gen(function*() {
        yield* HttpRouter.add("GET", "/home", new HttpApiError.BadRequest({})).pipe(
          HttpRouter.serve,
          Layer.build
        )
        assert.strictEqual((yield* HttpClient.get("/home")).status, 400)
      }).pipe(Effect.provide(DenoHttpServer.layerTest)))
  })

  it.effect("RouterConfig", () =>
    Effect.gen(function*() {
      yield* HttpRouter.add("GET", "/:param", Effect.succeed(HttpServerResponse.empty())).pipe(
        HttpRouter.serve,
        Layer.build
      )
      assert.strictEqual((yield* HttpClient.get("/123456")).status, 404)
      assert.strictEqual((yield* HttpClient.get("/12345")).status, 204)
    }).pipe(
      Effect.provide([
        DenoHttpServer.layerTest,
        Layer.succeed(HttpRouter.RouterConfig)({ maxParamLength: 5 })
      ])
    ))

  it.effect("HttpRouter prefixed", () =>
    Effect.gen(function*() {
      const handler = HttpRouter.serve(HttpRouter.use(Effect.fnUntraced(function*(router_) {
        const router = router_.prefixed("/todos")
        yield* router.add(
          "GET",
          "/:id",
          Effect.flatMap(HttpRouter.schemaParams(IdParams), ({ id }) => todoResponse({ id, title: "test" }))
        )
        yield* router.addAll([
          HttpRouter.route("GET", "/", Effect.succeed(HttpServerResponse.text("root")))
        ])
      })))
      yield* Layer.build(handler)
      assert.deepStrictEqual(
        yield* HttpClient.get("/todos/1").pipe(Effect.flatMap(HttpClientResponse.schemaBodyJson(Todo))),
        { id: 1, title: "test" }
      )
      assert.strictEqual(yield* HttpClient.get("/todos").pipe(Effect.flatMap((_) => _.text)), "root")
    }).pipe(Effect.provide(DenoHttpServer.layerTest)))

  it.effect("cancels a file body for HEAD requests", () =>
    Effect.gen(function*() {
      let cancelled = false
      const fileResponse = yield* HttpServerResponse.file(fixture).pipe(
        Effect.updateService(HttpPlatform.HttpPlatform, (platform) => ({
          ...platform,
          fileResponse: (path, options) =>
            Effect.map(platform.fileResponse(path, options), (response) => {
              assert.strictEqual(response.body._tag, "Raw")
              const source = (response.body as HttpBody.Raw).body
              assert(source instanceof ReadableStream)
              const reader = source.getReader()
              const body = new ReadableStream<Uint8Array>({
                pull(controller) {
                  return reader.read().then(({ done, value }) => {
                    if (done) controller.close()
                    else controller.enqueue(value)
                  })
                },
                cancel(reason) {
                  cancelled = true
                  return reader.cancel(reason)
                }
              })
              return HttpServerResponse.raw(body, {
                status: response.status,
                statusText: response.statusText,
                headers: response.headers,
                cookies: response.cookies
              })
            })
        }))
      )
      yield* fileResponse.pipe(
        Effect.succeed,
        HttpServer.serveEffect()
      )
      const response = yield* HttpClient.head("/")
      assert.strictEqual(response.status, 200)
      assert(cancelled)
    }).pipe(Effect.provide(DenoHttpServer.layerTest)))

  it.effect("ignores cancellation errors for HEAD response bodies", () => {
    const body = new ReadableStream<Uint8Array>()
    const reader = body.getReader()
    return Effect.gen(function*() {
      yield* HttpServerResponse.raw(body).pipe(
        Effect.succeed,
        HttpServer.serveEffect()
      )
      const response = yield* HttpClient.head("/")
      assert.strictEqual(response.status, 200)
    }).pipe(
      Effect.ensuring(Effect.sync(() => reader.releaseLock())),
      Effect.provide(DenoHttpServer.layerTest)
    )
  })

  it.effect("round trips WebSocket frames and closes cleanly", () =>
    Effect.gen(function*() {
      yield* serveWebSocket(echoWebSocket)
      const server = yield* HttpServer.HttpServer
      const port = (server.address as NetAddress.InetAddress).port
      const messages = yield* connectWebSocket(`ws://127.0.0.1:${port}/`, (socket) => socket.send("hello"), 1)
      assert.deepStrictEqual(messages, ["hello"])
    }).pipe(Effect.provide(DenoHttpServer.layerTest)))

  it.effect("preserves eager WebSocket frames across an async boundary", () =>
    Effect.gen(function*() {
      yield* serveWebSocket((socket) =>
        Effect.promise(() => new Promise<void>((resolve) => setTimeout(resolve, 0))).pipe(
          Effect.andThen(echoWebSocket(socket))
        )
      )

      const server = yield* HttpServer.HttpServer
      const port = (server.address as NetAddress.InetAddress).port
      const messages = yield* connectWebSocket(`ws://127.0.0.1:${port}/`, (socket) => {
        socket.send("first")
        socket.send("second")
      }, 2)

      assert.deepStrictEqual(messages, ["first", "second"])
    }).pipe(Effect.provide(DenoHttpServer.layerTest)))

  it.effect("delivers binary WebSocket frames as Uint8Array", () =>
    Effect.gen(function*() {
      const received = yield* Queue.unbounded<Uint8Array>()
      yield* serveWebSocket((socket) =>
        Effect.gen(function*() {
          const { pull } = yield* socket.reader
          while (true) {
            const chunk = yield* pull
            for (const message of chunk) {
              assert(message instanceof Uint8Array)
              yield* Queue.offer(received, message)
            }
          }
        }).pipe(
          Effect.catchReason("SocketError", "SocketCloseError", () => Effect.void),
          Effect.orDie
        )
      )

      const server = yield* HttpServer.HttpServer
      const port = (server.address as NetAddress.InetAddress).port
      const socket = yield* openWebSocket(`ws://127.0.0.1:${port}/`)
      socket.send(new Uint8Array([1, 2, 3]))

      assert.deepStrictEqual(yield* Queue.take(received), new Uint8Array([1, 2, 3]))
      socket.close()
    }).pipe(Effect.provide(DenoHttpServer.layerTest)))
})

const echoWebSocket = (socket: Socket.Socket) =>
  Effect.gen(function*() {
    const writer = yield* socket.writer
    const { pull } = yield* socket.reader
    while (true) {
      yield* writer.writeAll(yield* pull)
    }
  }).pipe(
    Effect.catchReason("SocketError", "SocketCloseError", () => Effect.void),
    Effect.orDie
  )

const serveWebSocket = (
  run: (socket: Socket.Socket) => Effect.Effect<void, Socket.SocketError, Scope.Scope>
) =>
  HttpRouter.add(
    "GET",
    "/",
    Effect.gen(function*() {
      const request = yield* HttpServerRequest.HttpServerRequest
      const socket = yield* request.upgrade
      yield* run(socket)
      return HttpServerResponse.empty()
    })
  ).pipe(HttpRouter.serve, Layer.build)

const openWebSocket = (url: string) =>
  Effect.acquireRelease(
    Effect.callback<WebSocket, Error>((resume) => {
      const socket = new WebSocket(url)
      socket.addEventListener("open", () => resume(Effect.succeed(socket)), { once: true })
      socket.addEventListener("error", () => resume(Effect.fail(new Error("WebSocket connection failed"))), {
        once: true
      })
    }),
    (socket) => Effect.sync(() => socket.close())
  )

const connectWebSocket = (url: string, onOpen: (socket: WebSocket) => void, messageCount: number) =>
  Effect.acquireUseRelease(
    openWebSocket(url),
    (socket) =>
      Effect.gen(function*() {
        const messages: Array<string> = []
        const fiber = yield* Effect.callback<void, Error>((resume) => {
          socket.addEventListener("message", (event) => {
            messages.push(event.data)
            if (messages.length === messageCount) resume(Effect.void)
          })
          socket.addEventListener("error", () => resume(Effect.fail(new Error("WebSocket connection failed"))), {
            once: true
          })
          onOpen(socket)
        }).pipe(Effect.forkChild)
        yield* Fiber.join(fiber)
        return messages
      }),
    (socket) => Effect.sync(() => socket.close())
  )
