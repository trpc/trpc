/** @effect-diagnostics preferSchemaOverJson:skip-file */
import { NodeHttpClient, NodeHttpServer, NodeHttpServerRequest, NodeWS } from "@effect/platform-node"
import { assert, describe, expect, it } from "@effect/vitest"
import { ByteSize, Effect, Exit, Formatter, Logger, Option, References } from "effect"
import * as Deferred from "effect/Deferred"
import * as Duration from "effect/Duration"
import * as Fiber from "effect/Fiber"
import { constVoid } from "effect/Function"
import {
  Cookies,
  FetchHttpClient,
  Headers,
  HttpBody,
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
  HttpIncomingMessage,
  HttpMiddleware,
  HttpPlatform,
  HttpRouter,
  HttpServer,
  HttpServerRequest,
  HttpServerRespondable,
  HttpServerResponse,
  Multipart,
  UrlParams
} from "effect/http"
import * as HttpApiError from "effect/http-api/HttpApiError"
import * as Latch from "effect/Latch"
import * as Layer from "effect/Layer"
import * as ManagedRuntime from "effect/ManagedRuntime"
import * as IpNetwork from "effect/net/IpNetwork"
import * as NetAddress from "effect/net/NetAddress"
import * as Schema from "effect/Schema"
import * as Scope from "effect/Scope"
import { Socket } from "effect/socket"
import * as Stream from "effect/Stream"
import * as Tracer from "effect/Tracer"
import * as Buffer from "node:buffer"
import { randomBytes } from "node:crypto"
import { EventEmitter } from "node:events"
import { createReadStream, readFileSync } from "node:fs"
import * as Http from "node:http"
import * as Http2 from "node:http2"
import * as Https from "node:https"
import * as Net from "node:net"
import { Readable } from "node:stream"
import * as Tls from "node:tls"
import * as Zlib from "node:zlib"
import {
  describeHttpServerProtocol,
  http2Get,
  layerHttp2Client,
  layerTestClient
} from "../../node-shared/test/HttpServerHttp2.test-utils.ts"

const Todo = Schema.Struct({
  id: Schema.Number,
  title: Schema.String
})
const IdParams = Schema.Struct({
  id: Schema.FiniteFromString
})
const todoResponse = HttpServerResponse.schemaJson(Todo)

