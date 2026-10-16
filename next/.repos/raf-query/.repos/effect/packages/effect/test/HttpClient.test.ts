import { assert, expect, it } from "@effect/vitest"
import { Context, Effect, Layer, Schema, Stream, Struct } from "effect"
import {
  FetchHttpClient,
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
  HttpRouter,
  HttpServer,
  HttpServerRequest,
  HttpServerResponse
} from "effect/http"
import { TestClock } from "effect/testing"

const Todo = Schema.Struct({
  userId: Schema.Number,
  id: Schema.Number,
  title: Schema.String,
  completed: Schema.Boolean
})
const TodoWithoutId = Schema.Struct({
  ...Struct.omit(Todo.fields, ["id"])
})

const makeJsonPlaceholder = Effect.gen(function*() {
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
interface JsonPlaceholder extends Effect.Success<typeof makeJsonPlaceholder> {}
const JsonPlaceholder = Context.Service<JsonPlaceholder>("test/JsonPlaceholder")
const JsonPlaceholderLayer = Layer.effect(JsonPlaceholder)(makeJsonPlaceholder)
const TestRoutes = HttpRouter.serve(HttpRouter.use(Effect.fnUntraced(function*(router) {
  yield* router.addAll([
    HttpRouter.route("GET", "/", Effect.succeed(HttpServerResponse.text("test"))),
    HttpRouter.route("GET", "/redirect", Effect.succeed(HttpServerResponse.redirect("/?value=a%23b#fragment"))),
    HttpRouter.route(
      "GET",
      "/stream",
      Effect.succeed(HttpServerResponse.stream(Stream.make("test").pipe(Stream.encodeText)))
    ),
    HttpRouter.route(
      "GET",
      "/interrupt",
      Effect.succeed(HttpServerResponse.stream(
        Stream.make("test").pipe(Stream.concat(Stream.never), Stream.encodeText)
      ))
    ),
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
    HttpRouter.route("HEAD", "/todos", Effect.succeed(HttpServerResponse.empty({ status: 200 })))
  ])
})))
const DenoHttpServerUrl = new URL("../../platform/deno/src/DenoHttpServer.ts", import.meta.url).href
const TestServerLayer = Layer.unwrap(Effect.promise(() =>
  "Deno" in globalThis
    ? (import(DenoHttpServerUrl) as Promise<{
      readonly layerServer: (options: {
        readonly hostname: string
        readonly port: number
        readonly onListen: () => void
      }) => Layer.Layer<HttpServer.HttpServer>
    }>).then((DenoHttpServer) => DenoHttpServer.layerServer({ hostname: "127.0.0.1", port: 0, onListen: () => {} }))
    : Promise.all([
      import("@effect/platform-node/NodeHttpServer"),
      import("node:http")
    ]).then(([NodeHttpServer, Http]) => NodeHttpServer.layerServer(Http.createServer, { port: 0 }))
))
;[
  {
    name: "FetchHttpClient",
    layer: FetchHttpClient.layer
  }
].forEach(({ layer, name }) => {
  const layerTest = HttpServer.layerTestClient.pipe(
    Layer.provide(layer),
    Layer.provideMerge(TestServerLayer)
  )
  const testLayer = Layer.merge(JsonPlaceholderLayer, TestRoutes).pipe(
    Layer.provideMerge(layerTest)
  )

  it.layer(layer)(name, (it) => {
    it.effect("get", () =>
      Effect.gen(function*() {
        const response = yield* HttpClient.get("/").pipe(
          Effect.flatMap((_) => _.text)
        )
        expect(response).toBe("test")
      }).pipe(Effect.provide(testLayer)))

    it.effect("followRedirects", () =>
      Effect.gen(function*() {
        const client = (yield* HttpClient.HttpClient).pipe(
          HttpClient.followRedirects()
        )
        const response = yield* client.get("/redirect")
        // Fetch follows redirects natively and retains the original request.
        expect(new URL(response.request.url).pathname).toBe("/redirect")
        expect(new URL(response.url).pathname).toBe("/")
        assert.strictEqual(new URL(response.url).search, "?value=a%23b")
        assert.strictEqual(new URL(response.url).hash, "")
        expect(yield* response.text).toBe("test")
      }).pipe(Effect.provide(testLayer)))

    it.effect("stream", () =>
      Effect.gen(function*() {
        const client = yield* HttpClient.HttpClient
        const response = yield* client.get("/stream").pipe(
          Effect.map((_) => _.stream),
          Stream.unwrap,
          Stream.decodeText(),
          Stream.mkString
        )
        expect(response).toBe("test")
      }).pipe(Effect.provide(testLayer)))

    it.effect("jsonplaceholder", () =>
      Effect.gen(function*() {
        const jp = yield* JsonPlaceholder
        const response = yield* jp.client.get("/todos/1").pipe(
          Effect.flatMap(HttpClientResponse.schemaBodyJson(Todo))
        )
        expect(response.id).toBe(1)
      }).pipe(Effect.provide(testLayer)))

    it.effect("jsonplaceholder schemaBodyJson", () =>
      Effect.gen(function*() {
        const jp = yield* JsonPlaceholder
        const response = yield* jp.createTodo({
          userId: 1,
          title: "test",
          completed: false
        })
        expect(response.title).toBe("test")
      }).pipe(Effect.provide(testLayer)))

    it.effect("head request with schemaJson", () =>
      Effect.gen(function*() {
        const client = yield* HttpClient.HttpClient
        const response = yield* client.head("/todos").pipe(
          Effect.flatMap(
            HttpClientResponse.schemaJson(Schema.Struct({ status: Schema.Literal(200) }))
          )
        )
        expect(response).toEqual({ status: 200 })
      }).pipe(Effect.provide(testLayer)))

    it.effect("interrupt", () =>
      Effect.gen(function*() {
        const client = yield* HttpClient.HttpClient
        const response = yield* client.get("/interrupt").pipe(
          Effect.flatMap((_) => _.text),
          Effect.timeout(1),
          Effect.asSome,
          Effect.catchTag("TimeoutError", () => Effect.succeedNone),
          TestClock.withLive
        )
        expect(response._tag).toEqual("None")
      }).pipe(Effect.provide(testLayer)))

    it.effect("close early", () =>
      Effect.gen(function*() {
        const response = yield* HttpClient.get("/stream")
        expect(response.status).toBe(200)
      }).pipe(Effect.provide(testLayer)))
  })
})
