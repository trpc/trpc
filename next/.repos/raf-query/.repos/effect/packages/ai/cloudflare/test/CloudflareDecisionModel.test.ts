import * as CloudflareClient from "@effect/ai-cloudflare/CloudflareClient"
import * as CloudflareDecisionModel from "@effect/ai-cloudflare/CloudflareDecisionModel"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Layer, Redacted, Schema } from "effect"
import { Decision, DecisionModel, Model } from "effect/ai"
import * as HttpClient from "effect/http/HttpClient"
import type * as HttpClientError from "effect/http/HttpClientError"
import type * as HttpClientRequest from "effect/http/HttpClientRequest"
import * as HttpClientResponse from "effect/http/HttpClientResponse"

const Triage = Decision.make({
  input: Schema.Struct({ message: Schema.String }),
  decisions: {
    team: Decision.classify({
      instructions: "Which team should handle this request?",
      criteria: { billing: "Payments", technical: "Outages" }
    }),
    severity: Decision.rate({
      instructions: "How severe is the impact?",
      criteria: ["Minor", "Major", "Critical"]
    }),
    urgent: Decision.probability({
      instructions: "Does this need immediate attention?",
      criteria: { false: "Can wait", true: "Act now" }
    })
  }
})

const input = { message: "Checkout is down" }

const answers = {
  team: {
    type: "choice",
    choice: "technical",
    confidence: 0.9,
    probabilities: { billing: 0.1, technical: 0.9 }
  },
  severity: {
    type: "score",
    score: 1.75,
    confidence: 0.8,
    probabilities: { "0": 0.05, "1": 0.15, "2": 0.8 },
    legend: { "0": "Minor", "1": "Major", "2": "Critical" }
  },
  urgent: { type: "noul", noul: 0.99 }
}

const clientLayer = (
  answers: unknown,
  onRequest: (request: HttpClientRequest.HttpClientRequest) => void = () => {},
  model = "clef"
) =>
  CloudflareClient.layer({ accountId: "test-account", apiKey: Redacted.make("test-token") }).pipe(
    Layer.provide(Layer.succeed(
      HttpClient.HttpClient,
      HttpClient.makeWith(
        Effect.map((request) => {
          onRequest(request)
          return HttpClientResponse.fromWeb(
            request,
            Response.json({
              success: true,
              result: { model, answers, usage: { input_tokens: 120, output_tokens: 0 } }
            })
          )
        }),
        Effect.succeed as HttpClient.HttpClient.Preprocess<HttpClientError.HttpClientError, never>
      )
    ))
  )

const layer = (answers: unknown) =>
  CloudflareDecisionModel.layer({ model: "clef" }).pipe(Layer.provide(clientLayer(answers)))

describe("CloudflareDecisionModel", () => {
  it.effect("sends every decision as a question and maps the answers", () =>
    Effect.gen(function*() {
      const result = yield* DecisionModel.decide(Triage, { input })
      assert.strictEqual(yield* Model.ProviderName, "cloudflare")
      assert.strictEqual(yield* Model.ModelName, "clef")
      assert.strictEqual(result.answers.team.label, "technical")
      assert.deepStrictEqual({ ...result.answers.team.probabilities }, { billing: 0.1, technical: 0.9 })
      assert.strictEqual(result.answers.team.confidence, 0.9)
      assert.strictEqual(result.answers.severity.label, "Critical")
      assert.strictEqual(result.answers.severity.rating, 1.75)
      assert.deepStrictEqual({ ...result.answers.severity.probabilities }, { Minor: 0.05, Major: 0.15, Critical: 0.8 })
      assert.strictEqual(result.answers.urgent.probability, 0.99)
      assert.strictEqual(result.usage.inputTokens, 120)
      assert.strictEqual(result.usage.outputTokens, 0)
    }).pipe(
      Effect.provide(CloudflareDecisionModel.model("clef")),
      Effect.provide(clientLayer(answers, (request) => {
        assert.strictEqual(request.body._tag, "Uint8Array")
        if (request.body._tag === "Uint8Array") {
          assert.deepStrictEqual(JSON.parse(new TextDecoder().decode(request.body.body)), {
            model: "clef",
            state: input,
            questions: {
              team: {
                type: "choice",
                instructions: Triage.decisions.team.instructions,
                criteria: Triage.decisions.team.criteria
              },
              severity: {
                type: "score",
                instructions: Triage.decisions.severity.instructions,
                criteria: Triage.decisions.severity.criteria
              },
              urgent: {
                type: "noul",
                instructions: Triage.decisions.urgent.instructions,
                criteria: Triage.decisions.urgent.criteria
              }
            }
          })
        }
      }))
    ))

  it.effect("sends an arbitrary model identifier through the decision request", () => {
    const model = "clef-next"
    return Effect.gen(function*() {
      const result = yield* DecisionModel.decide(Triage, { input })
      assert.strictEqual(yield* Model.ModelName, model)
      assert.strictEqual(result.answers.urgent.probability, 0.99)
    }).pipe(
      Effect.provide(CloudflareDecisionModel.model(model)),
      Effect.provide(clientLayer(answers, (request) => {
        assert.strictEqual(
          request.url,
          `https://api.cloudflare.com/client/v4/accounts/test-account/ai/run/@cf/cloudflare/${model}`
        )
        assert.strictEqual(request.body._tag, "Uint8Array")
        if (request.body._tag === "Uint8Array") {
          assert.strictEqual(JSON.parse(new TextDecoder().decode(request.body.body)).model, model)
        }
      }, model))
    )
  })

  it.effect("accepts probabilities with four-decimal rounding drift", () =>
    Effect.gen(function*() {
      const result = yield* DecisionModel.decide(Triage, { input })
      assert.strictEqual(result.answers.severity.label, "Minor")
      assert.closeTo(result.answers.severity.probabilities.Minor, 1 / 3, 1e-10)
    }).pipe(Effect.provide(layer({
      ...answers,
      severity: {
        ...answers.severity,
        score: 1,
        confidence: 0.3333,
        probabilities: { "0": 0.3333, "1": 0.3333, "2": 0.3333 }
      }
    }))))

  for (
    const [name, invalid] of [
      ["a missing answer", { team: answers.team, severity: answers.severity }],
      ["a skipped rating level", {
        ...answers,
        severity: { ...answers.severity, probabilities: { "0": 0.2, "2": 0.8 } }
      }],
      ["drift beyond four decimals", {
        ...answers,
        team: { ...answers.team, probabilities: { billing: 0.1, technical: 0.89 } }
      }]
    ] as const
  ) {
    it.effect(`fails with InvalidOutputError for ${name}`, () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(DecisionModel.decide(Triage, { input }))
        assert.strictEqual(error.reason._tag, "InvalidOutputError")
      }).pipe(Effect.provide(layer(invalid))))
  }
})