describe("HttpServer", () => {
  it.effect.each([8 * 1024, 512 * 1024])(
    "delivers a partial-read 413 and drains or closes for %i leftover bytes",
    (leftoverBytes) =>
      Effect.gen(function*() {
        const server = Http.createServer()
        const body = "rejected".repeat(16 * 1024)
        yield* HttpServer.serve(
          HttpServerRequest.HttpServerRequest.use((request) =>
            request.url === "/next"
              ? Effect.succeed(HttpServerResponse.text("next"))
              : request.stream.pipe(
                Stream.take(1),
                Stream.runDrain,
                Effect.as(HttpServerResponse.text(body, { status: 413 }))
              )
          )
        ).pipe(
          Layer.provide(NodeHttpServer.layer(() => server, { port: 0 })),
          Layer.build
        )
        if (leftoverBytes > 256 * 1024) {
          // A raw client observes the server FIN; node:http closes its own socket on Connection: close.
          yield* Effect.callback<void, Error>((resume) => {
            const socket = Net.connect({ host: "127.0.0.1", port: tcpPort(server), allowHalfOpen: true })
            let received = ""
            let sentLeftover = false
            let fin = false
            socket.setEncoding("utf8")
            socket.on("error", (error) => resume(Effect.fail(error)))
            socket.on("connect", () => {
              socket.write(
                `POST / HTTP/1.1\r\nHost: localhost\r\nContent-Length: ${
                  leftoverBytes + 1
                }\r\nConnection: keep-alive\r\n\r\nx`
              )
            })
            socket.on("data", (chunk: string) => {
              received += chunk
              if (!sentLeftover) {
                sentLeftover = true
                // Wait for the response so the handler consumes only the first byte.
                socket.write(Buffer.Buffer.alloc(leftoverBytes))
              }
            })
            socket.on("end", () => {
              fin = true
              resume(Effect.sync(() => {
                const separator = received.indexOf("\r\n\r\n")
                assert.isAtLeast(separator, 0)
                const headers = received.slice(0, separator).toLowerCase()
                assert.match(headers, /^http\/1\.1 413 /)
                assert.include(headers, "\r\nconnection: close")
                assert.include(headers, `\r\ncontent-length: ${Buffer.Buffer.byteLength(body)}`)
                assert.strictEqual(received.slice(separator + 4), body)
              }))
            })
            socket.on("close", () => {
              if (!fin) resume(Effect.fail(new Error("Socket closed before the server FIN")))
            })
            return Effect.sync(() => socket.destroy())
          }).pipe(Effect.timeout("3 seconds"))
          return
        }
        const agent = yield* Effect.acquireRelease(
          Effect.sync(() => new Http.Agent({ keepAlive: true, maxSockets: 1 })),
          (agent) => Effect.sync(() => agent.destroy())
        )
        yield* Effect.callback<void, Error>((resume) => {
          const fail = (error: Error) => resume(Effect.fail(error))
          const request = Http.request({
            host: "127.0.0.1",
            port: tcpPort(server),
            method: "POST",
            headers: { "content-length": leftoverBytes + 1 },
            agent
          })
          let firstSocket: Net.Socket
          request.on("error", fail)
          request.on("socket", (socket) => {
            firstSocket = socket
            socket.on("error", fail)
          })
          request.on("response", (response) => {
            let received = ""
            response.setEncoding("utf8")
            response.on("data", (chunk: string) => received += chunk)
            response.on("error", fail)
            response.on("end", () => {
              const status = response.statusCode
              const next = Http.get({ host: "127.0.0.1", port: tcpPort(server), path: "/next", agent }, (response) => {
                response.on("error", fail)
                response.on("end", () => {
                  resume(Effect.sync(() => {
                    assert.strictEqual(status, 413)
                    assert.strictEqual(received, body)
                    assert.strictEqual(response.statusCode, 200)
                    // Queued requests can reuse the socket without setting ClientRequest.reusedSocket.
                    assert.strictEqual(next.socket, firstSocket)
                  }))
                })
                response.resume()
              })
              next.on("error", fail)
            })
            // The first chunk must be consumed on its own, not coalesced with the leftover body.
            request.end(Buffer.Buffer.alloc(leftoverBytes))
          })
          request.write("x")
          return Effect.sync(() => request.destroy())
        }).pipe(Effect.timeout("3 seconds"))
      })
  )

  it.effect("returns 413 before a chunked upload finishes", () =>
    Effect.gen(function*() {
      yield* HttpRouter.add(
        "POST",
        "/body",
        HttpServerRequest.HttpServerRequest.use((request) => Effect.as(request.text, HttpServerResponse.empty())).pipe(
          Effect.provideService(HttpIncomingMessage.MaxBodySize, ByteSize.bytes(4))
        )
      ).pipe(HttpRouter.serve, Layer.build)
      const server = yield* HttpServer.HttpServer
      const port = (server.address as NetAddress.InetAddress).port

      const response = yield* Effect.callback<{ status: number | undefined; uploadComplete: boolean }, Error>(
        (resume) => {
          const request = Http.request({ hostname: "127.0.0.1", port, path: "/body", method: "POST", agent: false })
          request.on("error", (error) => resume(Effect.fail(error)))
          request.on("response", (response) => {
            const result = { status: response.statusCode, uploadComplete: request.writableEnded }
            // Withhold the final chunk until the server has sent its response.
            request.end("remaining upload")
            response.on("error", (error) => resume(Effect.fail(error)))
            response.on("end", () => {
              request.destroy()
              resume(Effect.succeed(result))
            })
            response.resume()
          })
          request.write("12345")
          return Effect.sync(() => request.destroy())
        }
      )
      assert.strictEqual(response.status, 413)
      assert.isFalse(response.uploadComplete)
    }).pipe(Effect.provide(NodeHttpServer.layerTest)))

  it.effect("returns 400 for malformed JSON within MaxBodySize", () =>
    Effect.gen(function*() {
      yield* HttpRouter.add(
        "POST",
        "/body",
        HttpServerRequest.HttpServerRequest.use((request) => Effect.as(request.json, HttpServerResponse.empty())).pipe(
          Effect.provideService(HttpIncomingMessage.MaxBodySize, ByteSize.bytes(4))
        )
      ).pipe(HttpRouter.serve, Layer.build)
      const client = yield* HttpClient.HttpClient
      const response = yield* client.post("/body", { body: HttpBody.text("{") })
      assert.strictEqual(response.status, 400)
    }).pipe(Effect.provide(NodeHttpServer.layerTest)))

  it.effect("does not duplicate Node's automatic 100 Continue with makeHandler", () =>
    Effect.gen(function*() {
      const scope = yield* Effect.scope
      const handler = yield* NodeHttpServer.makeHandler(
        HttpServerRequest.HttpServerRequest.use((request) => request.text.pipe(Effect.map(HttpServerResponse.text))),
        { scope }
      )
      // No checkContinue listener: Node acknowledges before invoking the handler.
      const server = yield* Effect.acquireRelease(
        Effect.sync(() => Http.createServer(handler)),
        (server) =>
          Effect.callback<void>((resume) => {
            server.close(() => resume(Effect.void))
          })
      )
      yield* Effect.callback<void, Error>((resume) => {
        server.once("error", (error) => resume(Effect.fail(error)))
        server.listen(0, "127.0.0.1", () => resume(Effect.void))
      })

      const response = yield* expectContinueRequest(tcpPort(server), "hello")
      assert.strictEqual(response.status, 200)
      assert.strictEqual(response.body, "hello")
      assert.isTrue(response.uploaded)
      assert.strictEqual(response.continues, 1)
    }))

  it.effect("rejects Expect: 100-continue without requesting the body", () =>
    Effect.gen(function*() {
      const server = Http.createServer()
      yield* HttpServer.serve(
        HttpServerRequest.HttpServerRequest.use((request) => {
          // Obtaining a body accessor must not start reading the body.
          void request.stream
          void request.text
          void request.multipart
          void request.multipartStream
          return Effect.succeed(HttpServerResponse.empty({ status: 413 }))
        })
      ).pipe(
        Layer.provide(NodeHttpServer.layer(() => server, { port: 0 })),
        Layer.build
      )

      const response = yield* expectContinueRequest(tcpPort(server), "hello")
      assert.strictEqual(response.status, 413)
      assert.strictEqual(response.continues, 0)
      assert.isFalse(response.uploaded)
    }))

  it.effect.each(["stream", "text", "json", "urlParamsBody", "arrayBuffer"] as const)(
    "sends one 100 Continue when consuming %s",
    (accessor) =>
      Effect.gen(function*() {
        const server = Http.createServer()
        yield* HttpServer.serve(
          HttpServerRequest.HttpServerRequest.use((original) => {
            const request = original.modify({ url: "/body" })
            const body = accessor === "stream"
              ? request.stream.pipe(Stream.decodeText(), Stream.mkString)
              : accessor === "arrayBuffer"
              ? request.arrayBuffer.pipe(Effect.map((buffer) => new TextDecoder().decode(buffer)))
              : accessor === "json"
              ? request.json.pipe(Effect.map((value) => String(value)))
              : accessor === "urlParamsBody"
              ? request.urlParamsBody.pipe(Effect.map(UrlParams.toString))
              : request.text
            return body.pipe(Effect.map(HttpServerResponse.text))
          })
        ).pipe(
          Layer.provide(NodeHttpServer.layer(() => server, { port: 0 })),
          Layer.build
        )

        const payload = accessor === "json" ? "\"hello\"" : accessor === "urlParamsBody" ? "hello=world" : "hello"
        const response = yield* expectContinueRequest(tcpPort(server), payload)
        assert.strictEqual(response.status, 200)
        assert.strictEqual(response.body, accessor === "urlParamsBody" ? "hello=world" : "hello")
        assert.strictEqual(response.continues, 1)
        assert.isTrue(response.uploaded)
      })
  )

  it.effect.each(["multipart", "multipartStream"] as const)(
    "sends one 100 Continue when consuming %s",
    (accessor) =>
      Effect.gen(function*() {
        const server = Http.createServer()
        yield* HttpServer.serve(
          HttpServerRequest.HttpServerRequest.use((original) => {
            const request = original.modify({ url: "/upload" })
            const field = accessor === "multipart"
              ? request.multipart.pipe(Effect.map((parts) => parts.message))
              : request.multipartStream.pipe(
                Stream.runCollect,
                Effect.map((parts) => parts.map((part) => Multipart.isField(part) ? part.value : "file").join(""))
              )
            return field.pipe(Effect.map((value) => HttpServerResponse.text(String(value))))
          })
        ).pipe(
          Layer.provide(NodeHttpServer.layer(() => server, { port: 0 })),
          Layer.build
        )

        const payload =
          "--boundary\r\nContent-Disposition: form-data; name=\"message\"\r\n\r\nhello\r\n--boundary--\r\n"
        const response = yield* expectContinueRequest(tcpPort(server), payload, {
          "content-type": "multipart/form-data; boundary=boundary"
        })
        assert.strictEqual(response.status, 200)
        assert.strictEqual(response.body, "hello")
        assert.strictEqual(response.continues, 1)
        assert.isTrue(response.uploaded)
      })
  )

  it.effect("sends one 100 Continue across repeated original and modified body reads", () =>
    Effect.gen(function*() {
      const server = Http.createServer()
      yield* HttpServer.serve(
        HttpServerRequest.HttpServerRequest.use((original) =>
          Effect.gen(function*() {
            const modified = original.modify({ url: "/body" })
            // Start both readers before the client uploads, then read their cached bodies again.
            const bodies = yield* Effect.all([original.text, modified.text], { concurrency: "unbounded" })
            const repeated = yield* Effect.all([original.text, modified.text])
            return HttpServerResponse.text([...bodies, ...repeated].join(","))
          })
        )
      ).pipe(
        Layer.provide(NodeHttpServer.layer(() => server, { port: 0 })),
        Layer.build
      )

      const response = yield* expectContinueRequest(tcpPort(server), "hello")
      assert.strictEqual(response.status, 200)
      assert.strictEqual(response.body, "hello,hello,hello,hello")
      assert.strictEqual(response.continues, 1)
      assert.isTrue(response.uploaded)
    }))

  it.effect("keeps routes isolated between independent servers", () =>
    Effect.gen(function*() {
      const publicServer = Http.createServer()
      const internalServer = Http.createServer()

      const Health = Layer.effectDiscard(
        Effect.flatMap(HttpRouter.HttpRouter, (router) =>
          router.add("GET", "/health", HttpServerResponse.text("healthy")))
      )
      const publicApp = Layer.mergeAll(
        HttpRouter.add("GET", "/public", HttpServerResponse.text("public")),
        Health
      )
      const internalApp = Layer.mergeAll(
        HttpRouter.add("GET", "/internal", HttpServerResponse.text("internal")),
        Health
      )

      yield* Layer.mergeAll(
        HttpRouter.serve(publicApp, { disableListenLog: true, disableLogger: true }).pipe(
          Layer.provide(NodeHttpServer.layer(() =>
            publicServer, { port: 0 }))
        ),
        HttpRouter.serve(internalApp, { disableListenLog: true, disableLogger: true }).pipe(
          Layer.provide(NodeHttpServer.layer(() => internalServer, { port: 0 }))
        )
      ).pipe(Layer.build)

      const status = (port: number, path: string) =>
        Effect.promise(() => fetch("http://localhost:" + port + path).then((response) => response.status))

      assert.strictEqual(yield* status(tcpPort(publicServer), "/public"), 200)
      assert.strictEqual(yield* status(tcpPort(internalServer), "/internal"), 200)
      assert.strictEqual(yield* status(tcpPort(publicServer), "/health"), 200)
      assert.strictEqual(yield* status(tcpPort(internalServer), "/health"), 200)
      assert.strictEqual(yield* status(tcpPort(publicServer), "/internal"), 404)
      assert.strictEqual(yield* status(tcpPort(internalServer), "/public"), 404)
    }))

  it.effect("takes the host header from the HTTP/2 authority", () =>
    Effect.gen(function*() {
      const server = Http2.createServer()
      yield* HttpServer.serve(
        HttpServerRequest.HttpServerRequest.use((request) =>
          Effect.succeed(HttpServerResponse.text(
            `${request.headers.host} ${Option.getOrThrow(HttpServerRequest.toURL(request)).href}`
          ))
        )
      ).pipe(
        Layer.provide(NodeHttpServer.layer(() => server, { port: 0 })),
        Layer.build
      )
      const port = tcpPort(server)

      for (const host of [undefined, "client.test"]) {
        assert.strictEqual(
          yield* http2Get(port, { ":path": "/info", ":authority": "example.test:4573", host }),
          "example.test:4573 http://example.test:4573/info"
        )
      }
    }))

  it.live("acknowledges Expect: 100-continue over HTTP/2", () =>
    Effect.gen(function*() {
      const server = Http2.createServer()
      yield* HttpServer.serve(
        HttpServerRequest.HttpServerRequest.use((request) => Effect.map(request.text, HttpServerResponse.text))
      ).pipe(
        Layer.provide(NodeHttpServer.layer(() => server, { port: 0 })),
        Layer.build
      )
      const session = yield* Effect.acquireRelease(
        Effect.sync(() => Http2.connect(`http://127.0.0.1:${tcpPort(server)}`)),
        (session) => Effect.sync(() => session.destroy())
      )
      const body = yield* Effect.callback<string, Error>((resume) => {
        const stream = session.request({ ":method": "POST", ":path": "/", expect: "100-continue" })
        let body = ""
        stream.setEncoding("utf8")
        stream.on("continue", () => stream.end("hello"))
        stream.on("data", (chunk: string) => {
          body += chunk
        })
        stream.on("end", () => resume(Effect.succeed(body)))
        stream.on("error", (error) => resume(Effect.fail(error)))
      }).pipe(Effect.timeout("2 seconds"))
      assert.strictEqual(body, "hello")
    }))

  it.effect("schema", () =>
    Effect.gen(function*() {
      yield* HttpRouter.add(
        "GET",
        "/todos/:id",
        Effect.flatMap(
          HttpRouter.schemaParams(IdParams),
          ({ id }) => todoResponse({ id, title: "test" })
        )
      ).pipe(
        HttpRouter.serve,
        Layer.build
      )
      const todo = yield* HttpClient.get("/todos/1").pipe(
        Effect.flatMap(HttpClientResponse.schemaBodyJson(Todo))
      )
      expect(todo).toEqual({ id: 1, title: "test" })
    }).pipe(Effect.provide(NodeHttpServer.layerTest)))

  it.effect("toServerResponse works behind the decompression middleware", () =>
    Effect.gen(function*() {
      yield* HttpServer.serveEffect(
        HttpServerRequest.HttpServerRequest.use((request) => {
          const responses = [request, request.modify({ url: "/modified" })].map(NodeHttpServerRequest.toServerResponse)
          return Effect.succeed(
            HttpServerResponse.text(responses.map((response) => response instanceof Http.ServerResponse).join(","))
          )
        }),
        HttpMiddleware.decompression()
      )
      const response = yield* HttpClient.post("/", {
        body: HttpBody.uint8Array(Zlib.gzipSync("hello")),
        headers: { "content-encoding": "gzip" }
      })
      assert.strictEqual(yield* response.text, "true,true")
    }).pipe(Effect.provide(NodeHttpServer.layerTest)))

  it.effect("redacts query params when inspecting requests", () =>
    Effect.gen(function*() {
      yield* HttpRouter.add(
        "GET",
        "/inspect",
        Effect.gen(function*() {
          const request = yield* HttpServerRequest.HttpServerRequest
          return yield* HttpServerResponse.json({
            url: request.url,
            json: JSON.stringify(request),
            formatted: Formatter.format(request)
          })
        }).pipe(Effect.provideService(UrlParams.CurrentRedactedNames, ["token"]))
      ).pipe(HttpRouter.serve, Layer.build)

      const result = (yield* HttpClient.get("/inspect?token=token-secret&sig=sig-visible").pipe(
        Effect.flatMap((response) => response.json)
      )) as { readonly url: string; readonly json: string; readonly formatted: string }

      assert.strictEqual(result.url, "/inspect?token=token-secret&sig=sig-visible")
      assert.match(result.json, /"url":"http:\/\/[^/"]+\/inspect\?token=REDACTED&sig=sig-visible"/)
      assert.include(result.formatted, "/inspect?token=REDACTED&sig=sig-visible")
      assert.notInclude(result.formatted, "token-secret")
    }).pipe(Effect.provide(NodeHttpServer.layerTest)))

  it.effect("redacts configured headers when inspecting requests", () =>
    Effect.gen(function*() {
      yield* HttpRouter.add(
        "GET",
        "/inspect",
        Effect.gen(function*() {
          const request = yield* HttpServerRequest.HttpServerRequest
          return yield* HttpServerResponse.json({
            json: JSON.stringify(request.headers),
            formatted: Formatter.format(request.headers)
          })
        }).pipe(Effect.provideService(Headers.CurrentRedactedNames, ["x-secret"]))
      ).pipe(HttpRouter.serve, Layer.build)

      const result = (yield* HttpClient.get("/inspect", { headers: { "x-secret": "header-secret" } }).pipe(
        Effect.flatMap((response) => response.json)
      )) as { readonly json: string; readonly formatted: string }

      assert.include(result.json, `"x-secret":"<redacted>"`)
      assert.notInclude(result.json, "header-secret")
      assert.notInclude(result.formatted, "header-secret")
    }).pipe(Effect.provide(NodeHttpServer.layerTest)))

  it.effect("schemaJson applies a JSON reviver", () =>
    Effect.gen(function*() {
      yield* HttpRouter.add(
        "POST",
        "/json",
        Effect.gen(function*() {
          const decoded = yield* HttpRouter.schemaJson(
            Schema.Struct({ body: Schema.Struct({ value: Schema.String }) }),
            { reviver: (key, value) => key === "value" ? "revived" : value }
          )
          assert.deepStrictEqual(decoded, { body: { value: "revived" } })
          return HttpServerResponse.empty()
        })
      ).pipe(HttpRouter.serve, Layer.build)

      const response = yield* HttpClient.post("/json", {
        body: HttpBody.jsonUnsafe({ value: "original" })
      })
      assert.strictEqual(response.status, 204)
    }).pipe(Effect.provide(NodeHttpServer.layerTest)))

  it.effect.each(["Uploaded", ""] as const)("forwards status text %j", (statusText) =>
    Effect.gen(function*() {
      yield* HttpRouter.add(
        "GET",
        "/",
        HttpServerResponse.empty({ status: 201, statusText })
      ).pipe(
        HttpRouter.serve,
        Layer.build
      )
      const server = yield* HttpServer.HttpServer
      assert.isTrue(NetAddress.isInetAddress(server.address))
      if (!NetAddress.isInetAddress(server.address)) return
      const port = server.address.port

      assert.strictEqual(yield* getStatusText(port), statusText)
    }).pipe(Effect.provide(NodeHttpServer.layerTest)))

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
          expect(file.path.endsWith("/test.txt")).toEqual(true)
          expect(file.contentType).toEqual("text/plain")
          return yield* HttpServerResponse.json({ ok: "file" in formData })
        })
      ).pipe(
        HttpRouter.serve,
        Layer.build
      )
      const client = yield* HttpClient.HttpClient
      const formData = new FormData()
      formData.append("file", new Blob(["test"], { type: "text/plain" }), "test.txt")
      const result = yield* client.post("/upload", { body: HttpBody.formData(formData) }).pipe(
        Effect.flatMap((r) => r.json)
      )
      expect(result).toEqual({ ok: true })
    }).pipe(Effect.provide(NodeHttpServer.layerTest)))

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
          expect(files).toHaveProperty("file")
          expect(files).toHaveProperty("test")
          return HttpServerResponse.empty()
        })
      ).pipe(
        HttpRouter.serve,
        Layer.build
      )
      const client = yield* HttpClient.HttpClient
      const formData = new FormData()
      formData.append("file", new Blob(["test"], { type: "text/plain" }), "test.txt")
      formData.append("test", "test")
      const response = yield* client.post("/upload", { body: HttpBody.formData(formData) })
      expect(response.status).toEqual(204)
    }).pipe(Effect.provide(NodeHttpServer.layerTest)))

  it.effect("formData withMaxFileSize", () =>
    Effect.gen(function*() {
      yield* HttpRouter.add(
        "POST",
        "/upload",
        Effect.gen(function*() {
          const request = yield* HttpServerRequest.HttpServerRequest
          yield* request.multipart
          return HttpServerResponse.empty()
        }).pipe(
          Effect.catchTag("MultipartError", (error) =>
            error.reason._tag === "FileTooLarge" ?
              Effect.succeed(HttpServerResponse.empty({ status: 413 })) :
              Effect.fail(error))
        )
      ).pipe(
        HttpRouter.serve,
        Layer.build,
        Effect.provideService(Multipart.MaxFileSize, ByteSize.bytes(100))
      )
      const client = yield* HttpClient.HttpClient
      const formData = new FormData()
      const data = new Uint8Array(1000)
      formData.append("file", new Blob([data], { type: "text/plain" }), "test.txt")
      const response = yield* client.post("/upload", { body: HttpBody.formData(formData) })
      expect(response.status).toEqual(413)
    }).pipe(Effect.provide(NodeHttpServer.layerTest)))

  it.effect("formData withMaxFieldSize", () =>
    Effect.gen(function*() {
      yield* HttpRouter.add(
        "POST",
        "/upload",
        Effect.gen(function*() {
          const request = yield* HttpServerRequest.HttpServerRequest
          yield* request.multipart
          return HttpServerResponse.empty()
        }).pipe(
          Effect.catchTag("MultipartError", (error) =>
            error.reason._tag === "FieldTooLarge" ?
              Effect.succeed(HttpServerResponse.empty({ status: 413 })) :
              Effect.fail(error))
        )
      ).pipe(
        HttpRouter.serve,
        Layer.build,
        Effect.provideService(Multipart.MaxFieldSize, ByteSize.bytes(100))
      )
      const client = yield* HttpClient.HttpClient
      const formData = new FormData()
      const data = new Uint8Array(1000).fill(1)
      formData.append("file", new TextDecoder().decode(data))
      const response = yield* client.post("/upload", { body: HttpBody.formData(formData) })
      expect(response.status).toEqual(413)
    }).pipe(Effect.provide(NodeHttpServer.layerTest)))

  it.effect("mountApp", () =>
    Effect.gen(function*() {
      const child = Effect.map(HttpServerRequest.HttpServerRequest, (_) => HttpServerResponse.text(_.url))
      yield* HttpRouter.use((router) => router.prefixed("/child").add("*", "*", child)).pipe(
        HttpRouter.serve,
        Layer.build
      )
      const client = yield* HttpClient.HttpClient
      const todo = yield* client.get("/child/1").pipe(Effect.flatMap((_) => _.text))
      expect(todo).toEqual("/1")
      const root = yield* client.get("/child").pipe(Effect.flatMap((_) => _.text))
      expect(root).toEqual("/")
      const rootSearch = yield* client.get("/child?foo=bar").pipe(Effect.flatMap((_) => _.text))
      expect(rootSearch).toEqual("/?foo=bar")
      const rootSlash = yield* client.get("/child/").pipe(Effect.flatMap((_) => _.text))
      expect(rootSlash).toEqual("/")
      const invalid = yield* client.get("/child1/", {
        urlParams: { foo: "bar" }
      }).pipe(Effect.map((_) => _.status))
      expect(invalid).toEqual(404)
    }).pipe(Effect.provide(NodeHttpServer.layerTest)))

  it.effect("file", () =>
    Effect.gen(function*() {
      yield* (yield* HttpServerResponse.file(`${__dirname}/fixtures/text.txt`).pipe(
        Effect.updateService(
          HttpPlatform.HttpPlatform,
          (_) => ({
            ..._,
            fileResponse: (path, options) =>
              Effect.map(
                _.fileResponse(path, options),
                (res) => {
                  ;(res as any).headers.etag = "\"etag\""
                  return res
                }
              )
          })
        )
      )).pipe(
        Effect.succeed,
        HttpServer.serveEffect()
      )
      const client = yield* HttpClient.HttpClient
      const res = yield* client.get("/")
      expect(res.status).toEqual(200)
      expect(res.headers["content-type"]).toEqual("text/plain")
      expect(res.headers["content-length"]).toEqual("27")
      expect(res.headers.etag).toEqual("\"etag\"")
      const text = yield* res.text
      expect(text.trim()).toEqual("lorem ipsum dolar sit amet")
    }).pipe(Effect.provide(NodeHttpServer.layerTest)))

  it.effect("fileWeb", () =>
    Effect.gen(function*() {
      const now = new Date()
      const file = new Buffer.File([new TextEncoder().encode("test")], "test.txt", {
        type: "text/plain",
        lastModified: now.getTime()
      })
      yield* HttpServerResponse.fileWeb(file).pipe(
        Effect.updateService(
          HttpPlatform.HttpPlatform,
          (_) => ({
            ..._,
            fileWebResponse: (path, options) =>
              Effect.map(
                _.fileWebResponse(path, options),
                (res) => ({ ...res, headers: { ...res.headers, etag: "W/\"etag\"" } })
              )
          })
        ),
        HttpServer.serveEffect()
      )
      const client = yield* HttpClient.HttpClient
      const res = yield* client.get("/")
      expect(res.status).toEqual(200)
      expect(res.headers["content-type"]).toEqual("text/plain")
      expect(res.headers["content-length"]).toEqual("4")
      expect(res.headers["last-modified"]).toEqual(now.toUTCString())
      expect(res.headers.etag).toEqual("W/\"etag\"")
      const text = yield* res.text
      expect(text.trim()).toEqual("test")
    }).pipe(Effect.provide(NodeHttpServer.layerTest)))

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
      ).pipe(
        HttpRouter.serve,
        Layer.build
      )
      const todo = yield* HttpClientRequest.post("/todos").pipe(
        HttpClientRequest.bodyUrlParams({ id: "1", title: "test" }),
        HttpClient.execute,
        Effect.flatMap(HttpClientResponse.schemaBodyJson(Todo))
      )
      expect(todo).toEqual({ id: 1, title: "test" })
    }).pipe(Effect.provide(NodeHttpServer.layerTest)))

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
        ).pipe(
          Effect.catchTag("SchemaError", (error) =>
            Effect.succeed(HttpServerResponse.jsonUnsafe({ error }, { status: 400 })))
        )
      ).pipe(
        HttpRouter.serve,
        Layer.build
      )
      const client = yield* HttpClient.HttpClient
      const response = yield* client.get("/todos")
      expect(response.status).toEqual(400)
    }).pipe(Effect.provide(NodeHttpServer.layerTest)))

  it.effect("schemaBodyFormJson", () =>
    Effect.gen(function*() {
      yield* HttpRouter.add(
        "POST",
        "/upload",
        Effect.gen(function*() {
          const result = yield* HttpServerRequest.schemaBodyFormJson(
            Schema.Struct({
              test: Schema.String
            }),
            { reviver: (key, value) => key === "test" ? "revived" : value }
          )("json")
          expect(result.test).toEqual("revived")
          return HttpServerResponse.empty()
        })
      ).pipe(
        HttpRouter.serve,
        Layer.build
      )
      const client = yield* HttpClient.HttpClient
      const formData = new FormData()
      formData.append("json", JSON.stringify({ test: "content" }))
      const response = yield* client.post("/upload", { body: HttpBody.formData(formData) })
      expect(response.status).toEqual(204)
    }).pipe(Effect.provide(NodeHttpServer.layerTest)))

  it.effect("schemaBodyFormJson file", () =>
    Effect.gen(function*() {
      yield* HttpRouter.add(
        "POST",
        "/upload",
        Effect.gen(function*() {
          const result = yield* HttpServerRequest.schemaBodyFormJson(Schema.Struct({
            test: Schema.String
          }))("json")

          expect(result.test).toEqual("content")
          return HttpServerResponse.empty()
        })
      ).pipe(
        HttpRouter.serve,
        Layer.build
      )
      const client = yield* HttpClient.HttpClient
      const formData = new FormData()
      formData.append(
        "json",
        new Blob([JSON.stringify({ test: "content" })], { type: "application/json" }),
        "test.json"
      )
      const response = yield* client.post("/upload", { body: HttpBody.formData(formData) })
      expect(response.status).toEqual(204)
    }).pipe(Effect.provide(NodeHttpServer.layerTest)))

  it.effect("schemaBodyFormJson url encoded", () =>
    Effect.gen(function*() {
      yield* HttpRouter.add(
        "POST",
        "/upload",
        Effect.gen(function*() {
          const result = yield* HttpServerRequest.schemaBodyFormJson(Schema.Struct({
            test: Schema.String
          }))("json")
          expect(result.test).toEqual("content")
          return HttpServerResponse.empty()
        })
      ).pipe(
        HttpRouter.serve,
        Layer.build
      )
      const client = yield* HttpClient.HttpClient
      const response = yield* client.post("/upload", {
        body: HttpBody.urlParams(UrlParams.fromInput({
          json: JSON.stringify({ test: "content" })
        }))
      })
      expect(response.status).toEqual(204)
    }).pipe(Effect.provide(NodeHttpServer.layerTest)))

  it.effect("tracing", () =>
    Effect.gen(function*() {
      yield* HttpRouter.add(
        "GET",
        "/",
        Effect.flatMap(
          Effect.currentSpan,
          (_) => HttpServerResponse.json({ spanId: _.spanId, parent: _.parent })
        )
      ).pipe(
        HttpRouter.serve,
        Layer.build
      )
      const client = yield* HttpClient.HttpClient
      const requestSpan = yield* Effect.makeSpan("client request")
      const body = yield* client.get("/").pipe(
        Effect.flatMap((r) => r.json),
        Effect.provideService(
          Tracer.Tracer,
          Tracer.make({
            span(options) {
              assert.strictEqual(options.name, "GET")
              assert.strictEqual(options.kind, "client")
              assert(options.parent._tag === "Some")
              if (options.parent.value._tag !== "Span") {
                throw new Error("Expected span parent")
              }
              assert.strictEqual(options.parent.value.name, "request parent")
              return requestSpan
            }
          })
        ),
        Effect.withSpan("request parent"),
        Effect.repeat({ times: 2 })
      )
      expect((body as any).parent._tag).toEqual("Some")
      expect((body as any).parent.value.spanId).toEqual(requestSpan.spanId)
    }).pipe(Effect.provide(NodeHttpServer.layerTest)))

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
      ]).pipe(
        HttpRouter.serve,
        Layer.build
      )
      const client = yield* HttpClient.HttpClient
      const home = yield* client.get("/home").pipe(Effect.flatMap((r) => r.text))
      expect(home).toEqual("<html />")
      const about = yield* client.get("/about").pipe(Effect.flatMap((r) => r.text))
      expect(about).toEqual("<html><body /></html>")
      const stream = yield* client.get("/stream").pipe(Effect.flatMap((r) => r.text))
      expect(stream).toEqual("<html><body />123hello</html>")
    }).pipe(Effect.provide(NodeHttpServer.layerTest)))

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
            expires: new Date(2022, 1, 1, 0, 0, 0, 0),
            maxAge: "5 minutes"
          })
        )
      ).pipe(
        HttpRouter.serve,
        Layer.build
      )
      const client = yield* HttpClient.HttpClient
      const res = yield* client.get("/home")
      assert.deepStrictEqual(
        res.cookies.toJSON(),
        Cookies.fromReadonlyRecord({
          test: Cookies.makeCookieUnsafe("test", "value"),
          test2: Cookies.makeCookieUnsafe("test2", "value2", {
            httpOnly: true,
            secure: true,
            sameSite: "lax",
            partitioned: true,
            path: "/",
            domain: "example.com",
            expires: new Date(2022, 1, 1, 0, 0, 0, 0),
            maxAge: Duration.minutes(5)
          })
        }).toJSON()
      )
    }).pipe(Effect.provide(NodeHttpServer.layerTest)))

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
      ).pipe(
        HttpRouter.serve,
        Layer.build
      )
      const client = yield* HttpClient.HttpClient
      const res = yield* client.get("/home")
      assert.strictEqual(res.status, 204)
    }).pipe(Effect.provide(NodeHttpServer.layerTest)))

  it.effect("completes a HEAD response once when close precedes the end callback", () =>
    Effect.gen(function*() {
      const scope = yield* Effect.scope
      const handler = yield* NodeHttpServer.makeHandler(
        Effect.succeed(HttpServerResponse.empty()),
        { scope }
      )
      const completed = Latch.makeUnsafe()
      let writableEnded = false
      const nodeResponse = Object.defineProperty(new EventEmitter(), "writableEnded", {
        get: () => writableEnded
      }) as Http.ServerResponse
      let closeListenerRemovals = 0
      nodeResponse.writeHead = () => nodeResponse
      nodeResponse.off = ((event: string | symbol, listener: (...args: Array<unknown>) => void) => {
        if (event === "close") {
          closeListenerRemovals++
        }
        return EventEmitter.prototype.off.call(nodeResponse, event, listener) as Http.ServerResponse
      }) as Http.ServerResponse["off"]
      nodeResponse.end = ((callback: () => void) => {
        writableEnded = true
        nodeResponse.emit("close")
        callback()
        completed.openUnsafe()
        return nodeResponse
      }) as Http.ServerResponse["end"]

      handler(
        { method: "HEAD", url: "/", headers: {}, socket: {} } as Http.IncomingMessage,
        nodeResponse
      )
      yield* completed.await

      assert.strictEqual(closeListenerRemovals, 1)
    }))

  it.live.each([
    { body: "Uint8Array", event: "close", response: () => HttpServerResponse.uint8Array(new Uint8Array(1024)) },
    { body: "Raw", event: "aborted", response: () => HttpServerResponse.raw(new Uint8Array(1024)) }
  ])("completes a $body response sent on $event after a disconnect", ({ event, response }) =>
    Effect.gen(function*() {
      const server = Http.createServer()
      const scope = yield* Scope.make()
      // A stuck uninterruptible request fiber would block the server's shutdown
      yield* Effect.addFinalizer(() => Effect.forkDetach(Scope.close(scope, Exit.void)))
      const received = yield* Latch.make()
      const sent = yield* Deferred.make<HttpServerResponse.HttpServerResponse, unknown>()
      yield* HttpRouter.add(
        "GET",
        "/",
        Effect.gen(function*() {
          const incoming = NodeHttpServerRequest.toIncomingMessage(yield* HttpServerRequest.HttpServerRequest)
          yield* received.open
          // Node emits the request's `aborted` before it marks the response destroyed
          yield* Effect.callback<void>((resume) => {
            if (incoming.socket.destroyed) return resume(Effect.void)
            ;(event === "aborted" ? incoming : incoming.socket).once(event, () => resume(Effect.void))
          })
          return response()
        }),
        { uninterruptible: true }
      ).pipe(
        (app) =>
          HttpRouter.serve(app, { middleware: (app) => Effect.onExit(app, (exit) => Deferred.done(sent, exit)) }),
        Layer.provide(NodeHttpServer.layer(() => server, { port: 0 })),
        Layer.buildWithScope(scope)
      )
      const socket = Net.connect({ port: tcpPort(server), host: "127.0.0.1" }, () => {
        socket.write("GET / HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n")
      })
      socket.on("error", constVoid)
      yield* received.await
      socket.destroy()
      const res = yield* Deferred.await(sent).pipe(Effect.timeout("2 seconds"))
      assert.strictEqual(res.status, 200)
    }))

  it.effect("returns none when a late remoteAddress read finds no socket", () =>
    Effect.gen(function*() {
      const scope = yield* Effect.scope
      let request: HttpServerRequest.HttpServerRequest | undefined
      const handler = yield* NodeHttpServer.makeHandler(
        Effect.gen(function*() {
          request = yield* HttpServerRequest.HttpServerRequest
          return HttpServerResponse.empty()
        }),
        { scope }
      )
      const completed = Latch.makeUnsafe()
      let writableEnded = false
      const nodeResponse = Object.defineProperty(new EventEmitter(), "writableEnded", {
        get: () => writableEnded
      }) as Http.ServerResponse
      nodeResponse.writeHead = () => nodeResponse
      nodeResponse.end = (() => {
        writableEnded = true
        completed.openUnsafe()
        return nodeResponse
      }) as Http.ServerResponse["end"]
      const nodeRequest = {
        method: "GET",
        url: "/",
        headers: {},
        socket: { remoteAddress: "127.0.0.1" }
      } as unknown as Http.IncomingMessage

      handler(nodeRequest, nodeResponse)
      yield* completed.await
      assert(request !== undefined)
      ;(nodeRequest as unknown as { socket: null }).socket = null

      assert.deepStrictEqual(request.remoteAddress, Option.none())
    }))

  it.effect("coalesces streaming chunks from the same pull", () =>
    Effect.gen(function*() {
      const scope = yield* Effect.scope
      const handler = yield* NodeHttpServer.makeHandler(
        Effect.succeed(HttpServerResponse.stream(Stream.make(
          Buffer.Buffer.from("a"),
          Buffer.Buffer.from("b")
        ))),
        { scope }
      )
      const completed = Latch.makeUnsafe()
      const writes: Array<Uint8Array> = []
      let writableEnded = false
      const nodeResponse = Object.defineProperty(new EventEmitter(), "writableEnded", {
        get: () => writableEnded
      }) as Http.ServerResponse
      nodeResponse.writeHead = () => nodeResponse
      nodeResponse.write = ((chunk: Uint8Array) => {
        writes.push(chunk)
        return true
      }) as Http.ServerResponse["write"]
      nodeResponse.end = (() => {
        writableEnded = true
        completed.openUnsafe()
        return nodeResponse
      }) as Http.ServerResponse["end"]

      handler(
        { method: "GET", url: "/", headers: {}, socket: {} } as Http.IncomingMessage,
        nodeResponse
      )
      yield* completed.await

      assert.deepStrictEqual(writes.map((chunk) => Buffer.Buffer.from(chunk).toString()), ["ab"])
    }))

  it.effect("waits for drain after a streaming write applies backpressure", () =>
    Effect.gen(function*() {
      const scope = yield* Effect.scope
      const handler = yield* NodeHttpServer.makeHandler(
        Effect.succeed(HttpServerResponse.stream(Stream.make(
          Buffer.Buffer.from("a"),
          Buffer.Buffer.from("b")
        ))),
        { scope }
      )
      const writeObserved = Latch.makeUnsafe()
      const completed = Latch.makeUnsafe()
      let writableEnded = false
      const nodeResponse = Object.defineProperty(new EventEmitter(), "writableEnded", {
        get: () => writableEnded
      }) as Http.ServerResponse
      let writeCount = 0
      nodeResponse.writeHead = () => nodeResponse
      nodeResponse.write = (() => {
        writeCount++
        queueMicrotask(() => writeObserved.openUnsafe())
        return writeCount > 1
      }) as Http.ServerResponse["write"]
      nodeResponse.end = (() => {
        writableEnded = true
        completed.openUnsafe()
        return nodeResponse
      }) as Http.ServerResponse["end"]

      handler(
        { method: "GET", url: "/", headers: {}, socket: {} } as Http.IncomingMessage,
        nodeResponse
      )
      yield* writeObserved.await
      assert.strictEqual(nodeResponse.writableEnded, false)

      nodeResponse.emit("drain")
      yield* completed.await
      assert.strictEqual(writeCount, 1)
    }))

  it.live.each([
    { method: "GET", status: 204 },
    { method: "GET", status: 205 },
    { method: "GET", status: 304 },
    { method: "HEAD", status: 204 },
    { method: "HEAD", status: 205 }
  ])("sends no body for $method with status $status", ({ method, status }) =>
    Effect.gen(function*() {
      yield* HttpServer.serveEffect(Effect.succeed(HttpServerResponse.text("x", { status })))
      const server = yield* HttpServer.HttpServer
      const received = yield* rawGet((server.address as NetAddress.InetAddress).port, ["/"], method)
      assert.match(received, new RegExp(`^HTTP/1.1 ${status} `))
      assert.isTrue(received.endsWith("\r\n\r\n"))
      // 304 describes the representation, 204 and 205 have no content.
      if (status === 304) {
        assert.match(received, /\r\ncontent-length: 1\r\n/i)
      } else {
        assert.notMatch(received, /\r\ncontent-length:/i)
      }
    }).pipe(Effect.provide(NodeHttpServer.layerTest)))

  it.live.each([
    {
      body: "Uint8Array",
      contentLength: 3,
      response: () => HttpServerResponse.text("hello").pipe(HttpServerResponse.setHeader("content-length", "3"))
    },
    {
      body: "Raw file Readable",
      contentLength: 3,
      response: () =>
        HttpServerResponse.raw(createReadStream(new URL("./fixtures/text.txt", import.meta.url)), { contentLength: 3 })
    },
    {
      body: "FormData",
      contentLength: 3,
      response: () => {
        const formData = new FormData()
        formData.append("text", "hello")
        return HttpServerResponse.formData(formData, { headers: { "content-length": "3" } })
      }
    },
    {
      body: "Stream",
      contentLength: 10,
      response: () => HttpServerResponse.stream(Stream.make(Buffer.Buffer.from("hello")), { contentLength: 10 })
    }
  ])(
    "aborts the connection when a $body body doesn't match content-length",
    ({ contentLength, response }) =>
      Effect.gen(function*() {
        yield* Layer.mergeAll(
          HttpRouter.add("GET", "/mismatch", Effect.sync(response)),
          HttpRouter.add("GET", "/next", HttpServerResponse.text("next"))
        ).pipe(
          HttpRouter.serve,
          Layer.build
        )
        const server = yield* HttpServer.HttpServer
        const received = yield* rawGet((server.address as NetAddress.InetAddress).port, ["/mismatch", "/next"])
        // The client must neither wait for the declared body nor read the next response as part of it.
        const headEnd = received.indexOf("\r\n\r\n")
        const body = headEnd === -1 ? "" : received.slice(headEnd + 4)
        assert.isBelow(body.length, contentLength)
      }).pipe(Effect.provide(NodeHttpServer.layerTest))
  )

  it.effect("aborts the response when a streamed body fails after it started", () =>
    Effect.gen(function*() {
      const received = yield* Latch.make()
      yield* HttpRouter.add(
        "GET",
        "/stream",
        HttpServerResponse.stream(
          Stream.make(Buffer.Buffer.from("partial")).pipe(
            Stream.concat(Stream.fromEffect(received.await.pipe(Effect.andThen(Effect.fail("boom")))))
          )
        )
      ).pipe(
        HttpRouter.serve,
        Layer.build
      )
      const response = yield* HttpClient.get("/stream")
      assert.strictEqual(response.status, 200)
      let body = ""
      const exit = yield* response.stream.pipe(
        Stream.runForEach((chunk) => {
          body += Buffer.Buffer.from(chunk).toString()
          return received.open
        }),
        Effect.exit
      )
      assert.strictEqual(body, "partial")
      assert.isTrue(Exit.isFailure(exit))
    }).pipe(Effect.provide(NodeHttpServer.layerTest)))

  describe("when writeHead throws", () => {
    it.live("answers rejected HTTP/1.1 headers with a 500 and reports the failure", () =>
      Effect.gen(function*() {
        const observed = yield* Deferred.make<Exit.Exit<unknown, unknown>>()
        yield* HttpServer.serve(
          Effect.succeed(HttpServerResponse.formData(new FormData(), { headers: { "x-invalid": "a\nb" } })),
          (app) => Effect.onExit(app, (exit) => Deferred.succeed(observed, exit))
        ).pipe(Layer.build)

        const response = yield* HttpClient.get("/")
        assert.strictEqual(response.status, 500)
        assert.strictEqual(yield* response.text, "")
        assert.isTrue(Exit.isFailure(yield* Deferred.await(observed)))
      }).pipe(Effect.timeout("2 seconds"), Effect.provide(NodeHttpServer.layerTest)))

    it.live.each(
      [
        { method: "GET", status: 103 },
        { method: "GET", status: 600 },
        { method: "HEAD", status: 600 }
      ] as const
    )(
      "answers a $method response with status $status with a 500 and destroys the raw body",
      ({ method, status }) =>
        Effect.gen(function*() {
          const body = Readable.from(["ok"])
          const observed = yield* Deferred.make<Exit.Exit<unknown, unknown>>()
          yield* HttpServer.serve(
            Effect.succeed(HttpServerResponse.raw(body, { status })),
            (app) => Effect.onExit(app, (exit) => Deferred.succeed(observed, exit))
          ).pipe(Layer.build)

          const response = yield* HttpClient.execute(HttpClientRequest.make(method)("/"))
          assert.strictEqual(response.status, 500)
          assert.isTrue(Exit.isFailure(yield* Deferred.await(observed)))
          assert.isTrue(body.destroyed)
        }).pipe(Effect.timeout("2 seconds"), Effect.provide(NodeHttpServer.layerTest))
    )
  })

  it.live("answers keep-alive requests while graceful shutdown drains an existing connection", () => {
    const requestStarted = Latch.makeUnsafe()
    const releaseResponse = Latch.makeUnsafe()
    const firstResponse = Latch.makeUnsafe()
    const secondResponse = Latch.makeUnsafe()
    const server = Http.createServer()
    server.keepAliveTimeout = 5000
    const runtime = ManagedRuntime.make(
      HttpServer.serve(Effect.gen(function*() {
        yield* requestStarted.open
        yield* releaseResponse.await
        return HttpServerResponse.text("ok")
      })).pipe(
        Layer.provide(NodeHttpServer.layer(() => server, {
          host: "127.0.0.1",
          port: 0,
          gracefulShutdownTimeout: "10 seconds"
        }))
      )
    )
    let socket: Net.Socket | undefined
    let responseData = ""

    return Effect.gen(function*() {
      yield* Effect.promise(() => runtime.context())
      const connection = Net.connect(tcpPort(server), "127.0.0.1")
      socket = connection
      connection.on("data", (chunk) => {
        responseData += chunk.toString()
        if (responseData.includes("\r\n\r\nok")) firstResponse.openUnsafe()
        if ((responseData.match(/HTTP\/1\.1 \d{3}/g) ?? []).length >= 2) secondResponse.openUnsafe()
      })
      yield* Effect.callback<void, Error>((resume) => {
        connection.once("connect", () => resume(Effect.void))
        connection.on("error", (error) => resume(Effect.fail(error)))
      }).pipe(Effect.timeout("2 seconds"))

      connection.write("GET /first HTTP/1.1\r\nHost: localhost\r\n\r\n")
      yield* requestStarted.await.pipe(Effect.timeout("2 seconds"))
      const disposed = runtime.dispose()
      // Wait for server.close() to stop listening, without letting the first request finish.
      yield* Effect.callback<void>((resume) => {
        const timer = setInterval(() => {
          if (!server.listening) resume(Effect.void)
        }, 1)
        return Effect.sync(() => clearInterval(timer))
      }).pipe(Effect.timeout("2 seconds"))

      releaseResponse.openUnsafe()
      yield* firstResponse.await.pipe(Effect.timeout("2 seconds"))
      assert.include(responseData, "HTTP/1.1 200")
      connection.write("GET /second HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n")
      const answered = yield* secondResponse.await.pipe(Effect.timeoutOption("1 second"))
      assert.strictEqual(
        answered._tag,
        "Some",
        "the second keep-alive request must receive a response before the shutdown timeout"
      )
      yield* Effect.promise(() => disposed).pipe(Effect.timeout("2 seconds"))
    }).pipe(
      Effect.ensuring(
        Effect.sync(() => {
          releaseResponse.openUnsafe()
          socket?.destroy()
          server.closeAllConnections()
        }).pipe(Effect.andThen(Effect.promise(() => runtime.dispose())))
      )
    )
  })

  it.live("closes idle HTTP/2 sessions on shutdown", () =>
    Effect.gen(function*() {
      const server = Http2.createServer()
      const scope = yield* Scope.make()
      yield* HttpServer.serve(Effect.succeed(HttpServerResponse.text("ok"))).pipe(
        Layer.provide(NodeHttpServer.layer(() => server, { port: 0, gracefulShutdownTimeout: "10 seconds" })),
        Layer.buildWithScope(scope)
      )
      const session = yield* Effect.acquireRelease(
        Effect.sync(() => Http2.connect(`http://127.0.0.1:${tcpPort(server)}`)),
        (session) => Effect.sync(() => session.destroy())
      )
      session.on("error", constVoid)
      yield* Effect.callback<void>((resume) => {
        session.once("connect", () => resume(Effect.void))
      }).pipe(Effect.timeout("2 seconds"))

      // Finalizers are uninterruptible, so the timeout applies to the join
      const closed = yield* Effect.forkDetach(Scope.close(scope, Exit.void))
      yield* Fiber.join(closed).pipe(Effect.timeout("2 seconds"))
    }))

  it.live("closes HTTP/2 sessions whose TLS handshake finishes during shutdown", () =>
    Effect.gen(function*() {
      const server = Http2.createSecureServer({ cert: tlsCert, key: tlsKey })
      const scope = yield* Scope.make()
      yield* HttpServer.serve(Effect.succeed(HttpServerResponse.text("ok"))).pipe(
        Layer.provide(NodeHttpServer.layer(() => server, { port: 0, gracefulShutdownTimeout: "10 seconds" })),
        Layer.buildWithScope(scope)
      )
      const port = tcpPort(server)
      const socket = yield* Effect.acquireRelease(
        Effect.sync(() => Net.connect(port, "127.0.0.1")),
        (socket) => Effect.sync(() => socket.destroy())
      )
      yield* Effect.callback<void>((resume) => {
        server.once("connection", () => resume(Effect.void))
      }).pipe(Effect.timeout("2 seconds"))

      // Finalizers are uninterruptible, so the timeout applies to the join
      const closed = yield* Effect.forkDetach(Scope.close(scope, Exit.void))
      yield* Effect.callback<void>((resume) => {
        const timer = setInterval(() => {
          if (!server.listening) resume(Effect.void)
        }, 1)
        return Effect.sync(() => clearInterval(timer))
      }).pipe(Effect.timeout("2 seconds"))
      const session = Http2.connect(`https://127.0.0.1:${port}`, {
        createConnection: () => Tls.connect({ socket, ca: tlsCert, ALPNProtocols: ["h2"] })
      })
      yield* Effect.addFinalizer(() => Effect.sync(() => session.destroy()))
      session.on("error", constVoid)
      // The server sends its settings once the session exists
      yield* Effect.callback<void>((resume) => {
        session.once("remoteSettings", () => resume(Effect.void))
      }).pipe(Effect.timeout("2 seconds"))

      yield* Fiber.join(closed).pipe(Effect.timeout("2 seconds"))
    }))

  it.live("disposes after a client aborts a handler awaiting an upstream request", () => {
    const upstreamStarted = Latch.makeUnsafe()
    const upstream = Http.createServer(() => {
      upstreamStarted.openUnsafe()
    })
    const server = Http.createServer()
    const router = HttpRouter.use((router) =>
      router.add(
        "GET",
        "/",
        Effect.gen(function*() {
          const request = yield* HttpServerRequest.HttpServerRequest
          if (request.method !== "HEAD") {
            return HttpServerResponse.text("ok")
          }
          yield* HttpClient.head(`http://localhost:${tcpPort(upstream)}`)
          return HttpServerResponse.empty()
        })
      )
    )
    const runtime = ManagedRuntime.make(
      Layer.effectDiscard(
        HttpRouter.serve(router).pipe(
          Layer.provide(NodeHttpServer.layer(() => server, {
            port: 0,
            gracefulShutdownTimeout: "100 millis"
          })),
          Layer.provide(FetchHttpClient.layer),
          Layer.launch,
          Effect.forkScoped,
          Effect.asVoid
        )
      )
    )

    return Effect.gen(function*() {
      yield* Effect.callback<void>((resume) => {
        upstream.listen(0, () => resume(Effect.void))
      })
      yield* Effect.promise(() => runtime.context())
      yield* Effect.callback<void>((resume) => {
        if (server.listening) {
          resume(Effect.void)
        } else {
          server.once("listening", () => resume(Effect.void))
        }
      })

      const downstreamClosed = Latch.makeUnsafe()
      const downstream = Http.request({ method: "HEAD", port: tcpPort(server), path: "/" })
      downstream.on("error", () => {})
      downstream.on("close", () => downstreamClosed.openUnsafe())
      downstream.end()
      yield* upstreamStarted.await
      downstream.destroy()
      yield* downstreamClosed.await

      const disposed = yield* Effect.promise(() => runtime.dispose()).pipe(
        Effect.timeoutOption("2 seconds")
      )
      assert.strictEqual(disposed._tag, "Some")
    }).pipe(
      Effect.ensuring(
        Effect.sync(() => {
          upstream.closeAllConnections()
          upstream.close()
        }).pipe(
          Effect.andThen(Effect.promise(() => runtime.dispose())),
          Effect.timeoutOrElse({ duration: "2 seconds", orElse: () => Effect.void })
        )
      )
    )
  })

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
        yield* HttpRouter.add(
          "GET",
          "/home",
          new CustomError({ name: "test" })
        ).pipe(
          HttpRouter.serve,
          Layer.build
        )
        const client = yield* HttpClient.HttpClient
        const res = yield* client.get("/home")
        assert.strictEqual(res.status, 599)
        const err = yield* HttpClientResponse.schemaBodyJson(CustomError)(res)
        assert.deepStrictEqual(err, new CustomError({ name: "test" }))
      }).pipe(Effect.provide(NodeHttpServer.layerTest)))

    it.effect("httpapi error", () =>
      Effect.gen(function*() {
        yield* HttpRouter.add(
          "GET",
          "/home",
          new HttpApiError.BadRequest({})
        ).pipe(
          HttpRouter.serve,
          Layer.build
        )
        const client = yield* HttpClient.HttpClient
        const res = yield* client.get("/home")
        assert.strictEqual(res.status, 400)
      }).pipe(Effect.provide(NodeHttpServer.layerTest)))
  })

  it.effect("RouterConfig", () =>
    Effect.gen(function*() {
      yield* HttpRouter.add(
        "GET",
        "/:param",
        Effect.succeed(HttpServerResponse.empty())
      ).pipe(
        HttpRouter.serve,
        Layer.build
      )
      let res = yield* HttpClient.get("/123456")
      assert.strictEqual(res.status, 404)
      res = yield* HttpClient.get("/12345")
      assert.strictEqual(res.status, 204)
    }).pipe(
      Effect.provide([
        NodeHttpServer.layerTest,
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
          Effect.flatMap(
            HttpRouter.schemaParams(IdParams),
            ({ id }) => todoResponse({ id, title: "test" })
          )
        )
        yield* router.addAll([
          HttpRouter.route("GET", "/", Effect.succeed(HttpServerResponse.text("root")))
        ])
      })))

      yield* Layer.build(handler)

      const todo = yield* HttpClient.get("/todos/1").pipe(
        Effect.flatMap(HttpClientResponse.schemaBodyJson(Todo))
      )
      expect(todo).toEqual({ id: 1, title: "test" })
      const root = yield* HttpClient.get("/todos").pipe(
        Effect.flatMap((r) => r.text)
      )
      expect(root).toEqual("root")
    }).pipe(Effect.provide(NodeHttpServer.layerTest)))

  it.effect("logs and traces status 101 after an upgraded WebSocket closes", () =>
    Effect.gen(function*() {
      const logged = yield* Deferred.make<unknown>()
      const logger = Logger.make((options) => {
        const annotations = options.fiber.getRef(References.CurrentLogAnnotations)
        if (annotations["http.url"] === "/ws") {
          Deferred.doneUnsafe(logged, Effect.succeed(annotations["http.status"]))
        }
      })
      const traced = yield* Deferred.make<unknown>()
      const tracer = Tracer.make({
        span(options) {
          const span = new Tracer.NativeSpan(options)
          if (options.kind === "server") {
            span.end = (endTime, exit) => {
              Tracer.NativeSpan.prototype.end.call(span, endTime, exit)
              Deferred.doneUnsafe(traced, Effect.succeed(span.attributes.get("http.response.status_code")))
            }
          }
          return span
        }
      })
      yield* HttpRouter.add(
        "GET",
        "/ws",
        Effect.gen(function*() {
          const request = yield* HttpServerRequest.HttpServerRequest
          const socket = yield* request.upgrade
          yield* Stream.runDrain(Socket.toStream(socket)).pipe(Effect.ignore)
          return HttpServerResponse.empty()
        })
      ).pipe(
        (layer) => HttpRouter.serve(layer, { disableListenLog: true }),
        Layer.provide(Logger.layer([logger])),
        Layer.provide(Layer.succeed(Tracer.Tracer)(tracer)),
        Layer.build
      )
      const server = yield* HttpServer.HttpServer
      const port = (server.address as NetAddress.InetAddress).port
      const handshakeStatus = yield* Effect.callback<number | undefined, Error>((resume) => {
        const ws = new NodeWS.WebSocket(`ws://127.0.0.1:${port}/ws`)
        let status: number | undefined
        ws.on("upgrade", (response) => {
          status = response.statusCode
        })
        ws.on("open", () => ws.close(1000))
        ws.on("close", () => resume(Effect.succeed(status)))
        ws.on("error", (error) => resume(Effect.fail(error)))
        return Effect.sync(() => ws.close())
      })
      assert.strictEqual(handshakeStatus, 101)
      assert.strictEqual(yield* Deferred.await(logged), 101)
      assert.strictEqual(yield* Deferred.await(traced), 101)
    }).pipe(Effect.timeout("5 seconds"), Effect.provide(layerTestWebsocket)), 10000)

  for (const failHandler of [false, true]) {
    it.effect(
      `logs the fallback status when an upgrade fails and the handler ${failHandler ? "fails" : "recovers"}`,
      () =>
        Effect.gen(function*() {
          const logged = yield* Deferred.make<unknown>()
          const logger = Logger.make((options) => {
            const annotations = options.fiber.getRef(References.CurrentLogAnnotations)
            if (annotations["http.url"] === "/ws") {
              Deferred.doneUnsafe(logged, Effect.succeed(annotations["http.status"]))
            }
          })
          yield* HttpRouter.add(
            "GET",
            "/ws",
            Effect.gen(function*() {
              const request = yield* HttpServerRequest.HttpServerRequest
              const result = yield* Effect.exit(request.upgrade)
              assert.isTrue(Exit.isFailure(result))
              if (failHandler) return yield* Effect.fail(new Error("upgrade failed"))
              return HttpServerResponse.empty({ status: 426 })
            })
          ).pipe(
            (layer) => HttpRouter.serve(layer, { disableListenLog: true }),
            Layer.provide(Logger.layer([logger])),
            Layer.build
          )
          // An ordinary HTTP request has no upgrade transport, so acquisition fails.
          const response = yield* HttpClient.get("/ws")
          assert.strictEqual(response.status, failHandler ? 500 : 426)
          assert.strictEqual(yield* Deferred.await(logged), response.status)
        }).pipe(Effect.timeout("5 seconds"), Effect.provide(layerTestWebsocket)),
      10000
    )
  }

  it.effect("websocket options are forwarded to the WebSocketServer", () =>
    Effect.gen(function*() {
      yield* HttpRouter.add(
        "GET",
        "/ws",
        Effect.gen(function*() {
          const request = yield* HttpServerRequest.HttpServerRequest
          const socket = yield* Effect.orDie(request.upgrade)
          yield* Effect.gen(function*() {
            const { pull } = yield* socket.reader
            while (true) {
              yield* pull
            }
          }).pipe(
            Effect.scoped,
            Effect.catchTag("SocketError", () => Effect.void),
            Effect.orDie
          )
          return HttpServerResponse.empty()
        })
      ).pipe(
        HttpRouter.serve,
        Layer.build
      )
      const server = yield* HttpServer.HttpServer
      const port = (server.address as NetAddress.InetAddress).port

      const connect = (perMessageDeflate: boolean) =>
        Effect.acquireRelease(
          Effect.callback<NodeWS.WebSocket, Error>((resume) => {
            const ws = new NodeWS.WebSocket(`ws://127.0.0.1:${port}/ws`, { perMessageDeflate })
            ws.on("open", () => resume(Effect.succeed(ws)))
            ws.on("error", (error) => resume(Effect.fail(error)))
          }),
          (ws) => Effect.sync(() => ws.close())
        )

      // layerTest configures websocket: { perMessageDeflate: true }, so the
      // server accepts the extension when the client offers it...
      const compressed = yield* connect(true)
      expect(compressed.extensions).toContain("permessage-deflate")

      // ...and clients that do not offer it still connect uncompressed.
      const plain = yield* connect(false)
      expect(plain.extensions).not.toContain("permessage-deflate")
    }).pipe(Effect.scoped, Effect.provide(layerTestWebsocket)))

  for (
    const [name, exit, code] of [
      ["success", "success", 1000],
      ["interrupt", "interrupt", 1001],
      ["failure", "failure", 1011],
      ["defect", "defect", 1011],
      ["explicit close before failure", "explicit", 4400]
    ] as const
  ) {
    it.effect(`closes a WebSocket with the handler's ${name} code`, () =>
      Effect.gen(function*() {
        const opened = yield* Deferred.make<void>()
        yield* HttpRouter.add(
          "GET",
          "/ws",
          Effect.gen(function*() {
            const request = yield* HttpServerRequest.HttpServerRequest
            const socket = yield* request.upgrade
            yield* socket.reader
            yield* Deferred.await(opened)
            if (exit === "explicit") {
              const writer = yield* socket.writer
              yield* writer.write(new Socket.CloseEvent(4400, "handler closed"))
            }
            if (exit === "interrupt") return yield* Effect.interrupt
            if (exit === "failure" || exit === "explicit") return yield* Effect.fail(new Error("handler failed"))
            if (exit === "defect") return yield* Effect.die(new Error("handler defect"))
            return HttpServerResponse.empty()
          })
        ).pipe((layer) => HttpRouter.serve(layer), Layer.build)
        const server = yield* HttpServer.HttpServer
        const port = (server.address as NetAddress.InetAddress).port
        const actual = yield* Effect.callback<number, Error>((resume) => {
          const ws = new NodeWS.WebSocket(`ws://127.0.0.1:${port}/ws`)
          ws.on("open", () => {
            Effect.runSync(Deferred.succeed(opened, undefined))
          })
          ws.on("close", (code) => resume(Effect.succeed(code)))
          ws.on("error", (error) => resume(Effect.fail(error)))
          return Effect.sync(() => ws.close())
        })
        assert.strictEqual(actual, code)
      }).pipe(Effect.timeout("5 seconds"), Effect.provide(layerTestWebsocket)), 10000)
  }

  it.effect("an upgrade connection reset by the peer does not crash the process", () =>
    Effect.gen(function*() {
      yield* HttpRouter.add("GET", "/", HttpServerResponse.text("ok")).pipe(
        HttpRouter.serve,
        Layer.build
      )
      const server = yield* HttpServer.HttpServer
      const port = (server.address as NetAddress.InetAddress).port

      const uncaught: Array<unknown> = []
      const onUncaught = (error: unknown) => uncaught.push(error)
      process.on("uncaughtException", onUncaught)
      yield* Effect.addFinalizer(() => Effect.sync(() => process.off("uncaughtException", onUncaught)))

      yield* Effect.callback<void>((resume) => {
        const socket = Net.connect({ port, host: "127.0.0.1" }, () => {
          socket.write(
            "GET /ws HTTP/1.1\r\n" +
              "Host: 127.0.0.1\r\n" +
              "Upgrade: websocket\r\n" +
              "Connection: Upgrade\r\n" +
              "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n" +
              "Sec-WebSocket-Version: 13\r\n\r\n"
          )
          setTimeout(() => {
            socket.resetAndDestroy()
            setTimeout(() => resume(Effect.void), 50)
          }, 50)
        })
        socket.on("error", () => {})
      })

      expect(uncaught).toEqual([])
      const response = yield* HttpClient.get("/")
      expect(response.status).toEqual(200)
    }).pipe(Effect.provide(layerTestWebsocket)))

  it.effect("fails refused websocket handshakes without hanging shutdown", () =>
    Effect.gen(function*() {
      const outcome = yield* Deferred.make<Socket.SocketError | undefined>()
      yield* HttpRouter.add(
        "GET",
        "/ws",
        Effect.gen(function*() {
          const request = yield* HttpServerRequest.HttpServerRequest
          const socket = yield* request.upgrade
          const error = yield* Effect.scoped(socket.reader).pipe(
            Effect.match({ onFailure: (error) => error, onSuccess: () => undefined })
          )
          yield* Deferred.succeed(outcome, error)
          return HttpServerResponse.empty()
        })
      ).pipe(
        HttpRouter.serve,
        Layer.build
      )
      const server = yield* HttpServer.HttpServer
      const port = (server.address as NetAddress.InetAddress).port

      const status = yield* Effect.callback<number | undefined, Error>((resume) => {
        const req = Http.request({
          hostname: "127.0.0.1",
          port,
          agent: false,
          path: "/ws",
          method: "GET",
          headers: {
            Connection: "Upgrade",
            Upgrade: "websocket",
            "Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ==",
            "Sec-WebSocket-Version": "12" // Unsupported version forces handshake rejection.
          }
        })
        req.on("response", (res) => {
          res.resume()
          res.on("end", () => resume(Effect.succeed(res.statusCode)))
        })
        req.on("error", (error) => resume(Effect.fail(error)))
        req.end()
        return Effect.sync(() => req.destroy())
      })
      assert.strictEqual(status, 400)
      assert.isTrue(Socket.SocketError.is(yield* Deferred.await(outcome)))
    }).pipe(Effect.provide(layerTestWebsocket), Effect.scoped))

  it.effect("does not write the HTTP response to an upgraded connection", () =>
    Effect.gen(function*() {
      yield* HttpRouter.add(
        "GET",
        "/ws",
        Effect.gen(function*() {
          const request = yield* HttpServerRequest.HttpServerRequest
          const socket = yield* Effect.orDie(request.upgrade)
          yield* Effect.asVoid(socket.reader)
          const writer = yield* socket.writer
          yield* writer.write("refused")
          yield* writer.write(new Socket.CloseEvent(4400, "refused"))
          return HttpServerResponse.empty()
        }).pipe(Effect.scoped)
      ).pipe(
        HttpRouter.serve,
        Layer.build
      )
      const server = yield* HttpServer.HttpServer
      const port = (server.address as NetAddress.InetAddress).port
      const { frames, trailing } = yield* Effect.promise(() => rawWebSocket(port, "/ws"))
      assert.strictEqual(frames.length, 2)
      assert.strictEqual(frames[0].opcode, 1)
      assert.strictEqual(frames[0].payload.toString(), "refused")
      assert.strictEqual(frames[1].opcode, 8)
      assert.strictEqual(frames[1].payload.readUInt16BE(0), 4400)
      assert.strictEqual(trailing.toString(), "")
    }).pipe(Effect.provide(layerTestWebsocket)))

  it.effect("writes the HTTP response when the upgrade is not consumed", () =>
    Effect.gen(function*() {
      yield* HttpRouter.add(
        "GET",
        "/no-ws",
        HttpServerResponse.text("upgrade refused", { status: 426 })
      ).pipe(
        HttpRouter.serve,
        Layer.build
      )
      const server = yield* HttpServer.HttpServer
      const port = (server.address as NetAddress.InetAddress).port
      const response = yield* Effect.promise(() => rawUpgradeRequest(port, "/no-ws"))
      assert.match(response, /^HTTP\/1\.1 426/)
      assert.match(response, /upgrade refused/)
    }).pipe(Effect.provide(layerTestWebsocket)))

  it.effect("switches other protocols to the raw connection", () =>
    Effect.gen(function*() {
      yield* HttpRouter.add(
        "POST",
        "/attach",
        Effect.gen(function*() {
          const request = yield* HttpServerRequest.HttpServerRequest
          const socket = yield* Effect.orDie(request.upgrade)
          const reader = yield* socket.reader
          const writer = yield* socket.writer
          const decoder = new TextDecoder()
          let received = ""
          while (true) {
            const chunks = yield* reader.pull.pipe(
              Effect.catchReason("SocketError", "SocketCloseError", () => Effect.succeed(undefined))
            )
            if (chunks === undefined) break
            for (const chunk of chunks) received += typeof chunk === "string" ? chunk : decoder.decode(chunk)
          }
          // the client half-closed, but the connection stays writable
          yield* writer.write(`echo:${received}`)
          return HttpServerResponse.empty()
        }).pipe(Effect.scoped)
      ).pipe(
        HttpRouter.serve,
        Layer.build
      )
      const server = yield* HttpServer.HttpServer
      const port = (server.address as NetAddress.InetAddress).port
      // The bytes after the request head arrive with it, before the 101.
      const response = yield* Effect.promise(() =>
        rawExchange(
          port,
          "POST /attach HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: Upgrade\r\nUpgrade: tcp\r\n\r\nearly"
        )
      )
      assert.strictEqual(
        response,
        "HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: tcp\r\n\r\necho:early"
      )
    }).pipe(Effect.provide(layerTestWebsocket)))

  it.effect.each([
    {
      name: "a Content-Length body split from the head",
      input: [
        "POST /attach HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: Upgrade\r\nUpgrade: tcp\r\nContent-Length: 5\r\n\r\nhe",
        "lloearly"
      ],
      read: true,
      upgrades: true
    },
    {
      name: "an unread Content-Length body",
      input: [
        "POST /attach HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: Upgrade\r\nUpgrade: tcp\r\nContent-Length: 5\r\n\r\nhe",
        "lloearly"
      ],
      read: false,
      upgrades: true
    },
    {
      name: "a chunked body",
      input: [
        "POST /attach HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: Upgrade\r\nUpgrade: tcp\r\nTransfer-Encoding: chunked\r\n\r\n5\r\nhe",
        "llo\r\n0\r\n\r\nearly"
      ],
      read: true,
      // Node 25 and older do not parse upgrade request bodies, and only Content-Length is framed by hand.
      upgrades: Number(process.versions.node.split(".")[0]) >= 26
    }
  ])("reads $name before switching protocols", ({ input, read, upgrades }) =>
    Effect.gen(function*() {
      yield* HttpRouter.add(
        "POST",
        "/attach",
        Effect.gen(function*() {
          const request = yield* HttpServerRequest.HttpServerRequest
          const body = read ? yield* request.text : ""
          const socket = yield* Effect.orDie(request.upgradeWith({ headers: { "content-type": "application/raw" } }))
          const reader = yield* socket.reader
          const writer = yield* socket.writer
          const decoder = new TextDecoder()
          let received = ""
          while (true) {
            const chunks = yield* reader.pull.pipe(
              Effect.catchReason("SocketError", "SocketCloseError", () => Effect.succeed(undefined))
            )
            if (chunks === undefined) break
            for (const chunk of chunks) received += typeof chunk === "string" ? chunk : decoder.decode(chunk)
          }
          yield* writer.write(`${body}|${received}`)
          return HttpServerResponse.empty()
        }).pipe(Effect.scoped)
      ).pipe(
        HttpRouter.serve,
        Layer.build
      )
      const server = yield* HttpServer.HttpServer
      const port = (server.address as NetAddress.InetAddress).port
      const response = yield* Effect.promise(() => rawExchange(port, input))
      if (upgrades) {
        assert.strictEqual(
          response,
          `HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: tcp\r\ncontent-type: application/raw\r\n\r\n${
            read ? "hello" : ""
          }|early`
        )
      } else {
        assert.match(response, /^HTTP\/1\.1 411 /)
      }
    }).pipe(Effect.provide(layerTestWebsocket)))

  it.effect.each([
    {
      name: "when the unread body exceeds MaxBodySize",
      method: "POST" as const,
      input: [
        "POST /attach HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: Upgrade\r\nUpgrade: tcp\r\nContent-Length: 5\r\n\r\nhe",
        "llo"
      ],
      headers: {},
      maxBodySize: ByteSize.bytes(4)
    },
    ...["connection", "upgrade", "content-length", "transfer-encoding"].map((name) => ({
      name: `with a ${name} header`,
      method: "POST" as const,
      input: "POST /attach HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: Upgrade\r\nUpgrade: tcp\r\n\r\n",
      headers: { [name]: "1" },
      maxBodySize: undefined
    })),
    {
      name: "with an invalid header name",
      method: "POST" as const,
      input: "POST /attach HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: Upgrade\r\nUpgrade: tcp\r\n\r\n",
      headers: { "x name": "1" },
      maxBodySize: undefined
    },
    {
      name: "with an invalid header value",
      method: "POST" as const,
      input: "POST /attach HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: Upgrade\r\nUpgrade: tcp\r\n\r\n",
      headers: { "x-name": "a\r\nx-injected: 1" },
      maxBodySize: undefined
    },
    {
      name: "with headers on a WebSocket upgrade",
      method: "GET" as const,
      input: upgradeRequest("/attach"),
      headers: { "x-name": "1" },
      maxBodySize: undefined
    }
  ])("does not switch protocols $name", ({ headers, input, maxBodySize, method }) =>
    Effect.gen(function*() {
      yield* HttpRouter.add(
        method,
        "/attach",
        Effect.gen(function*() {
          const request = yield* HttpServerRequest.HttpServerRequest
          const socket = yield* request.upgradeWith({ headers })
          yield* socket.reader
          return HttpServerResponse.empty()
        }).pipe(Effect.scoped, Effect.provideService(HttpIncomingMessage.MaxBodySize, maxBodySize))
      ).pipe(
        HttpRouter.serve,
        Layer.build
      )
      const server = yield* HttpServer.HttpServer
      const port = (server.address as NetAddress.InetAddress).port
      const response = yield* Effect.promise(() => rawExchange(port, input))
      assert.match(response, /^HTTP\/1\.1 [45]\d\d /)
    }).pipe(Effect.provide(layerTestWebsocket)))

  it.effect("serves other requests after a truncated multipart upgrade body", () =>
    Effect.gen(function*() {
      yield* HttpRouter.addAll([
        HttpRouter.route(
          "POST",
          "/attach",
          Effect.gen(function*() {
            const request = yield* HttpServerRequest.HttpServerRequest
            yield* request.multipart
            const socket = yield* Effect.orDie(request.upgrade)
            yield* socket.reader
            return HttpServerResponse.empty()
          }).pipe(Effect.scoped)
        ),
        HttpRouter.route("GET", "/ping", HttpServerResponse.text("pong"))
      ]).pipe(
        HttpRouter.serve,
        Layer.build
      )
      const server = yield* HttpServer.HttpServer
      const port = (server.address as NetAddress.InetAddress).port
      // The client stops after the first boundary of a 200 byte body.
      const response = yield* Effect.promise(() =>
        rawExchange(
          port,
          "POST /attach HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: Upgrade\r\nUpgrade: tcp\r\n" +
            "Content-Type: multipart/form-data; boundary=abc\r\nContent-Length: 200\r\n\r\n--abc\r\n"
        )
      )
      assert.notMatch(response, /^HTTP\/1\.1 101 /)
      const ping = yield* HttpClient.get("/ping")
      assert.strictEqual(yield* ping.text, "pong")
    }).pipe(Effect.provide(layerTestWebsocket)))

  it.effect("writes upgrade response header values as Latin-1", () =>
    Effect.gen(function*() {
      yield* HttpRouter.add(
        "POST",
        "/attach",
        Effect.gen(function*() {
          const request = yield* HttpServerRequest.HttpServerRequest
          const socket = yield* Effect.orDie(request.upgradeWith({ headers: { "x-name": "café" } }))
          yield* Effect.orDie(socket.reader)
          return HttpServerResponse.empty()
        }).pipe(Effect.scoped)
      ).pipe(
        HttpRouter.serve,
        Layer.build
      )
      const server = yield* HttpServer.HttpServer
      const port = (server.address as NetAddress.InetAddress).port
      const headers = yield* Effect.callback<Http.IncomingHttpHeaders, Error>((resume) => {
        const request = Http.request({
          hostname: "127.0.0.1",
          port,
          path: "/attach",
          method: "POST",
          agent: false,
          headers: { connection: "Upgrade", upgrade: "tcp" }
        })
        request.on("error", (error) => resume(Effect.fail(error)))
        request.on("upgrade", (response, socket) => {
          socket.destroy()
          resume(Effect.succeed(response.headers))
        })
        request.end()
        return Effect.sync(() => request.destroy())
      })
      // Node decodes header bytes as Latin-1, like other HTTP peers.
      assert.strictEqual(headers["x-name"], "café")
    }).pipe(Effect.provide(layerTestWebsocket)))

  describe("request URL", () => {
    it.effect("toURL reports https over TLS", () =>
      Effect.gen(function*() {
        const port = yield* serveUrlEcho(Https.createServer({ cert: tlsCert, key: tlsKey }))
        assert.strictEqual(
          yield* rawRequest(port, `GET /x?y=1 HTTP/1.1\r\nHost: 127.0.0.1:${port}`, { tls: true }),
          `127.0.0.1:${port} /x?y=1 https://127.0.0.1:${port}/x?y=1`
        )
      }))

    it.effect("xForwardedHeaders trusts an IPv4-mapped peer and keeps provenance after modify", () =>
      Effect.gen(function*() {
        const server = Http.createServer()
        yield* HttpServer.serve(
          HttpServerRequest.HttpServerRequest.use((request) => {
            const moved = request.modify({ url: "/moved" })
            return Effect.succeed(HttpServerResponse.text(
              `${Option.getOrUndefined(moved.remoteAddress)} ${Option.getOrUndefined(moved.peerAddress)} ${
                Option.getOrThrow(HttpServerRequest.toURL(moved)).href
              }`
            ))
          }).pipe(HttpMiddleware.xForwardedHeaders({ trustedProxies: [IpNetwork.fromStringUnsafe("127.0.0.0/8")] }))
        ).pipe(
          Layer.provide(NodeHttpServer.layer(() => server, { port: 0, host: "::" })),
          Layer.build
        )
        assert.strictEqual(
          yield* rawRequest(
            tcpPort(server),
            "GET /x HTTP/1.1\r\nHost: app.test\r\nX-Forwarded-For: 198.51.100.7\r\nX-Forwarded-Proto: https"
          ),
          "198.51.100.7 ::ffff:127.0.0.1 https://app.test/moved"
        )
      }))

    it.effect("absolute-form request-target replaces the host (RFC 9112 §3.2.2)", () =>
      Effect.gen(function*() {
        const port = yield* serveUrlEcho(Http.createServer())
        assert.strictEqual(
          yield* rawRequest(port, "GET http://abs.test/x?y=1 HTTP/1.1\r\nHost: other.test"),
          "abs.test /x?y=1 http://abs.test/x?y=1"
        )
        assert.strictEqual(
          yield* rawRequest(port, "GET http://abs.test//other.test/x?y=1 HTTP/1.1\r\nHost: other.test"),
          "abs.test //other.test/x?y=1 http://abs.test//other.test/x?y=1"
        )
      }))

    it.effect("searchParamsParser parses the query", () =>
      Effect.gen(function*() {
        yield* HttpRouter.add(
          "GET",
          "/search",
          Effect.map(HttpServerRequest.ParsedSearchParams, (params) => HttpServerResponse.jsonUnsafe(params)).pipe(
            HttpMiddleware.searchParamsParser
          )
        ).pipe(HttpRouter.serve, Layer.build)
        const body = yield* HttpClient.get("/search?a=1&a=2&b=3").pipe(Effect.flatMap((response) => response.json))
        assert.deepStrictEqual(body, { a: ["1", "2"], b: "3" })
      }).pipe(Effect.provide(NodeHttpServer.layerTest)))
  })
})

