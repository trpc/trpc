import { assert, describe, it, vi } from "@effect/vitest"
import { Effect, FileSystem, Layer, Path } from "effect"
import { Etag, HttpPlatform, HttpRouter, HttpServerResponse } from "effect/http"
import { HttpApi, HttpApiBuilder, HttpApiScalar, HttpApiSwagger, OpenApi } from "effect/http-api"

const TestServices = Layer.mergeAll(
  Path.layer,
  Etag.layerWeak,
  HttpPlatform.layer
).pipe(Layer.provideMerge(FileSystem.layerNoop({})))

// Response spies are shared across suites.
describe("HttpApiBuilder", { concurrent: false }, () => {
  it.effect("defers and memoizes successful openapiPath responses", () =>
    Effect.gen(function*() {
      let transforms = 0
      const Api = HttpApi.make("OpenApiPath").annotate(
        OpenApi.Transform,
        (spec) => {
          transforms++
          return spec
        }
      )
      const Health = HttpRouter.use((router) => router.add("GET", "/health", HttpServerResponse.text("OK")))

      yield* Effect.acquireUseRelease(
        Effect.sync(() => vi.spyOn(HttpServerResponse, "jsonUnsafe")),
        (jsonUnsafe) =>
          withHandler(
            Layer.merge(HttpApiBuilder.layer(Api, { openapiPath: "/openapi.json" }), Health).pipe(
              Layer.provide(TestServices)
            ),
            (handler) =>
              Effect.gen(function*() {
                const health = yield* Effect.promise(() => handler(new Request("http://test/health")))
                assert.strictEqual(health.status, 200)
                assert.strictEqual(transforms, 0)
                assert.strictEqual(jsonUnsafe.mock.calls.length, 0)

                const firstRequests = yield* Effect.promise(() =>
                  Promise.all(
                    Array.from({ length: 20 }, () => handler(new Request("http://test/openapi.json")))
                  )
                )
                assert.ok(firstRequests.every((response) => response.status === 200))
                assert.strictEqual(transforms, 1)
                assert.strictEqual(jsonUnsafe.mock.calls.length, 1)

                const cached = yield* Effect.promise(() => handler(new Request("http://test/openapi.json")))
                assert.strictEqual(cached.status, 200)
                assert.strictEqual(transforms, 1)
                assert.strictEqual(jsonUnsafe.mock.calls.length, 1)
              })
          ),
        (jsonUnsafe) => Effect.sync(() => jsonUnsafe.mockRestore())
      )
    }))

  it.effect("retries openapiPath generation after a defect", () =>
    Effect.gen(function*() {
      let transforms = 0
      const Api = HttpApi.make("OpenApiPathRecovery").annotate(
        OpenApi.Transform,
        (spec) => {
          transforms++
          if (transforms === 1) throw new Error("OpenAPI generation defect")
          return spec
        }
      )

      yield* withHandler(
        HttpApiBuilder.layer(Api, { openapiPath: "/openapi.json" }).pipe(Layer.provide(TestServices)),
        (handler) =>
          Effect.gen(function*() {
            const first = yield* Effect.promise(() => handler(new Request("http://test/openapi.json")))
            assert.strictEqual(first.status, 500)
            assert.strictEqual(transforms, 1)

            const second = yield* Effect.promise(() => handler(new Request("http://test/openapi.json")))
            assert.strictEqual(second.status, 200)
            assert.strictEqual(transforms, 2)

            const cached = yield* Effect.promise(() => handler(new Request("http://test/openapi.json")))
            assert.strictEqual(cached.status, 200)
            assert.strictEqual(transforms, 2)
          })
      )
    }))
})

