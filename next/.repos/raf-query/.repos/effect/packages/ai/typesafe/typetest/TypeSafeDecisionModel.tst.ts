import { TypeSafeClient, TypeSafeDecisionModel } from "@effect/ai-typesafe"
import { type Config, Effect, type Layer, Redacted, Schema } from "effect"
import { Decision, DecisionModel, type Model } from "effect/ai"
import type { HttpClient } from "effect/http"
import { describe, expect, it } from "tstyche"

declare const acceptsKnownModel: (model: TypeSafeDecisionModel.Model) => void

const Triage = Decision.make({
  input: Schema.String,
  decisions: {
    urgent: Decision.probability({
      instructions: "The message conveys urgency",
      criteria: { false: "No time pressure", true: "Needs action now" }
    })
  }
})

describe("TypeSafeDecisionModel", () => {
  describe("Model", () => {
    it("keeps the known model ids as literals, while the constructors still accept custom ids", () => {
      expect(acceptsKnownModel).type.toBeCallableWith("jev-latest")
      expect(acceptsKnownModel).type.toBeCallableWith("jev-preview")
      expect(acceptsKnownModel).type.toBeCallableWith("jev-1.13.0")
      expect(acceptsKnownModel).type.not.toBeCallableWith("not-a-real-model")
      expect(TypeSafeDecisionModel.model).type.toBeCallableWith("not-a-real-model")
      expect(TypeSafeDecisionModel.layer).type.toBeCallableWith({ model: "not-a-real-model" })
    })
  })

  describe("model", () => {
    it("provides DecisionModel and requires TypeSafeClient", () => {
      expect(TypeSafeDecisionModel.model("jev-latest")).type.toBe<
        Model.Model<"typesafe", DecisionModel.DecisionModel, TypeSafeClient.TypeSafeClient>
      >()
    })

    it("satisfies a decide program's DecisionModel requirement", () => {
      const program = DecisionModel.decide(Triage, { input: "My card was charged twice." }).pipe(
        Effect.provide(TypeSafeDecisionModel.model("jev-latest"))
      )

      type Requirements = typeof program extends Effect.Effect<any, any, infer R> ? R : never

      expect<Requirements>().type.toBe<TypeSafeClient.TypeSafeClient>()
    })
  })

  describe("layer", () => {
    it("provides DecisionModel and requires TypeSafeClient", () => {
      expect(TypeSafeDecisionModel.layer({ model: "jev-latest" })).type.toBe<
        Layer.Layer<DecisionModel.DecisionModel, never, TypeSafeClient.TypeSafeClient>
      >()
    })
  })

  describe("make", () => {
    it("builds a DecisionModel from the TypeSafeClient service", () => {
      expect(TypeSafeDecisionModel.make({ model: "jev-latest" })).type.toBe<
        Effect.Effect<DecisionModel.DecisionModel, never, TypeSafeClient.TypeSafeClient>
      >()
    })
  })
})

describe("TypeSafeClient", () => {
  it("layer requires only HttpClient", () => {
    expect(TypeSafeClient.layer({ apiKey: Redacted.make("ts-test-key") })).type.toBe<
      Layer.Layer<TypeSafeClient.TypeSafeClient, never, HttpClient.HttpClient>
    >()
  })

  it("layerConfig fails with ConfigError", () => {
    expect(TypeSafeClient.layerConfig()).type.toBe<
      Layer.Layer<TypeSafeClient.TypeSafeClient, Config.ConfigError, HttpClient.HttpClient>
    >()
  })
})
