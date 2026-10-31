import { NodeHttpServer } from "@effect/platform-node"
import * as NodeHttpClient from "@effect/platform-node/NodeHttpClient"
import { assert, describe, expect, it } from "@effect/vitest"
import {
  Array,
  ByteSize,
  Cause,
  Clock,
  Context,
  DateTime,
  Deferred,
  Effect,
  Equal,
  Exit,
  Fiber,
  FileSystem,
  Layer,
  Option,
  Redacted,
  Ref,
  Schema,
  SchemaGetter,
  SchemaTransformation,
  Stream,
  Struct
} from "effect"
import {
  Cookies,
  FetchHttpClient,
  HttpBody,
  HttpClient,
  HttpClientRequest,
  type HttpClientResponse,
  HttpRouter,
  HttpServer,
  HttpServerRequest,
  HttpServerResponse,
  Multipart
} from "effect/http"
import {
  HttpApi,
  HttpApiBuilder,
  HttpApiClient,
  HttpApiEndpoint,
  HttpApiError,
  HttpApiGroup,
  HttpApiMiddleware,
  HttpApiSchema,
  HttpApiSecurity,
  HttpApiTest,
  OpenApi
} from "effect/http-api"
import type * as Socket from "effect/socket/Socket"
import * as Http from "node:http"
import type * as Net from "node:net"

function* assertServerText(res: HttpClientResponse.HttpClientResponse, status: number, text: string) {
  assert.strictEqual(res.status, status)
  assert.strictEqual(yield* res.text, text)
}

function* assertServerJson(res: HttpClientResponse.HttpClientResponse, status: number, json: unknown) {
  assert.strictEqual(res.status, status)
  assert.deepStrictEqual(yield* res.json, json)
}

function* assertClientText<E, R>(res: Effect.Effect<string, E, R>, text: string) {
  assert.strictEqual(yield* res, text)
}

function* assertClientJson<E, R>(res: Effect.Effect<unknown, E, R>, json: unknown) {
  assert.deepStrictEqual(yield* res, json)
}

function* assertClientError<A, E, R>(res: Effect.Effect<A, E, R>, error: E) {
  assert.ok(Equal.equals(yield* Effect.flip(res), error))
}