describe("HttpApiScalar", { concurrent: false }, () => {
  it.effect("defers and memoizes successful OpenAPI responses", () =>
    Effect.gen(function*() {
      let transforms = 0
      const Api = HttpApi.make("Docs").annotate(
        OpenApi.Transform,
        (spec) => {
          transforms++
          return spec
        }
      )
      const Health = HttpRouter.use((router) => router.add("GET", "/health", HttpServerResponse.text("OK")))

      yield* Effect.acquireUseRelease(
        Effect.sync(() => vi.spyOn(HttpServerResponse, "html")),
        (html) =>
          withHandler(Layer.merge(HttpApiScalar.layerCdn(Api), Health), (handler) =>
            Effect.gen(function*() {
              const health = yield* Effect.promise(() => handler(new Request("http://test/health")))
              assert.strictEqual(health.status, 200)
              assert.strictEqual(transforms, 0)
              assert.strictEqual(html.mock.calls.length, 0)

              const firstRequests = yield* Effect.promise(() =>
                Promise.all(
                  Array.from({ length: 20 }, () => handler(new Request("http://test/docs")))
                )
              )
              assert.ok(firstRequests.every((response) => response.status === 200))
              assert.strictEqual(transforms, 1)
              assert.strictEqual(html.mock.calls.length, 1)

              const cached = yield* Effect.promise(() => handler(new Request("http://test/docs")))
              assert.strictEqual(cached.status, 200)
              assert.strictEqual(transforms, 1)
              assert.strictEqual(html.mock.calls.length, 1)
            })),
        (html) => Effect.sync(() => html.mockRestore())
      )
    }))

  it.effect("retries OpenAPI generation after a defect", () =>
    Effect.gen(function*() {
      let transforms = 0
      const Api = HttpApi.make("ScalarRecovery").annotate(
        OpenApi.Transform,
        (spec) => {
          transforms++
          if (transforms === 1) throw new Error("OpenAPI generation defect")
          return spec
        }
      )

      yield* withHandler(HttpApiScalar.layerCdn(Api), (handler) =>
        Effect.gen(function*() {
          const first = yield* Effect.promise(() => handler(new Request("http://test/docs")))
          assert.strictEqual(first.status, 500)
          assert.strictEqual(transforms, 1)

          const second = yield* Effect.promise(() => handler(new Request("http://test/docs")))
          assert.strictEqual(second.status, 200)
          assert.strictEqual(transforms, 2)

          const cached = yield* Effect.promise(() => handler(new Request("http://test/docs")))
          assert.strictEqual(cached.status, 200)
          assert.strictEqual(transforms, 2)
        }))
    }))

  it.effect("defers inline Scalar generation until the route is requested", () =>
    Effect.gen(function*() {
      let transforms = 0
      const Api = HttpApi.make("ScalarInline").annotate(
        OpenApi.Transform,
        (spec) => {
          transforms++
          return spec
        }
      )
      const Health = HttpRouter.use((router) => router.add("GET", "/health", HttpServerResponse.text("OK")))

      yield* withHandler(Layer.merge(HttpApiScalar.layer(Api), Health), (handler) =>
        Effect.gen(function*() {
          const health = yield* Effect.promise(() => handler(new Request("http://test/health")))
          assert.strictEqual(health.status, 200)
          assert.strictEqual(transforms, 0)

          const docs = yield* Effect.promise(() => handler(new Request("http://test/docs")))
          assert.strictEqual(docs.status, 200)
          assert.strictEqual(transforms, 1)
        }))
    }))

  it.effect("escapes OpenAPI metadata in its HTML contexts", () =>
    Effect.gen(function*() {
      const title = `Docs "title" </title><script>`
      const injectedTag = `<script id="script-data-injected">`
      const description = `"quoted" 'single' </script >${injectedTag}`
      const Api = HttpApi.make("Docs")
        .annotate(OpenApi.Title, title)
        .annotate(OpenApi.Description, description)

      const html = yield* render(HttpApiScalar.layerCdn(Api))

      assert.ok(html.includes(`<title>Docs "title" &lt;/title&gt;&lt;script&gt;</title>`))
      const escapedDescription =
        `&quot;quoted&quot; &#39;single&#39; &lt;/script &gt;&lt;script id=&quot;script-data-injected&quot;&gt;`
      assert.ok(html.includes(`<meta name="description" content="${escapedDescription}"/>`))
      assert.ok(html.includes(`<meta name="og:description" content="${escapedDescription}"/>`))
      assert.ok(!html.includes(`</script >`))
      assert.deepStrictEqual(extractSpec(html), OpenApi.fromApi(Api))
    }))

  it.effect("encodes CDN versions before interpolating the script source", () =>
    Effect.gen(function*() {
      const version = `1.2.3"></script><script id="injected">`
      const html = yield* render(HttpApiScalar.layerCdn(HttpApi.make("Docs"), { version }))

      assert.ok(html.includes(
        `src="https://cdn.jsdelivr.net/npm/@scalar/api-reference@${
          encodeURIComponent(version)
        }/dist/browser/standalone.min.js"`
      ))
      assert.strictEqual(html.match(/<script\b/g)?.length, 2)
      assert.ok(!html.includes(`id="injected"`))
    }))
})

