import { type OpenRouterClient, OpenRouterDecisionModel } from "@effect/ai-openrouter"
import { Effect, type Layer, Schema } from "effect"
import { Decision, DecisionModel, type Model } from "effect/ai"
import { describe, expect, it } from "tstyche"

const Triage = Decision.make({
  input: Schema.String,
  decisions: {
    department: Decision.classify({
      instructions: "Which team should handle this",
      criteria: { billing: "Payments", technical: "Bugs" }
    }),
    urgent: Decision.probability({
      instructions: "The message conveys urgency",
      criteria: { false: "No time pressure", true: "Needs action now" }
    })
  }
})

describe("OpenRouterDecisionModel", () => {
  it("model provides DecisionModel and requires OpenRouterClient", () => {
    expect(OpenRouterDecisionModel.model("openai/gpt-4o-mini")).type.toBe<
      Model.Model<"openrouter", DecisionModel.DecisionModel, OpenRouterClient.OpenRouterClient>
    >()
  })

  it("layer provides DecisionModel and requires OpenRouterClient", () => {
    expect(OpenRouterDecisionModel.layer({ model: "openai/gpt-4o-mini" })).type.toBe<
      Layer.Layer<DecisionModel.DecisionModel, never, OpenRouterClient.OpenRouterClient>
    >()
  })

  it("make builds a DecisionModel from the client service", () => {
    expect(OpenRouterDecisionModel.make({ model: "openai/gpt-4o-mini" })).type.toBe<
      Effect.Effect<DecisionModel.DecisionModel, never, OpenRouterClient.OpenRouterClient>
    >()
  })

  it("accepts any model id, since OpenRouter ids are namespaced strings", () => {
    expect(OpenRouterDecisionModel.model).type.toBeCallableWith("anthropic/claude-sonnet-4")
    expect(OpenRouterDecisionModel.model).type.toBeCallableWith("some-new-provider/some-new-model")
  })

  it("satisfies a decide program's DecisionModel requirement", () => {
    const program = DecisionModel.decide(Triage, { input: "hello" }).pipe(
      Effect.provide(OpenRouterDecisionModel.model("openai/gpt-4o-mini"))
    )

    type Requirements = typeof program extends Effect.Effect<any, any, infer R> ? R : never

    expect<Requirements>().type.toBe<OpenRouterClient.OpenRouterClient>()
  })

  it("accepts routing and tracing options in the layer config", () => {
    expect(OpenRouterDecisionModel.layer).type.toBeCallableWith({
      model: "openai/gpt-4o-mini",
      config: { session_id: "session-1", user: "user-1" }
    })
  })

  it("exposes Config as a context service whose fields are all optional", () => {
    expect<{ readonly user: string }>().type.toBeAssignableTo<
      typeof OpenRouterDecisionModel.Config.Service
    >()
    expect<{ readonly session_id: string }>().type.toBeAssignableTo<
      typeof OpenRouterDecisionModel.Config.Service
    >()
  })
})
