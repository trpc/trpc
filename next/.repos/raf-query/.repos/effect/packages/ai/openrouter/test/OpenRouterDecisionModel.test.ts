import { OpenRouterClient, OpenRouterConfig, OpenRouterDecisionModel } from "@effect/ai-openrouter"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Layer, Redacted, Result, Schema } from "effect"
import { Decision, DecisionModel, Model } from "effect/ai"
import { HttpClient, type HttpClientError, HttpClientRequest, HttpClientResponse } from "effect/http"

const Ticket = Schema.Struct({
  message: Schema.String,
  orderId: Schema.String
})

const TicketTriage = Decision.make({
  input: Ticket,
  decisions: {
    department: Decision.classify({
      instructions: "Which team should handle this",
      criteria: {
        billing: "Payment or subscription issues",
        technical: "Bugs or integration problems",
        sales: "Pricing or account questions"
      }
    }),
    frustration: Decision.rate({
      instructions: "How frustrated the customer appears",
      criteria: ["Calm, just stating facts", "Frustrated but civil", "Very angry, strong language"]
    }),
    urgent: Decision.probability({
      instructions: "The message conveys urgency or time-sensitivity",
      criteria: {
        false: "No time pressure",
        true: "Needs action now"
      }
    })
  }
})

const ticket = {
  message: "Hi, I've been trying to connect my Stripe account for 3 days and it keeps failing. Please help ASAP.",
  orderId: "A-104"
}

const decisionsResponse = {
  model: "test/decision-model",
  answers: {
    department: {
      type: "choice",
      choice: "billing",
      probabilities: { billing: 0.84, technical: 0.159, sales: 0.001 },
      confidence: 0.596
    },
    frustration: {
      type: "score",
      score: 1.6,
      legend: {
        "0": "Calm, just stating facts",
        "1": "Frustrated but civil",
        "2": "Very angry, strong language"
      },
      probabilities: { "0": 0.05, "1": 0.3, "2": 0.65 },
      confidence: 0.78
    },
    urgent: {
      type: "noul",
      noul: 0.999
    }
  },
  usage: { input_tokens: 312, output_tokens: 48 }
}

