import { OpenAiClient } from "@effect/ai-openai"
import * as OpenAiDecisionModel from "@effect/ai-openai/OpenAiDecisionModel"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Layer, Redacted, Result, Schema } from "effect"
import { Decision, DecisionModel, Model } from "effect/ai"
import { HttpClient, type HttpClientError, type HttpClientRequest, HttpClientResponse } from "effect/http"

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

const Urgency = Decision.make({
  input: Schema.String,
  decisions: {
    urgent: Decision.probability({ instructions: "Does this need immediate attention?" })
  }
})

const Screenshots = Decision.make({
  input: Schema.Struct({ message: Schema.String, shots: Schema.Array(Decision.Image) }),
  decisions: {
    urgent: Decision.probability({ instructions: "Does this need immediate attention?" })
  }
})

const input = { message: "Checkout is down" }

const answers = [
  {
    name: "team",
    type: "choice",
    choice: "technical",
    probabilities: [{ value: "billing", probability: 0.1 }, { value: "technical", probability: 0.9 }],
    confidence: 0.9
  },
  {
    name: "severity",
    type: "score",
    score: 1.75,
    probabilities: [
      { value: 0, label: "minor", probability: 0.05 },
      { value: 1, label: "major", probability: 0.15 },
      { value: 2, label: "critical", probability: 0.8 }
    ],
    confidence: 0.8
  },
  { name: "urgent", type: "predicate", probability: 0.99 }
]

const response = (
  answers: ReadonlyArray<unknown>,
  fields: object = { usage: { input_tokens: 120, output_tokens: 0 } }
) => ({ id: "dec_123", object: "decision", model: "gpt-6-luna", answers, ...fields })

const clientLayer = (
  body: unknown,
  onRequest: (request: HttpClientRequest.HttpClientRequest) => void = () => {}
) =>
  OpenAiClient.layer({ apiKey: Redacted.make("sk-test-key") }).pipe(
    Layer.provide(Layer.succeed(
      HttpClient.HttpClient,
      HttpClient.makeWith(
        Effect.map((request) => {
          onRequest(request)
          return HttpClientResponse.fromWeb(request, Response.json(body))
        }),
        Effect.succeed as HttpClient.HttpClient.Preprocess<HttpClientError.HttpClientError, never>
      )
    ))
  )

const layer = (body: unknown) =>
  OpenAiDecisionModel.layer({ model: "gpt-6-luna" }).pipe(Layer.provide(clientLayer(body)))

const requestBody = (request: HttpClientRequest.HttpClientRequest) => {
  assert.strictEqual(request.body._tag, "Uint8Array")
  return request.body._tag === "Uint8Array" ? JSON.parse(new TextDecoder().decode(request.body.body)) : undefined
}

