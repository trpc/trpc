import { NodeHttpServer } from "@effect/platform-node"
import * as NodeClient from "@effect/platform-node/NodeHttpClient"
import Undici from "@effect/platform-node/Undici"
import { assert, describe, expect, it } from "@effect/vitest"
import { Struct } from "effect"
import * as Context from "effect/Context"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import { flow } from "effect/Function"
import {
  FetchHttpClient,
  HttpBody,
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
  HttpRouter,
  HttpServer,
  HttpServerRequest,
  HttpServerResponse,
  Multipart,
  UrlParams
} from "effect/http"
import * as Layer from "effect/Layer"
import * as Schedule from "effect/Schedule"
import * as Schema from "effect/Schema"
import type * as Socket from "effect/socket/Socket"
import * as Stream from "effect/Stream"
import { mkdtempSync, openAsBlob, rmSync, truncateSync, writeFileSync } from "node:fs"
import * as Http from "node:http"
import type * as Net from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"

const Todo = Schema.Struct({
  userId: Schema.Number,
  id: Schema.Number,
  title: Schema.String,
  completed: Schema.Boolean
})
const TodoWithoutId = Schema.Struct({
  ...Struct.omit(Todo.fields, ["id"])
})
const largeResponseBody = "a".repeat(10 * 1024 * 1024)
const responseBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47])
const formDataResponses = [
  {
    name: "URL-encoded",
    path: "/form/url-encoded",
    contentType: "application/x-www-form-urlencoded",
    body: "tag=one&tag=two"
  },
  {
    name: "multipart",
    path: "/form/multipart",
    contentType: "multipart/form-data; boundary=effect-test",
    body: [
      "--effect-test",
      "Content-Disposition: form-data; name=\"tag\"",
      "",
      "one",
      "--effect-test",
      "Content-Disposition: form-data; name=\"tag\"",
      "",
      "two",
      "--effect-test--",
      ""
    ].join("\r\n")
  }
] as const

