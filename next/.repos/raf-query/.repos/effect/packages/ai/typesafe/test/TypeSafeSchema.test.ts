import * as TypeSafeSchema from "@effect/ai-typesafe/TypeSafeSchema"
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

const noulAnswer = {
  type: "noul",
  noul: 0.999
}

describe("TypeSafeSchema", () => {
  it("encodes a systemone request with every question type", () => {
    const request = {
      state: { message: "My card was charged twice.", order_id: "A-104" },
      model: "jev-latest",
      questions: {
        department: {
          type: "choice",
          instructions: "Which team should handle this",
          criteria: { billing: "Payment or subscription issues", technical: "Bugs or integration problems" }
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

    const decoded = Schema.decodeUnknownSync(TypeSafeSchema.SystemOneRequest)(request)
    const encoded = Schema.encodeSync(TypeSafeSchema.SystemOneRequest)(decoded)

    assert.deepStrictEqual(JSON.parse(JSON.stringify(encoded)), request)
  })

  it("accepts a noul question without criteria", () => {
    const decoded = Schema.decodeUnknownSync(TypeSafeSchema.NoulQuestion)({
      type: "noul",
      instructions: "The message conveys urgency"
    })

    assert.strictEqual(decoded.type, "noul")
    assert.isUndefined(decoded.criteria)
  })

  it("decodes a systemone response with choice, score, and noul answers", () => {
    const response = {
      model: "jev-latest",
      answers: {
        department: choiceAnswer,
        frustration: scoreAnswer,
        urgent: noulAnswer
      },
      usage: { input_tokens: 312, output_tokens: 48 }
    }

    const decoded = Schema.decodeUnknownSync(TypeSafeSchema.SystemOneResponse)(response)

    assert.deepStrictEqual(JSON.parse(JSON.stringify(decoded)), response)
  })

  it("decodes a score answer without a legend", () => {
    const { legend: _legend, ...withoutLegend } = scoreAnswer
    const decoded = Schema.decodeUnknownSync(TypeSafeSchema.ScoreAnswer)(withoutLegend)

    assert.strictEqual(decoded.score, 1.6)
    assert.deepStrictEqual(decoded.probabilities, { "0": 0.05, "1": 0.3, "2": 0.65 })
  })

  it.each([
    { name: "score answer without probabilities", answer: { type: "score", score: 1.6, confidence: 0.78 } },
    { name: "score answer without score", answer: { type: "score", probabilities: { "0": 1 }, confidence: 1 } },
    { name: "choice answer without probabilities", answer: { type: "choice", choice: "billing", confidence: 1 } },
    { name: "choice answer without choice", answer: { type: "choice", probabilities: { billing: 1 }, confidence: 1 } },
    { name: "noul answer without noul", answer: { type: "noul" } },
    { name: "answer with an unknown type", answer: { type: "rank", rank: [] } }
  ])("rejects a $name", ({ answer }) => {
    assert.throws(() => Schema.decodeUnknownSync(TypeSafeSchema.Answer)(answer))
  })

  it.each([
    { name: "absent usage", extra: {} },
    { name: "empty usage", extra: { usage: {} } },
    { name: "input tokens only", extra: { usage: { input_tokens: 312 } } },
    { name: "output tokens only", extra: { usage: { output_tokens: 48 } } }
  ])("decodes a response with $name", ({ extra }) => {
    const response = { model: "jev-latest", answers: { urgent: noulAnswer }, ...extra }
    const decoded = Schema.decodeUnknownSync(TypeSafeSchema.SystemOneResponse)(response)

    assert.deepStrictEqual(JSON.parse(JSON.stringify(decoded)), response)
  })

  it.each([
    { name: "neither optional field", model: { name: "jev-latest" } },
    { name: "description only", model: { name: "jev-latest", description: "Latest Jev" } },
    { name: "release date only", model: { name: "jev-latest", release_date: "2026-08-01" } }
  ])("decodes a model with $name", ({ model }) => {
    const response = { models: [model] }
    const decoded = Schema.decodeUnknownSync(TypeSafeSchema.ListModelsResponse)(response)

    assert.deepStrictEqual(JSON.parse(JSON.stringify(decoded)), response)
  })

  it("decodes a models list response", () => {
    const response = {
      models: [
        { name: "jev-1.13.0", description: "Jev 1.13", release_date: "2026-08-01" }
      ]
    }

    const decoded = Schema.decodeUnknownSync(TypeSafeSchema.ListModelsResponse)(response)

    assert.deepStrictEqual(JSON.parse(JSON.stringify(decoded)), response)
  })
})
