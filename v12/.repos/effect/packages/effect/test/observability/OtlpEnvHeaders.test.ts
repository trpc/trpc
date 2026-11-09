import { assert, it } from "@effect/vitest"
import { ConfigProvider, Effect } from "effect"
import * as OtlpEnv from "effect/observability/internal/otlpEnv"

it.effect("decodes percent-encoded OTLP header values", () =>
  Effect.gen(function*() {
    const headers = yield* OtlpEnv.headers("TRACES").parse(
      ConfigProvider.fromEnv({
        env: {
          OTEL_EXPORTER_OTLP_TRACES_HEADERS: "authorization=Bearer%20token,x-comma=comma%2Cvalue"
        }
      })
    )

    assert.deepStrictEqual(headers, {
      authorization: "Bearer token",
      "x-comma": "comma,value"
    })
  }))