const tlsCert = readFileSync(new URL("./fixtures/tls/cert.pem", import.meta.url))
const tlsKey = readFileSync(new URL("./fixtures/tls/key.pem", import.meta.url))

const layerHttp2Secure = (
  client: Layer.Layer<HttpClient.HttpClient>,
  options?: Http2.SecureServerOptions
) =>
  layerTestClient("https").pipe(
    Layer.provide(client),
    Layer.provideMerge(
      NodeHttpServer.layerServer(() => Http2.createSecureServer({ cert: tlsCert, key: tlsKey, ...options }), {
        port: 0
      })
    )
  )

describeHttpServerProtocol("HTTP/1.1", NodeHttpServer.layerTest)
describeHttpServerProtocol(
  "h2c",
  layerTestClient("http").pipe(
    Layer.provide(layerHttp2Client()),
    Layer.provideMerge(NodeHttpServer.layerServer(() => Http2.createServer(), { port: 0 }))
  )
)
describeHttpServerProtocol("HTTP/2 over TLS", layerHttp2Secure(layerHttp2Client({ ca: tlsCert })))
describeHttpServerProtocol(
  "HTTP/2 on an allowHTTP1 server",
  layerHttp2Secure(layerHttp2Client({ ca: tlsCert }), { allowHTTP1: true })
)
describeHttpServerProtocol(
  "HTTP/1.1 on an allowHTTP1 server",
  layerHttp2Secure(NodeHttpClient.layerUndiciOptions({ allowH2: false, connect: { ca: tlsCert } }), {
    allowHTTP1: true
  })
)

