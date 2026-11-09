import * as Resource from "@effect/opentelemetry/Resource"
import { assert, describe, it } from "@effect/vitest"
import * as ConfigProvider from "effect/ConfigProvider"
import * as Effect from "effect/Effect"

describe("Resource", () => {
  it("lets custom attributes override SDK defaults but not the service options", () => {
    const attributes = Resource.configToAttributes({
      serviceName: "test",
      serviceVersion: "service-version",
      attributes: {
        "service.name": "attribute-service",
        "telemetry.sdk.name": "custom",
        "telemetry.sdk.language": "webjs",
        "telemetry.sdk.version": "custom-version"
      }
    })
    assert.deepStrictEqual(attributes, {
      "service.name": "test",
      "service.version": "service-version",
      "telemetry.sdk.name": "custom",
      "telemetry.sdk.language": "webjs",
      "telemetry.sdk.version": "custom-version"
    })
  })

  it.effect("preserves embedded equals signs and ignores empty attribute keys", () =>
    Effect.gen(function*() {
      const resource = yield* Resource.Resource
      assert.strictEqual(resource.attributes["key"], "value")
      assert.strictEqual(resource.attributes["encoded"], "abc=def==")
      assert.strictEqual(resource.attributes[""], undefined)
    }).pipe(
      Effect.provide(Resource.layerFromEnv()),
      Effect.provideService(
        ConfigProvider.ConfigProvider,
        ConfigProvider.fromEnv({
          env: {
            OTEL_RESOURCE_ATTRIBUTES: "key=value,encoded=abc=def==, =ignored"
          }
        })
      )
    ))

  it.effect("percent-decodes attribute keys and values once", () =>
    Effect.gen(function*() {
      const resource = yield* Resource.Resource
      assert.strictEqual(resource.attributes["message"], "hello world")
      assert.strictEqual(resource.attributes["list"], "one,two=three")
      assert.strictEqual(resource.attributes["地域"], "東京")
      assert.strictEqual(resource.attributes["percent"], "%20")
    }).pipe(
      Effect.provide(Resource.layerFromEnv()),
      Effect.provideService(
        ConfigProvider.ConfigProvider,
        ConfigProvider.fromEnv({
          env: {
            OTEL_RESOURCE_ATTRIBUTES:
              "message = hello%20world ,list=one%2Ctwo%3Dthree,%E5%9C%B0%E5%9F%9F=%E6%9D%B1%E4%BA%AC,percent=%2520"
          }
        })
      )
    ))

  it.effect("keeps empty attribute values and skips entries without a separator", () =>
    Effect.gen(function*() {
      const resource = yield* Resource.Resource
      assert.strictEqual(resource.attributes["empty"], "")
      assert.strictEqual(resource.attributes["a"], "1")
      assert.isFalse("novalue" in resource.attributes)
    }).pipe(
      Effect.provide(Resource.layerFromEnv()),
      Effect.provideService(
        ConfigProvider.ConfigProvider,
        ConfigProvider.fromEnv({ env: { OTEL_RESOURCE_ATTRIBUTES: "empty=,novalue,a=1" } })
      )
    ))

  it.effect("accepts structured OTEL_RESOURCE_ATTRIBUTES", () =>
    Effect.gen(function*() {
      const resource = yield* Resource.Resource
      assert.strictEqual(resource.attributes["team"], "platform")
      assert.strictEqual(resource.attributes["service.version"], "1.0.0")
    }).pipe(
      Effect.provide(Resource.layerFromEnv()),
      Effect.provideService(
        ConfigProvider.ConfigProvider,
        ConfigProvider.fromUnknown({ OTEL_RESOURCE_ATTRIBUTES: { team: "platform", "service.version": "1.0.0" } })
      )
    ))

  it.effect("discards OTEL_RESOURCE_ATTRIBUTES with malformed percent-encoding", () =>
    Effect.gen(function*() {
      const resource = yield* Resource.Resource
      assert.strictEqual(resource.attributes["valid"], undefined)
      assert.strictEqual(resource.attributes["cpu"], undefined)
      assert.strictEqual(resource.attributes["service.name"], "env-service")
      assert.strictEqual(resource.attributes["team"], "explicit")
    }).pipe(
      Effect.provide(Resource.layerFromEnv({ team: "explicit" })),
      Effect.provideService(
        ConfigProvider.ConfigProvider,
        ConfigProvider.fromEnv({
          env: {
            OTEL_SERVICE_NAME: "env-service",
            OTEL_RESOURCE_ATTRIBUTES: "valid=yes,cpu=50%"
          }
        })
      )
    ))
})