describe("HttpApi", () => {
  it.effect("undeclared multipart stream errors respond with 413", () => {
    const Api = HttpApi.make("api").add(
      HttpApiGroup.make("group").add(
        HttpApiEndpoint.post("upload", "/upload", {
          payload: Schema.Struct({
            file: Multipart.SingleFileSchema
          }).pipe(HttpApiSchema.asMultipartStream({ maxFileSize: 4 }))
        })
      )
    )
    const GroupLayer = HttpApiBuilder.group(
      Api,
      "group",
      (handlers) =>
        handlers.handle("upload", ({ payload }) =>
          // Handler types only allow declared errors; preserve the undeclared runtime failure.
          payload.pipe(
            Stream.filter(Multipart.isFile),
            Stream.runForEach((file) => Stream.runDrain(file.content))
          ) as Effect.Effect<void>)
    )
    const ApiLayer = HttpRouter.serve(
      HttpApiBuilder.layer(Api).pipe(Layer.provide(GroupLayer)),
      { disableListenLog: true, disableLogger: true }
    ).pipe(Layer.provideMerge(NodeHttpServer.layerTest))

    return Effect.gen(function*() {
      const data = new FormData()
      data.append("file", new Blob(["hello"], { type: "text/plain" }), "hello.txt")
      const response = yield* HttpClientRequest.post("/upload").pipe(
        HttpClientRequest.bodyFormData(data),
        HttpClient.execute
      )
      assert.strictEqual(response.status, 413)
    }).pipe(Effect.provide(ApiLayer))
  })

  it.effect("catch all path", () => {
    const Api = HttpApi.make("api")
      .add(
        HttpApiGroup.make("group")
          .add(
            HttpApiEndpoint.get("catchAll", "*", {
              success: Schema.String
            })
          )
      )
    const GroupLayer = HttpApiBuilder.group(
      Api,
      "group",
      (handlers) => handlers.handle("catchAll", (ctx) => Effect.succeed(ctx.request.url))
    )
    const ApiLayer = HttpRouter.serve(
      HttpApiBuilder.layer(Api).pipe(Layer.provide(GroupLayer)),
      { disableListenLog: true, disableLogger: true }
    ).pipe(Layer.provideMerge(NodeHttpServer.layerTest))

    return Effect.gen(function*() {
      // server side
      yield* assertServerText(yield* HttpClient.get(""), 200, `"/"`)
      yield* assertServerText(yield* HttpClient.get("/"), 200, `"/"`)
      yield* assertServerText(yield* HttpClient.get("/a/b/c"), 200, `"/a/b/c"`)

      // client side
      const client = yield* HttpApiClient.make(Api)
      yield* assertClientText(client.group.catchAll(), "/*")
    }).pipe(Effect.provide(ApiLayer))
  })

  describe("middleware", () => {
    it.effect("error", () => {
      class M extends HttpApiMiddleware.Service<M>()("Http/Logger", {
        error: Schema.String
          .pipe(
            HttpApiSchema.status("MethodNotAllowed"),
            HttpApiSchema.asText()
          )
      }) {}

      const Api = HttpApi.make("api")
        .add(
          HttpApiGroup.make("group")
            .add(
              HttpApiEndpoint.get("a", "/a", {
                success: Schema.Finite
              })
            ).middleware(M)
        )
      const GroupLayer = HttpApiBuilder.group(
        Api,
        "group",
        (handlers) => handlers.handle("a", () => Effect.succeed(1))
      )
      const MLayer = Layer.succeed(
        M,
        () => Effect.fail("error")
      )

      const ApiLayer = HttpRouter.serve(
        HttpApiBuilder.layer(Api).pipe(Layer.provide(GroupLayer), Layer.provide(MLayer)),
        { disableListenLog: true, disableLogger: true }
      ).pipe(Layer.provideMerge(NodeHttpServer.layerTest))

      return Effect.gen(function*() {
        // server side
        yield* assertServerText(yield* HttpClient.get("/a"), 405, "error")

        // client side
        const client = yield* HttpApiClient.make(Api)
        yield* assertClientError(client.group.a(), "error")
      }).pipe(Effect.provide(ApiLayer))
    })

    it.effect("error array", () => {
      class M extends HttpApiMiddleware.Service<M>()("Http/Auth", {
        error: [HttpApiError.UnauthorizedNoContent, HttpApiError.ForbiddenNoContent]
      }) {}

      const Api = HttpApi.make("api").add(
        HttpApiGroup.make("group")
          .add(
            HttpApiEndpoint.get("unauthorized", "/unauthorized", {
              success: Schema.String
            }),
            HttpApiEndpoint.get("forbidden", "/forbidden", {
              success: Schema.String
            })
          )
          .middleware(M)
      )
      const GroupLayer = HttpApiBuilder.group(
        Api,
        "group",
        (handlers) =>
          handlers
            .handle("unauthorized", () => Effect.succeed("ok"))
            .handle("forbidden", () => Effect.succeed("ok"))
      )
      const MLayer = Layer.succeed(
        M,
        (_, { endpoint }) =>
          endpoint.identifier === "unauthorized"
            ? Effect.fail(new HttpApiError.Unauthorized({}))
            : Effect.fail(new HttpApiError.Forbidden({}))
      )

      const ApiLayer = HttpRouter.serve(
        HttpApiBuilder.layer(Api).pipe(Layer.provide(GroupLayer), Layer.provide(MLayer)),
        { disableListenLog: true, disableLogger: true }
      ).pipe(Layer.provideMerge(NodeHttpServer.layerTest))

      return Effect.gen(function*() {
        yield* assertServerText(yield* HttpClient.get("/unauthorized"), 401, "")
        yield* assertServerText(yield* HttpClient.get("/forbidden"), 403, "")

        const client = yield* HttpApiClient.make(Api)
        yield* assertClientError(client.group.unauthorized(), new HttpApiError.Unauthorized({}))
        yield* assertClientError(client.group.forbidden(), new HttpApiError.Forbidden({}))
      }).pipe(Effect.provide(ApiLayer))
    })

    it.effect("client middleware modifies request and receives metadata", () => {
      class M extends HttpApiMiddleware.Service<M>()("Client/Metadata", {
        requiredForClient: true
      }) {}

      const Api = HttpApi.make("api").add(
        HttpApiGroup.make("group")
          .add(
            HttpApiEndpoint.get("a", "/a", {
              success: Schema.String
            })
          )
          .middleware(M)
      )
      const GroupLayer = HttpApiBuilder.group(
        Api,
        "group",
        (handlers) => handlers.handle("a", (ctx) => Effect.succeed(ctx.request.headers["x-client"] ?? "missing"))
      )
      const MLayer = Layer.succeed(M, (effect) => effect)

      const ApiLayer = HttpRouter.serve(
        HttpApiBuilder.layer(Api).pipe(Layer.provide(GroupLayer), Layer.provide(MLayer)),
        { disableListenLog: true, disableLogger: true }
      ).pipe(Layer.provideMerge(NodeHttpServer.layerTest))

      return Effect.gen(function*() {
        const metadata = yield* Ref.make<{ readonly group: string; readonly endpoint: string } | undefined>(undefined)

        const MClient = HttpApiMiddleware.layerClient(
          M,
          Effect.fnUntraced(function*({ endpoint, group, next, request }) {
            yield* Ref.set(metadata, { group: group.identifier, endpoint: endpoint.identifier })
            return yield* next(HttpClientRequest.setHeader(request, "x-client", "from-client"))
          })
        )

        const client = yield* HttpApiClient.make(Api).pipe(
          Effect.provide(MClient)
        )
        assert.strictEqual(yield* client.group.a(), "from-client")
        assert.deepStrictEqual(yield* Ref.get(metadata), {
          group: "group",
          endpoint: "a"
        })
      }).pipe(Effect.provide(ApiLayer))
    })

    it.effect("client middleware chain order is LIFO", () => {
      class M1 extends HttpApiMiddleware.Service<M1>()("Client/Chain1", {
        requiredForClient: true
      }) {}

      class M2 extends HttpApiMiddleware.Service<M2>()("Client/Chain2", {
        requiredForClient: true
      }) {}

      const Api = HttpApi.make("api").add(
        HttpApiGroup.make("group")
          .add(
            HttpApiEndpoint.get("a", "/a", {
              success: Schema.String
            })
              .middleware(M1)
              .middleware(M2)
          )
      )
      const GroupLayer = HttpApiBuilder.group(
        Api,
        "group",
        (handlers) =>
          handlers.handle(
            "a",
            (ctx) => Effect.succeed(`${ctx.request.headers["x-m1"] ?? "0"}${ctx.request.headers["x-m2"] ?? "0"}`)
          )
      )
      const M1Layer = Layer.succeed(M1, (effect) => effect)
      const M2Layer = Layer.succeed(M2, (effect) => effect)

      const ApiLayer = HttpRouter.serve(
        HttpApiBuilder.layer(Api).pipe(Layer.provide(GroupLayer), Layer.provide(M1Layer), Layer.provide(M2Layer)),
        { disableListenLog: true, disableLogger: true }
      ).pipe(Layer.provideMerge(NodeHttpServer.layerTest))

      return Effect.gen(function*() {
        const order: Array<string> = []

        const M1Client = HttpApiMiddleware.layerClient(
          M1,
          Effect.fnUntraced(function*({ next, request }) {
            order.push("m1-before")
            const response = yield* next(HttpClientRequest.setHeader(request, "x-m1", "1"))
            order.push("m1-after")
            return response
          })
        )

        const M2Client = HttpApiMiddleware.layerClient(
          M2,
          Effect.fnUntraced(function*({ next, request }) {
            order.push("m2-before")
            const response = yield* next(HttpClientRequest.setHeader(request, "x-m2", "1"))
            order.push("m2-after")
            return response
          })
        )

        const client = yield* HttpApiClient.make(Api).pipe(
          Effect.provide([M1Client, M2Client])
        )

        assert.strictEqual(yield* client.group.a(), "11")
        assert.deepStrictEqual(order, ["m2-before", "m1-before", "m1-after", "m2-after"])
      }).pipe(Effect.provide(ApiLayer))
    })

    it.effect("required client middleware can fail with typed clientError", () => {
      class ClientFailure extends Schema.Error<ClientFailure>("ClientFailure")({
        _tag: Schema.tag("ClientFailure")
      }) {}

      class M extends HttpApiMiddleware.Service<M, {
        clientError: ClientFailure
      }>()("Client/Failure", {
        requiredForClient: true
      }) {}

      const Api = HttpApi.make("api").add(
        HttpApiGroup.make("group")
          .add(
            HttpApiEndpoint.get("a", "/a", {
              success: Schema.String
            })
          )
          .middleware(M)
      )
      let handled = false
      const GroupLayer = HttpApiBuilder.group(
        Api,
        "group",
        (handlers) =>
          handlers.handle("a", () =>
            Effect.sync(() => {
              handled = true
              return "ok"
            }))
      )
      const MLayer = Layer.succeed(M, (effect) => effect)

      const ApiLayer = HttpRouter.serve(
        HttpApiBuilder.layer(Api).pipe(Layer.provide(GroupLayer), Layer.provide(MLayer)),
        { disableListenLog: true, disableLogger: true }
      ).pipe(Layer.provideMerge(NodeHttpServer.layerTest))

      return Effect.gen(function*() {
        const MClient = HttpApiMiddleware.layerClient(
          M,
          () => Effect.fail(new ClientFailure({}))
        )

        const client = yield* HttpApiClient.make(Api).pipe(
          Effect.provide(MClient)
        )

        yield* assertClientError(client.group.a(), new ClientFailure({}))
        assert.isFalse(handled)
      }).pipe(Effect.provide(ApiLayer))
    })

    it.effect("optional client middleware is skipped when not provided", () => {
      class M extends HttpApiMiddleware.Service<M>()("Client/Optional") {}

      const Api = HttpApi.make("api").add(
        HttpApiGroup.make("group")
          .add(
            HttpApiEndpoint.get("a", "/a", {
              success: Schema.String
            })
          )
          .middleware(M)
      )
      const GroupLayer = HttpApiBuilder.group(
        Api,
        "group",
        (handlers) => handlers.handle("a", (ctx) => Effect.succeed(ctx.request.headers["x-optional"] ?? "missing"))
      )
      const MLayer = Layer.succeed(M, (effect) => effect)

      const ApiLayer = HttpRouter.serve(
        HttpApiBuilder.layer(Api).pipe(Layer.provide(GroupLayer), Layer.provide(MLayer)),
        { disableListenLog: true, disableLogger: true }
      ).pipe(Layer.provideMerge(NodeHttpServer.layerTest))

      return Effect.gen(function*() {
        const client = yield* HttpApiClient.make(Api)
        assert.strictEqual(yield* client.group.a(), "missing")
      }).pipe(Effect.provide(ApiLayer))
    })

    it.effect("layerClient supports effectful construction", () => {
      class HeaderValue extends Context.Service<HeaderValue, string>()("HeaderValue") {}

      class M extends HttpApiMiddleware.Service<M>()("Client/Effectful", {
        requiredForClient: true
      }) {}

      const Api = HttpApi.make("api").add(
        HttpApiGroup.make("group")
          .add(
            HttpApiEndpoint.get("a", "/a", {
              success: Schema.String
            })
          )
          .middleware(M)
      )
      const GroupLayer = HttpApiBuilder.group(
        Api,
        "group",
        (handlers) => handlers.handle("a", (ctx) => Effect.succeed(ctx.request.headers["x-effect"] ?? "missing"))
      )
      const MLayer = Layer.succeed(M, (effect) => effect)

      const ApiLayer = HttpRouter.serve(
        HttpApiBuilder.layer(Api).pipe(Layer.provide(GroupLayer), Layer.provide(MLayer)),
        { disableListenLog: true, disableLogger: true }
      ).pipe(Layer.provideMerge(NodeHttpServer.layerTest))

      return Effect.gen(function*() {
        const MClient = HttpApiMiddleware.layerClient(
          M,
          Effect.gen(function*() {
            const header = yield* HeaderValue
            return ({ next, request }) => next(HttpClientRequest.setHeader(request, "x-effect", header))
          })
        )

        const client = yield* HttpApiClient.make(Api).pipe(
          Effect.provide(MClient),
          Effect.provideService(HeaderValue, "from-effect")
        )

        assert.strictEqual(yield* client.group.a(), "from-effect")
      }).pipe(Effect.provide(ApiLayer))
    })

    it.effect("security middleware can be implemented with layerClient", () => {
      class CurrentToken extends Context.Service<CurrentToken, string>()("CurrentToken") {}

      class M extends HttpApiMiddleware.Service<M, {
        provides: CurrentToken
      }>()("Client/Security", {
        security: {
          apiKey: HttpApiSecurity.apiKey({
            in: "header",
            key: "authorization"
          })
        }
      }) {}

      const Api = HttpApi.make("api").add(
        HttpApiGroup.make("group")
          .add(HttpApiEndpoint.get("a", "/a", {
            success: Schema.String
          }))
          .middleware(M)
      )
      const GroupLayer = HttpApiBuilder.group(
        Api,
        "group",
        (handlers) => handlers.handle("a", () => CurrentToken)
      )
      const MLayer = Layer.succeed(M)({
        apiKey: (effect, options) => Effect.provideService(effect, CurrentToken, Redacted.value(options.credential))
      })

      const ApiLayer = HttpRouter.serve(
        HttpApiBuilder.layer(Api).pipe(Layer.provide(GroupLayer), Layer.provide(MLayer)),
        { disableListenLog: true, disableLogger: true }
      ).pipe(Layer.provideMerge(NodeHttpServer.layerTest))

      return Effect.gen(function*() {
        const client = yield* HttpApiClient.make(Api)
        assert.strictEqual(yield* client.group.a(), "")

        const MClient = HttpApiMiddleware.layerClient(
          M,
          ({ next, request }) => next(HttpClientRequest.setHeader(request, "authorization", "token"))
        )
        const authedClient = yield* HttpApiClient.make(Api).pipe(Effect.provide(MClient))

        assert.strictEqual(yield* authedClient.group.a(), "token")
      }).pipe(Effect.provide(ApiLayer))
    })

    it.effect("basic security round trips non-ASCII credentials", () => {
      class CurrentCredentials extends Context.Service<CurrentCredentials, string>()("CurrentCredentials") {}

      class M extends HttpApiMiddleware.Service<M, {
        provides: CurrentCredentials
      }>()("Client/Security/Basic", {
        security: {
          basic: HttpApiSecurity.basic
        }
      }) {}

      const Api = HttpApi.make("api").add(
        HttpApiGroup.make("group")
          .add(HttpApiEndpoint.get("a", "/a", {
            success: Schema.String
          }))
          .middleware(M)
      )
      const GroupLayer = HttpApiBuilder.group(
        Api,
        "group",
        (handlers) => handlers.handle("a", () => CurrentCredentials)
      )
      const MLayer = Layer.succeed(M)({
        basic: (effect, { credential }) =>
          Effect.provideService(
            effect,
            CurrentCredentials,
            `${credential.username}:${Redacted.value(credential.password)}`
          )
      })

      const ApiLayer = HttpRouter.serve(
        HttpApiBuilder.layer(Api).pipe(Layer.provide(GroupLayer), Layer.provide(MLayer)),
        { disableListenLog: true, disableLogger: true }
      ).pipe(Layer.provideMerge(NodeHttpServer.layerTest))

      return Effect.gen(function*() {
        const MClient = HttpApiMiddleware.layerClient(
          M,
          ({ next, request }) => next(HttpClientRequest.basicAuth(request, "usér", "pässword€"))
        )
        const client = yield* HttpApiClient.make(Api).pipe(Effect.provide(MClient))

        assert.strictEqual(yield* client.group.a(), "usér:pässword€")
      }).pipe(Effect.provide(ApiLayer))
    })

    it("security middleware cache does not reuse the first service impl", async () => {
      class CurrentMarker extends Context.Service<CurrentMarker, string>()("CurrentMarker") {}

      class M extends HttpApiMiddleware.Service<M, {
        provides: CurrentMarker
      }>()("Server/Security/Repro", {
        security: {
          apiKey: HttpApiSecurity.apiKey({
            in: "header",
            key: "authorization"
          })
        }
      }) {}

      const Api = HttpApi.make("api").add(
        HttpApiGroup.make("group")
          .add(HttpApiEndpoint.get("a", "/a", {
            success: Schema.Struct({
              marker: Schema.String
            })
          }))
          .middleware(M)
      )

      const makeWebHandler = (marker: string) => {
        const GroupLayer = HttpApiBuilder.group(
          Api,
          "group",
          (handlers) => handlers.handle("a", () => Effect.map(CurrentMarker, (marker) => ({ marker })))
        )
        const MLayer = Layer.succeed(M)({
          apiKey: (effect) => Effect.provideService(effect, CurrentMarker, marker)
        })

        return HttpRouter.toWebHandler(
          Layer.mergeAll(
            HttpApiBuilder.layer(Api).pipe(
              Layer.provide(GroupLayer),
              Layer.provide(MLayer),
              Layer.provide(HttpServer.layerServices)
            )
          ),
          { disableLogger: true }
        )
      }

      const first = makeWebHandler("first")
      const second = makeWebHandler("second")

      try {
        const firstResponse = await first.handler(
          new Request("http://localhost/a", {
            headers: {
              authorization: "token"
            }
          })
        )
        assert.strictEqual(firstResponse.status, 200)
        assert.deepStrictEqual(await firstResponse.json(), { marker: "first" })

        const secondResponse = await second.handler(
          new Request("http://localhost/a", {
            headers: {
              authorization: "token"
            }
          })
        )
        assert.strictEqual(secondResponse.status, 200)
        assert.deepStrictEqual(await secondResponse.json(), { marker: "second" })
      } finally {
        await first.dispose()
        await second.dispose()
      }
    })

    it.effect("addHttpApi + middleware works across merged groups", () => {
      class M1 extends HttpApiMiddleware.Service<M1>()("Http/M1") {}
      class M2 extends HttpApiMiddleware.Service<M2>()("Http/M2") {}

      const calls: Array<string> = []

      const V0 = HttpApi.make("v0").add(
        HttpApiGroup.make("users").add(
          HttpApiEndpoint.get("list", "/users", {
            success: Schema.String
          })
        )
      )
      const Api = HttpApi.make("api")
        .add(
          HttpApiGroup.make("health").add(
            HttpApiEndpoint.get("health", "/health", {
              success: Schema.String
            })
          )
        )
        .addHttpApi(V0)
        .middleware(M1)
        .middleware(M2)

      const HealthLayer = HttpApiBuilder.group(
        Api,
        "health",
        (handlers) => handlers.handle("health", () => Effect.succeed("ok"))
      )
      const UsersLayer = HttpApiBuilder.group(
        Api,
        "users",
        (handlers) => handlers.handle("list", () => Effect.succeed("ok"))
      )
      const M1Layer = Layer.succeed(
        M1,
        (effect, { endpoint, group }) =>
          Effect.sync(() => calls.push(`m1:${group.identifier}.${endpoint.identifier}`)).pipe(
            Effect.flatMap(() => effect)
          )
      )
      const M2Layer = Layer.succeed(
        M2,
        (effect, { endpoint, group }) =>
          Effect.sync(() => calls.push(`m2:${group.identifier}.${endpoint.identifier}`)).pipe(
            Effect.flatMap(() => effect)
          )
      )

      const ApiLayer = HttpRouter.serve(
        HttpApiBuilder.layer(Api).pipe(
          Layer.provide(HealthLayer),
          Layer.provide(UsersLayer),
          Layer.provide(M1Layer),
          Layer.provide(M2Layer)
        ),
        { disableListenLog: true, disableLogger: true }
      ).pipe(Layer.provideMerge(NodeHttpServer.layerTest))

      return Effect.gen(function*() {
        yield* assertServerJson(yield* HttpClient.get("/health"), 200, "ok")
        yield* assertServerJson(yield* HttpClient.get("/users"), 200, "ok")
        assert.deepStrictEqual(calls, [
          "m2:health.health",
          "m1:health.health",
          "m2:users.list",
          "m1:users.list"
        ])
      }).pipe(Effect.provide(ApiLayer))
    })

    it.effect("missing middleware layer fails with service not found error", () => {
      class M extends HttpApiMiddleware.Service<M>()("Server/MissingMiddleware") {}

      const Api = HttpApi.make("api").add(
        HttpApiGroup.make("group")
          .add(
            HttpApiEndpoint.get("a", "/a", {
              success: Schema.String
            })
          )
          .middleware(M)
      )
      const GroupLayer = HttpApiBuilder.group(
        Api,
        "group",
        (handlers) => handlers.handle("a", () => Effect.succeed("ok"))
      )
      const ApiLayer = HttpRouter.serve(
        HttpApiBuilder.layer(Api).pipe(Layer.provide(GroupLayer)),
        { disableListenLog: true, disableLogger: true }
      ).pipe(Layer.provideMerge(NodeHttpServer.layerTest))

      return HttpClient.get("/a").pipe(
        Effect.provide(ApiLayer),
        Effect.sandbox,
        Effect.flip,
        Effect.flatMap((cause) =>
          Effect.sync(() => {
            const defect = Cause.squash(cause)
            assert.instanceOf(defect, Error)
            assert.include(defect.message, "Service not found: Server/MissingMiddleware")
            assert.isFalse(defect.message.includes("is not a function"))
          })
        )
      ) as Effect.Effect<void, HttpClientResponse.HttpClientResponse>
    })
  })

  it.effect("missing addHttpApi group layer has actionable error", () => {
    const HealthApi = HttpApiGroup.make("health").add(
      HttpApiEndpoint.get("health", "/health", {
        success: Schema.String
      })
    )
    const V0 = HttpApi.make("v0").add(
      HttpApiGroup.make("users").add(
        HttpApiEndpoint.get("list", "/users", {
          success: Schema.String
        })
      )
    )
    const Api = HttpApi.make("api")
      .add(HealthApi)
      .addHttpApi(V0)

    const UsersLayer = HttpApiBuilder.group(
      Api,
      "users",
      (handlers) => handlers.handle("list", () => Effect.succeed("ok"))
    )
    const ApiLayer = HttpRouter.serve(
      HttpApiBuilder.layer(Api).pipe(Layer.provide(UsersLayer)),
      { disableListenLog: true, disableLogger: true }
    ).pipe(Layer.provideMerge(NodeHttpServer.layerTest))

    return HttpClient.get("/users").pipe(
      Effect.provide(ApiLayer),
      Effect.sandbox,
      Effect.flip,
      Effect.flatMap((cause) =>
        Effect.sync(() => {
          const defect = Cause.squash(cause)
          assert.strictEqual(typeof defect, "string")
          assert.include(defect, "HttpApiGroup \"health\" not found")
          assert.include(defect, "HttpApiBuilder.group(api, \"health\", ...)")
          assert.include(defect, "Available groups: effect/http-api/HttpApiGroup/users")
        })
      )
    ) as Effect.Effect<void, HttpClientResponse.HttpClientResponse>
  })

  describe("payload option", () => {
    describe("GET", () => {
      it.effect("query parameters", () => {
        const Api = HttpApi.make("api")
          .add(
            HttpApiGroup.make("group")
              .add(
                HttpApiEndpoint.get("a", "/a", {
                  payload: {
                    required: Schema.FiniteFromString,
                    optionalKey: Schema.optionalKey(Schema.FiniteFromString),
                    optional: Schema.optional(Schema.FiniteFromString)
                  },
                  success: Schema.Any
                })
              )
          )
        const GroupLayer = HttpApiBuilder.group(
          Api,
          "group",
          (handlers) => handlers.handle("a", (ctx) => Effect.succeed(ctx.payload))
        )
        const ApiLayer = HttpRouter.serve(
          HttpApiBuilder.layer(Api).pipe(Layer.provide(GroupLayer)),
          { disableListenLog: true, disableLogger: true }
        ).pipe(Layer.provideMerge(NodeHttpServer.layerTest))

        return Effect.gen(function*() {
          // server side
          yield* assertServerText(yield* HttpClient.get("/a"), 400, "")
          yield* assertServerJson(yield* HttpClient.get("/a?required=1"), 200, { required: 1 })
          yield* assertServerJson(yield* HttpClient.get("/a?required=1&optionalKey=1"), 200, {
            required: 1,
            optionalKey: 1
          })
          yield* assertServerJson(yield* HttpClient.get("/a?required=1&optional=1"), 200, { required: 1, optional: 1 })
          yield* assertServerJson(yield* HttpClient.get("/a?required=1"), 200, { required: 1 })
          // TODO: fix this test
          yield* assertServerJson(yield* HttpClient.get("/a?required=1&optional="), 200, { required: 1, optional: 0 })

          // client side
          const client = yield* HttpApiClient.make(Api)
          yield* assertClientJson(client.group.a({ payload: { required: 1 } }), { required: 1 })
          yield* assertClientJson(client.group.a({ payload: { required: 1, optionalKey: 1 } }), {
            required: 1,
            optionalKey: 1
          })
          yield* assertClientJson(client.group.a({ payload: { required: 1, optional: 1 } }), {
            required: 1,
            optional: 1
          })
          yield* assertClientJson(client.group.a({ payload: { required: 1, optional: undefined } }), { required: 1 })
        }).pipe(Effect.provide(ApiLayer))
      })
    })

    it.effect("array of schemas with different encodings", () => {
      const Api = HttpApi.make("api").add(
        HttpApiGroup.make("group").add(
          HttpApiEndpoint.post("a", "/a", {
            payload: [
              Schema.Struct({ a: Schema.String }), // application/json
              Schema.String.pipe(HttpApiSchema.asText()), // text/plain
              Schema.Uint8Array.pipe(HttpApiSchema.asUint8Array()) // application/octet-stream
            ],
            success: Schema.Any
          })
        )
      )
      const GroupLayer = HttpApiBuilder.group(
        Api,
        "group",
        (handlers) => handlers.handle("a", (ctx) => Effect.succeed(ctx.payload))
      )

      const ApiLayer = HttpRouter.serve(
        HttpApiBuilder.layer(Api).pipe(Layer.provide(GroupLayer)),
        { disableListenLog: true, disableLogger: true }
      ).pipe(Layer.provideMerge(NodeHttpServer.layerTest))

      return Effect.gen(function*() {
        // server side
        yield* assertServerText(yield* HttpClient.post("/a"), 400, "")
        yield* assertServerJson(yield* HttpClient.post("/a", { body: HttpBody.jsonUnsafe({ a: "text" }) }), 200, {
          a: "text"
        })
        yield* assertServerJson(yield* HttpClient.post("/a", { body: HttpBody.text("text") }), 200, "text")
        yield* assertServerJson(
          yield* HttpClient.post("/a", { body: HttpBody.uint8Array(new Uint8Array([1, 2, 3])) }),
          200,
          { 0: 1, 1: 2, 2: 3 }
        )

        // client side
        const client = yield* HttpApiClient.make(Api)
        yield* assertClientJson(client.group.a({ payload: { a: "text" } }), { a: "text" })
        yield* assertClientJson(client.group.a({ payload: "text" }), "text")
        yield* assertClientJson(client.group.a({ payload: new Uint8Array([1, 2, 3]) }), { 0: 1, 1: 2, 2: 3 })
      }).pipe(Effect.provide(ApiLayer))
    })

    describe("streaming", () => {
      const Item = Schema.Struct({ n: Schema.Number })
      const Api = HttpApi.make("api").add(
        HttpApiGroup.make("group").add(
          HttpApiEndpoint.post("ndjson", "/ndjson", {
            payload: HttpApiSchema.StreamNdjson({ schema: Item }),
            success: Schema.Array(Item)
          }),
          HttpApiEndpoint.post("bytes", "/bytes", {
            payload: HttpApiSchema.StreamUint8Array(),
            success: Schema.Number
          }),
          HttpApiEndpoint.post("ignore", "/ignore", {
            payload: HttpApiSchema.StreamUint8Array(),
            success: Schema.String
          }),
          HttpApiEndpoint.post("flaky", "/flaky", {
            payload: HttpApiSchema.StreamNdjson({ schema: Item }),
            success: Schema.Array(Item),
            error: HttpApiError.ServiceUnavailable
          }),
          HttpApiEndpoint.post("mixed", "/mixed", {
            payload: [Schema.Array(Item), HttpApiSchema.StreamNdjson({ schema: Item })],
            success: Schema.String
          })
        )
      )
      const GroupLayer = HttpApiBuilder.group(
        Api,
        "group",
        Effect.fnUntraced(function*(handlers) {
          const flakyCalls = yield* Ref.make(0)
          return handlers
            .handle("ndjson", ({ payload }) => Stream.runCollect(payload))
            .handle("bytes", ({ payload }) => Stream.runFold(payload, () => 0, (total, chunk) => total + chunk.length))
            .handle("ignore", () => Effect.succeed("ok"))
            .handle("flaky", ({ payload }) =>
              Effect.gen(function*() {
                const items = yield* Stream.runCollect(payload)
                if ((yield* Ref.getAndUpdate(flakyCalls, (n) => n + 1)) === 0) {
                  return yield* new HttpApiError.ServiceUnavailable()
                }
                return items
              }))
            .handle("mixed", ({ payload }) =>
              Stream.isStream(payload)
                ? Effect.map(Stream.runCollect(payload), (items) => `stream:${items.length}`)
                : Effect.succeed(`array:${payload.length}`))
        })
      )
      ;[
        { name: "node:http", layer: NodeHttpClient.layerNodeHttp },
        { name: "undici", layer: NodeHttpClient.layerUndici },
        { name: "fetch", layer: FetchHttpClient.layer }
      ].forEach(({ layer, name }) => {
        describe(name, () => {
          const ApiLayer = HttpRouter.serve(
            HttpApiBuilder.layer(Api).pipe(Layer.provide(GroupLayer)),
            { disableListenLog: true, disableLogger: true }
          ).pipe(
            Layer.provideMerge(HttpServer.layerTestClient),
            Layer.provide(layer),
            Layer.provideMerge(NodeHttpServer.layer(Http.createServer, { port: 0 }))
          )

          it.effect("uploads a caller's stream", () =>
            Effect.gen(function*() {
              const client = yield* HttpApiClient.make(Api)
              const items = yield* client.group.ndjson({ payload: Stream.make({ n: 1 }, { n: 2 }, { n: 3 }) })
              assert.deepStrictEqual(items, [{ n: 1 }, { n: 2 }, { n: 3 }])
              const total = yield* client.group.bytes({
                payload: Stream.make(new Uint8Array(2), new Uint8Array(3))
              })
              assert.strictEqual(total, 5)
            }).pipe(Effect.provide(ApiLayer)))

          it.effect("fails with an HttpClientError when the source fails before the method returns", () =>
            Effect.gen(function*() {
              const client = yield* HttpApiClient.make(Api)
              const error = yield* client.group.ndjson({
                payload: Stream.make({ n: 1 }).pipe(Stream.concat(Stream.fail("SourceError" as const)))
              }).pipe(Effect.flip)
              assert.strictEqual(error._tag, "HttpClientError")
            }).pipe(Effect.provide(ApiLayer)))

          it.live("interrupts the upload once the response is decoded", () =>
            Effect.gen(function*() {
              const client = yield* HttpApiClient.make(Api)
              const finalized = yield* Deferred.make<void>()
              const result = yield* client.group.ignore({
                payload: Stream.make(new Uint8Array(1)).pipe(
                  Stream.concat(Stream.never),
                  Stream.ensuring(Deferred.succeed(finalized, undefined))
                )
              })
              assert.strictEqual(result, "ok")
              yield* Deferred.await(finalized).pipe(Effect.timeout("1 second"))
            }).pipe(Effect.provide(ApiLayer)))

          it.effect("replays the stream on retry", () =>
            Effect.gen(function*() {
              const client = yield* HttpApiClient.make(Api, {
                transformClient: (client) => HttpClient.retryTransient(client, { times: 1 })
              })
              let runs = 0
              const items = yield* client.group.flaky({
                payload: Stream.suspend(() => {
                  runs++
                  return Stream.make({ n: 1 }, { n: 2 })
                })
              })
              assert.deepStrictEqual(items, [{ n: 1 }, { n: 2 }])
              assert.strictEqual(runs, 2)
            }).pipe(Effect.provide(ApiLayer)))

          it.effect("sends the buffered or streaming member of a mixed payload", () =>
            Effect.gen(function*() {
              const client = yield* HttpApiClient.make(Api)
              assert.strictEqual(yield* client.group.mixed({ payload: [{ n: 1 }, { n: 2 }] }), "array:2")
              assert.strictEqual(yield* client.group.mixed({ payload: Stream.make({ n: 1 }, { n: 2 }) }), "stream:2")
            }).pipe(Effect.provide(ApiLayer)))
        })
      })
    })
  })

  describe("params option", () => {
    it.effect("should accept a record of schemas", () => {
      const Api = HttpApi.make("api").add(
        HttpApiGroup.make("group").add(
          HttpApiEndpoint.get("get", "/:id", {
            params: {
              id: Schema.FiniteFromString
            },
            success: Schema.String
          })
        )
      )
      const GroupLayer = HttpApiBuilder.group(
        Api,
        "group",
        (handlers) => handlers.handle("get", (ctx) => Effect.succeed(`User ${ctx.params.id}`))
      )

      const ApiLayer = HttpRouter.serve(
        HttpApiBuilder.layer(Api).pipe(Layer.provide(GroupLayer)),
        { disableListenLog: true, disableLogger: true }
      ).pipe(Layer.provideMerge(NodeHttpServer.layerTest))

      return Effect.gen(function*() {
        // server side
        yield* assertServerJson(yield* HttpClient.get("/1"), 200, "User 1")

        // client side
        const client = yield* HttpApiClient.make(Api)
        yield* assertClientJson(client.group.get({ params: { id: 1 } }), "User 1")
      }).pipe(Effect.provide(ApiLayer))
    })
  })

  describe("query option", () => {
    it.effect("should accept a record of schemas", () => {
      const Api = HttpApi.make("api").add(
        HttpApiGroup.make("group").add(
          HttpApiEndpoint.get("get", "/", {
            query: {
              id: Schema.FiniteFromString
            },
            success: Schema.String
          })
        )
      )
      const GroupLayer = HttpApiBuilder.group(
        Api,
        "group",
        (handlers) => handlers.handle("get", (ctx) => Effect.succeed(`User ${ctx.query.id}`))
      )

      const ApiLayer = HttpRouter.serve(
        HttpApiBuilder.layer(Api).pipe(Layer.provide(GroupLayer)),
        { disableListenLog: true, disableLogger: true }
      ).pipe(Layer.provideMerge(NodeHttpServer.layerTest))

      return Effect.gen(function*() {
        // server side
        yield* assertServerJson(yield* HttpClient.get("/?id=1"), 200, "User 1")

        // client side
        const client = yield* HttpApiClient.make(Api)
        yield* assertClientJson(client.group.get({ query: { id: 1 } }), "User 1")
      }).pipe(Effect.provide(ApiLayer))
    })
  })

  describe("success option", () => {
    it.effect("no content", () => {
      const Api = HttpApi.make("api")
        .add(
          HttpApiGroup.make("group")
            .add(
              HttpApiEndpoint.get("a", "/a", {
                success: Schema.Void
              }),
              HttpApiEndpoint.get("b", "/b", {
                success: HttpApiSchema.NoContent
              }),
              HttpApiEndpoint.get("c", "/c", {
                success: Schema.String.pipe(HttpApiSchema.asNoContent({ decode: () => "c" }))
              })
            )
        )
      const GroupLayer = HttpApiBuilder.group(
        Api,
        "group",
        (handlers) =>
          handlers
            .handle("a", () => Effect.void)
            .handle("b", () => Effect.succeed(HttpApiSchema.NoContent.make()))
            .handle("c", () => Effect.succeed("-"))
      )

      const ApiLayer = HttpRouter.serve(
        HttpApiBuilder.layer(Api).pipe(Layer.provide(GroupLayer)),
        { disableListenLog: true, disableLogger: true }
      ).pipe(Layer.provideMerge(NodeHttpServer.layerTest))

      return Effect.gen(function*() {
        // server side
        yield* assertServerText(yield* HttpClient.get("/a"), 200, "")
        yield* assertServerText(yield* HttpClient.get("/b"), 204, "")
        yield* assertServerText(yield* HttpClient.get("/c"), 200, "")

        // client side
        const client = yield* HttpApiClient.make(Api)
        yield* assertClientJson(client.group.a(), undefined)
        yield* assertClientJson(client.group.b(), undefined)
        yield* assertClientJson(client.group.c(), "c")
      }).pipe(Effect.provide(ApiLayer))
    })

    it.effect("upgrade", () => {
      class NotFound extends Schema.Error<NotFound>("NotFound")({
        _tag: Schema.tag("NotFound")
      }, {
        httpApiStatus: 404
      }) {}
      const Api = HttpApi.make("api")
        .add(
          HttpApiGroup.make("containers")
            .add(
              HttpApiEndpoint.post("attach", "/containers/:id/attach", {
                params: { id: Schema.String },
                success: HttpApiSchema.Upgrade({ protocol: "tcp" }),
                error: NotFound
              }),
              HttpApiEndpoint.post("start", "/containers/:id/start", {
                params: { id: Schema.String },
                payload: Schema.Struct({ tty: Schema.Boolean, detach: Schema.Boolean }),
                success: [
                  HttpApiSchema.Upgrade({
                    protocol: "tcp",
                    headers: { "content-type": Schema.Literals(["application/raw", "application/multiplexed"]) }
                  }),
                  Schema.String
                ],
                error: NotFound
              })
            )
        )
      const GroupLayer = HttpApiBuilder.group(
        Api,
        "containers",
        (handlers) =>
          handlers
            .handle("attach", ({ params, upgrade }) =>
              Effect.gen(function*() {
                // fails before the 101 is sent
                if (params.id !== "abc") return yield* new NotFound()
                const socket = yield* upgrade()
                const reader = yield* socket.reader
                const writer = yield* socket.writer
                yield* writer.write(`${params.id}:${yield* readUntilClose(reader)}`)
              }).pipe(Effect.catchTag("SocketError", Effect.die), Effect.scoped))
            .handle("start", ({ params, payload, upgrade }) =>
              Effect.gen(function*() {
                if (params.id !== "abc") return yield* new NotFound()
                // the server may decline the upgrade with an ordinary success
                if (payload.detach) return `${params.id}:detached`
                const socket = yield* upgrade({
                  headers: { "content-type": payload.tty ? "application/raw" : "application/multiplexed" }
                })
                const reader = yield* socket.reader
                const writer = yield* socket.writer
                yield* writer.write(`${params.id}:${payload.tty}:${yield* readUntilClose(reader)}`)
              }).pipe(Effect.catchTag("SocketError", Effect.die), Effect.scoped))
      )
      const ApiLayer = HttpRouter.serve(
        HttpApiBuilder.layer(Api).pipe(Layer.provide(GroupLayer)),
        { disableListenLog: true, disableLogger: true }
      ).pipe(
        Layer.provideMerge(HttpServer.layerTestClient),
        Layer.provide(NodeHttpClient.layerNodeHttp),
        Layer.provideMerge(NodeHttpServer.layer(Http.createServer, { port: 0 }))
      )

      return Effect.gen(function*() {
        // server side
        const refused = yield* HttpClient.post("/containers/abc/attach")
        assert.strictEqual(refused.status, 426)
        assert.strictEqual(refused.headers.upgrade, "tcp")

        const missingConnection = yield* HttpClient.post("/containers/abc/attach", {
          headers: { upgrade: "tcp" }
        })
        assert.strictEqual(missingConnection.status, 426)
        assert.strictEqual(missingConnection.headers.upgrade, "tcp")

        // the upgrade is checked before the payload is decoded
        const invalidPayload = HttpBody.text("{", "application/json")
        const refusedStart = yield* HttpClient.post("/containers/abc/start", { body: invalidPayload })
        assert.strictEqual(refusedStart.status, 426)
        const invalidStart = yield* HttpClient.post("/containers/abc/start", {
          headers: { connection: "Upgrade", upgrade: "tcp" },
          body: invalidPayload
        })
        assert.strictEqual(invalidStart.status, 400)
        const detachedStart = yield* HttpClient.post("/containers/abc/start", {
          headers: { connection: "Upgrade", upgrade: "tcp" },
          body: HttpBody.text(JSON.stringify({ tty: false, detach: true }), "application/json")
        })
        assert.strictEqual(detachedStart.status, 200)
        assert.strictEqual(yield* detachedStart.json, "abc:detached")

        // client side
        const client = yield* HttpApiClient.make(Api)
        const attached = yield* client.containers.attach({ params: { id: "abc" } })
        assert.isTrue(HttpApiClient.isUpgraded(attached))
        const { headers, socket } = attached
        assert.strictEqual(headers.upgrade, "tcp")
        const reader = yield* socket.reader
        yield* Effect.scoped(Effect.flatMap(socket.writer, (writer) => writer.write("ping")))
        assert.strictEqual(yield* readUntilClose(reader), "abc:ping")

        const error = yield* Effect.flip(client.containers.attach({ params: { id: "missing" } }))
        assert.deepStrictEqual(error, new NotFound())

        const started = yield* client.containers.start({ params: { id: "abc" }, payload: { tty: true, detach: false } })
        if (!HttpApiClient.isUpgraded(started)) return assert.fail("expected an upgrade")
        assert.deepStrictEqual(started.headers, { "content-type": "application/raw" })
        const startReader = yield* started.socket.reader
        yield* Effect.scoped(Effect.flatMap(started.socket.writer, (writer) => writer.write("ping")))
        assert.strictEqual(yield* readUntilClose(startReader), "abc:true:ping")

        const detached = yield* client.containers.start({
          params: { id: "abc" },
          payload: { tty: false, detach: true }
        })
        assert.strictEqual(detached, "abc:detached")

        const startError = yield* Effect.flip(
          client.containers.start({ params: { id: "missing" }, payload: { tty: false, detach: false } })
        )
        assert.deepStrictEqual(startError, new NotFound())
      }).pipe(Effect.scoped, Effect.provide(ApiLayer))
    })

    it.live("closes an upgraded connection whose headers fail to decode", () =>
      Effect.gen(function*() {
        const { baseUrl, closed } = yield* makeUpgradeServer
        const client = yield* HttpApiClient.make(UpgradeApi, { baseUrl })
        const error = yield* Effect.flip(Effect.scoped(client.containers.start()))
        assert.strictEqual(error._tag, "SchemaError")
        yield* Deferred.await(closed).pipe(Effect.timeout("2 seconds"))
      }).pipe(Effect.scoped, Effect.provide(NodeHttpClient.layerNodeHttp)))

    it.live("closes an upgraded connection when interrupted as the upgrade is taken", () =>
      Effect.gen(function*() {
        const { baseUrl, closed } = yield* makeUpgradeServer
        const client = yield* HttpApiClient.make(UpgradeApi, { baseUrl })
        const response = yield* client.containers.start({ responseMode: "response-only" })
        // interrupts the decoding fiber as soon as the upgrade succeeds
        const interrupted: HttpClientResponse.HttpClientResponse = Object.create(response, {
          upgrade: {
            value: Effect.tap(response.upgrade, () =>
              Effect.withFiber((fiber) => {
                fiber.interruptUnsafe()
                return Effect.void
              }))
          }
        })
        const decodeStart = HttpApiClient.decodeResponse(UpgradeApi, { group: "containers", endpoint: "start" })
        const exit = yield* Fiber.await(yield* Effect.forkChild(decodeStart(interrupted)))
        assert.isTrue(Exit.hasInterrupts(exit))
        yield* Deferred.await(closed).pipe(Effect.timeout("2 seconds"))
      }).pipe(Effect.scoped, Effect.provide(NodeHttpClient.layerNodeHttp)))

    it("no content via toWebHandler", async () => {
      const Api = HttpApi.make("api")
        .add(
          HttpApiGroup.make("group")
            .add(HttpApiEndpoint.delete("remove", "/items/:id", { params: { id: Schema.String } }))
        )
      const GroupLayer = HttpApiBuilder.group(
        Api,
        "group",
        (handlers) => handlers.handle("remove", () => Effect.void)
      )
      const ApiLayer = HttpApiBuilder.layer(Api).pipe(
        Layer.provide(GroupLayer),
        Layer.provide(HttpServer.layerServices)
      )
      const { handler, dispose } = HttpRouter.toWebHandler(
        Layer.mergeAll(ApiLayer),
        { disableLogger: true }
      )
      try {
        const response = await handler(new Request("http://localhost/items/123", { method: "DELETE" }))
        assert.strictEqual(response.status, 204)
        assert.strictEqual(response.body, null)
      } finally {
        await dispose()
      }
    })

    describe("encodings", () => {
      describe("asJson", () => {
        it.effect("custom contentType", () => {
          const Api = HttpApi.make("api").add(
            HttpApiGroup.make("group").add(
              HttpApiEndpoint.get("a", "/a", {
                success: Schema.String.pipe(HttpApiSchema.asJson({ contentType: "application/scim+json" }))
              })
            )
          )
          const GroupLayer = HttpApiBuilder.group(
            Api,
            "group",
            (handlers) => handlers.handle("a", () => Effect.succeed("a"))
          )

          const ApiLayer = HttpRouter.serve(
            HttpApiBuilder.layer(Api).pipe(Layer.provide(GroupLayer)),
            { disableListenLog: true, disableLogger: true }
          ).pipe(Layer.provideMerge(NodeHttpServer.layerTest))

          return Effect.gen(function*() {
            // server side
            const res = yield* HttpClient.get("/a")
            yield* assertServerJson(res, 200, "a")
            assert.strictEqual(res.headers["content-type"], "application/scim+json")

            // client side
            const client = yield* HttpApiClient.make(Api)
            yield* assertClientJson(client.group.a(), "a")
          }).pipe(Effect.provide(ApiLayer))
        })
      })
    })

    describe("StreamNdjson", () => {
      const Item = Schema.Struct({ text: Schema.String })
      const Api = HttpApi.make("api").add(
        HttpApiGroup.make("group").add(
          HttpApiEndpoint.get("failing", "/failing", {
            success: HttpApiSchema.StreamNdjson({ schema: Item })
          })
        )
      )
      const makeApiLayer = (firstItemReceived: Effect.Effect<void>) => {
        const GroupLayer = HttpApiBuilder.group(
          Api,
          "group",
          (handlers) =>
            handlers.handle("failing", () =>
              Effect.succeed(
                Stream.make({ text: "a" }).pipe(
                  Stream.concat(Stream.fromEffect(firstItemReceived.pipe(Effect.andThen(Effect.die("boom")))))
                )
              ))
        )
        return HttpRouter.serve(
          HttpApiBuilder.layer(Api).pipe(Layer.provide(GroupLayer)),
          { disableListenLog: true, disableLogger: true }
        ).pipe(Layer.provideMerge(NodeHttpServer.layerTest))
      }

      it.effect("a server failure mid-stream reaches the client as a body read error, not a clean end", () =>
        Effect.gen(function*() {
          const firstItemReceived = yield* Deferred.make<void>()
          yield* Effect.gen(function*() {
            const client = yield* HttpApiClient.make(Api)
            const stream = yield* client.group.failing()
            const delivered: Array<typeof Item.Type> = []
            const error = yield* stream.pipe(
              Stream.runForEach((item) => {
                delivered.push(item)
                return Deferred.succeed(firstItemReceived, undefined)
              }),
              Effect.flip
            )
            assert.deepStrictEqual(delivered, [{ text: "a" }])
            assert(error._tag === "HttpClientError" && error.reason._tag === "DecodeError")
          }).pipe(Effect.provide(makeApiLayer(Deferred.await(firstItemReceived))))
        }))
    })
  })

  describe("error option", () => {
    it.effect("no content", () => {
      const Api = HttpApi.make("api")
        .add(
          HttpApiGroup.make("group")
            .add(
              HttpApiEndpoint.get("a", "/a", {
                error: Schema.Void.pipe(HttpApiSchema.status("Forbidden"))
              }),
              HttpApiEndpoint.get("b", "/b", {
                error: HttpApiSchema.NoContent,
                success: Schema.String
              }),
              HttpApiEndpoint.get("c", "/c", {
                error: Schema.String.pipe(
                  HttpApiSchema.asNoContent({ decode: () => "c" }),
                  HttpApiSchema.status("Forbidden")
                )
              }),
              HttpApiEndpoint.get("d", "/d", {
                error: HttpApiSchema.Empty(400)
              }),
              HttpApiEndpoint.get("e", "/e", {
                error: HttpApiError.UnauthorizedNoContent
              }),
              HttpApiEndpoint.get("f", "/f", {
                error: HttpApiError.BadRequestNoContent
              })
            )
        )
      const GroupLayer = HttpApiBuilder.group(
        Api,
        "group",
        (handlers) =>
          handlers
            .handle("a", () => Effect.fail(undefined))
            .handle("b", () => Effect.fail(HttpApiSchema.NoContent.make()))
            .handle("c", () => Effect.fail(""))
            .handle("d", () => Effect.fail(void 0))
            .handle("e", () => Effect.fail(new HttpApiError.Unauthorized({})))
            .handle("f", () => Effect.fail(new HttpApiError.BadRequest({})))
      )

      const ApiLayer = HttpRouter.serve(
        HttpApiBuilder.layer(Api).pipe(Layer.provide(GroupLayer)),
        { disableListenLog: true, disableLogger: true }
      ).pipe(Layer.provideMerge(NodeHttpServer.layerTest))

      return Effect.gen(function*() {
        // server side
        yield* assertServerText(yield* HttpClient.get("/a"), 403, "")
        yield* assertServerText(yield* HttpClient.get("/b"), 204, "")
        yield* assertServerText(yield* HttpClient.get("/c"), 403, "")
        yield* assertServerText(yield* HttpClient.get("/d"), 400, "")
        yield* assertServerText(yield* HttpClient.get("/e"), 401, "")
        yield* assertServerText(yield* HttpClient.get("/f"), 400, "")

        // client side
        const client = yield* HttpApiClient.make(Api)
        yield* assertClientError(client.group.a(), undefined)
        yield* assertClientError(client.group.b(), undefined)
        yield* assertClientError(client.group.c(), "c")
        yield* assertClientError(client.group.d(), undefined)
        yield* assertClientError(client.group.e(), new HttpApiError.Unauthorized({}))
        yield* assertClientError(client.group.f(), new HttpApiError.BadRequest({}))
      }).pipe(Effect.provide(ApiLayer))
    })
  })

  describe("original tests", () => {
    describe("payload", () => {
      it.effect("is decoded / encoded", () =>
        Effect.gen(function*() {
          const expected = new User({
            id: 123,
            name: "Joe",
            createdAt: DateTime.makeUnsafe(0)
          })
          const client = yield* HttpApiClient.make(Api)
          const clientUsersGroup = yield* HttpApiClient.group(Api, {
            httpClient: yield* HttpClient.HttpClient,
            group: "users"
          })
          const clientUsersEndpointCreate = yield* HttpApiClient.endpoint(Api, {
            httpClient: yield* HttpClient.HttpClient,
            group: "users",
            endpoint: "create"
          })

          const apiClientUser = yield* client.users.create({
            query: { id: 123 },
            payload: { name: "Joe" }
          })
          assert.deepStrictEqual(
            apiClientUser,
            expected
          )
          const groupClientUser = yield* clientUsersGroup.create({
            query: { id: 123 },
            payload: { name: "Joe" }
          })
          assert.deepStrictEqual(
            groupClientUser,
            expected
          )
          const endpointClientUser = yield* clientUsersEndpointCreate({
            query: { id: 123 },
            payload: { name: "Joe" }
          })
          assert.deepStrictEqual(
            endpointClientUser,
            expected
          )
        }).pipe(Effect.provide(HttpLayer)))

      it.live("multipart", () =>
        Effect.gen(function*() {
          const client = yield* HttpApiClient.make(Api)
          const data = new FormData()
          data.append("file", new Blob(["hello"], { type: "text/plain" }), "hello.txt")
          const result = yield* client.users.upload({ payload: data, params: {} })
          assert.deepStrictEqual(result, {
            contentType: "text/plain",
            length: 5
          })
        }).pipe(Effect.provide(HttpLayer)))

      it.live("multipart stream", () =>
        Effect.gen(function*() {
          const client = yield* HttpApiClient.make(Api)
          const data = new FormData()
          data.append("file", new Blob(["hello"], { type: "text/plain" }), "hello.txt")
          const result = yield* client.users.uploadStream({ payload: data })
          assert.deepStrictEqual(result, {
            contentType: "text/plain",
            length: 5
          })
        }).pipe(Effect.provide(HttpLayer)))
    })

    describe("headers", () => {
      it.effect("should accept a record of schemas", () => {
        const Api = HttpApi.make("api").add(
          HttpApiGroup.make("group").add(
            HttpApiEndpoint.get("get", "/:id", {
              headers: {
                id: Schema.FiniteFromString
              },
              success: Schema.String
            })
          )
        )
        const GroupLayer = HttpApiBuilder.group(
          Api,
          "group",
          (handlers) => handlers.handle("get", (ctx) => Effect.succeed(`User ${ctx.headers.id}`))
        )

        const ApiLayer = HttpRouter.serve(
          HttpApiBuilder.layer(Api).pipe(Layer.provide(GroupLayer)),
          { disableListenLog: true, disableLogger: true }
        ).pipe(Layer.provideMerge(NodeHttpServer.layerTest))

        return Effect.gen(function*() {
          const client = yield* HttpApiClient.make(Api)
          const result = yield* client.group.get({ headers: { id: 1 } })
          assert.strictEqual(result, "User 1")
        }).pipe(Effect.provide(ApiLayer))
      })

      it.effect("is decoded / encoded", () =>
        Effect.gen(function*() {
          const client = yield* HttpApiClient.make(Api)
          const users = yield* client.users.list({
            headers: { page: 1 },
            query: {}
          })
          const user = users[0]
          assert.deepStrictEqual(
            user,
            new User({
              id: 1,
              name: "page 1",
              createdAt: DateTime.makeUnsafe(0)
            })
          )
        }).pipe(Effect.provide(HttpLayer)))
    })

    describe("errors", () => {
      it.effect("empty errors have no body", () =>
        Effect.gen(function*() {
          const response = yield* HttpClient.get("/groups/0")
          assert.strictEqual(response.status, 418)
          const text = yield* response.text
          assert.strictEqual(text, "")
        }).pipe(Effect.provide(HttpLayer)))

      it.effect("empty errors decode", () =>
        Effect.gen(function*() {
          const client = yield* HttpApiClient.make(Api)
          const error = yield* client.groups.findById({ params: { id: 0 } }).pipe(
            Effect.flip
          )
          assert.deepStrictEqual(error, new GroupError({}))
        }).pipe(Effect.provide(HttpLayer)))

      it.effect("default to 500 status code", () =>
        Effect.gen(function*() {
          const response = yield* HttpClientRequest.get("/users").pipe(
            HttpClientRequest.setHeaders({ page: "0" }),
            HttpClient.execute
          )
          assert.strictEqual(response.status, 500)
          const body = yield* response.json
          assert.deepStrictEqual(body, {
            _tag: "NoStatusError"
          })
        }).pipe(Effect.provide(HttpLayer)))

      it.effect("class level annotations", () =>
        Effect.gen(function*() {
          const response = yield* HttpClientRequest.post("/users").pipe(
            HttpClientRequest.setUrlParams({ id: "0" }),
            HttpClientRequest.bodyJsonUnsafe({ name: "boom" }),
            HttpClient.execute
          )
          assert.strictEqual(response.status, 400)
        }).pipe(Effect.provide(HttpLayer)))

      it.effect("BadRequest", () =>
        Effect.gen(function*() {
          const client = yield* HttpApiClient.make(Api)
          const error = yield* client.users.upload({ params: {}, payload: new FormData() }).pipe(
            Effect.flip
          )
          assert(error._tag === "HttpClientError" && error.reason._tag === "DecodeError")
          assert.strictEqual(error.reason.response.status, 400)
        }).pipe(Effect.provide(HttpLayer)))
    })

    it.effect("handler level context", () =>
      Effect.gen(function*() {
        const client = yield* HttpApiClient.make(Api)
        const users = yield* client.users.list({ headers: { page: 1 }, query: {} })
        const user = users[0]
        assert.strictEqual(user.name, "page 1")
        assert.deepStrictEqual(user.createdAt, DateTime.makeUnsafe(0))
      }).pipe(Effect.provide(HttpLayer)))

    it.effect("custom client context", () =>
      Effect.gen(function*() {
        let tapped = false
        const client = yield* HttpApiClient.makeWith(Api, {
          httpClient: (yield* HttpClient.HttpClient).pipe(
            HttpClient.tapRequest(Effect.fnUntraced(function*(_request) {
              tapped = true
              yield* CurrentUser
            }))
          )
        })
        const users = yield* client.users.list({ headers: { page: 1 }, query: {} }).pipe(
          Effect.provideService(
            CurrentUser,
            new User({
              id: 1,
              name: "foo",
              createdAt: DateTime.makeUnsafe(0)
            })
          )
        )
        const user = users[0]
        assert.strictEqual(user.name, "page 1")
        assert.isTrue(tapped)
      }).pipe(Effect.provide(HttpLayer)))

    describe("security", () => {
      it.effect("security middleware sets current user", () =>
        Effect.gen(function*() {
          const server = yield* HttpServer.HttpServer
          const url = new URL(HttpServer.formatAddress(server.address))
          url.hostname = "127.0.0.1"
          const ref = yield* Ref.make(Cookies.mergeIntoArray(
            [],
            url.origin,
            Cookies.fromSetCookie("token=foo; Path=/"),
            yield* Clock.currentTimeMillis
          ))
          const client = yield* HttpApiClient.makeWith(Api, {
            httpClient: HttpClient.withCookiesRef(yield* HttpClient.HttpClient, ref)
          })
          const user = yield* client.users.findById({ params: { id: -1 } })
          assert.strictEqual(user.name, "foo")
        }).pipe(Effect.provide(HttpLayer)))

      it.effect("apiKey header security", () =>
        Effect.gen(function*() {
          const decode = HttpApiBuilder.securityDecode(securityHeader).pipe(
            Effect.provideService(
              HttpServerRequest.HttpServerRequest,
              HttpServerRequest.fromWeb(
                new Request("http://localhost:3000/", {
                  headers: {
                    "x-api-key": "foo"
                  }
                })
              )
            ),
            Effect.provideService(HttpServerRequest.ParsedSearchParams, {})
          )
          const redacted = yield* decode
          assert.strictEqual(Redacted.value(redacted), "foo")
        }).pipe(Effect.provide(HttpLayer)))

      it.effect("apiKey query security", () =>
        Effect.gen(function*() {
          const redacted = yield* HttpApiBuilder.securityDecode(securityQuery).pipe(
            Effect.provideService(
              HttpServerRequest.HttpServerRequest,
              HttpServerRequest.fromWeb(new Request("http://localhost:3000/"))
            ),
            Effect.provideService(HttpServerRequest.ParsedSearchParams, {
              api_key: "foo"
            })
          )
          assert.strictEqual(Redacted.value(redacted), "foo")
        }).pipe(Effect.provide(HttpLayer)))
    })

    it.effect("client responseMode decoded-and-response", () =>
      Effect.gen(function*() {
        const client = yield* HttpApiClient.make(Api)
        const [users, response] = yield* client.users.list({
          headers: { page: 1 },
          query: {},
          responseMode: "decoded-and-response"
        })
        assert.strictEqual(users[0].name, "page 1")
        assert.strictEqual(response.status, 200)
      }).pipe(Effect.provide(HttpLayer)))

    it.effect("client responseMode response-only skips decoding", () => {
      const Api = HttpApi.make("api").add(
        HttpApiGroup.make("group").add(
          HttpApiEndpoint.get("bad", "/bad", {
            success: Schema.Struct({
              value: Schema.Finite
            })
          })
        )
      )

      const GroupLayer = HttpApiBuilder.group(
        Api,
        "group",
        (handlers) => handlers.handleRaw("bad", () => Effect.succeed(HttpServerResponse.text("not-json")))
      )

      const ApiLayer = HttpRouter.serve(
        HttpApiBuilder.layer(Api).pipe(Layer.provide(GroupLayer)),
        { disableListenLog: true, disableLogger: true }
      ).pipe(Layer.provideMerge(NodeHttpServer.layerTest))

      return Effect.gen(function*() {
        const client = yield* HttpApiClient.make(Api)

        yield* Effect.flip(client.group.bad())

        const response = yield* client.group.bad({
          responseMode: "response-only"
        })
        assert.strictEqual(response.status, 200)
        assert.strictEqual(yield* response.text, "not-json")
      }).pipe(Effect.provide(ApiLayer))
    })

    it.effect("multiple payload types", () =>
      Effect.gen(function*() {
        const client = yield* HttpApiClient.make(Api)
        let [group, response] = yield* client.groups.create({
          payload: { name: "Some group" },
          responseMode: "decoded-and-response"
        })
        assert.deepStrictEqual(group, new Group({ id: 1, name: "Some group" }))
        assert.strictEqual(response.status, 200)

        const data = new FormData()
        data.set("name", "Some group")
        ;[group, response] = yield* client.groups.create({
          payload: data,
          responseMode: "decoded-and-response"
        })
        assert.deepStrictEqual(group, new Group({ id: 1, name: "Some group" }))
        assert.strictEqual(response.status, 200)

        group = yield* client.groups.create({
          payload: { foo: "Some group" }
        })
        assert.deepStrictEqual(group, new Group({ id: 1, name: "Some group" }))
      }).pipe(Effect.provide(HttpLayer)))

    it.effect(".handle can return HttpServerResponse", () =>
      Effect.gen(function*() {
        const client = yield* HttpApiClient.make(Api)
        const response = yield* client.groups.handle({
          params: { id: 1 },
          payload: { name: "Some group" }
        })
        assert.deepStrictEqual(response, {
          id: 1,
          name: "Some group"
        })
      }).pipe(Effect.provide(HttpLayer)))

    it.effect(".handleRaw can manually process body", () =>
      Effect.gen(function*() {
        const client = yield* HttpApiClient.make(Api)
        const response = yield* client.groups.handleRaw({
          params: { id: 1 },
          payload: { name: "Some group" }
        })
        assert.deepStrictEqual(response, {
          id: 1,
          name: "Some group"
        })
      }).pipe(Effect.provide(HttpLayer)))

    describe("OpenAPI spec", () => {
      it("fixture", () => {
        const spec = OpenApi.fromApi(Api)
        expect(spec).toMatchSnapshot()
      })
    })

    it.effect("error from plain text", () => {
      class RateLimitError extends Schema.Error<RateLimitError>("RateLimitError")({
        _tag: Schema.tag("RateLimitError"),
        message: Schema.String
      }) {}

      const RateLimitErrorSchema = Schema.String.pipe(
        Schema.decodeTo(
          RateLimitError,
          SchemaTransformation.transform({
            encode: ({ message }) => message,
            decode: (message) => new RateLimitError({ message })
          })
        ),
        HttpApiSchema.status("TooManyRequests"),
        HttpApiSchema.asText()
      )

      const Api = HttpApi.make("api").add(
        HttpApiGroup.make("group").add(
          HttpApiEndpoint.get("error", "/error", {
            error: RateLimitErrorSchema
          })
        )
      )
      const ApiLayer = HttpApiBuilder.layer(Api).pipe(
        Layer.provide(
          HttpApiBuilder.group(
            Api,
            "group",
            (handlers) => handlers.handle("error", () => new RateLimitError({ message: "Rate limit exceeded" }))
          )
        ),
        HttpRouter.serve,
        Layer.provideMerge(NodeHttpServer.layerTest)
      )
      return Effect.gen(function*() {
        const client = yield* HttpApiClient.make(Api)
        const response = yield* client.group.error().pipe(Effect.flip)
        assert.deepStrictEqual(response, new RateLimitError({ message: "Rate limit exceeded" }))
      }).pipe(Effect.provide(ApiLayer))
    })
  })

  describe("HttpApiTest", () => {
    it.effect("works", () =>
      Effect.gen(function*() {
        const client = yield* HttpApiTest.groups(Api, ["groups"])
        const result = yield* client.groups.findById({ params: { id: 0 } })
        assert.deepStrictEqual(result, new Group({ id: 1, name: "foo" }))
      }).pipe(
        Effect.provide([
          NodeHttpServer.layerHttpServices,
          AuthorizationLayer,
          HttpApiBuilder.group(Api, "groups", (handlers) =>
            handlers
              .handle("findById", () => Effect.succeed(new Group({ id: 1, name: "foo" })))
              .handle(
                "handle",
                () => Effect.die("unimplemented")
              )
              .handle("create", () => Effect.die("unimplemented"))
              .handle("handleRaw", () => Effect.die("unimplemented")))
        ])
      ))
  })
})

