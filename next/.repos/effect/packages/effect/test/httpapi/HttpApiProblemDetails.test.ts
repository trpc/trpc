import { assert, describe, it } from "@effect/vitest"
import { Cause, Effect, ErrorReporter, Exit, FileSystem, Layer, Path, Schema } from "effect"
import { Etag, HttpPlatform, HttpRouter } from "effect/http"
import {
  HttpApi,
  HttpApiBuilder,
  HttpApiEndpoint,
  HttpApiError,
  HttpApiGroup,
  HttpApiMiddleware,
  HttpApiSchema,
  HttpApiTest,
  OpenApi
} from "effect/http-api"

const TestServices = Layer.mergeAll(
  Path.layer,
  Etag.layerWeak,
  HttpPlatform.layer
).pipe(Layer.provideMerge(FileSystem.layerNoop({})))

const fetchWith = async (
  app: Layer.Layer<
    never,
    never,
    | HttpRouter.HttpRouter
    | Etag.Generator
    | FileSystem.FileSystem
    | HttpPlatform.HttpPlatform
    | Path.Path
  >,
  path: string,
  reporter: Layer.Layer<never> = Layer.empty
): Promise<Response> => {
  const { dispose, handler } = HttpRouter.toWebHandler(app.pipe(Layer.provide(TestServices), Layer.provide(reporter)), {
    disableLogger: true
  })
  try {
    return await handler(new Request(`http://localhost${path}`))
  } finally {
    await dispose()
  }
}

class OutOfCredit extends HttpApiError.Problem<OutOfCredit>()(
  "OutOfCredit",
  { type: "https://example.com/probs/out-of-credit", status: 403, title: "You do not have enough credit." },
  { balance: Schema.Number }
) {}

const PurchaseApi = HttpApi.make("Api").add(
  HttpApiGroup.make("test").add(
    HttpApiEndpoint.get("purchase", "/purchase", { success: Schema.String, error: OutOfCredit })
  )
)
const PurchaseGroup = HttpApiBuilder.group(
  PurchaseApi,
  "test",
  (handlers) => handlers.handle("purchase", () => Effect.fail(new OutOfCredit({ balance: 30 })))
)

describe("HttpApiError.Problem", () => {
  it("responds with the declared status and a problem+json body", async () => {
    const response = await fetchWith(HttpApiBuilder.layer(PurchaseApi).pipe(Layer.provide(PurchaseGroup)), "/purchase")
    assert.strictEqual(response.status, 403)
    assert.strictEqual(response.headers.get("content-type"), "application/problem+json")
    assert.deepStrictEqual(await response.json(), {
      type: "https://example.com/probs/out-of-credit",
      status: 403,
      title: "You do not have enough credit.",
      balance: 30
    })
  })

  it.layer(TestServices)("client", (it) => {
    it.effect("decodes the response into the class instance", () =>
      Effect.gen(function*() {
        const client = yield* HttpApiTest.groups(PurchaseApi, ["test"]).pipe(Effect.provide(PurchaseGroup))
        const error = yield* Effect.flip(client.test.purchase())
        assert.instanceOf(error, OutOfCredit)
        assert.strictEqual(error._tag, "OutOfCredit")
        assert.strictEqual(error.balance, 30)
      }))
  })

  it("lists application/problem+json under the status in the OpenAPI spec", () => {
    const content = OpenApi.fromApi(PurchaseApi).paths["/purchase"]?.get?.responses[403]?.content
    assert.isDefined(content?.["application/problem+json"])
  })

  it("discriminates decoding by type and keeps the declared status", () => {
    class Banned extends HttpApiError.Problem<Banned>()(
      "Banned",
      { type: "https://example.com/probs/banned", status: 403, title: "You are banned." },
      { balance: Schema.Number }
    ) {}
    const body = { type: "https://example.com/probs/banned", status: 999, title: "wire", balance: 1 }
    assert.isTrue(Exit.isFailure(Schema.decodeUnknownExit(OutOfCredit)(body)))
    const decoded = Schema.decodeUnknownSync(Schema.Union([OutOfCredit, Banned]))(body)
    assert.instanceOf(decoded, Banned)
    assert.strictEqual(decoded.status, 403)
  })
})

