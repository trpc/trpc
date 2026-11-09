import * as OpenRouterSchema from "@effect/ai-openrouter/OpenRouterSchema"
import { assert, describe, it } from "@effect/vitest"
import { Schema } from "effect"

const choiceAnswer = {
  type: "choice",
  choice: "billing",
  probabilities: { billing: 0.84, technical: 0.159, sales: 0.001 },
  confidence: 0.596
}

const scoreAnswer = {
  type: "score",
  score: 1.6,
  legend: { "0": "Calm", "1": "Frustrated", "2": "Very angry" },
  probabilities: { "0": 0.05, "1": 0.3, "2": 0.65 },
  confidence: 0.78
}

const noulAnswer = { type: "noul", noul: 0.999 }

describe("OpenRouterSchema", () => {
  it("encodes a decisions request with every question type", () => {
    const request = {
      model: "openai/gpt-4o-mini",
      state: { message: "My card was charged twice.", orderId: "A-104" },
      questions: {
        department: {
          type: "choice",
          instructions: "Which team should handle this",
          criteria: { billing: "Payment issues", technical: "Bugs" }
        },
        frustration: {
          type: "score",
          instructions: "How frustrated the customer appears",
          criteria: ["Calm", "Frustrated", "Very angry"]
        },
        urgent: {
          type: "noul",
          instructions: "The message conveys urgency",
          criteria: { false: "No time pressure", true: "Needs action now" }
        }
      }
    } as const

    const decoded = Schema.decodeUnknownSync(OpenRouterSchema.DecisionsRequest)(request)
    const encoded = Schema.encodeSync(OpenRouterSchema.DecisionsRequest)(decoded)

    assert.deepStrictEqual(JSON.parse(JSON.stringify(encoded)), request)
  })

  it("accepts a request carrying routing and tracing options", () => {
    const decoded = Schema.decodeUnknownSync(OpenRouterSchema.DecisionsRequest)({
      model: "openai/gpt-4o-mini",
      state: "hello",
      questions: { urgent: { type: "noul", instructions: "Urgent" } },
      provider: { order: ["openai"] },
      session_id: "session-1",
      user: "user-1"
    })

    assert.strictEqual(decoded.session_id, "session-1")
    assert.strictEqual(decoded.user, "user-1")
  })

  it("accepts a noul question without criteria", () => {
    const decoded = Schema.decodeUnknownSync(OpenRouterSchema.NoulQuestion)({
      type: "noul",
      instructions: "The message conveys urgency"
    })

    assert.strictEqual(decoded.type, "noul")
    assert.isUndefined(decoded.criteria)
  })

  it.each([
    { name: "string", state: "a plain string" },
    { name: "object", state: { message: "hi", orderId: "A-1" } },
    { name: "array", state: ["first", "second"] }
  ])("accepts a $name state", ({ state }) => {
    const decoded = Schema.decodeUnknownSync(OpenRouterSchema.DecisionsRequest)({
      model: "openai/gpt-4o-mini",
      state,
      questions: { urgent: { type: "noul", instructions: "Urgent" } }
    })

    assert.deepStrictEqual(decoded.state, state)
  })

  it("decodes a response with choice, score and noul answers", () => {
    const response = {
      id: "dec_123",
      model: "openai/gpt-4o-mini",
      provider: "OpenAI",
      answers: { department: choiceAnswer, frustration: scoreAnswer, urgent: noulAnswer },
      usage: { input_tokens: 312, output_tokens: 48, cost: 0.00042 }
    }

    const decoded = Schema.decodeUnknownSync(OpenRouterSchema.DecisionsResponse)(response)

    assert.deepStrictEqual(JSON.parse(JSON.stringify(decoded)), response)
  })

  it("decodes a response without id, provider or cost", () => {
    const decoded = Schema.decodeUnknownSync(OpenRouterSchema.DecisionsResponse)({
      model: "openai/gpt-4o-mini",
      answers: { urgent: noulAnswer },
      usage: { input_tokens: 10, output_tokens: 2 }
    })

    assert.isUndefined(decoded.id)
    assert.isUndefined(decoded.provider)
    assert.isUndefined(decoded.usage.cost)
  })

  it.each([
    { name: "choice answer without probabilities", answer: { type: "choice", choice: "billing" } },
    { name: "choice answer without confidence", answer: { type: "choice", choice: "billing", probabilities: {} } },
    { name: "score answer without probabilities", answer: { type: "score", score: 1.6 } },
    { name: "score answer without legend", answer: { type: "score", score: 1.6, probabilities: { "0": 1 } } }
  ])("decodes a $name, since the field is optional upstream", ({ answer }) => {
    const decoded = Schema.decodeUnknownSync(OpenRouterSchema.Answer)(answer)

    assert.strictEqual(decoded.type, (answer as { type: string }).type)
  })

  it.each([
    { name: "choice answer without choice", answer: { type: "choice", probabilities: { billing: 1 } } },
    { name: "score answer without score", answer: { type: "score", probabilities: { "0": 1 } } },
    { name: "noul answer without noul", answer: { type: "noul" } },
    { name: "answer with an unknown type", answer: { type: "rank", rank: [] } }
  ])("rejects a $name", ({ answer }) => {
    assert.throws(() => Schema.decodeUnknownSync(OpenRouterSchema.Answer)(answer))
  })

  it("rejects a response without usage", () => {
    assert.throws(() =>
      Schema.decodeUnknownSync(OpenRouterSchema.DecisionsResponse)({
        model: "openai/gpt-4o-mini",
        answers: { urgent: noulAnswer }
      })
    )
  })
})