const makeLocalServerClient = Effect.gen(function*() {
  const client = yield* HttpClient.HttpClient
  const createTodo = (todo: typeof TodoWithoutId.Type) =>
    HttpClientRequest.post("/todos").pipe(
      HttpClientRequest.schemaBodyJson(TodoWithoutId)(todo),
      Effect.flatMap(client.execute),
      Effect.flatMap(HttpClientResponse.schemaBodyJson(Todo))
    )
  return {
    client,
    createTodo
  } as const
})
interface LocalServerClient extends Effect.Success<typeof makeLocalServerClient> {}
const LocalServerClient = Context.Service<LocalServerClient>("test/LocalServerClient")
const LocalServerClientLayer = Layer.effect(LocalServerClient)(makeLocalServerClient)
const LocalServerRoutes = HttpRouter.serve(HttpRouter.addAll([
  HttpRouter.route(
    "GET",
    "/todos/1",
    Effect.succeed(HttpServerResponse.jsonUnsafe({
      userId: 1,
      id: 1,
      title: "test",
      completed: false
    }))
  ),
  HttpRouter.route(
    "POST",
    "/todos",
    Effect.gen(function*() {
      const todo = yield* HttpServerRequest.schemaBodyJson(TodoWithoutId)
      return HttpServerResponse.jsonUnsafe({ ...todo, id: 201 })
    })
  ),
  HttpRouter.route("GET", "/text", Effect.succeed(HttpServerResponse.text("test"))),
  HttpRouter.route(
    "QUERY",
    "/search",
    Effect.gen(function*() {
      const request = yield* HttpServerRequest.HttpServerRequest
      return HttpServerResponse.jsonUnsafe({
        method: request.method,
        contentType: request.headers["content-type"],
        body: yield* request.text
      })
    })
  ),
  HttpRouter.route("GET", "/bytes", Effect.succeed(HttpServerResponse.uint8Array(responseBytes))),
  HttpRouter.route(
    "POST",
    "/multipart",
    Effect.gen(function*() {
      const request = yield* HttpServerRequest.HttpServerRequest
      const parts = yield* request.multipartStream.pipe(
        Stream.mapEffect((part) =>
          Effect.gen(function*() {
            if (Multipart.isField(part)) {
              return { key: part.key, value: part.value }
            }
            const content = yield* part.contentEffect
            return {
              key: part.key,
              name: part.name,
              contentType: part.contentType,
              content: new TextDecoder().decode(content)
            }
          })
        ),
        Stream.runCollect
      )
      return HttpServerResponse.jsonUnsafe(parts)
    })
  ),
  HttpRouter.route(
    "POST",
    "/bom-json",
    Effect.gen(function*() {
      const request = yield* HttpServerRequest.HttpServerRequest
      return HttpServerResponse.text(`\uFEFF${JSON.stringify(yield* request.json)}`, {
        contentType: "application/json"
      })
    })
  ),
  HttpRouter.route(
    "POST",
    "/question-form",
    Effect.gen(function*() {
      const request = yield* HttpServerRequest.HttpServerRequest
      return HttpServerResponse.text(`?${UrlParams.toString(yield* request.urlParamsBody)}`, {
        contentType: "application/x-www-form-urlencoded"
      })
    })
  ),
  ...formDataResponses.map(({ body, contentType, path }) =>
    HttpRouter.route("GET", path, Effect.succeed(HttpServerResponse.text(body, { contentType })))
  ),
  HttpRouter.route("GET", "/large", Effect.succeed(HttpServerResponse.text(largeResponseBody))),
  HttpRouter.route("GET", "/hang", Effect.never),
  HttpRouter.route(
    "GET",
    "/redirect",
    Effect.succeed(HttpServerResponse.text("redirecting", {
      status: 302,
      headers: { location: "/redirected" }
    }))
  ),
  HttpRouter.route("GET", "/redirected", Effect.succeed(HttpServerResponse.text("redirected"))),
  HttpRouter.route("HEAD", "/todos", Effect.succeed(HttpServerResponse.empty({ status: 200 }))),
  HttpRouter.route(
    "POST",
    "/upgrade",
    Effect.succeed(HttpServerResponse.jsonUnsafe({ message: "unauthorized" }, { status: 401 }))
  )
]))
;[
  {
    name: "fetch",
    layer: NodeClient.layerFetch
  },
  {
    name: "node:http",
    layer: NodeClient.layerNodeHttp
  },
  {
    name: "undici",
    layer: NodeClient.layerUndici
  }
].forEach(({ layer, name }) => {
  const layerTest = HttpServer.layerTestClient.pipe(
    Layer.provide(layer),
    Layer.provideMerge(NodeHttpServer.layer(Http.createServer, { port: 0 }))
  )
  const localServerTestLayer = Layer.merge(LocalServerClientLayer, LocalServerRoutes).pipe(
    Layer.provideMerge(layerTest)
  )

  describe(`NodeHttpClient - ${name}`, () => {
    it.effect("text", () =>
      Effect.gen(function*() {
        const response = yield* HttpClient.get("/text?existing=1", {
          urlParams: { value: "a#b" },
          hash: "fragment"
        })
        const url = new URL(response.url)
        assert.strictEqual(url.pathname, "/text")
        assert.strictEqual(url.search, "?existing=1&value=a%23b")
        assert.strictEqual(url.hash, "")
        expect(yield* response.text).toBe("test")
      }).pipe(Effect.provide(localServerTestLayer)))

    it.effect("accessing text preserves response bytes", () =>
      Effect.gen(function*() {
        const response = yield* HttpClient.get("/bytes")
        void response.text
        assert.deepStrictEqual(new Uint8Array(yield* response.arrayBuffer), responseBytes)
      }).pipe(Effect.provide(localServerTestLayer)))

    it.effect("request and response json ignore a leading UTF-8 BOM", () =>
      Effect.gen(function*() {
        const response = yield* HttpClient.post("/bom-json", {
          body: HttpBody.text("\uFEFF{\"a\":1}", "application/json")
        })
        assert.deepStrictEqual(yield* response.json, { a: 1 })
      }).pipe(Effect.provide(localServerTestLayer)))

    it.effect("request and response urlParamsBody preserve a leading question mark", () =>
      Effect.gen(function*() {
        const response = yield* HttpClient.post("/question-form", {
          body: HttpBody.text("?name=value", "application/x-www-form-urlencoded")
        })
        // the server echoes its parsed key behind another raw question mark
        assert.deepStrictEqual([...yield* response.urlParamsBody], [["??name", "value"]])
      }).pipe(Effect.provide(localServerTestLayer)))

    if (name !== "fetch") {
      it.live("continues uploading while reading a streaming response", () => {
        const server = Http.createServer((request, response) => {
          request.on("error", () => {})
          response.writeHead(200, { "content-type": "text/plain" })
          response.write("ready\n")
          request.pipe(response)
        })
        const testLayer = HttpServer.layerTestClient.pipe(
          Layer.provide(layer),
          Layer.provideMerge(NodeHttpServer.layer(() => server, { port: 0 }))
        )
        return Effect.gen(function*() {
          const readingResponse = yield* Deferred.make<void>()
          const encoder = new TextEncoder()
          const body = Stream.succeed(encoder.encode("first")).pipe(
            Stream.concat(Stream.fromEffect(
              Deferred.await(readingResponse).pipe(Effect.as(encoder.encode("second")))
            ))
          )
          const response = yield* HttpClient.post("/", { body: HttpBody.stream(body) })
          const text = yield* response.stream.pipe(
            Stream.tap(() => Deferred.succeed(readingResponse, undefined)),
            Stream.decodeText(),
            Stream.mkString
          )
          assert.strictEqual(text, "ready\nfirstsecond")
        }).pipe(
          Effect.timeout("2 seconds"),
          Effect.ensuring(Effect.sync(() => server.closeAllConnections())),
          Effect.provide(testLayer)
        )
      })

      it.live.each([
        { source: "global", FormData: globalThis.FormData },
        { source: "undici", FormData: Undici.FormData }
      ])("sends $source form data request bodies as multipart", ({ FormData }) =>
        Effect.gen(function*() {
          const formData = new FormData()
          formData.append("title", "effect")
          formData.append("file", new Blob(["file contents"], { type: "text/plain" }), "notes.txt")
          const response = yield* HttpClient.post("/multipart", {
            body: HttpBody.formData(formData as globalThis.FormData),
            headers: { "content-type": "multipart/form-data; boundary=caller-boundary" }
          }).pipe(
            Effect.timeout("2 seconds")
          )
          assert.deepStrictEqual(yield* response.json, [
            { key: "title", value: "effect" },
            { key: "file", name: "notes.txt", contentType: "text/plain", content: "file contents" }
          ])
        }).pipe(Effect.provide(localServerTestLayer)))

      it.live("returns TransportError when a form data file cannot be read", () =>
        Effect.gen(function*() {
          const directory = yield* Effect.acquireRelease(
            Effect.sync(() => mkdtempSync(join(tmpdir(), "effect-form-data-"))),
            (directory) => Effect.sync(() => rmSync(directory, { recursive: true, force: true }))
          )
          const path = join(directory, "notes.txt")
          writeFileSync(path, "file contents")
          const blob = yield* Effect.promise(() => openAsBlob(path, { type: "text/plain" }))
          const formData = new FormData()
          formData.append("file", blob, "notes.txt")
          truncateSync(path, 0)

          const error = yield* HttpClient.post("/multipart", { body: HttpBody.formData(formData) }).pipe(
            Effect.timeout("2 seconds"),
            Effect.flip
          )
          assert(error._tag === "HttpClientError", `Expected HttpClientError, got ${error._tag}`)
          assert.strictEqual(error.reason._tag, "TransportError")
        }).pipe(Effect.provide(localServerTestLayer)))
    }

    if (name === "undici") {
      it.effect.each(formDataResponses)("parses $name response form data", ({ path }) =>
        Effect.gen(function*() {
          const response = yield* HttpClient.get(path)
          const form = yield* response.formData
          assert.deepStrictEqual(form.getAll("tag"), ["one", "two"])
        }).pipe(Effect.provide(localServerTestLayer)))
    }

    it.effect("local server followRedirects", () =>
      Effect.gen(function*() {
        const client = (yield* HttpClient.HttpClient).pipe(
          HttpClient.followRedirects()
        )
        const response = yield* client.get("/redirect")
        expect(new URL(response.url).pathname).toBe("/redirected")
        expect(yield* response.text).toBe("redirected")
      }).pipe(Effect.provide(localServerTestLayer)))

    it.effect("text stream", () =>
      Effect.gen(function*() {
        const client = yield* HttpClient.HttpClient
        const response = yield* client.get("/text").pipe(
          Effect.map((_) => _.stream),
          Stream.unwrap,
          Stream.decodeText(),
          Stream.mkString
        )
        expect(response).toBe("test")
      }).pipe(Effect.provide(localServerTestLayer)))

    it.effect("local server", () =>
      Effect.gen(function*() {
        const local = yield* LocalServerClient
        const response = yield* local.client.get("/todos/1").pipe(
          Effect.flatMap(HttpClientResponse.schemaBodyJson(Todo, {
            reviver: (key, value) => key === "title" ? "revived" : value
          }))
        )
        expect(response.id).toBe(1)
        expect(response.title).toBe("revived")
      }).pipe(
        Effect.provide(localServerTestLayer)
      ))

    it.effect("local server schemaBodyJson", () =>
      Effect.gen(function*() {
        const local = yield* LocalServerClient
        const response = yield* local.createTodo({
          userId: 1,
          title: "test",
          completed: false
        })
        expect(response.title).toBe("test")
      }).pipe(
        Effect.provide(localServerTestLayer)
      ))

    it.effect("round trips QUERY method, body, and content type through the local server", () =>
      Effect.gen(function*() {
        const body = JSON.stringify({ query: "effect" })
        const response = yield* HttpClient.query("/search", {
          body: HttpBody.text(body, "application/json")
        })

        assert.strictEqual(response.status, 200)
        assert.deepStrictEqual(yield* response.json, {
          method: "QUERY",
          contentType: "application/json",
          body
        })
      }).pipe(Effect.provide(localServerTestLayer)))

    it.effect("head request with schemaJson", () =>
      Effect.gen(function*() {
        const client = yield* HttpClient.HttpClient
        const response = yield* client.head("/todos").pipe(
          Effect.flatMap(
            HttpClientResponse.schemaJson(Schema.Struct({ status: Schema.Literal(200) }))
          )
        )
        expect(response).toEqual({ status: 200 })
      }).pipe(Effect.provide(localServerTestLayer)))

    it.live("interrupt", () =>
      Effect.gen(function*() {
        const client = yield* HttpClient.HttpClient
        const response = yield* client.get("/hang").pipe(
          Effect.flatMap((_) => _.text),
          Effect.timeout(1),
          Effect.asSome,
          Effect.catchTag("TimeoutError", () => Effect.succeedNone)
        )
        expect(response._tag).toEqual("None")
      }).pipe(Effect.provide(localServerTestLayer)))

    if (name !== "fetch") {
      it.effect("reads a refused upgrade as an ordinary response", () =>
        Effect.gen(function*() {
          const response = yield* HttpClient.execute(
            HttpClientRequest.post("/upgrade").pipe(HttpClientRequest.upgrade("tcp"))
          )
          assert.strictEqual(response.status, 401)
          const error = yield* Effect.flip(response.upgrade)
          assert.strictEqual(error.reason._tag, "StatusCodeError")
          assert.deepStrictEqual(yield* response.json, { message: "unauthorized" })
        }).pipe(Effect.provide(localServerTestLayer)))
    }

    it.effect("close early", () =>
      Effect.gen(function*() {
        const response = yield* HttpClient.get("/large")
        expect(response.status).toBe(200)
      }).pipe(Effect.provide(localServerTestLayer)))
  })
})

