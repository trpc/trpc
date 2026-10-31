import { assert, describe, it } from "@effect/vitest"
import { Cause, ConfigProvider, Effect, Exit } from "effect"
import { OtlpResource } from "effect/observability"
import * as Version from "effect/Version"

const attributesRecord = (resource: OtlpResource.Resource): Record<string, string | null | undefined> =>
  Object.fromEntries(resource.attributes.map((attribute) => [attribute.key, attribute.value.stringValue]))

const sdk = {
  "telemetry.sdk.name": "effect",
  "telemetry.sdk.language": "nodejs",
  "telemetry.sdk.version": Version.getCurrentVersion()
}

describe("OtlpResource", () => {
  describe("fromConfig", () => {
    it.effect("decodes percent-encoded OTEL_RESOURCE_ATTRIBUTES", () =>
      Effect.gen(function*() {
        const resource = yield* OtlpResource.fromConfig()
        const attributes = Object.fromEntries(
          resource.attributes.map((attribute) => [attribute.key, attribute.value.stringValue])
        )

        assert.strictEqual(attributes.message, "hello world")
        assert.strictEqual(attributes.comma, "comma,value")
      }).pipe(
        Effect.provideService(
          ConfigProvider.ConfigProvider,
          ConfigProvider.fromEnv({
            env: {
              OTEL_SERVICE_NAME: "repro",
              OTEL_RESOURCE_ATTRIBUTES: "message=hello%20world,comma=comma%2Cvalue"
            }
          })
        )
      ))

    it.effect("trims OTEL_RESOURCE_ATTRIBUTES entries and keeps empty values", () =>
      Effect.gen(function*() {
        const resource = yield* OtlpResource.fromConfig()

        assert.deepStrictEqual(attributesRecord(resource), {
          ...sdk,
          "service.name": "env-service",
          message: "hello world",
          empty: "",
          a: "1"
        })
      }).pipe(
        Effect.provideService(
          ConfigProvider.ConfigProvider,
          ConfigProvider.fromEnv({
            env: {
              OTEL_SERVICE_NAME: "env-service",
              OTEL_RESOURCE_ATTRIBUTES: "message = hello%20world ,empty=,novalue, =ignored,a=1"
            }
          })
        )
      ))

    it.effect("uses explicit service options before attributes and environment variables", () =>
      Effect.gen(function*() {
        const resource = yield* OtlpResource.fromConfig({
          serviceName: "explicit-service",
          serviceVersion: "explicit-version",
          attributes: {
            "custom.attribute": "explicit",
            "service.name": "explicit-attribute-service",
            "service.version": "explicit-attribute-version"
          }
        })

        assert.deepStrictEqual(attributesRecord(resource), {
          ...sdk,
          "custom.attribute": "explicit",
          "service.name": "explicit-service",
          "service.version": "explicit-version"
        })
      }).pipe(
        Effect.provideService(
          ConfigProvider.ConfigProvider,
          ConfigProvider.fromEnv({
            env: {
              OTEL_SERVICE_NAME: "env-service",
              OTEL_SERVICE_VERSION: "env-version",
              OTEL_RESOURCE_ATTRIBUTES: "service.name=env-attribute-service,service.version=env-attribute-version"
            }
          })
        )
      ))

    it.effect("uses explicit attributes before environment variables", () =>
      Effect.gen(function*() {
        const resource = yield* OtlpResource.fromConfig({
          attributes: {
            "custom.attribute": "explicit",
            "service.name": "explicit-attribute-service",
            "service.version": "explicit-attribute-version"
          }
        })

        assert.deepStrictEqual(attributesRecord(resource), {
          ...sdk,
          "custom.attribute": "explicit",
          "service.name": "explicit-attribute-service",
          "service.version": "explicit-attribute-version"
        })
      }).pipe(
        Effect.provideService(
          ConfigProvider.ConfigProvider,
          ConfigProvider.fromEnv({
            env: {
              OTEL_SERVICE_NAME: "env-service",
              OTEL_SERVICE_VERSION: "env-version",
              OTEL_RESOURCE_ATTRIBUTES:
                "service.name=env-attribute-service,service.version=env-attribute-version,custom.attribute=env"
            }
          })
        )
      ))

    it.effect("uses dedicated service variables before OTEL resource attributes", () =>
      Effect.gen(function*() {
        const resource = yield* OtlpResource.fromConfig()

        assert.deepStrictEqual(attributesRecord(resource), {
          ...sdk,
          "service.name": "env-service",
          "service.version": "env-version"
        })
      }).pipe(
        Effect.provideService(
          ConfigProvider.ConfigProvider,
          ConfigProvider.fromEnv({
            env: {
              OTEL_SERVICE_NAME: "env-service",
              OTEL_SERVICE_VERSION: "env-version",
              OTEL_RESOURCE_ATTRIBUTES: "service.name=env-attribute-service,service.version=env-attribute-version"
            }
          })
        )
      ))

    it.effect("omits service.version when it is not configured", () =>
      Effect.gen(function*() {
        const resource = yield* OtlpResource.fromConfig({
          serviceName: "explicit-service"
        })

        assert.deepStrictEqual(attributesRecord(resource), {
          ...sdk,
          "service.name": "explicit-service"
        })
      }).pipe(
        Effect.provideService(
          ConfigProvider.ConfigProvider,
          ConfigProvider.fromEnv({
            env: {}
          })
        )
      ))

    it.effect("dies when no service name is configured", () =>
      Effect.gen(function*() {
        const exit = yield* Effect.exit(OtlpResource.fromConfig())
        assert(Exit.isFailure(exit) && Cause.hasDies(exit.cause))
        assert.include(Cause.pretty(exit.cause), "OTEL_SERVICE_NAME")
      }).pipe(
        Effect.provideService(ConfigProvider.ConfigProvider, ConfigProvider.fromEnv({ env: {} }))
      ))
  })

  it("lets custom attributes override SDK defaults and service options override attributes", () => {
    const resource = OtlpResource.make({
      serviceName: "test",
      serviceVersion: "1.0.0",
      attributes: {
        "telemetry.sdk.name": "custom",
        "telemetry.sdk.language": "webjs",
        "telemetry.sdk.version": "custom-version",
        "service.name": "attribute-service",
        "service.version": "attribute-version"
      }
    })
    assert.deepStrictEqual(resource.attributes, [
      { key: "telemetry.sdk.name", value: { stringValue: "custom" } },
      { key: "telemetry.sdk.language", value: { stringValue: "webjs" } },
      { key: "telemetry.sdk.version", value: { stringValue: "custom-version" } },
      { key: "service.name", value: { stringValue: "test" } },
      { key: "service.version", value: { stringValue: "1.0.0" } }
    ])
  })

  describe("unknownToAttributeValue", () => {
    it("preserves bigint attribute precision", () => {
      const input = 9_007_199_254_740_993n
      const output = OtlpResource.unknownToAttributeValue(input)

      assert.strictEqual(String(output.intValue), input.toString())
    })

    it("keeps integers outside the int64 range out of intValue", () => {
      assert.deepStrictEqual(OtlpResource.unknownToAttributeValue(2 ** 63), { doubleValue: 2 ** 63 })
      assert.deepStrictEqual(OtlpResource.unknownToAttributeValue(-9_223_372_036_854_778_000), {
        doubleValue: -9_223_372_036_854_778_000
      })
      assert.deepStrictEqual(
        OtlpResource.unknownToAttributeValue(9_223_372_036_854_775_808n),
        { stringValue: "9223372036854775808" }
      )
      assert.deepStrictEqual(
        OtlpResource.unknownToAttributeValue(-9_223_372_036_854_775_809n),
        { stringValue: "-9223372036854775809" }
      )
    })
  })
})
