import { TypeSafeClient, TypeSafeDecisionModel } from "@effect/ai-typesafe"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Layer, Redacted, Schema } from "effect"
import { Decision, DecisionModel, Model } from "effect/ai"
import { HttpClient, type HttpClientError, type HttpClientRequest, HttpClientResponse } from "effect/http"

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

const systemOneResponse = {
  model: "jev-latest",
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

const Structured = Decision.make({
  input: Schema.String,
  decisions: {
    severity: Decision.rate({
      instructions: ["How severe?"],
      criteria: ["Minor", { label: "Critical", description: { impact: "outage" } }]
    })
  }
})

describe("TypeSafeDecisionModel", () => {
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
        Effect.provide(TypeSafeDecisionModel.layer({ model: "jev-latest" })),
        Effect.provide(makeClientLayer((request) =>
          Effect.succeed(jsonResponse(request, {
            model: "jev-latest",
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

  it.effect("normalizes rounded score probabilities", () =>
    Effect.gen(function*() {
      const definition = Decision.make({
        input: Schema.String,
        decisions: { score: Decision.rate({ instructions: "Rate", criteria: ["low", "mid", "high"] }) }
      })
      const { answers } = yield* DecisionModel.decide(definition, { input: "test" }).pipe(
        Effect.provide(TypeSafeDecisionModel.layer({ model: "jev-latest" })),
        Effect.provide(makeClientLayer((request) =>
          Effect.succeed(jsonResponse(request, {
            model: "jev-latest",
            answers: {
              score: { type: "score", score: 1, probabilities: { "0": 0.1, "1": 0.7, "2": 0.19 }, confidence: 0.7 }
            },
            usage: { input_tokens: 1, output_tokens: 1 }
          }))
        ))
      )
      assert.closeTo(Object.values(answers.score.probabilities).reduce((sum, value) => sum + value, 0), 1, 1e-6)
    }))

  it.effect("rejects a distribution outside two-decimal rounding", () =>
    Effect.gen(function*() {
      const definition = Decision.make({
        input: Schema.String,
        decisions: { choice: Decision.classify({ instructions: "Pick", criteria: { a: "A", b: "B" } }) }
      })
      const error = yield* DecisionModel.decide(definition, { input: "test" }).pipe(
        Effect.provide(TypeSafeDecisionModel.layer({ model: "jev-latest" })),
        Effect.provide(makeClientLayer((request) =>
          Effect.succeed(jsonResponse(request, {
            model: "jev-latest",
            answers: { choice: { type: "choice", choice: "a", probabilities: { a: 0.49, b: 0.49 }, confidence: 0.5 } }
          }))
        )),
        Effect.flip
      )
      assert.strictEqual(error.reason._tag, "InvalidOutputError")
    }))

  for (
    const [name, probabilities, reason] of [
      ["out-of-range", { a: 1.01, b: -0.02 }, "InvalidOutputError"],
      ["all-zero", { a: 0, b: 0 }, "InvalidOutputError"],
      ["missing label", { a: 0.5 }, "InvalidOutputError"],
      // `Infinity` serializes as `null`, which the client response schema rejects
      ["non-finite", { a: Infinity, b: 0.5 }, "InvalidResponseError"]
    ] as const
  ) {
    it.effect("rejects " + name + " choice probabilities", () =>
      Effect.gen(function*() {
        const definition = Decision.make({
          input: Schema.String,
          decisions: { choice: Decision.classify({ instructions: "Pick", criteria: { a: "A", b: "B" } }) }
        })
        const error = yield* DecisionModel.decide(definition, { input: "test" }).pipe(
          Effect.provide(TypeSafeDecisionModel.layer({ model: "jev-latest" })),
          Effect.provide(makeClientLayer((request) =>
            Effect.succeed(jsonResponse(request, {
              model: "jev-latest",
              answers: { choice: { type: "choice", choice: "a", probabilities, confidence: 0.5 } }
            }))
          )),
          Effect.flip
        )
        assert.strictEqual(error.reason._tag, reason)
      }))
  }

  it.effect("omits absent probability criteria from the encoded question", () =>
    Effect.gen(function*() {
      const definition = Decision.make({
        input: Schema.String,
        decisions: {
          urgent: Decision.probability({ instructions: "Needs action now" })
        }
      })
      const { answers } = yield* DecisionModel.decide(definition, { input: "Help ASAP" }).pipe(
        Effect.provide(TypeSafeDecisionModel.layer({ model: "jev-latest" })),
        Effect.provide(makeClientLayer((request) =>
          Effect.gen(function*() {
            const { questions } = yield* getRequestBody(request)
            assert.deepStrictEqual(questions.urgent, {
              type: "noul",
              instructions: "Needs action now"
            })

            return jsonResponse(request, {
              model: "jev-latest",
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
          Effect.provide(TypeSafeDecisionModel.layer({ model: "jev-latest" })),
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
                model: "jev-latest",
                answers: {
                  category: {
                    type: "choice",
                    choice: key,
                    probabilities: { [key]: 0.75, ordinary: 0.25 },
                    confidence: 0.5
                  }
                }
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
          Effect.provide(TypeSafeDecisionModel.layer({ model: "jev-latest" })),
          Effect.provide(makeClientLayer((request) =>
            Effect.gen(function*() {
              const { questions } = yield* getRequestBody(request)
              assert.deepStrictEqual(questions.intensity.criteria, ["low", key, "high"])

              return jsonResponse(request, {
                model: "jev-latest",
                answers: {
                  intensity: {
                    type: "score",
                    score: 1.1,
                    legend: { "0": "low", "1": key, "2": "high" },
                    probabilities: { "0": 0.1, "1": 0.7, "2": 0.2 },
                    confidence: 0.5
                  }
                }
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
          Effect.provide(TypeSafeDecisionModel.layer({ model: "jev-latest" })),
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
                model: "jev-latest",
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

  it.effect("model provides DecisionModel with typesafe provider metadata", () =>
    Effect.gen(function*() {
      const provider = yield* Model.ProviderName
      const modelName = yield* Model.ModelName
      const model = yield* DecisionModel.DecisionModel

      assert.strictEqual(provider, "typesafe")
      assert.strictEqual(modelName, "jev-latest")
      assert.isDefined(model.decide)
    }).pipe(
      Effect.provide(TypeSafeDecisionModel.model("jev-latest")),
      Effect.provideService(TypeSafeClient.TypeSafeClient, noopTypeSafeClient)
    ))

  it.effect("sends the encoded input as state and every decision as a question in one request", () =>
    Effect.gen(function*() {
      const requests: Array<HttpClientRequest.HttpClientRequest> = []
      const clientLayer = makeClientLayer((request) => {
        requests.push(request)
        return Effect.succeed(jsonResponse(request, systemOneResponse))
      })

      yield* DecisionModel.decide(TicketTriage, { input: ticket }).pipe(
        Effect.provide(TypeSafeDecisionModel.layer({ model: "jev-latest" })),
        Effect.provide(clientLayer)
      )

      assert.strictEqual(requests.length, 1)
      assert.strictEqual(requests[0].method, "POST")
      assert.strictEqual(requests[0].url, "https://api.typesafe.ai/v1/systemone")
      assert.strictEqual(requests[0].headers["authorization"], "Bearer ts-test-key")

      const body = yield* getRequestBody(requests[0])
      assert.deepStrictEqual(body, {
        state: {
          message: ticket.message,
          orderId: "A-104"
        },
        model: "jev-latest",
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
        Effect.provide(TypeSafeDecisionModel.layer({ model: "jev-latest" })),
        Effect.provide(makeClientLayer((request) => Effect.succeed(jsonResponse(request, systemOneResponse))))
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
        Effect.provide(TypeSafeDecisionModel.layer({ model: "jev-latest" })),
        Effect.provide(makeClientLayer((request) => {
          requests.push(request)
          return Effect.succeed(jsonResponse(request, systemOneResponse))
        }))
      )

      assert.strictEqual(requests.length, 1)
      const body = yield* getRequestBody(requests[0])
      assert.deepStrictEqual(body.state, { message: ticket.message, orderId: null })
      assert.strictEqual(answers.urgent.probability, 0.999)
    }))

  for (
    const { extra, inputTokens, name, outputTokens } of [
      { name: "absent usage", extra: {}, inputTokens: undefined, outputTokens: undefined },
      { name: "empty usage", extra: { usage: {} }, inputTokens: undefined, outputTokens: undefined },
      { name: "input tokens only", extra: { usage: { input_tokens: 312 } }, inputTokens: 312, outputTokens: undefined },
      { name: "output tokens only", extra: { usage: { output_tokens: 48 } }, inputTokens: undefined, outputTokens: 48 }
    ]
  ) {
    it.effect("preserves answers with " + name, () =>
      Effect.gen(function*() {
        const { usage: _usage, ...response } = systemOneResponse
        const { answers, usage } = yield* DecisionModel.decide(TicketTriage, { input: ticket }).pipe(
          Effect.provide(TypeSafeDecisionModel.layer({ model: "jev-latest" })),
          Effect.provide(makeClientLayer((request) => Effect.succeed(jsonResponse(request, { ...response, ...extra }))))
        )

        assert.strictEqual(answers.department.label, "billing")
        assert.strictEqual(answers.frustration.rating, 1.6)
        assert.strictEqual(answers.urgent.probability, 0.999)
        assert.strictEqual(usage.inputTokens, inputTokens)
        assert.strictEqual(usage.outputTokens, outputTokens)
      }))
  }

  it.effect("sends a pinned model id through unchanged", () =>
    Effect.gen(function*() {
      const requests: Array<HttpClientRequest.HttpClientRequest> = []

      const modelName = yield* Effect.gen(function*() {
        yield* DecisionModel.decide(TicketTriage, { input: ticket })
        return yield* Model.ModelName
      }).pipe(
        Effect.provide(TypeSafeDecisionModel.model("jev-1.13.0")),
        Effect.provide(makeClientLayer((request) => {
          requests.push(request)
          return Effect.succeed(jsonResponse(request, { ...systemOneResponse, model: "jev-1.13.0" }))
        }))
      )

      const body = yield* getRequestBody(requests[0])
      assert.strictEqual(modelName, "jev-1.13.0")
      assert.strictEqual(body.model, "jev-1.13.0")
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
        Effect.provide(TypeSafeDecisionModel.layer({ model: "jev-latest" })),
        Effect.provide(makeClientLayer((request) => {
          requests.push(request)
          return Effect.succeed(jsonResponse(request, {
            model: "jev-latest",
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
        Effect.provide(TypeSafeDecisionModel.layer({ model: "jev-latest" })),
        Effect.provide(makeClientLayer((request) => {
          requests.push(request)
          return Effect.succeed(jsonResponse(request, {
            model: "jev-latest",
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
        Effect.provide(TypeSafeDecisionModel.layer({ model: "jev-latest" })),
        Effect.provide(makeClientLayer((request) =>
          Effect.succeed(jsonResponse(request, {
            ...systemOneResponse,
            answers: {
              ...systemOneResponse.answers,
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
      const { urgent: _urgent, ...answers } = systemOneResponse.answers
      const error = yield* DecisionModel.decide(TicketTriage, { input: ticket }).pipe(
        Effect.provide(TypeSafeDecisionModel.layer({ model: "jev-latest" })),
        Effect.provide(
          makeClientLayer((request) => Effect.succeed(jsonResponse(request, { ...systemOneResponse, answers })))
        ),
        Effect.flip
      )

      assert.strictEqual(error._tag, "AiError")
      assert.strictEqual(error.reason._tag, "InvalidOutputError")
    }))

  it.effect("fails with a non-retryable InvalidResponseError when a score answer omits probabilities", () =>
    Effect.gen(function*() {
      const { probabilities: _probabilities, ...frustration } = systemOneResponse.answers.frustration
      const error = yield* DecisionModel.decide(TicketTriage, { input: ticket }).pipe(
        Effect.provide(TypeSafeDecisionModel.layer({ model: "jev-latest" })),
        Effect.provide(makeClientLayer((request) =>
          Effect.succeed(jsonResponse(request, {
            ...systemOneResponse,
            answers: { ...systemOneResponse.answers, frustration }
          }))
        )),
        Effect.flip
      )

      assert.strictEqual(error._tag, "AiError")
      assert.strictEqual(error.reason._tag, "InvalidResponseError")
    }))

  it.effect("fails with InvalidOutputError when a score distribution skips a level index", () =>
    Effect.gen(function*() {
      const error = yield* DecisionModel.decide(TicketTriage, { input: ticket }).pipe(
        Effect.provide(TypeSafeDecisionModel.layer({ model: "jev-latest" })),
        Effect.provide(makeClientLayer((request) =>
          Effect.succeed(jsonResponse(request, {
            ...systemOneResponse,
            answers: {
              ...systemOneResponse.answers,
              frustration: {
                ...systemOneResponse.answers.frustration,
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

  it.effect("surfaces client errors through decide", () =>
    Effect.gen(function*() {
      const error = yield* DecisionModel.decide(TicketTriage, { input: ticket }).pipe(
        Effect.provide(TypeSafeDecisionModel.layer({ model: "jev-latest" })),
        Effect.provide(makeClientLayer((request) =>
          Effect.succeed(
            HttpClientResponse.fromWeb(
              request,
              new Response(JSON.stringify({ message: "Rate limit exceeded" }), {
                status: 429,
                headers: { "content-type": "application/json", "retry-after": "3" }
              })
            )
          )
        )),
        Effect.flip
      )

      assert.strictEqual(error._tag, "AiError")
      assert.strictEqual(error.reason._tag, "RateLimitError")
    }))

  it.effect("sends structured descriptions and maps score indices to labels", () =>
    Effect.gen(function*() {
      const result = yield* DecisionModel.decide(Structured, { input: "Checkout is down" })
      assert.strictEqual(result.answers.severity.label, "Critical")
      assert.deepStrictEqual({ ...result.answers.severity.probabilities }, { Minor: 0.1, Critical: 0.9 })
    }).pipe(
      Effect.provide(TypeSafeDecisionModel.layer({ model: "jev-latest" })),
      Effect.provide(makeClientLayer((request) =>
        Effect.gen(function*() {
          const body = yield* getRequestBody(request)
          assert.deepStrictEqual(body.questions, {
            severity: { type: "score", instructions: ["How severe?"], criteria: ["Minor", { impact: "outage" }] }
          })
          return jsonResponse(request, {
            model: "jev-latest",
            answers: {
              severity: {
                type: "score",
                score: 0.9,
                probabilities: { "0": 0.1, "1": 0.9 },
                confidence: 0.9,
                legend: { "0": "Minor", "1": { impact: "outage" } }
              }
            }
          })
        })
      ))
    ))

  describe("images", () => {
    const Listing = Schema.Struct({
      message: Schema.String,
      photo: Decision.Image,
      gallery: Schema.Array(Decision.Image)
    })

    const FindMug = Decision.make({
      input: Listing,
      decisions: {
        present: Decision.probability({ instructions: "`photo` shows a coffee mug" }),
        mug: Decision.locate({ image: "photo", instructions: "the coffee mug" })
      }
    })

    it.effect("sends images as assets keyed by their state references and maps box answers onto locate answers", () => {
      const requests: Array<HttpClientRequest.HttpClientRequest> = []
      const input = {
        message: "Kitchen counter",
        photo: { mediaType: "image/png", data: new Uint8Array([137, 80, 78, 71]) },
        gallery: [
          { mediaType: "image/jpeg", data: "/9j/4AAQ" },
          {
            mediaType: "application/octet-stream",
            data: new URL("data:image/png;base64,iVBORw0KGgo%2B%2FA%3D%3D#preview")
          }
        ]
      }

      return Effect.gen(function*() {
        const { answers } = yield* DecisionModel.decide(FindMug, { input })

        assert.deepStrictEqual(answers, {
          present: { probability: 0.97 },
          mug: { box: { left: 0.44, top: 0.25, right: 0.84, bottom: 0.82 }, confidence: 0.92 }
        })
        const body = yield* getRequestBody(requests[0])
        const [photo, jpeg, dataUrl] = [body.state.photo, ...body.state.gallery]
        assert.deepStrictEqual(body, {
          model: "jev-preview",
          state: { message: "Kitchen counter", photo, gallery: [jpeg, dataUrl] },
          questions: {
            present: { type: "noul", instructions: "`photo` shows a coffee mug" },
            mug: { type: "box", instructions: "the coffee mug in `photo`" }
          },
          assets: {
            [photo]: { type: "image", format: "png", data_base64: "iVBORw==" },
            [jpeg]: { type: "image", format: "jpg", data_base64: "/9j/4AAQ" },
            [dataUrl]: { type: "image", format: "png", data_base64: "iVBORw0KGgo+/A==" }
          }
        })
      }).pipe(
        Effect.provide(TypeSafeDecisionModel.layer({ model: "jev-preview" })),
        Effect.provide(makeClientLayer((request) => {
          requests.push(request)
          return Effect.succeed(jsonResponse(request, {
            model: "jev-1.14.0",
            answers: {
              present: { type: "noul", noul: 0.97 },
              mug: { type: "box", box: { top: 0.25, bottom: 0.82, left: 0.44, right: 0.84 }, confidence: 0.92 }
            },
            usage: { input_tokens: 290, output_tokens: 21 }
          }))
        }))
      )
    })

    for (
      const [name, image] of [
        ["a remote URL", { mediaType: "image/png", data: new URL("https://example.com/mug.png") }],
        ["a data URL without base64", { mediaType: "image/png", data: new URL("data:image/png,%89PNG") }],
        ["a WebP image", { mediaType: "image/webp", data: "UklGRg==" }]
      ] as const
    ) {
      it.effect("rejects " + name + " with InvalidUserInputError before sending", () =>
        Effect.gen(function*() {
          const error = yield* DecisionModel.decide(FindMug, { input: { message: "", photo: image, gallery: [] } })
            .pipe(
              Effect.flip
            )
          assert.strictEqual(error.reason._tag, "InvalidUserInputError")
        }).pipe(
          Effect.provide(TypeSafeDecisionModel.layer({ model: "jev-preview" })),
          Effect.provide(makeClientLayer(() => Effect.die(new Error("Invalid images must not be sent"))))
        ))
    }
  })
})
const makeClientLayer = (
  handler: (
    request: HttpClientRequest.HttpClientRequest
  ) => Effect.Effect<HttpClientResponse.HttpClientResponse, HttpClientError.HttpClientError>
) =>
  TypeSafeClient.layer({ apiKey: Redacted.make("ts-test-key") }).pipe(
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

const getRequestBody = Effect.fnUntraced(function*(request: HttpClientRequest.HttpClientRequest) {
  const body = request.body
  if (body._tag === "Uint8Array") {
    const text = new TextDecoder().decode(body.body)
    return JSON.parse(text)
  }
  return yield* Effect.die(new Error("Expected Uint8Array body"))
})

const noopTypeSafeClient: TypeSafeClient.Service = {
  client: undefined as unknown as TypeSafeClient.Service["client"],
  systemOne: () => Effect.die(new Error("noop")),
  listModels: () => Effect.die(new Error("noop"))
}