it.live("followRedirects releases redirect response bodies with a single socket", () =>
  Effect.gen(function*() {
    const client = (yield* HttpClient.HttpClient).pipe(HttpClient.followRedirects())
    const response = yield* client.get("/redirect")
    expect(yield* response.text).toBe("redirected")
  }).pipe(
    Effect.timeout("2 seconds"),
    Effect.provide(LocalServerRoutes.pipe(
      Layer.provideMerge(HttpServer.layerTestClient),
      Layer.provide(NodeClient.layerNodeHttpOptions({ maxSockets: 1 })),
      Layer.provideMerge(NodeHttpServer.layer(Http.createServer, { port: 0 }))
    ))
  ))

it.live("followRedirects releases scoped redirect response bodies with a single socket", () =>
  Effect.gen(function*() {
    const client = (yield* HttpClient.HttpClient).pipe(HttpClient.withScope, HttpClient.followRedirects())
    const response = yield* client.get("/redirect")
    expect(yield* response.text).toBe("redirected")
  }).pipe(
    Effect.scoped,
    Effect.timeout("2 seconds"),
    Effect.provide(LocalServerRoutes.pipe(
      Layer.provideMerge(HttpServer.layerTestClient),
      Layer.provide(NodeClient.layerNodeHttpOptions({ maxSockets: 1 })),
      Layer.provideMerge(NodeHttpServer.layer(Http.createServer, { port: 0 }))
    ))
  ))

