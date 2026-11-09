import { OpenAiTelemetry } from "@effect/ai-openai-compat"
import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"

describe("OpenAiTelemetry", () => {
  it.effect("writes current OpenAI GenAI attribute keys", () =>
    Effect.gen(function*() {
      const span = yield* Effect.currentSpan
      OpenAiTelemetry.addGenAIAnnotations(span, {
        provider: { name: "openai" },
        openai: {
          request: { serviceTier: "auto" },
          response: { serviceTier: "default", systemFingerprint: "fp_1" }
        }
      })
      const attributes = Object.fromEntries(span.attributes)
      assert.deepStrictEqual(attributes, {
        "gen_ai.provider.name": "openai",
        "openai.request.service_tier": "auto",
        "openai.response.service_tier": "default",
        "openai.response.system_fingerprint": "fp_1"
      })
    }).pipe(Effect.withSpan("test")))
})