const serveUrlEcho = Effect.fnUntraced(function*(server: Http.Server) {
  yield* HttpRouter.add(
    "GET",
    "*",
    HttpServerRequest.HttpServerRequest.use((request) =>
      Effect.succeed(HttpServerResponse.text(
        `${request.headers.host} ${request.url} ${Option.getOrThrow(HttpServerRequest.toURL(request)).href}`
      ))
    )
  ).pipe(
    HttpRouter.serve,
    Layer.provide(NodeHttpServer.layer(() => server, { port: 0 })),
    Layer.build
  )
  return tcpPort(server)
})

const rawRequest = (port: number, head: string, options?: { readonly tls?: boolean }) =>
  Effect.callback<string, Error>((resume) => {
    const socket = options?.tls
      ? Tls.connect({ host: "127.0.0.1", port, rejectUnauthorized: false })
      : Net.createConnection({ host: "127.0.0.1", port })
    let response = ""
    socket.setEncoding("utf8")
    socket.write(`${head}\r\nConnection: close\r\n\r\n`)
    socket.on("data", (chunk: string) => {
      response += chunk
    })
    socket.on("error", (error) => resume(Effect.fail(error)))
    socket.on("close", () => resume(Effect.succeed(response.slice(response.indexOf("\r\n\r\n") + 4))))
    return Effect.sync(() => socket.destroy())
  })