const UpgradeApi = HttpApi.make("api").add(
  HttpApiGroup.make("containers").add(
    HttpApiEndpoint.post("start", "/start", {
      success: HttpApiSchema.Upgrade({
        protocol: "tcp",
        headers: { "content-type": Schema.Literal("application/raw") }
      })
    })
  )
)

// Answers upgrade requests with a 101 whose Content-Type does not match
// UpgradeApi, and completes `closed` once the client closes the connection.
const makeUpgradeServer = Effect.gen(function*() {
  const closed = yield* Deferred.make<void>()
  const sockets = new Set<Net.Socket>()
  const server = yield* Effect.acquireRelease(
    Effect.callback<Http.Server>((resume) => {
      const server = Http.createServer()
      server.on("upgrade", (_request: Http.IncomingMessage, socket: Net.Socket) => {
        sockets.add(socket)
        const done = () => Deferred.doneUnsafe(closed, Effect.void)
        socket.once("end", done)
        socket.once("close", done)
        socket.write(
          "HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: tcp\r\n" +
            "Content-Type: text/plain\r\n\r\n"
        )
        // the server side must read for the client's close to arrive
        socket.resume()
      })
      server.listen(0, "127.0.0.1", () => resume(Effect.succeed(server)))
    }),
    (server) =>
      Effect.callback<void>((resume) => {
        for (const socket of sockets) socket.destroy()
        server.close(() => resume(Effect.void))
      })
  )
  return { baseUrl: `http://127.0.0.1:${(server.address() as Net.AddressInfo).port}`, closed }
})

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

