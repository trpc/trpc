import { assert, describe, it } from "@effect/vitest"
import { ConfigProvider, Effect } from "effect"
import { OtlpResource } from "effect/observability"

const attributesRecord = (resource: OtlpResource.Resource): Record<string, string | null | undefined> =>
  Object.fromEntries(resource.attributes.map((attribute) => [attribute.key, attribute.value.stringValue]))

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
  })

  describe("unknownToAttributeValue", () => {
    it("preserves bigint attribute precision", () => {
      const input = 9_007_199_254_740_993n
      const output = OtlpResource.unknownToAttributeValue(input)

      assert.strictEqual(String(output.intValue), input.toString())
    })
  })
})