const layerTestWebsocket = HttpServer.layerTestClient.pipe(
  Layer.provide(
    Layer.fresh(FetchHttpClient.layer).pipe(
      Layer.provide(Layer.succeed(FetchHttpClient.RequestInit)({ keepalive: false }))
    )
  ),
  Layer.provideMerge(NodeHttpServer.layer(Http.createServer, {
    port: 0,
    websocket: { perMessageDeflate: true }
  }))
)

const getStatusText = (port: number) =>
  Effect.callback<string | undefined, Error>((resume) => {
    const request = Http.get({ hostname: "127.0.0.1", port, agent: false }, (response) => {
      response.resume()
      response.on("end", () => resume(Effect.succeed(response.statusMessage)))
    })
    request.on("error", (error) => resume(Effect.fail(error)))
    return Effect.sync(() => request.destroy())
  })

const tcpPort = (server: Net.Server): number => {
  const address = server.address()
  assert(address !== null && typeof address !== "string")
  return address.port
}

// Sends the requests pipelined on one connection and returns everything received until the connection closes.
const rawGet = (port: number, paths: ReadonlyArray<string>, method = "GET") =>
  Effect.callback<string>((resume) => {
    const socket = Net.connect({ port, host: "127.0.0.1" }, () => {
      socket.write(
        paths.map((path, index) =>
          `${method} ${path} HTTP/1.1\r\nHost: 127.0.0.1\r\n${
            index === paths.length - 1 ? "Connection: close\r\n" : ""
          }\r\n`
        ).join("")
      )
    })
    let received = ""
    socket.setEncoding("latin1")
    socket.on("data", (chunk) => received += chunk)
    socket.on("error", constVoid)
    socket.on("close", () => resume(Effect.succeed(received)))
    return Effect.sync(() => socket.destroy())
  }).pipe(Effect.timeout("2 seconds"))