class UserError extends Schema.Error<UserError>("UserError")({
  _tag: Schema.tag("UserError")
}, {
  httpApiStatus: 400
}) {}
class GroupError extends Schema.Error<GroupError>("GroupError")({
  _tag: Schema.tag("GroupError")
}, {
  httpApiStatus: 418
}) {}
class NoStatusError extends Schema.Error<NoStatusError>("NoStatusError")({
  _tag: Schema.tag("NoStatusError")
}) {}

class User extends Schema.Class<User>("User")({
  id: Schema.Int,
  uuid: Schema.optional(Schema.String),
  name: Schema.String,
  createdAt: Schema.DateTimeUtcFromString
}, {
  description: "Some description for User"
}) {}

class Group extends Schema.Class<Group>("Group")({
  id: Schema.Int,
  name: Schema.String
}) {}

const securityHeader = HttpApiSecurity.apiKey({
  in: "header",
  key: "x-api-key"
})

const securityQuery = HttpApiSecurity.apiKey({
  in: "query",
  key: "api_key"
})

class CurrentUser extends Context.Service<CurrentUser, User>()("CurrentUser") {}

class Authorization extends HttpApiMiddleware.Service<Authorization, {
  provides: CurrentUser
}>()("Authorization", {
  security: {
    cookie: HttpApiSecurity.apiKey({
      in: "cookie",
      key: "token"
    })
  }
}) {}