describe("HttpApiSwagger", { concurrent: false }, () => {
  it.effect("defers and memoizes successful OpenAPI responses", () =>
    Effect.gen(function*() {
      let transforms = 0
      const Api = HttpApi.make("Docs").annotate(
        OpenApi.Transform,
        (spec) => {
          transforms++
          return spec
        }
      )
      const Health = HttpRouter.use((router) => router.add("GET", "/health", HttpServerResponse.text("OK")))

      yield* Effect.acquireUseRelease(
        Effect.sync(() => vi.spyOn(HttpServerResponse, "html")),
        (html) =>
          withHandler(Layer.merge(HttpApiSwagger.layer(Api), Health), (handler) =>
            Effect.gen(function*() {
              const health = yield* Effect.promise(() => handler(new Request("http://test/health")))
              assert.strictEqual(health.status, 200)
              assert.strictEqual(transforms, 0)
              assert.strictEqual(html.mock.calls.length, 0)

              const firstRequests = yield* Effect.promise(() =>
                Promise.all(
                  Array.from({ length: 20 }, () => handler(new Request("http://test/docs")))
                )
              )
              assert.ok(firstRequests.every((response) => response.status === 200))
              assert.strictEqual(transforms, 1)
              assert.strictEqual(html.mock.calls.length, 1)

              const cached = yield* Effect.promise(() => handler(new Request("http://test/docs")))
              assert.strictEqual(cached.status, 200)
              assert.strictEqual(transforms, 1)
              assert.strictEqual(html.mock.calls.length, 1)
            })),
        (html) => Effect.sync(() => html.mockRestore())
      )
    }))

  it.effect("retries OpenAPI generation after a defect", () =>
    Effect.gen(function*() {
      let transforms = 0
      const Api = HttpApi.make("SwaggerRecovery").annotate(
        OpenApi.Transform,
        (spec) => {
          transforms++
          if (transforms === 1) throw new Error("OpenAPI generation defect")
          return spec
        }
      )

      yield* withHandler(HttpApiSwagger.layer(Api), (handler) =>
        Effect.gen(function*() {
          const first = yield* Effect.promise(() => handler(new Request("http://test/docs")))
          assert.strictEqual(first.status, 500)
          assert.strictEqual(transforms, 1)

          const second = yield* Effect.promise(() => handler(new Request("http://test/docs")))
          assert.strictEqual(second.status, 200)
          assert.strictEqual(transforms, 2)

          const cached = yield* Effect.promise(() => handler(new Request("http://test/docs")))
          assert.strictEqual(cached.status, 200)
          assert.strictEqual(transforms, 2)
        }))
    }))

  it.effect("escapes script end-tag variants in OpenAPI data", () =>
    Effect.gen(function*() {
      const injectedTag = `<script id="script-data-injected">`
      const Api = HttpApi.make("Docs")
        .annotate(OpenApi.Description, `</script/>${injectedTag}`)

      const html = yield* render(HttpApiSwagger.layer(Api))

      assert.ok(!html.includes(`</script/>`))
      assert.deepStrictEqual(extractSwaggerSpec(html), OpenApi.fromApi(Api))
    }))
})

const withHandler = <A, E, R>(
  layer: Layer.Layer<never, never, HttpRouter.HttpRouter>,
  use: (handler: (request: Request) => Promise<Response>) => Effect.Effect<A, E, R>
) =>
  Effect.acquireUseRelease(
    Effect.sync(() => HttpRouter.toWebHandler(layer, { disableLogger: true })),
    ({ handler }) => use(handler),
    ({ dispose }) => Effect.promise(dispose)
  )

const render = (layer: Layer.Layer<never, never, HttpRouter.HttpRouter>) =>
  withHandler(layer, (handler) =>
    Effect.flatMap(
      Effect.promise(() => handler(new Request("http://test/docs"))),
      (response) => Effect.promise(() => response.text())
    ))

function extractSpec(html: string): unknown {
  const marker = "        content: "
  const start = html.indexOf(marker)
  assert.notStrictEqual(start, -1)
  const end = html.indexOf("\n      })", start)
  assert.notStrictEqual(end, -1)
  return JSON.parse(html.slice(start + marker.length, end))
}

function extractSwaggerSpec(html: string): unknown {
  const marker = `  <script id="swagger-spec" type="application/json">\n    `
  const start = html.indexOf(marker)
  assert.notStrictEqual(start, -1)
  const end = html.indexOf("\n  </script>", start)
  assert.notStrictEqual(end, -1)
  return JSON.parse(html.slice(start + marker.length, end))
}