it.live("releases an immediately failing form data stream and connection before layer teardown", () => {
  const server = Http.createServer((request) => {
    request.on("error", () => {})
    request.resume()
  })
  const layer = HttpServer.layerTestClient.pipe(
    Layer.provide(NodeClient.layerNodeHttp),
    Layer.provideMerge(NodeHttpServer.layer(() => server, { port: 0 }))
  )
  return Effect.gen(function*() {
    const streams: Array<ReadableStream<Uint8Array<ArrayBuffer>>> = []
    class BrokenFile extends File {
      override stream() {
        const stream = new ReadableStream<Uint8Array<ArrayBuffer>>({
          start(controller) {
            controller.error(new Error("file read failed"))
          }
        })
        streams.push(stream)
        return stream
      }
    }
    const formData = new FormData()
    formData.append("file", new BrokenFile(["file contents"], "notes.txt"))
    const error = yield* HttpClient.post("/", { body: HttpBody.formData(formData) }).pipe(
      Effect.timeout("2 seconds"),
      Effect.match({ onFailure: (error) => error, onSuccess: () => undefined })
    )
    assert.strictEqual(streams.length, 1)
    assert(error?._tag === "HttpClientError", `Expected HttpClientError, got ${error?._tag}`)
    assert.strictEqual(error.reason._tag, "TransportError")
    assert.strictEqual(streams[0].locked, false)
    const connections = yield* Effect.sleep("10 millis").pipe(
      Effect.andThen(Effect.callback<number, Error>((resume) => {
        server.getConnections((error, count) => resume(error ? Effect.fail(error) : Effect.succeed(count)))
      })),
      Effect.repeat({ while: (count) => count !== 0, schedule: Schedule.spaced("10 millis") }),
      Effect.timeout("1 second")
    )
    assert.strictEqual(connections, 0)
  }).pipe(
    Effect.ensuring(Effect.sync(() => server.closeAllConnections())),
    Effect.provide(layer)
  )
})