describe("OpenRouterDecisionModel", () => {
  it.effect("accepts rounded choice probabilities that total 0.99", () =>
    Effect.gen(function*() {
      const definition = Decision.make({
        input: Schema.String,
        decisions: {
          neutral3: Decision.classify({
            instructions: "Choose a sentiment",
            criteria: { negative: "Negative", neutral: "Neutral", positive: "Positive" }
          })
        }
      })
      const { answers } = yield* DecisionModel.decide(definition, { input: "It is fine" }).pipe(
        Effect.provide(OpenRouterDecisionModel.layer({ model: "test/decision-model" })),
        Effect.provide(makeClientLayer((request) =>
          Effect.succeed(jsonResponse(request, {
            model: "test/decision-model",
            answers: {
              neutral3: {
                type: "choice",
                choice: "neutral",
                probabilities: { negative: 0.02, neutral: 0.93, positive: 0.04 },
                confidence: 0.93
              }
            },
            usage: { input_tokens: 10, output_tokens: 5 }
          }))
        ))
      )

      assert.strictEqual(answers.neutral3.label, "neutral")
      assert.closeTo(Object.values(answers.neutral3.probabilities).reduce((sum, value) => sum + value, 0), 1, 1e-6)
    }))

  for (
    const [name, probabilities, succeeds] of [
      ["extra provider key", { a: 0.5, b: 0.5, extra: 0.01 }, true],
      ["drift outside two-decimal rounding", { a: 0.49, b: 0.49 }, false],
      ["out-of-range probability", { a: 1.01, b: -0.02 }, false],
      ["all-zero distribution", { a: 0, b: 0 }, false],
      ["eight rounded labels", { a: 0.12, b: 0.12, c: 0.12, d: 0.12, e: 0.12, f: 0.12, g: 0.12, h: 0.13 }, true]
    ] as const
  ) {
    it.effect(name, () =>
      Effect.gen(function*() {
        const definition = Decision.make({
          input: Schema.String,
          decisions: {
            choice: Decision.classify({
              instructions: "Pick a label",
              criteria: Object.fromEntries(
                Object.keys(probabilities).filter((key) => key !== "extra").map((key) => [key, key])
              )
            })
          }
        })
        const result = yield* Effect.result(
          DecisionModel.decide(definition, { input: "test" }).pipe(
            Effect.provide(OpenRouterDecisionModel.layer({ model: "test/decision-model" })),
            Effect.provide(makeClientLayer((request) =>
              Effect.succeed(jsonResponse(request, {
                model: "test/decision-model",
                answers: { choice: { type: "choice", choice: "a", probabilities, confidence: 0.5 } },
                usage: { input_tokens: 1, output_tokens: 1 }
              }))
            ))
          )
        )
        if (succeeds) {
          assert.isTrue(Result.isSuccess(result))
          if (Result.isSuccess(result)) {
            assert.closeTo(
              Object.values(result.success.answers.choice.probabilities).reduce((sum, value) => sum + value, 0),
              1,
              1e-6
            )
            if (name === "extra provider key") {
              assert.deepStrictEqual(result.success.answers.choice.probabilities, { a: 0.5, b: 0.5 })
            }
          }
        } else {
          assert.isTrue(Result.isFailure(result))
          if (Result.isFailure(result)) assert.strictEqual(result.failure.reason._tag, "InvalidOutputError")
        }
      }))
  }

  it.effect("normalizes rounded score probabilities", () =>
    Effect.gen(function*() {
      const definition = Decision.make({
        input: Schema.String,
        decisions: { score: Decision.rate({ instructions: "Rate", criteria: ["low", "mid", "high"] }) }
      })
      const { answers } = yield* DecisionModel.decide(definition, { input: "test" }).pipe(
        Effect.provide(OpenRouterDecisionModel.layer({ model: "test/decision-model" })),
        Effect.provide(makeClientLayer((request) =>
          Effect.succeed(jsonResponse(request, {
            model: "test/decision-model",
            answers: {
              score: { type: "score", score: 1, probabilities: { "0": 0.1, "1": 0.7, "2": 0.19 }, confidence: 0.7 }
            },
            usage: { input_tokens: 1, output_tokens: 1 }
          }))
        ))
      )
      assert.closeTo(Object.values(answers.score.probabilities).reduce((sum, value) => sum + value, 0), 1, 1e-6)
    }))

  it.effect("omits absent probability criteria from the encoded question", () =>
    Effect.gen(function*() {
      const definition = Decision.make({
        input: Schema.String,
        decisions: {
          urgent: Decision.probability({ instructions: "Needs action now" })
        }
      })
      const { answers } = yield* DecisionModel.decide(definition, { input: "Help ASAP" }).pipe(
        Effect.provide(OpenRouterDecisionModel.layer({ model: "test/decision-model" })),
        Effect.provide(makeClientLayer((request) =>
          Effect.gen(function*() {
            const { questions } = yield* getRequestBody(request)
            assert.deepStrictEqual(questions.urgent, {
              type: "noul",
              instructions: "Needs action now"
            })

            return jsonResponse(request, {
              model: "test/decision-model",
              answers: { urgent: { type: "noul", noul: 0.75 } },
              usage: { input_tokens: 20, output_tokens: 4 }
            })
          })
        ))
      )

      assert.deepStrictEqual(answers.urgent, { probability: 0.75 })
    }))

  for (const key of ["__proto__", "constructor", "toString"]) {
    it.effect("round trips a classification label named " + key, () =>
      Effect.gen(function*() {
        const definition = Decision.make({
          input: Schema.String,
          decisions: {
            category: Decision.classify({
              instructions: "Choose a category",
              criteria: { [key]: "Special category", ordinary: "Ordinary category" }
            })
          }
        })
        const { answers } = yield* DecisionModel.decide(definition, { input: "Help" }).pipe(
          Effect.provide(OpenRouterDecisionModel.layer({ model: "test/decision-model" })),
          Effect.provide(makeClientLayer((request) =>
            Effect.gen(function*() {
              const { questions } = yield* getRequestBody(request)
              const criteria = questions.category.criteria

              assert.isTrue(Object.hasOwn(criteria, key))
              assert.isTrue(Object.getOwnPropertyDescriptor(criteria, key)?.enumerable)
              assert.deepStrictEqual(Object.keys(criteria), [key, "ordinary"])
              assert.strictEqual(criteria[key], "Special category")
              assert.strictEqual(Object.getPrototypeOf(criteria), Object.prototype)

              return jsonResponse(request, {
                model: "test/decision-model",
                answers: {
                  category: {
                    type: "choice",
                    choice: key,
                    probabilities: { [key]: 0.75, ordinary: 0.25 },
                    confidence: 0.5
                  }
                },
                usage: { input_tokens: 10, output_tokens: 5 }
              })
            })
          ))
        )
        const { label, probabilities } = answers.category

        assert.isTrue(Object.hasOwn(probabilities, key))
        assert.isTrue(Object.getOwnPropertyDescriptor(probabilities, key)?.enumerable)
        assert.deepStrictEqual(Object.keys(probabilities), [key, "ordinary"])
        assert.deepStrictEqual(probabilities, { [key]: 0.75, ordinary: 0.25 })
        assert.strictEqual(label, key)
        assert.strictEqual(Object.getPrototypeOf(probabilities), null)
      }))

    it.effect("maps a score distribution to a rate level named " + key, () =>
      Effect.gen(function*() {
        const definition = Decision.make({
          input: Schema.String,
          decisions: {
            intensity: Decision.rate({ instructions: "How intense", criteria: ["low", key, "high"] })
          }
        })
        const { answers } = yield* DecisionModel.decide(definition, { input: "Help" }).pipe(
          Effect.provide(OpenRouterDecisionModel.layer({ model: "test/decision-model" })),
          Effect.provide(makeClientLayer((request) =>
            Effect.gen(function*() {
              const { questions } = yield* getRequestBody(request)
              assert.deepStrictEqual(questions.intensity.criteria, ["low", key, "high"])

              return jsonResponse(request, {
                model: "test/decision-model",
                answers: {
                  intensity: {
                    type: "score",
                    score: 1.1,
                    legend: { "0": "low", "1": key, "2": "high" },
                    probabilities: { "0": 0.1, "1": 0.7, "2": 0.2 },
                    confidence: 0.5
                  }
                },
                usage: { input_tokens: 10, output_tokens: 5 }
              })
            })
          ))
        )
        const { label, probabilities, rating } = answers.intensity

        assert.isTrue(Object.hasOwn(probabilities, key))
        assert.isTrue(Object.getOwnPropertyDescriptor(probabilities, key)?.enumerable)
        assert.deepStrictEqual(Object.keys(probabilities), ["low", key, "high"])
        assert.deepStrictEqual(probabilities, { low: 0.1, [key]: 0.7, high: 0.2 })
        assert.strictEqual(label, key)
        assert.strictEqual(rating, 1.1)
        assert.strictEqual(Object.getPrototypeOf(probabilities), null)
      }))

    it.effect("sends an own enumerable question named " + key, () =>
      Effect.gen(function*() {
        const definition = Decision.make({
          input: Schema.String,
          decisions: {
            [key]: Decision.probability({
              instructions: "Needs action now",
              criteria: { false: "No", true: "Yes" }
            })
          }
        })
        const { answers } = yield* DecisionModel.decide(definition, { input: "Help" }).pipe(
          Effect.provide(OpenRouterDecisionModel.layer({ model: "test/decision-model" })),
          Effect.provide(makeClientLayer((request) =>
            Effect.gen(function*() {
              const { questions } = yield* getRequestBody(request)

              assert.strictEqual(Object.getPrototypeOf(questions), Object.prototype)
              assert.isTrue(Object.hasOwn(questions, key))
              assert.isTrue(Object.getOwnPropertyDescriptor(questions, key)?.enumerable)
              assert.deepStrictEqual(Object.keys(questions), [key])
              assert.deepStrictEqual(questions[key], {
                type: "noul",
                instructions: "Needs action now",
                criteria: { false: "No", true: "Yes" }
              })

              return jsonResponse(request, {
                model: "test/decision-model",
                answers: { [key]: { type: "noul", noul: 0.75 } },
                usage: { input_tokens: 20, output_tokens: 4 }
              })
            })
          ))
        )

        assert.strictEqual(Object.getPrototypeOf(answers), null)
        assert.isTrue(Object.hasOwn(answers, key))
        assert.isTrue(Object.getOwnPropertyDescriptor(answers, key)?.enumerable)
        assert.deepStrictEqual(Object.keys(answers), [key])
        assert.deepStrictEqual(answers[key], { probability: 0.75 })
      }))
  }

  for (
    const apiUrl of [
      "https://proxy.test/openrouter/v1",
      "https://proxy.test/openrouter/v1/",
      "https://proxy.test/openrouter",
      "https://proxy.test/openrouter/"
    ]
  ) {
    it.effect("resolves the alpha endpoint for " + apiUrl, () =>
      Effect.gen(function*() {
        const requests: Array<HttpClientRequest.HttpClientRequest> = []
        yield* DecisionModel.decide(TicketTriage, { input: ticket }).pipe(
          Effect.provide(OpenRouterDecisionModel.layer({ model: "test/decision-model" })),
          Effect.provide(makeClientLayer((request) => {
            requests.push(request)
            return Effect.succeed(jsonResponse(request, decisionsResponse))
          }, apiUrl))
        )
        assert.strictEqual(requests.length, 1)
        assert.strictEqual(requests[0].url, "https://proxy.test/openrouter/alpha/decisions")
      }))
  }

  it.effect("applies a scoped client transform only to the enclosed decisions request", () =>
    Effect.gen(function*() {
      const requests: Array<HttpClientRequest.HttpClientRequest> = []
      yield* Effect.gen(function*() {
        yield* DecisionModel.decide(TicketTriage, { input: ticket }).pipe(
          OpenRouterConfig.withClientTransform(
            HttpClient.mapRequest(HttpClientRequest.setHeader("x-decision-scope", "scoped"))
          )
        )
        yield* DecisionModel.decide(TicketTriage, { input: ticket })
      }).pipe(
        Effect.provide(OpenRouterDecisionModel.layer({ model: "test/decision-model" })),
        Effect.provide(makeClientLayer((request) => {
          requests.push(request)
          return Effect.succeed(jsonResponse(request, decisionsResponse))
        }))
      )
      assert.strictEqual(requests.length, 2)
      assert.strictEqual(requests[0].headers["x-decision-scope"], "scoped")
      assert.isUndefined(requests[1].headers["x-decision-scope"])
    }))

  it.effect("rejects numeric state before making an HTTP request", () =>
    Effect.gen(function*() {
      const definition = Decision.make({ input: Schema.Number, decisions: TicketTriage.decisions })
      const error = yield* DecisionModel.decide(definition, { input: 42 }).pipe(
        Effect.provide(OpenRouterDecisionModel.layer({ model: "test/decision-model" })),
        Effect.provide(makeClientLayer(() => Effect.die(new Error("Unexpected HTTP request")))),
        Effect.flip
      )
      assert.strictEqual(error._tag, "AiError")
      assert.strictEqual(error.reason._tag, "InvalidUserInputError")
    }))

  it.effect("maps a malformed successful response to a client InvalidOutputError", () =>
    Effect.gen(function*() {
      const error = yield* DecisionModel.decide(TicketTriage, { input: ticket }).pipe(
        Effect.provide(OpenRouterDecisionModel.layer({ model: "test/decision-model" })),
        Effect.provide(makeClientLayer((request) =>
          Effect.succeed(jsonResponse(request, {
            ...decisionsResponse,
            usage: { input_tokens: "not a number", output_tokens: 48 }
          }))
        )),
        Effect.flip
      )
      assert.strictEqual(error._tag, "AiError")
      assert.strictEqual(error.module, "OpenRouterClient")
      assert.strictEqual(error.method, "createDecisions")
      assert.strictEqual(error.reason._tag, "InvalidOutputError")
    }))

  it.effect("make constructs a DecisionModel service", () =>
    Effect.gen(function*() {
      const service = yield* OpenRouterDecisionModel.make({ model: "test/decision-model" })
      assert.isFunction(service.decide)
    }).pipe(Effect.provide(makeClientLayer(() => Effect.die(new Error("Unexpected HTTP request"))))))

  it.effect("forwards request config and scoped overrides", () =>
    Effect.gen(function*() {
      const requests: Array<HttpClientRequest.HttpClientRequest> = []
      yield* DecisionModel.decide(TicketTriage, { input: ticket }).pipe(
        Effect.provideService(OpenRouterDecisionModel.Config, { user: "scoped-user", trace: { trace_id: "scoped" } }),
        Effect.provide(OpenRouterDecisionModel.layer({
          model: "test/decision-model",
          config: {
            provider: { order: ["test-provider"] },
            session_id: "session-1",
            user: "default-user",
            trace: { trace_id: "default" }
          }
        })),
        Effect.provide(makeClientLayer((request) => {
          requests.push(request)
          return Effect.succeed(jsonResponse(request, decisionsResponse))
        }))
      )
      const body = yield* getRequestBody(requests[0])
      assert.deepStrictEqual(body.provider, { order: ["test-provider"] })
      assert.strictEqual(body.session_id, "session-1")
      assert.strictEqual(body.user, "scoped-user")
      assert.deepStrictEqual(body.trace, { trace_id: "scoped" })
    }))

  it.effect("accepts absent confidence, cost, id and provider without inventing values", () =>
    Effect.gen(function*() {
      const { confidence: _choiceConfidence, ...department } = decisionsResponse.answers.department
      const { confidence: _scoreConfidence, legend: _legend, ...frustration } = decisionsResponse.answers.frustration
      const { answers, usage } = yield* DecisionModel.decide(TicketTriage, { input: ticket }).pipe(
        Effect.provide(OpenRouterDecisionModel.layer({ model: "test/decision-model" })),
        Effect.provide(makeClientLayer((request) =>
          Effect.succeed(jsonResponse(request, {
            ...decisionsResponse,
            answers: { ...decisionsResponse.answers, department, frustration }
          }))
        ))
      )
      assert.isUndefined(answers.department.confidence)
      assert.isUndefined(answers.frustration.confidence)
      assert.strictEqual(answers.frustration.label, "Very angry, strong language")
      assert.strictEqual(answers.urgent.probability, 0.999)
      assert.deepStrictEqual({ ...usage }, { inputTokens: 312, outputTokens: 48 })
    }))

  it.effect("drops provider-specific cost, id and provider metadata", () =>
    Effect.gen(function*() {
      const result = yield* DecisionModel.decide(TicketTriage, { input: ticket }).pipe(
        Effect.provide(OpenRouterDecisionModel.layer({ model: "test/decision-model" })),
        Effect.provide(makeClientLayer((request) =>
          Effect.succeed(jsonResponse(request, {
            ...decisionsResponse,
            id: "decision-1",
            provider: "test-provider",
            usage: { ...decisionsResponse.usage, cost: 0.001 }
          }))
        ))
      )
      assert.deepStrictEqual({ ...result.usage }, { inputTokens: 312, outputTokens: 48 })
      assert.isFalse("id" in result)
      assert.isFalse("provider" in result)
      assert.isFalse("cost" in result.answers.department)
    }))

  it.effect("fails with InvalidOutputError when a choice answer omits probabilities", () =>
    Effect.gen(function*() {
      const { probabilities: _probabilities, ...department } = decisionsResponse.answers.department
      const error = yield* DecisionModel.decide(TicketTriage, { input: ticket }).pipe(
        Effect.provide(OpenRouterDecisionModel.layer({ model: "test/decision-model" })),
        Effect.provide(makeClientLayer((request) =>
          Effect.succeed(jsonResponse(request, {
            ...decisionsResponse,
            answers: { ...decisionsResponse.answers, department }
          }))
        )),
        Effect.flip
      )
      assert.strictEqual(error._tag, "AiError")
      assert.strictEqual(error.reason._tag, "InvalidOutputError")
    }))

  it.effect("model provides DecisionModel with openrouter provider metadata", () =>
    Effect.gen(function*() {
      const provider = yield* Model.ProviderName
      const modelName = yield* Model.ModelName
      const model = yield* DecisionModel.DecisionModel

      assert.strictEqual(provider, "openrouter")
      assert.strictEqual(modelName, "test/decision-model")
      assert.isDefined(model.decide)
    }).pipe(
      Effect.provide(OpenRouterDecisionModel.model("test/decision-model")),
      Effect.provide(makeClientLayer(() => Effect.die(new Error("Unexpected HTTP request"))))
    ))

  it.effect("sends the encoded input as state and every decision as a question in one request", () =>
    Effect.gen(function*() {
      const requests: Array<HttpClientRequest.HttpClientRequest> = []
      const clientLayer = makeClientLayer((request) => {
        requests.push(request)
        return Effect.succeed(jsonResponse(request, decisionsResponse))
      })

      yield* DecisionModel.decide(TicketTriage, { input: ticket }).pipe(
        Effect.provide(OpenRouterDecisionModel.layer({ model: "test/decision-model" })),
        Effect.provide(clientLayer)
      )

      assert.strictEqual(requests.length, 1)
      assert.strictEqual(requests[0].method, "POST")
      assert.strictEqual(requests[0].url, "https://openrouter.ai/api/alpha/decisions")
      assert.strictEqual(requests[0].headers["authorization"], "Bearer or-test-key")

      assert.strictEqual(requests[0].headers["http-referer"], "https://example.com")
      assert.strictEqual(requests[0].headers["x-title"], "Decision contract tests")

      const body = yield* getRequestBody(requests[0])
      assert.deepStrictEqual(body, {
        state: {
          message: ticket.message,
          orderId: "A-104"
        },
        model: "test/decision-model",
        questions: {
          department: {
            type: "choice",
            instructions: "Which team should handle this",
            criteria: {
              billing: "Payment or subscription issues",
              technical: "Bugs or integration problems",
              sales: "Pricing or account questions"
            }
          },
          frustration: {
            type: "score",
            instructions: "How frustrated the customer appears",
            criteria: ["Calm, just stating facts", "Frustrated but civil", "Very angry, strong language"]
          },
          urgent: {
            type: "noul",
            instructions: "The message conveys urgency or time-sensitivity",
            criteria: {
              false: "No time pressure",
              true: "Needs action now"
            }
          }
        }
      })
    }))

  it.effect("maps choice, score, and noul answers onto classify, rate, and probability answers", () =>
    Effect.gen(function*() {
      const { answers, usage } = yield* DecisionModel.decide(TicketTriage, { input: ticket }).pipe(
        Effect.provide(OpenRouterDecisionModel.layer({ model: "test/decision-model" })),
        Effect.provide(makeClientLayer((request) => Effect.succeed(jsonResponse(request, decisionsResponse))))
      )

      assert.strictEqual(answers.department.label, "billing")
      assert.deepStrictEqual(answers.department.probabilities, { billing: 0.84, technical: 0.159, sales: 0.001 })
      assert.strictEqual(answers.department.confidence, 0.596)

      assert.strictEqual(answers.frustration.rating, 1.6)
      assert.strictEqual(answers.frustration.label, "Very angry, strong language")
      assert.deepStrictEqual(answers.frustration.probabilities, {
        "Calm, just stating facts": 0.05,
        "Frustrated but civil": 0.3,
        "Very angry, strong language": 0.65
      })
      assert.strictEqual(answers.frustration.confidence, 0.78)

      assert.strictEqual(answers.urgent.probability, 0.999)
      assert.isFalse("confidence" in answers.urgent)

      assert.strictEqual(usage.inputTokens, 312)
      assert.strictEqual(usage.outputTokens, 48)
    }))

  it.effect("encodes an explicitly undefined optional input field as JSON null", () =>
    Effect.gen(function*() {
      const requests: Array<HttpClientRequest.HttpClientRequest> = []
      const definition = Decision.make({
        input: Schema.Struct({ message: Schema.String, orderId: Schema.optional(Schema.String) }),
        decisions: TicketTriage.decisions
      })
      const { answers } = yield* DecisionModel.decide(definition, {
        input: { message: ticket.message, orderId: undefined }
      }).pipe(
        Effect.provide(OpenRouterDecisionModel.layer({ model: "test/decision-model" })),
        Effect.provide(makeClientLayer((request) => {
          requests.push(request)
          return Effect.succeed(jsonResponse(request, decisionsResponse))
        }))
      )

      assert.strictEqual(requests.length, 1)
      const body = yield* getRequestBody(requests[0])
      assert.deepStrictEqual(body.state, { message: ticket.message, orderId: null })
      assert.strictEqual(answers.urgent.probability, 0.999)
    }))

  it.effect("sends a pinned model id through unchanged", () =>
    Effect.gen(function*() {
      const requests: Array<HttpClientRequest.HttpClientRequest> = []

      const modelName = yield* Effect.gen(function*() {
        yield* DecisionModel.decide(TicketTriage, { input: ticket })
        return yield* Model.ModelName
      }).pipe(
        Effect.provide(OpenRouterDecisionModel.model("test/decision-model-pinned")),
        Effect.provide(makeClientLayer((request) => {
          requests.push(request)
          return Effect.succeed(jsonResponse(request, { ...decisionsResponse, model: "test/decision-model-pinned" }))
        }))
      )

      const body = yield* getRequestBody(requests[0])
      assert.strictEqual(modelName, "test/decision-model-pinned")
      assert.strictEqual(body.model, "test/decision-model-pinned")
    }))

  it.effect("passes a string input through as a string state", () =>
    Effect.gen(function*() {
      const requests: Array<HttpClientRequest.HttpClientRequest> = []
      const Sentiment = Decision.make({
        input: Schema.String,
        decisions: {
          urgent: Decision.probability({
            instructions: "The message conveys urgency",
            criteria: { false: "No time pressure", true: "Needs action now" }
          })
        }
      })

      yield* DecisionModel.decide(Sentiment, { input: "My card was charged twice." }).pipe(
        Effect.provide(OpenRouterDecisionModel.layer({ model: "test/decision-model" })),
        Effect.provide(makeClientLayer((request) => {
          requests.push(request)
          return Effect.succeed(jsonResponse(request, {
            model: "test/decision-model",
            answers: { urgent: { type: "noul", noul: 0.93 } },
            usage: { input_tokens: 20, output_tokens: 4 }
          }))
        }))
      )

      const body = yield* getRequestBody(requests[0])
      assert.strictEqual(body.state, "My card was charged twice.")
    }))

  it.effect("passes an array input through as an array state", () =>
    Effect.gen(function*() {
      const requests: Array<HttpClientRequest.HttpClientRequest> = []
      const Conversation = Decision.make({
        input: Schema.Array(Schema.String),
        decisions: {
          urgent: Decision.probability({
            instructions: "The message conveys urgency",
            criteria: { false: "No time pressure", true: "Needs action now" }
          })
        }
      })

      yield* DecisionModel.decide(Conversation, {
        input: ["Hi", "My customer number is TS1337.", "My card was charged twice."]
      }).pipe(
        Effect.provide(OpenRouterDecisionModel.layer({ model: "test/decision-model" })),
        Effect.provide(makeClientLayer((request) => {
          requests.push(request)
          return Effect.succeed(jsonResponse(request, {
            model: "test/decision-model",
            answers: { urgent: { type: "noul", noul: 0.93 } },
            usage: { input_tokens: 20, output_tokens: 4 }
          }))
        }))
      )

      const body = yield* getRequestBody(requests[0])
      assert.deepStrictEqual(body.state, ["Hi", "My customer number is TS1337.", "My card was charged twice."])
    }))

  it.effect("fails with InvalidOutputError when an answer type does not match the decision", () =>
    Effect.gen(function*() {
      const error = yield* DecisionModel.decide(TicketTriage, { input: ticket }).pipe(
        Effect.provide(OpenRouterDecisionModel.layer({ model: "test/decision-model" })),
        Effect.provide(makeClientLayer((request) =>
          Effect.succeed(jsonResponse(request, {
            ...decisionsResponse,
            answers: {
              ...decisionsResponse.answers,
              urgent: {
                type: "choice",
                choice: "true",
                probabilities: { true: 0.9, false: 0.1 },
                confidence: 0.8
              }
            }
          }))
        )),
        Effect.flip
      )

      assert.strictEqual(error._tag, "AiError")
      assert.strictEqual(error.reason._tag, "InvalidOutputError")
    }))

  it.effect("fails with InvalidOutputError when an answer is missing", () =>
    Effect.gen(function*() {
      const { urgent: _urgent, ...answers } = decisionsResponse.answers
      const error = yield* DecisionModel.decide(TicketTriage, { input: ticket }).pipe(
        Effect.provide(OpenRouterDecisionModel.layer({ model: "test/decision-model" })),
        Effect.provide(
          makeClientLayer((request) => Effect.succeed(jsonResponse(request, { ...decisionsResponse, answers })))
        ),
        Effect.flip
      )

      assert.strictEqual(error._tag, "AiError")
      assert.strictEqual(error.reason._tag, "InvalidOutputError")
    }))

  it.effect("fails with InvalidOutputError when a score answer omits probabilities", () =>
    Effect.gen(function*() {
      const { probabilities: _probabilities, ...frustration } = decisionsResponse.answers.frustration
      const error = yield* DecisionModel.decide(TicketTriage, { input: ticket }).pipe(
        Effect.provide(OpenRouterDecisionModel.layer({ model: "test/decision-model" })),
        Effect.provide(makeClientLayer((request) =>
          Effect.succeed(jsonResponse(request, {
            ...decisionsResponse,
            answers: { ...decisionsResponse.answers, frustration }
          }))
        )),
        Effect.flip
      )

      assert.strictEqual(error._tag, "AiError")
      assert.strictEqual(error.reason._tag, "InvalidOutputError")
    }))

  it.effect("fails with InvalidOutputError when a score distribution skips a level index", () =>
    Effect.gen(function*() {
      const error = yield* DecisionModel.decide(TicketTriage, { input: ticket }).pipe(
        Effect.provide(OpenRouterDecisionModel.layer({ model: "test/decision-model" })),
        Effect.provide(makeClientLayer((request) =>
          Effect.succeed(jsonResponse(request, {
            ...decisionsResponse,
            answers: {
              ...decisionsResponse.answers,
              frustration: {
                ...decisionsResponse.answers.frustration,
                probabilities: { "0": 0.35, "2": 0.65 }
              }
            }
          }))
        )),
        Effect.flip
      )

      assert.strictEqual(error._tag, "AiError")
      assert.strictEqual(error.reason._tag, "InvalidOutputError")
    }))

  for (
    const [status, reason] of [
      [400, "InvalidRequestError"],
      [401, "AuthenticationError"],
      [402, "UnknownError"],
      [403, "AuthenticationError"],
      [404, "InvalidRequestError"],
      [413, "UnknownError"],
      [429, "RateLimitError"],
      [500, "InternalProviderError"],
      [502, "InternalProviderError"],
      [503, "InternalProviderError"],
      [524, "InternalProviderError"],
      [529, "InternalProviderError"]
    ] as const
  ) {
    it.effect("maps HTTP " + status + " using the existing OpenRouter error mapping", () =>
      Effect.gen(function*() {
        const error = yield* DecisionModel.decide(TicketTriage, { input: ticket }).pipe(
          Effect.provide(OpenRouterDecisionModel.layer({ model: "test/decision-model" })),
          Effect.provide(makeClientLayer((request) =>
            Effect.succeed(HttpClientResponse.fromWeb(
              request,
              new Response(
                JSON.stringify({ error: { message: "Decision request failed", code: status } }),
                { status, headers: { "content-type": "application/json", "retry-after": "3" } }
              )
            ))
          )),
          Effect.flip
        )
        assert.strictEqual(error._tag, "AiError")
        assert.strictEqual(error.reason._tag, reason)
      }))
  }
})