class GroupsApi extends HttpApiGroup.make("groups").add(
  HttpApiEndpoint.get("findById", "/:id", {
    params: {
      id: Schema.FiniteFromString
    },
    success: Group,
    error: GroupError.pipe(HttpApiSchema.asNoContent({
      decode: () => new GroupError({})
    }))
  }),
  HttpApiEndpoint.post("create", "/", {
    payload: [
      Schema.Struct(Struct.pick(Group.fields, ["name"])),
      Schema.Struct({ foo: Schema.String }).pipe(
        HttpApiSchema.asFormUrlEncoded()
      ),
      Schema.Struct(Struct.pick(Group.fields, ["name"])).pipe(
        HttpApiSchema.asMultipart()
      )
    ],
    success: Group
  }),
  HttpApiEndpoint.post("handle", "/handle/:id", {
    params: {
      id: Schema.FiniteFromString
    },
    payload: Schema.Struct({
      name: Schema.String
    }),
    success: Schema.Struct({
      id: Schema.Finite,
      name: Schema.String
    })
  }),
  HttpApiEndpoint.post("handleRaw", "/handleraw/:id", {
    params: {
      id: Schema.FiniteFromString
    },
    payload: Schema.Struct({
      name: Schema.String
    }),
    success: Schema.Struct({
      id: Schema.Finite,
      name: Schema.String
    })
  })
).prefix("/groups") {}