it.live("returns TransportError when a form data file stream cannot be created", () =>
  Effect.gen(function*() {
    class ThrowingFile extends File {
      override stream(): never {
        throw new Error("file stream failed")
      }
    }
    const formData = new FormData()
    formData.append("file", new ThrowingFile([], "notes.txt"))
    const error = yield* HttpClient.post("/", { body: HttpBody.formData(formData) }).pipe(Effect.flip)
    assert.strictEqual(error.reason._tag, "TransportError")
  }).pipe(Effect.provide(HttpServer.layerTestClient.pipe(
    Layer.provide(NodeClient.layerNodeHttp),
    Layer.provideMerge(NodeHttpServer.layer(Http.createServer, { port: 0 }))
  ))))

it.live("reads backpressured form data files on demand and releases them on interruption", () => {
  const server = Http.createServer((request) => request.pause())
  let read = 0
  let stream: ReadableStream | undefined
  class LargeFile extends File {
    override stream() {
      return stream = new ReadableStream<Uint8Array<ArrayBuffer>>({
        pull(controller) {
          if (read === 64 * 1024 * 1024) return controller.close()
          read += 64 * 1024
          controller.enqueue(new Uint8Array(64 * 1024))
        }
      })
    }
  }
  return Effect.gen(function*() {
    const formData = new FormData()
    formData.append("file", new LargeFile([], "large.bin"))
    yield* HttpClient.post("/", { body: HttpBody.formData(formData) }).pipe(Effect.timeout("1 second"), Effect.ignore)
    // The server never reads the upload, so only socket buffers should fill.
    assert.isBelow(read, 16 * 1024 * 1024)
    yield* Effect.sync(() => stream?.locked).pipe(
      Effect.repeat({ while: (locked) => locked !== false, schedule: Schedule.spaced("10 millis") }),
      Effect.timeout("1 second")
    )
  }).pipe(
    Effect.ensuring(Effect.sync(() => server.closeAllConnections())),
    Effect.provide(HttpServer.layerTestClient.pipe(
      Layer.provide(NodeClient.layerNodeHttp),
      Layer.provideMerge(NodeHttpServer.layer(() => server, { port: 0 }))
    ))
  )
})