describe("OpenAiDecisionModel", () => {
  it.effect("keeps explicit Rate labels separate from their string descriptions", () => {
    const definition = Decision.make({
      input: Schema.String,
      decisions: {
        severity: Decision.rate({
          instructions: "Severity?",
          criteria: ["Minor", { label: "Critical", description: "Checkout unavailable" }]
        })
      }
    })
    return Effect.gen(function*() {
      const result = yield* DecisionModel.decide(definition, { input: "Checkout is down" })
      assert.strictEqual(result.answers.severity.label, "Critical")
      assert.deepStrictEqual({ ...result.answers.severity.probabilities }, { Minor: 0.1, Critical: 0.9 })
    }).pipe(
      Effect.provide(OpenAiDecisionModel.layer({ model: "gpt-6-luna" })),
      Effect.provide(clientLayer(
        response([{
          name: "severity",
          type: "score",
          score: 0.9,
          confidence: 0.9,
          probabilities: [{ value: 0, label: "ignored", probability: 0.1 }, {
            value: 1,
            label: "ignored",
            probability: 0.9
          }]
        }]),
        (request) => {
          assert.deepStrictEqual(requestBody(request).questions, [{
            type: "score",
            name: "severity",
            instructions: "Severity?",
            levels: [{ label: "Minor", description: "Minor" }, {
              label: "Critical",
              description: "Checkout unavailable"
            }]
          }])
        }
      ))
    )
  })

  it.effect("serializes structured instructions and descriptions to strings, including null choices", () => {
    const definition = Decision.make({
      input: Schema.String,
      decisions: {
        team: Decision.classify({
          instructions: { question: "Team?" },
          criteria: { billing: null, technical: { handles: "Outages" } }
        }),
        severity: Decision.rate({
          instructions: ["Severity?"],
          criteria: ["Minor", "Major", { label: "Critical", description: ["outage"] }]
        }),
        urgent: Decision.probability({
          instructions: { question: "Urgent?" },
          criteria: { false: ["Can wait"], true: { action: "Act now" } }
        })
      }
    })
    return DecisionModel.decide(definition, { input: "Checkout is down" }).pipe(
      Effect.provide(OpenAiDecisionModel.layer({ model: "gpt-6-luna" })),
      Effect.provide(clientLayer(response(answers), (request) => {
        assert.deepStrictEqual(requestBody(request).questions, [
          {
            type: "choice",
            name: "team",
            instructions: "{\"question\":\"Team?\"}",
            choices: [
              { value: "billing", description: "null" },
              { value: "technical", description: "{\"handles\":\"Outages\"}" }
            ]
          },
          {
            type: "score",
            name: "severity",
            instructions: "[\"Severity?\"]",
            levels: [
              { label: "Minor", description: "Minor" },
              { label: "Major", description: "Major" },
              { label: "Critical", description: "[\"outage\"]" }
            ]
          },
          {
            type: "predicate",
            name: "urgent",
            instructions: "{\"question\":\"Urgent?\"}\n\nfalse: [\"Can wait\"]\ntrue: {\"action\":\"Act now\"}"
          }
        ])
      }))
    )
  })

  it.effect("sends every decision as a named question and keys the answers by name", () =>
    Effect.gen(function*() {
      const result = yield* DecisionModel.decide(Triage, { input })
      assert.strictEqual(yield* Model.ProviderName, "openai")
      assert.strictEqual(yield* Model.ModelName, "gpt-6-luna")
      assert.strictEqual(result.answers.team.label, "technical")
      assert.deepStrictEqual({ ...result.answers.team.probabilities }, { billing: 0.1, technical: 0.9 })
      assert.strictEqual(result.answers.team.confidence, 0.9)
      assert.strictEqual(result.answers.severity.label, "Critical")
      assert.strictEqual(result.answers.severity.rating, 1.75)
      assert.deepStrictEqual({ ...result.answers.severity.probabilities }, { Minor: 0.05, Major: 0.15, Critical: 0.8 })
      assert.strictEqual(result.answers.severity.confidence, 0.8)
      assert.strictEqual(result.answers.urgent.probability, 0.99)
      assert.strictEqual(result.usage.inputTokens, 120)
      assert.strictEqual(result.usage.outputTokens, 0)
    }).pipe(
      Effect.provide(OpenAiDecisionModel.model("gpt-6-luna")),
      Effect.provide(clientLayer(response([...answers].reverse()), (request) => {
        assert.strictEqual(request.method, "POST")
        assert.strictEqual(request.url, "https://api.openai.com/v1/decisions")
        assert.deepStrictEqual(requestBody(request), {
          model: "gpt-6-luna",
          input: JSON.stringify(input),
          questions: [
            {
              type: "choice",
              name: "team",
              instructions: "Which team should handle this request?",
              choices: [
                { value: "billing", description: "Payments" },
                { value: "technical", description: "Outages" }
              ]
            },
            {
              type: "score",
              name: "severity",
              instructions: "How severe is the impact?",
              levels: [
                { label: "Minor", description: "Minor" },
                { label: "Major", description: "Major" },
                { label: "Critical", description: "Critical" }
              ]
            },
            {
              type: "predicate",
              name: "urgent",
              instructions: "Does this need immediate attention?\n\nfalse: Can wait\ntrue: Act now"
            }
          ]
        })
      }))
    ))

  it.effect("sends string state unchanged without images and leaves omitted usage undefined", () =>
    Effect.gen(function*() {
      const result = yield* DecisionModel.decide(Urgency, { input: "Checkout is down" })
      assert.isUndefined(result.usage.inputTokens)
      assert.isUndefined(result.usage.outputTokens)
    }).pipe(
      Effect.provide(OpenAiDecisionModel.layer({ model: "gpt-6-luna" })),
      Effect.provide(clientLayer(response([answers[2]], {}), (request) => {
        assert.strictEqual(requestBody(request).input, "Checkout is down")
      }))
    ))

  it.effect("fails with InvalidOutputError when an answer is missing", () =>
    Effect.gen(function*() {
      const error = yield* Effect.flip(DecisionModel.decide(Triage, { input }))
      assert.strictEqual(error.reason._tag, "InvalidOutputError")
    }).pipe(Effect.provide(layer(response(answers.slice(0, 2))))))

  it.effect("decide fails with ContentPolicyError when any answer is a refusal, even beside a missing answer", () =>
    Effect.gen(function*() {
      const error = yield* Effect.flip(DecisionModel.decide(Triage, { input }))
      assert.strictEqual(error.reason._tag, "ContentPolicyError")
      if (error.reason._tag === "ContentPolicyError") {
        assert.include(error.reason.description, "severity")
        assert.notInclude(error.reason.description, "team")
      }
    }).pipe(Effect.provide(layer(response([
      { name: "severity", type: "refusal", refusal: "I can't help with that." },
      answers[2]
    ])))))

  it.effect("decideSettled reports a refusal and a mismatched score per decision", () =>
    Effect.gen(function*() {
      const { outcomes } = yield* DecisionModel.decideSettled(Triage, { input })
      assert.isTrue(Result.isFailure(outcomes.team) && outcomes.team.failure.reason === "Invalid")
      assert.isTrue(Result.isFailure(outcomes.severity) && outcomes.severity.failure.reason === "Refused")
      assert.deepStrictEqual(outcomes.urgent, Result.succeed({ probability: 0.99 }))
    }).pipe(Effect.provide(layer(response([
      { ...answers[1], name: "team" },
      { name: "severity", type: "refusal", refusal: "I can't help with that." },
      answers[2]
    ])))))

  it.effect("a refusal outranks a later answer with the same name", () =>
    Effect.gen(function*() {
      const error = yield* Effect.flip(DecisionModel.decide(Urgency, { input: "Checkout is down" }))
      assert.strictEqual(error.reason._tag, "ContentPolicyError")
      const { outcomes } = yield* DecisionModel.decideSettled(Urgency, { input: "Checkout is down" })
      assert.isTrue(Result.isFailure(outcomes.urgent) && outcomes.urgent.failure.reason === "Refused")
    }).pipe(Effect.provide(layer(response([
      { name: "urgent", type: "refusal" },
      { name: "urgent", type: "predicate", probability: 0.99 }
    ])))))

  it.effect("sends the state text, then each byte array, base64, or data URL image after its reference", () => {
    const dataUrl = "data:image/webp;base64,UklGRg=="
    const shots = [
      { mediaType: "image/png", data: new Uint8Array([137, 80, 78, 71]) },
      { mediaType: "image/jpeg", data: "/9j/4AAQ" },
      { mediaType: "image/webp", data: new URL(dataUrl) }
    ]
    return Effect.gen(function*() {
      const result = yield* DecisionModel.decide(Screenshots, { input: { message: "Checkout is down", shots } })
      assert.strictEqual(result.answers.urgent.probability, 0.99)
    }).pipe(
      Effect.provide(OpenAiDecisionModel.layer({ model: "gpt-6-luna" })),
      Effect.provide(clientLayer(response([answers[2]]), (request) => {
        const body = requestBody(request)
        assert.strictEqual(body.input.length, 1)
        assert.strictEqual(body.input[0].role, "user")
        const content = body.input[0].content
        const state = JSON.parse(content[0].text)
        const [png, jpeg, webp] = state.shots
        assert.deepStrictEqual(content, [
          { type: "input_text", text: JSON.stringify({ message: "Checkout is down", shots: [png, jpeg, webp] }) },
          { type: "input_text", text: `Image ${png}:` },
          { type: "input_image", image_url: "data:image/png;base64,iVBORw==" },
          { type: "input_text", text: `Image ${jpeg}:` },
          { type: "input_image", image_url: "data:image/jpeg;base64,/9j/4AAQ" },
          { type: "input_text", text: `Image ${webp}:` },
          { type: "input_image", image_url: dataUrl }
        ])
      }))
    )
  })

  it.effect("rejects remote image URLs without sending a request", () => {
    let requests = 0
    return Effect.gen(function*() {
      const error = yield* Effect.flip(DecisionModel.decide(Screenshots, {
        input: {
          message: "Checkout is down",
          shots: [{ mediaType: "image/png", data: new URL("https://example.com/cat.png") }]
        }
      }))
      assert.strictEqual(error.reason._tag, "InvalidUserInputError")
      assert.strictEqual(requests, 0)
    }).pipe(
      Effect.provide(OpenAiDecisionModel.layer({ model: "gpt-6-luna" })),
      Effect.provide(clientLayer(response([answers[2]]), () => {
        requests++
      }))
    )
  })
})