class UsersApi extends HttpApiGroup.make("users")
  .add(
    HttpApiEndpoint.get("findById", "/:id", {
      params: {
        id: Schema.Finite
      },
      success: User,
      error: UserError
    }),
    HttpApiEndpoint.post("create", "/", {
      payload: Schema.Struct(Struct.omit(User.fields, ["id", "createdAt"])),
      query: {
        id: Schema.Finite
      },
      success: User,
      error: [UserError, UserError]
    }),
    HttpApiEndpoint.get("list", "/", {
      headers: {
        page: Schema.Finite.pipe(
          Schema.optionalKey,
          Schema.decode({
            decode: SchemaGetter.withDefault(Effect.succeed(1)),
            encode: SchemaGetter.passthrough()
          })
        )
      },
      query: {
        query: Schema.optional(Schema.String).annotate({ description: "search query" })
      },
      success: Schema.Array(User),
      error: NoStatusError
    })
      .annotate(OpenApi.Deprecated, true)
      .annotate(OpenApi.Summary, "test summary")
      .annotateMerge(OpenApi.annotations({ identifier: "listUsers" })),
    HttpApiEndpoint.post("upload", "/upload/:0?", {
      params: {
        0: Schema.optional(Schema.String)
      },
      payload: Schema.Struct({
        file: Multipart.SingleFileSchema
      }).pipe(HttpApiSchema.asMultipart()),
      success: Schema.Struct({
        contentType: Schema.String,
        length: Schema.Int
      })
    }),
    HttpApiEndpoint.post("uploadStream", `/uploadstream`, {
      payload: Schema.Struct({
        file: Multipart.SingleFileSchema
      }).pipe(HttpApiSchema.asMultipartStream()),
      success: Schema.Struct({
        contentType: Schema.String,
        length: Schema.Int
      })
    })
  )
  .middleware(Authorization)
  .annotateMerge(OpenApi.annotations({ title: "Users API" }))
{}