interface WebSocketFrame {
  readonly opcode: number
  readonly payload: Buffer.Buffer
}

const parseWebSocketFrames = (
  stream: Buffer.Buffer
): { readonly frames: ReadonlyArray<WebSocketFrame>; readonly trailing: Buffer.Buffer } => {
  const frames: Array<WebSocketFrame> = []
  let offset = 0
  while (stream.length - offset >= 2) {
    const first = stream[offset]
    const second = stream[offset + 1]
    const opcode = first & 0x0f
    let length = second & 0x7f
    let headerSize = 2
    if (length === 126) {
      if (stream.length - offset < 4) break
      length = stream.readUInt16BE(offset + 2)
      headerSize = 4
    } else if (length === 127) {
      break
    }
    const controlFrame = (opcode & 0x8) !== 0
    if (
      (first & 0x70) !== 0 || (second & 0x80) !== 0 ||
      ![0x0, 0x1, 0x2, 0x8, 0x9, 0xa].includes(opcode) ||
      (controlFrame && length > 125)
    ) {
      break
    }
    if (stream.length - offset < headerSize + length) break
    frames.push({ opcode, payload: stream.subarray(offset + headerSize, offset + headerSize + length) })
    offset += headerSize + length
  }
  return { frames, trailing: stream.subarray(offset) }
}