const makeClientLayer = (
  handler: (
    request: HttpClientRequest.HttpClientRequest
  ) => Effect.Effect<HttpClientResponse.HttpClientResponse, HttpClientError.HttpClientError>,
  apiUrl?: string
) =>
  OpenRouterClient.layer({
    apiUrl,
    apiKey: Redacted.make("or-test-key"),
    siteReferrer: "https://example.com",
    siteTitle: "Decision contract tests"
  }).pipe(
    Layer.provide(Layer.succeed(HttpClient.HttpClient, makeHttpClient(handler)))
  )

const makeHttpClient = (
  handler: (
    request: HttpClientRequest.HttpClientRequest
  ) => Effect.Effect<HttpClientResponse.HttpClientResponse, HttpClientError.HttpClientError>
) =>
  HttpClient.makeWith(
    Effect.fnUntraced(function*(requestEffect) {
      const request = yield* requestEffect
      return yield* handler(request)
    }),
    Effect.succeed as HttpClient.HttpClient.Preprocess<HttpClientError.HttpClientError, never>
  )

const jsonResponse = (
  request: HttpClientRequest.HttpClientRequest,
  body: unknown
): HttpClientResponse.HttpClientResponse =>
  HttpClientResponse.fromWeb(
    request,
    new Response(JSON.stringify(body), {
      status: 200,
      headers: {
        "content-type": "application/json"
      }
    })
  )

const getRequestBody = (request: HttpClientRequest.HttpClientRequest) =>
  Effect.gen(function*() {
    const body = request.body
    if (body._tag === "Uint8Array") {
      const text = new TextDecoder().decode(body.body)
      return JSON.parse(text)
    }
    return yield* Effect.die(new Error("Expected Uint8Array body"))
  })