describe("HttpApiMiddleware.ProblemDetails", () => {
  const Group = HttpApiGroup.make("test").add(
    HttpApiEndpoint.get("list", "/list", { query: { page: Schema.String }, success: Schema.String })
  )
  const PlainApi = HttpApi.make("Api").add(Group)
  const ProblemApi = HttpApi.make("Api").add(Group).middleware(HttpApiMiddleware.ProblemDetails)
  const PlainGroup = HttpApiBuilder.group(
    PlainApi,
    "test",
    (handlers) => handlers.handle("list", () => Effect.succeed("ok"))
  )
  const ProblemGroup = HttpApiBuilder.group(
    ProblemApi,
    "test",
    (handlers) => handlers.handle("list", () => Effect.succeed("ok"))
  )

  it("keeps the empty 400 without the middleware", async () => {
    const response = await fetchWith(HttpApiBuilder.layer(PlainApi).pipe(Layer.provide(PlainGroup)), "/list")
    assert.strictEqual(response.status, 400)
    assert.strictEqual(await response.text(), "")
  })

  it("renders a generic problem+json 400 without details", async () => {
    const response = await fetchWith(
      HttpApiBuilder.layer(ProblemApi).pipe(
        Layer.provide(ProblemGroup),
        Layer.provide(HttpApiMiddleware.layerProblemDetails())
      ),
      "/list"
    )
    assert.strictEqual(response.status, 400)
    assert.strictEqual(response.headers.get("content-type"), "application/problem+json")
    assert.deepStrictEqual(await response.json(), {
      type: "about:blank",
      title: "Bad Request",
      status: 400,
      detail: "Request validation failed"
    })
  })

  it("adds errors prefixed with the slot name when includeDetails is enabled", async () => {
    const response = await fetchWith(
      HttpApiBuilder.layer(ProblemApi).pipe(
        Layer.provide(ProblemGroup),
        Layer.provide(HttpApiMiddleware.layerProblemDetails({ includeDetails: true }))
      ),
      "/list"
    )
    assert.strictEqual(response.status, 400)
    const body = Schema.decodeUnknownSync(HttpApiError.BadRequestProblem)(await response.json())
    assert.isArray(body.errors)
    assert.strictEqual(body.errors?.[0]?.path[0], "query")
    assert.isString(body.errors?.[0]?.message)
  })

  it("adds a problem+json 400 to the OpenAPI spec", () => {
    assert.isUndefined(OpenApi.fromApi(PlainApi).paths["/list"]?.get?.responses[400])
    const content = OpenApi.fromApi(ProblemApi).paths["/list"]?.get?.responses[400]?.content
    assert.isDefined(content?.["application/problem+json"])
  })

  describe("response encoding failure", () => {
    const EncodeApi = HttpApi.make("Api").add(
      HttpApiGroup.make("test").add(HttpApiEndpoint.get("count", "/count", { success: Schema.Number }))
    ).middleware(HttpApiMiddleware.ProblemDetails)
    const EncodeGroup = HttpApiBuilder.group(
      EncodeApi,
      "test",
      (handlers) => handlers.handle("count", () => Effect.succeed("not a number" as unknown as number))
    )

    it("renders a generic problem+json 500 and reports the schema error once", async () => {
      const reports: Array<Cause.Cause<unknown>> = []
      const reporter = ErrorReporter.make(({ cause }) => reports.push(cause))
      const response = await fetchWith(
        HttpApiBuilder.layer(EncodeApi).pipe(
          Layer.provide(EncodeGroup),
          Layer.provide(HttpApiMiddleware.layerProblemDetails({ includeDetails: true }))
        ),
        "/count",
        ErrorReporter.layer([reporter])
      )
      assert.strictEqual(response.status, 500)
      assert.strictEqual(response.headers.get("content-type"), "application/problem+json")
      assert.deepStrictEqual(await response.json(), {
        type: "about:blank",
        title: "Internal Server Error",
        status: 500
      })
      assert.strictEqual(reports.length, 1)
      const reported = Cause.squash(reports[0])
      assert.isTrue(HttpApiError.HttpApiSchemaError.is(reported))
      assert.strictEqual((reported as HttpApiError.HttpApiSchemaError).kind, "Body")
    })

    it.layer(TestServices)("client", (it) => {
      it.effect("decodes the 500 into InternalServerErrorProblem", () =>
        Effect.gen(function*() {
          const client = yield* HttpApiTest.groups(EncodeApi, ["test"]).pipe(
            Effect.provide(EncodeGroup.pipe(Layer.provideMerge(HttpApiMiddleware.layerProblemDetails())))
          )
          const error = yield* Effect.flip(client.test.count())
          assert.instanceOf(error, HttpApiError.InternalServerErrorProblem)
        }))
    })

    it("adds a problem+json 500 to the OpenAPI spec", () => {
      const content = OpenApi.fromApi(EncodeApi).paths["/count"]?.get?.responses[500]?.content
      assert.isDefined(content?.["application/problem+json"])
    })
  })
})

describe("HttpApiSchema.asProblem", () => {
  it("encodes a built-in error as a problem", async () => {
    const Api = HttpApi.make("Api").add(
      HttpApiGroup.make("test").add(
        HttpApiEndpoint.get("user", "/user", {
          success: Schema.String,
          error: HttpApiError.NotFound.pipe(HttpApiSchema.asProblem({ title: "Not Found" }))
        })
      )
    )
    const Group = HttpApiBuilder.group(
      Api,
      "test",
      (handlers) => handlers.handle("user", () => Effect.fail(new HttpApiError.NotFound()))
    )
    const response = await fetchWith(HttpApiBuilder.layer(Api).pipe(Layer.provide(Group)), "/user")
    assert.strictEqual(response.status, 404)
    assert.strictEqual(response.headers.get("content-type"), "application/problem+json")
    assert.deepStrictEqual(await response.json(), { type: "about:blank", title: "Not Found", status: 404 })
  })

  it("rejects a body with a different type", () => {
    const exit = Schema.decodeUnknownExit(HttpApiError.NotFound.pipe(HttpApiSchema.asProblem({ title: "Not Found" })))({
      type: "https://example.com/probs/other",
      title: "Not Found",
      status: 404
    })
    assert.isTrue(Exit.isFailure(exit))
  })
})