const upgradeRequest = (path: string): string =>
  [
    `GET ${path} HTTP/1.1`,
    "Host: 127.0.0.1",
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Key: ${randomBytes(16).toString("base64")}`,
    "Sec-WebSocket-Version: 13",
    "",
    ""
  ].join("\r\n")

const closeFrame = (code: number): Buffer.Buffer => {
  const payload = Buffer.Buffer.alloc(2)
  payload.writeUInt16BE(code, 0)
  const mask = randomBytes(4)
  const masked = Buffer.Buffer.from(payload)
  for (let index = 0; index < masked.length; index++) {
    masked[index] = masked[index] ^ mask[index % 4]
  }
  return Buffer.Buffer.concat([Buffer.Buffer.from([0x88, 0x80 | payload.length]), mask, masked])
}

const rawWebSocket = (
  port: number,
  path: string
): Promise<{ readonly frames: ReadonlyArray<WebSocketFrame>; readonly trailing: Buffer.Buffer }> =>
  new Promise((resolve, reject) => {
    const socket = Net.createConnection({ host: "127.0.0.1", port })
    const timer = setTimeout(() => {
      socket.destroy()
      reject(new Error("the websocket conversation did not finish in time"))
    }, 5000)
    let upgraded = false
    let stream = Buffer.Buffer.alloc(0)
    let closeEchoed = false
    socket.on("connect", () => socket.write(upgradeRequest(path)))
    socket.on("data", (data) => {
      stream = Buffer.Buffer.concat([stream, Buffer.Buffer.from(data)])
      if (!upgraded) {
        const headerEnd = stream.indexOf("\r\n\r\n")
        if (headerEnd === -1) return
        if (!stream.subarray(0, headerEnd).toString().includes("101")) {
          clearTimeout(timer)
          socket.destroy()
          reject(new Error("the upgrade was refused"))
          return
        }
        upgraded = true
        stream = Buffer.Buffer.from(stream.subarray(headerEnd + 4))
      }
      if (!closeEchoed) {
        const close = parseWebSocketFrames(stream).frames.find((frame) => frame.opcode === 8)
        if (close !== undefined) {
          closeEchoed = true
          socket.write(closeFrame(close.payload.length >= 2 ? close.payload.readUInt16BE(0) : 1000))
        }
      }
    })
    socket.on("error", constVoid)
    socket.on("close", () => {
      clearTimeout(timer)
      resolve(parseWebSocketFrames(stream))
    })
  })

// Writes `input`, half-closes, and resolves with everything the server sent.
const rawExchange = (port: number, input: string | ReadonlyArray<string>): Promise<string> =>
  new Promise((resolve, reject) => {
    const socket = Net.createConnection({ host: "127.0.0.1", port })
    const timer = setTimeout(() => {
      socket.destroy()
      reject(new Error("the exchange did not finish in time"))
    }, 5000)
    let stream = Buffer.Buffer.alloc(0)
    // Pause between parts so the server reads them separately.
    const parts = typeof input === "string" ? [input] : [...input]
    const writeNext = () => {
      const part = parts.shift()!
      if (parts.length === 0) return socket.end(part)
      socket.write(part)
      setTimeout(writeNext, 50)
    }
    socket.on("connect", writeNext)
    socket.on("data", (data) => {
      stream = Buffer.Buffer.concat([stream, Buffer.Buffer.from(data)])
    })
    socket.on("error", constVoid)
    socket.on("close", () => {
      clearTimeout(timer)
      resolve(stream.toString())
    })
  })

const rawUpgradeRequest = (port: number, path: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const socket = Net.createConnection({ host: "127.0.0.1", port })
    const timer = setTimeout(() => {
      socket.destroy()
      reject(new Error("the upgrade request was not answered in time"))
    }, 5000)
    let stream = Buffer.Buffer.alloc(0)
    socket.on("connect", () => socket.write(upgradeRequest(path)))
    socket.on("data", (data) => {
      stream = Buffer.Buffer.concat([stream, Buffer.Buffer.from(data)])
    })
    socket.on("error", constVoid)
    socket.on("close", () => {
      clearTimeout(timer)
      resolve(stream.toString())
    })
  })

// Flush only headers. Like curl, upload only after the server asks for the body.
const expectContinueRequest = (port: number, payload: string, headers: Http.OutgoingHttpHeaders = {}) =>
  Effect.callback<{ status: number; body: string; continues: number; uploaded: boolean }, Error>((resume) => {
    let continues = 0
    let uploaded = false
    const request = Http.request({
      host: "127.0.0.1",
      port,
      method: "POST",
      headers: {
        ...headers,
        expect: "100-continue",
        "content-length": Buffer.Buffer.byteLength(payload),
        connection: "close"
      },
      agent: false
    }, (response) => {
      let body = ""
      response.setEncoding("utf8")
      response.on("data", (chunk: string) => {
        body += chunk
      })
      response.on("error", (error) => resume(Effect.fail(error)))
      response.on("end", () => resume(Effect.succeed({ status: response.statusCode!, body, continues, uploaded })))
    })
    request.on("continue", () => {
      continues++
      if (!uploaded) {
        uploaded = true
        request.end(payload)
      }
    })
    request.on("error", (error) => resume(Effect.fail(error)))
    request.setTimeout(3000, () => request.destroy(new Error("Expect: 100-continue request timed out")))
    request.flushHeaders()
    return Effect.sync(() => request.destroy())
  })