class TopLevelApi extends HttpApiGroup.make("root", { topLevel: true })
  .add(
    HttpApiEndpoint.get("healthz", `/healthz`, {
      success: HttpApiSchema.NoContent.annotate({ description: "Empty" })
    })
  )
{}

class AnotherApi extends HttpApi.make("another").add(GroupsApi) {}

class Api extends HttpApi.make("api")
  .addHttpApi(AnotherApi)
  .add(UsersApi.prefix("/users"))
  .add(TopLevelApi)
  .annotateMerge(OpenApi.annotations({
    title: "API",
    summary: "test api summary",
    transform: (openApiSpec) => ({
      ...openApiSpec,
      tags: [...openApiSpec.tags ?? [], {
        name: "Tag from OpenApi.Transform annotation"
      }]
    })
  }))
  .annotate(
    HttpApi.AdditionalSchemas,
    [
      Schema.Struct({
        contentType: Schema.String,
        length: Schema.Int
      }).annotate({
        identifier: "ComponentsSchema"
      })
    ]
  )
{}

// impl

class UserRepo extends Context.Service<UserRepo, {
  readonly findById: (id: number) => Effect.Effect<User>
}>()("UserRepo") {
  static layer = Layer.succeed(this)({
    findById: (id) => Effect.map(DateTime.now, (now) => ({ id, name: "foo", createdAt: now }))
  })
}