it.live.each(["response completion", "response interruption", "upload failure"] as const)(
  "releases an unfinished keep-alive upload after %s before layer teardown",
  (mode) =>
    Effect.gen(function*() {
      const uploadBlocked = yield* Deferred.make<void>()
      const uploadFinalized = yield* Deferred.make<void>()
      const failUpload = yield* Deferred.make<void>()
      const connectionClosed = yield* Deferred.make<void>()
      const server = Http.createServer((request, response) => {
        request.on("error", () => {})
        request.socket.once("close", () => Deferred.doneUnsafe(connectionClosed, Effect.void))
        request.once("data", () => {
          response.writeHead(200, { "content-type": "text/plain" })
          if (mode === "response completion") {
            response.end("ready")
          } else {
            response.write("ready")
          }
        })
      })
      const layer = HttpServer.layerTestClient.pipe(
        Layer.provide(NodeClient.layerNodeHttpNoAgent.pipe(
          Layer.provide(NodeClient.layerAgentOptions({ keepAlive: true }))
        )),
        Layer.provideMerge(NodeHttpServer.layer(() => server, { port: 0 }))
      )
      yield* Effect.gen(function*() {
        const body = Stream.succeed(new TextEncoder().encode("first")).pipe(
          Stream.concat(Stream.fromEffect(
            Deferred.succeed(uploadBlocked, undefined).pipe(
              Effect.andThen(Deferred.await(failUpload)),
              Effect.andThen(Effect.fail("upload failed"))
            )
          )),
          Stream.ensuring(Deferred.succeed(uploadFinalized, undefined))
        )
        const response = yield* HttpClient.post("/", { body: HttpBody.stream(body) })
        yield* Deferred.await(uploadBlocked)
        if (mode === "response completion") {
          assert.strictEqual(yield* response.text, "ready")
        } else if (mode === "response interruption") {
          const reading = yield* Deferred.make<void>()
          const reader = yield* response.stream.pipe(
            Stream.tap(() => Deferred.succeed(reading, undefined)),
            Stream.runDrain,
            Effect.forkChild
          )
          yield* Deferred.await(reading)
          yield* Fiber.interrupt(reader)
        } else {
          const error = yield* response.stream.pipe(
            Stream.tap(() => Deferred.succeed(failUpload, undefined)),
            Stream.runDrain,
            Effect.timeout("1 second"),
            Effect.flip
          )
          assert.strictEqual(error._tag, "HttpClientError")
        }
        // Check while the agent is still alive: layer teardown must not mask a leak.
        yield* Deferred.await(uploadFinalized).pipe(Effect.timeout("1 second"))
        if (mode !== "response completion") {
          yield* Deferred.await(connectionClosed).pipe(Effect.timeout("1 second"))
        }
      }).pipe(
        Effect.timeout("2 seconds"),
        Effect.ensuring(Effect.sync(() => server.closeAllConnections())),
        Effect.provide(layer)
      )
    })
)

it.live("returns a stream body encoding failure", () =>
  Effect.gen(function*() {
    yield* Effect.gen(function*() {
      const request = yield* HttpServerRequest.HttpServerRequest
      yield* request.text
      return HttpServerResponse.empty()
    }).pipe(HttpServer.serveEffect())
    const error = yield* HttpClient.post("/", {
      body: HttpBody.stream(Stream.fail("encode failure"))
    }).pipe(Effect.timeout("1 second"), Effect.flip)
    assert(error._tag === "HttpClientError")
    assert.strictEqual(error.reason._tag, "EncodeError")
    assert.strictEqual(error.reason.cause, "encode failure")
  }).pipe(Effect.provide(HttpServer.layerTestClient.pipe(
    Layer.provide(NodeClient.layerNodeHttp),
    Layer.provideMerge(NodeHttpServer.layer(Http.createServer, { port: 0 }))
  ))))

