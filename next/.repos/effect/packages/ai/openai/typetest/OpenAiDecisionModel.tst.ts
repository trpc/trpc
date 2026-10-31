import { type OpenAiClient, OpenAiDecisionModel } from "@effect/ai-openai"
import { Effect, type Layer, Schema } from "effect"
import { Decision, DecisionModel, type Model } from "effect/ai"
import { describe, expect, it } from "tstyche"

declare const client: OpenAiClient.Service

const Triage = Decision.make({
  input: Schema.String,
  decisions: {
    urgent: Decision.probability({
      instructions: "The message conveys urgency",
      criteria: { false: "No time pressure", true: "Needs action now" }
    })
  }
})

describe("OpenAiDecisionModel", () => {
  it("suggests gpt-6-luna while accepting other model ids", () => {
    expect<OpenAiDecisionModel.Model>().type.toBe<"gpt-6-luna" | (string & {})>()
    expect(OpenAiDecisionModel.layer).type.toBeCallableWith({ model: "gpt-6-luna-next" })
  })

  it("model provides DecisionModel and requires OpenAiClient", () => {
    expect(OpenAiDecisionModel.model("gpt-6-luna")).type.toBe<
      Model.Model<"openai", DecisionModel.DecisionModel, OpenAiClient.OpenAiClient>
    >()
  })

  it("layer provides DecisionModel and requires OpenAiClient", () => {
    expect(OpenAiDecisionModel.layer({ model: "gpt-6-luna" })).type.toBe<
      Layer.Layer<DecisionModel.DecisionModel, never, OpenAiClient.OpenAiClient>
    >()
  })

  it("make builds a DecisionModel from the client service", () => {
    expect(OpenAiDecisionModel.make({ model: "gpt-6-luna" })).type.toBe<
      Effect.Effect<DecisionModel.DecisionModel, never, OpenAiClient.OpenAiClient>
    >()
  })

  it("satisfies a decide program's DecisionModel requirement", () => {
    const program = DecisionModel.decide(Triage, { input: "hello" }).pipe(
      Effect.provide(OpenAiDecisionModel.model("gpt-6-luna"))
    )

    type Requirements = typeof program extends Effect.Effect<any, any, infer R> ? R : never

    expect<Requirements>().type.toBe<OpenAiClient.OpenAiClient>()
  })
})

describe("OpenAiClient.createDecisions", () => {
  it("accepts string input and message input with text and image parts", () => {
    const questions = [
      { type: "predicate", name: "urgent", instructions: "Act now?" },
      {
        type: "choice",
        name: "team",
        instructions: "Which team?",
        choices: [{ value: "billing", description: "Pay" }]
      },
      { type: "score", name: "severity", instructions: "How bad?", levels: [{ label: "Minor", description: "Minor" }] }
    ] as const
    expect(client.createDecisions).type.toBeCallableWith({ model: "gpt-6-luna", input: "Checkout is down", questions })
    expect(client.createDecisions).type.toBeCallableWith({
      model: "gpt-6-luna",
      input: [{
        role: "user",
        content: [
          { type: "input_text", text: "Checkout is down" },
          { type: "input_image", image_url: "data:image/png;base64,iVBORw==" }
        ]
      }],
      questions
    })
  })

  it("rejects questions without a name", () => {
    expect(client.createDecisions).type.not.toBeCallableWith({
      model: "gpt-6-luna",
      input: "Checkout is down",
      questions: [{ type: "predicate", instructions: "Act now?" }]
    })
  })
})