const AuthorizationLayer = Layer.succeed(
  Authorization
)({
  cookie: (effect, opts) =>
    Effect.provideService(
      effect,
      CurrentUser,
      new User({
        id: 1,
        name: Redacted.value(opts.credential),
        createdAt: DateTime.nowUnsafe()
      })
    )
})

const HttpUsersLayer = HttpApiBuilder.group(
  Api,
  "users",
  Effect.fnUntraced(function*(handlers) {
    const fs = yield* FileSystem.FileSystem
    const repo = yield* UserRepo
    return handlers
      .handle("findById", (_) => _.params.id === -1 ? CurrentUser : repo.findById(_.params.id))
      .handle("create", (_) =>
        _.payload.name === "boom"
          ? Effect.fail(new UserError({}))
          : Effect.map(DateTime.now, (now) =>
            new User({
              id: _.query.id,
              name: _.payload.name,
              createdAt: now
            })))
      .handle("list", (_) =>
        _.headers.page === 0
          ? Effect.fail(new NoStatusError({}))
          // test handler level context
          : Effect.map(DateTime.nowInCurrentZone, (now) => [
            new User({
              id: 1,
              name: `page ${_.headers.page}`,
              createdAt: DateTime.toUtc(now)
            })
          ]))
      .handle("upload", (_) =>
        Effect.gen(function*() {
          const stat = yield* fs.stat(_.payload.file.path).pipe(Effect.orDie)
          return {
            contentType: _.payload.file.contentType,
            length: Option.getOrThrow(ByteSize.toNumber(stat.size))
          }
        }))
      .handle("uploadStream", (_) =>
        Effect.gen(function*() {
          const { content, file } = yield* _.payload.pipe(
            Stream.filter(Multipart.isFile),
            Stream.mapEffect((file) =>
              file.contentEffect.pipe(
                Effect.map((content) => ({ file, content }))
              )
            ),
            Stream.runCollect,
            Effect.flatMap((_) => Effect.fromOption(Array.head(_))),
            Effect.orDie
          )
          return {
            contentType: file.contentType,
            length: content.length
          }
        }))
  })
).pipe(
  Layer.provide([
    UserRepo.layer,
    AuthorizationLayer
  ])
)

const HttpGroupsLayer = HttpApiBuilder.group(
  Api,
  "groups",
  (handlers) =>
    handlers
      .handle("findById", ({ params }) =>
        params.id === 0
          ? Effect.fail(new GroupError({}))
          : Effect.succeed(new Group({ id: 1, name: "foo" })))
      .handle("create", ({ payload }) =>
        Effect.succeed(
          new Group({
            id: 1,
            name: "foo" in payload ? payload.foo : payload.name
          })
        ))
      .handle(
        "handle",
        Effect.fnUntraced(function*({ params, payload }) {
          return HttpServerResponse.jsonUnsafe({
            id: params.id,
            name: payload.name
          })
        })
      )
      .handleRaw(
        "handleRaw",
        Effect.fnUntraced(function*({ params, request }) {
          const body = (yield* Effect.orDie(request.json)) as { name: string }
          return HttpServerResponse.jsonUnsafe({
            id: params.id,
            name: body.name
          })
        })
      )
)

const TopLevelLayer = HttpApiBuilder.group(
  Api,
  "root",
  (handlers) => handlers.handle("healthz", (_) => Effect.void)
)

const HttpApiLayer = Layer.provide(HttpApiBuilder.layer(Api), [
  HttpGroupsLayer,
  HttpUsersLayer,
  TopLevelLayer
])

const HttpLayer = HttpRouter.serve(HttpApiLayer, {
  disableListenLog: true,
  disableLogger: true
}).pipe(
  Layer.provideMerge(NodeHttpServer.layerTest),
  Layer.provide(DateTime.layerCurrentZoneOffset(0))
)