// Answers upgrade requests by hand, sending bytes in the same write as the
// response head, like a Docker Engine attach endpoint.
const makeUpgradeServer = (onClose?: () => void) => {
  const sockets = new Set<Net.Socket>()
  return Effect.acquireRelease(
    Effect.callback<Http.Server>((resume) => {
      const server = Http.createServer()
      server.on("connection", (socket) => {
        sockets.add(socket)
        socket.once("close", () => sockets.delete(socket))
      })
      server.on("upgrade", (request: Http.IncomingMessage, socket: Net.Socket) => {
        if (onClose !== undefined) socket.once("close", onClose)
        socket.write(
          "HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\n" +
            `Upgrade: ${request.headers.upgrade}\r\nX-Url: ${request.url}\r\n` +
            `X-Authorization: ${request.headers.authorization}\r\n\r\nhello|`
        )
        socket.on("data", (chunk) => socket.write(`echo:${chunk}|`))
        socket.on("end", () => socket.end("bye"))
      })
      server.listen(0, "127.0.0.1", () => resume(Effect.succeed(server)))
    }),
    (server) =>
      Effect.callback<void>((resume) => {
        for (const socket of sockets) socket.destroy()
        server.closeAllConnections()
        server.close(() => resume(Effect.void))
      })
  ).pipe(
    Effect.map((server) =>
      HttpClient.mapRequest(flow(
        HttpClientRequest.prependUrl(`http://127.0.0.1:${(server.address() as Net.AddressInfo).port}/base`),
        HttpClientRequest.bearerToken("token")
      ))
    )
  )
}

const readUntilClose = Effect.fnUntraced(function*(reader: Socket.Reader) {
  const decoder = new TextDecoder()
  let text = ""
  while (true) {
    const chunks = yield* reader.pull.pipe(
      Effect.catchReason("SocketError", "SocketCloseError", () => Effect.succeed(undefined))
    )
    if (chunks === undefined) return text
    for (const chunk of chunks) text += typeof chunk === "string" ? chunk : decoder.decode(chunk)
  }
})

describe("NodeHttpClient upgrade", () => {
  ;[
    { name: "node:http", layer: NodeClient.layerNodeHttp },
    { name: "undici", layer: NodeClient.layerUndici }
  ].forEach(({ layer, name }) => {
    describe(name, () => {
      it.effect("hands over the connection of a 101 response", () =>
        Effect.gen(function*() {
          const client = (yield* HttpClient.HttpClient).pipe(yield* makeUpgradeServer())
          const response = yield* client.execute(
            HttpClientRequest.post("/attach").pipe(HttpClientRequest.upgrade("tcp"))
          )
          assert.strictEqual(response.status, 101)
          assert.strictEqual(response.headers["upgrade"], "tcp")
          assert.strictEqual(response.headers["x-url"], "/base/attach")
          assert.strictEqual(response.headers["x-authorization"], "Bearer token")

          const socket = yield* response.upgrade
          const reader = yield* socket.reader
          // releasing the writer half-closes, so the server answers "bye"
          yield* Effect.scoped(Effect.flatMap(socket.writer, (writer) => writer.write("ping")))
          assert.strictEqual(yield* readUntilClose(reader), "hello|echo:ping|bye")
        }).pipe(Effect.provide(layer)))
      it.live("closes the upgraded connection when the request scope closes", () =>
        Effect.gen(function*() {
          const closed = yield* Deferred.make<void>()
          const client = (yield* HttpClient.HttpClient).pipe(
            yield* makeUpgradeServer(() => Deferred.doneUnsafe(closed, Effect.void)),
            HttpClient.withScope
          )
          yield* Effect.scoped(Effect.gen(function*() {
            const response = yield* client.execute(
              HttpClientRequest.post("/attach").pipe(HttpClientRequest.upgrade("tcp"))
            )
            assert.strictEqual(response.status, 101)
          }))
          yield* Deferred.await(closed).pipe(Effect.timeout("1 second"))
        }).pipe(Effect.provide(layer)))
    })
  })

  it.effect("fetch rejects an upgrade request before calling fetch", () =>
    Effect.gen(function*() {
      let calls = 0
      const error = yield* HttpClient.execute(
        HttpClientRequest.post("http://127.0.0.1:1/attach").pipe(HttpClientRequest.upgrade("tcp"))
      ).pipe(
        Effect.provideService(
          FetchHttpClient.Fetch,
          Object.assign(() => {
            calls++
            return Promise.resolve(new Response(""))
          }, { preconnect: () => {} })
        ),
        Effect.flip
      )
      assert.strictEqual(error.reason._tag, "TransportError")
      assert.strictEqual(calls, 0)
    }).pipe(Effect.provide(NodeClient.layerFetch)))
})
