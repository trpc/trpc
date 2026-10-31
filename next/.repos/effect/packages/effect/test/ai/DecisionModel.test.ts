import { assert, describe, it } from "@effect/vitest"
import { Context, Effect, Layer, Result, Schema, SchemaGetter } from "effect"
import { Decision, DecisionModel, Model } from "effect/ai"
import * as AiError from "effect/ai/AiError"

const Ticket = Schema.Struct({
  subject: Schema.String,
  priority: Schema.FiniteFromString
})

const TicketTriage = Decision.make({
  input: Ticket,
  decisions: {
    department: Decision.classify({
      instructions: "Which team should handle this",
      criteria: {
        billing: "payments",
        technical: "bugs",
        sales: "pricing"
      }
    }),
    frustration: Decision.rate({
      instructions: "How frustrated",
      criteria: ["calm", "frustrated", "angry"]
    }),
    urgent: Decision.probability({
      instructions: "The message is time-sensitive",
      criteria: {
        false: "No time pressure",
        true: "Needs action now"
      }
    })
  }
})

const ticket = { subject: "Card was charged twice", priority: 3 }

const expectedAnswers: Decision.Answers<typeof TicketTriage.decisions> = {
  department: {
    label: "billing",
    probabilities: { billing: 0.8, technical: 0.15, sales: 0.05 },
    confidence: 0.8
  },
  frustration: {
    rating: 1.4,
    label: "frustrated",
    probabilities: { calm: 0.1, frustrated: 0.5, angry: 0.4 },
    confidence: 0.5
  },
  urgent: {
    probability: 0.9
  }
}

const triageAnswers = {
  department: { _tag: "Classify" as const, ...expectedAnswers.department },
  frustration: { _tag: "Rate" as const, ...expectedAnswers.frustration },
  urgent: { _tag: "Probability" as const, ...expectedAnswers.urgent }
}

const makeLayer = (
  decide: (
    options: DecisionModel.ProviderOptions
  ) => Effect.Effect<DecisionModel.ProviderResponse, AiError.AiError>
) =>
  Layer.effect(
    DecisionModel.DecisionModel,
    DecisionModel.make({ decide })
  )

const succeedWith = (
  answers: DecisionModel.ProviderResponse["answers"],
  usage: DecisionModel.ProviderResponse["usage"] = { inputTokens: undefined, outputTokens: undefined }
) => makeLayer(() => Effect.succeed({ answers, usage }))

const failureOf = <A, E>(effect: Effect.Effect<A, E, DecisionModel.DecisionModel>) =>
  effect.pipe(Effect.match({ onFailure: (error) => error, onSuccess: () => undefined }))

const unanswered = (outcome: Result.Result<unknown, Decision.Unanswered>) => {
  assert.isTrue(Result.isFailure(outcome))
  return Result.isFailure(outcome) ? outcome.failure : undefined
}

const Scene = Schema.Struct({
  photo: Decision.Image,
  frames: Schema.Array(Schema.Struct({ frame: Decision.Image }))
})

const FindMug = Decision.make({
  input: Scene,
  decisions: {
    mug: Decision.locate({ image: "photo", instructions: "the coffee mug" })
  }
})

const png: DecisionModel.Image = { mediaType: "image/png", data: "iVBORw0KGgo=" }

const scene = { photo: png, frames: [{ frame: png }] }

const locateWith = (
  mug: unknown,
  onCall: (options: DecisionModel.ProviderOptions) => void = () => {}
) =>
  Layer.effect(
    DecisionModel.DecisionModel,
    DecisionModel.make({
      supportsImages: true,
      supportsLocate: true,
      decide: (options) => {
        onCall(options)
        return Effect.succeed({
          answers: { mug: mug as DecisionModel.ProviderAnswer },
          usage: { inputTokens: undefined, outputTokens: undefined }
        })
      }
    })
  )

class Redactor extends Context.Service<Redactor, {
  readonly redact: (value: string) => string
}>()("Redactor") {}

const RedactedString = Schema.String.pipe(
  Schema.decodeTo(Schema.String, {
    decode: SchemaGetter.passthrough(),
    encode: SchemaGetter.transformEffect<string, string, Redactor>((value) =>
      Effect.map(Effect.service(Redactor), (redactor) => redactor.redact(value))
    )
  })
)

describe("Decision", () => {
  it("make keeps the input schema and decisions", () => {
    assert.strictEqual(TicketTriage.input, Ticket)
    assert.deepStrictEqual(Object.keys(TicketTriage.decisions), ["department", "frustration", "urgent"])
    assert.strictEqual(TicketTriage.decisions.department._tag, "Classify")
    assert.strictEqual(TicketTriage.decisions.frustration._tag, "Rate")
    assert.strictEqual(TicketTriage.decisions.urgent._tag, "Probability")
  })

  it("constructors keep instructions and criteria", () => {
    assert.strictEqual(TicketTriage.decisions.department.instructions, "Which team should handle this")
    assert.deepStrictEqual(TicketTriage.decisions.department.criteria, {
      billing: "payments",
      technical: "bugs",
      sales: "pricing"
    })
    assert.deepStrictEqual(TicketTriage.decisions.frustration.criteria, [
      { label: "calm", description: "calm" },
      { label: "frustrated", description: "frustrated" },
      { label: "angry", description: "angry" }
    ])
    assert.deepStrictEqual(TicketTriage.decisions.urgent.criteria, {
      false: "No time pressure",
      true: "Needs action now"
    })
  })

  it("probability accepts omitted criteria", () => {
    const decision = Decision.probability({ instructions: "Needs action now" })

    assert.strictEqual(decision._tag, "Probability")
    assert.strictEqual(decision.instructions, "Needs action now")
    assert.strictEqual(decision.criteria, undefined)
  })

  it("probability preserves explicit criteria, including empty descriptions", () => {
    const criteria = { false: "", true: "Needs action now" }
    const decision = Decision.probability({ instructions: "Is urgent", criteria })

    assert.strictEqual(decision.instructions, "Is urgent")
    assert.strictEqual(decision.criteria, criteria)
  })

  it("make fails on empty decisions", () => {
    assert.throws(() => Decision.make({ input: Schema.String, decisions: {} }))
  })

  it("rate fails with fewer than two criteria", () => {
    assert.throws(() => Decision.rate({ instructions: "How much", criteria: ["only"] as any }))
  })
})

describe("DecisionModel", () => {
  it.effect("probability without criteria reaches the provider and returns an answer", () => {
    const definition = Decision.make({
      input: Schema.String,
      decisions: {
        urgent: Decision.probability({ instructions: "Needs action now" })
      }
    })
    const calls: Array<DecisionModel.ProviderOptions> = []

    return Effect.gen(function*() {
      const { answers } = yield* DecisionModel.decide(definition, { input: "Help now" })

      assert.strictEqual(calls.length, 1)
      assert.strictEqual(calls[0].state, "Help now")
      assert.strictEqual(calls[0].decisions, definition.decisions)
      assert.strictEqual((calls[0].decisions.urgent as Decision.Probability).criteria, undefined)
      assert.deepStrictEqual(answers, { urgent: { probability: 0.9 } })
    }).pipe(
      Effect.provide(makeLayer((options) => {
        calls.push(options)
        return Effect.succeed({
          answers: { urgent: triageAnswers.urgent },
          usage: { inputTokens: undefined, outputTokens: undefined }
        })
      }))
    )
  })

  for (const key of ["__proto__", "constructor", "toString"]) {
    it.effect("preserves the own enumerable rate probability " + key, () => {
      const definition = Decision.make({
        input: Schema.String,
        decisions: {
          intensity: Decision.rate({
            instructions: "How intense",
            criteria: ["low", key, "high"]
          })
        }
      })

      return Effect.gen(function*() {
        const { answers } = yield* DecisionModel.decide(definition, { input: "Help" })
        const { label, probabilities, rating } = answers.intensity

        assert.isTrue(Object.hasOwn(probabilities, key))
        assert.isTrue(Object.getOwnPropertyDescriptor(probabilities, key)?.enumerable)
        assert.deepStrictEqual(Object.keys(probabilities), ["low", key, "high"])
        assert.deepStrictEqual(probabilities, { low: 0.1, [key]: 0.7, high: 0.2 })
        assert.strictEqual(label, key)
        assert.strictEqual(rating, 1.1)
        assert.strictEqual(Object.getPrototypeOf(probabilities), null)
      }).pipe(Effect.provide(succeedWith({
        intensity: { _tag: "Rate", rating: 1.1, probabilities: { low: 0.1, [key]: 0.7, high: 0.2 } }
      })))
    })

    it.effect("preserves the own enumerable answer key " + key, () => {
      const definition = Decision.make({
        input: Schema.String,
        decisions: {
          [key]: Decision.probability({
            instructions: "Needs action now",
            criteria: { false: "No", true: "Yes" }
          })
        }
      })

      return Effect.gen(function*() {
        const { answers } = yield* DecisionModel.decide(definition, { input: "Help" })

        assert.strictEqual(Object.getPrototypeOf(answers), null)
        assert.isTrue(Object.hasOwn(answers, key))
        assert.isTrue(Object.getOwnPropertyDescriptor(answers, key)?.enumerable)
        assert.deepStrictEqual(Object.keys(answers), [key])
        assert.deepStrictEqual(answers[key], { probability: 0.75 })
      }).pipe(Effect.provide(succeedWith({ [key]: { _tag: "Probability", probability: 0.75 } })))
    })

    it.effect("preserves the own enumerable classification probability " + key, () => {
      const definition = Decision.make({
        input: Schema.String,
        decisions: {
          category: Decision.classify({
            instructions: "Choose a category",
            criteria: { [key]: "Special category", ordinary: "Ordinary category" }
          })
        }
      })

      return Effect.gen(function*() {
        const { answers } = yield* DecisionModel.decide(definition, { input: "Help" })
        const probabilities = answers.category.probabilities

        assert.strictEqual(Object.getPrototypeOf(probabilities), null)
        assert.isTrue(Object.hasOwn(probabilities, key))
        assert.isTrue(Object.getOwnPropertyDescriptor(probabilities, key)?.enumerable)
        assert.deepStrictEqual(Object.keys(probabilities), [key, "ordinary"])
        assert.strictEqual(probabilities[key], 0.75)
        assert.strictEqual(probabilities.ordinary, 0.25)
        assert.strictEqual(answers.category.label, key)
      }).pipe(Effect.provide(succeedWith({
        category: { _tag: "Classify", label: key, probabilities: { [key]: 0.75, ordinary: 0.25 } }
      })))
    })
  }

  it.effect("round trips usage with undefined tokens through JSON", () =>
    Effect.gen(function*() {
      const usage = new DecisionModel.DecisionUsage({ inputTokens: undefined, outputTokens: undefined })

      const encoded = yield* Schema.encodeEffect(DecisionModel.DecisionUsage)(usage)
      const json = JSON.parse(JSON.stringify(encoded))
      const decoded = yield* Schema.decodeUnknownEffect(DecisionModel.DecisionUsage)(json)

      assert.deepStrictEqual(json, {}, "encoded JSON")
      assert.deepStrictEqual(decoded, new DecisionModel.DecisionUsage({}), "decoded usage")
    }))

  it.effect("decide returns answers keyed by decision with usage", () =>
    Effect.gen(function*() {
      const { answers, metadata, usage } = yield* DecisionModel.decide(TicketTriage, { input: ticket })

      assert.deepStrictEqual(Object.keys(answers).sort(), ["department", "frustration", "urgent"])

      assert.strictEqual(answers.department.label, "billing")
      assert.deepStrictEqual(answers.department.probabilities, { billing: 0.8, technical: 0.15, sales: 0.05 })
      assert.strictEqual(answers.department.confidence, 0.8)

      assert.strictEqual(answers.frustration.rating, 1.4)
      assert.strictEqual(answers.frustration.label, "frustrated")
      assert.deepStrictEqual(answers.frustration.probabilities, { calm: 0.1, frustrated: 0.5, angry: 0.4 })
      assert.strictEqual(answers.frustration.confidence, 0.5)

      assert.strictEqual(answers.urgent.probability, 0.9)
      assert.isFalse("confidence" in answers.urgent)
      assert.isFalse("probabilities" in answers.urgent)

      assert.strictEqual(usage.inputTokens, 12)
      assert.strictEqual(usage.outputTokens, undefined)
      assert.deepStrictEqual(metadata, {})
    }).pipe(
      Effect.provide(succeedWith(triageAnswers, { inputTokens: 12, outputTokens: undefined }))
    ))

  it.effect("decide returns the provider's response id, model id and metadata", () =>
    Effect.gen(function*() {
      const response = yield* DecisionModel.decide(TicketTriage, { input: ticket })

      assert.strictEqual(response.id, "decision-1")
      assert.strictEqual(response.modelId, "provider/model-2026")
      assert.deepStrictEqual(response.metadata, { provider: { cost: 0.002 } })
    }).pipe(
      Effect.provide(makeLayer(() =>
        Effect.succeed({
          answers: triageAnswers,
          usage: { inputTokens: 12, outputTokens: 3 },
          id: "decision-1",
          modelId: "provider/model-2026",
          metadata: { provider: { cost: 0.002 } }
        })
      ))
    ))

  it.effect("classify and rate retain distributions when the provider omits confidence", () =>
    Effect.gen(function*() {
      const { answers } = yield* DecisionModel.decide(TicketTriage, { input: ticket })

      assert.deepStrictEqual(answers.department, {
        label: "billing",
        probabilities: { billing: 0.8, technical: 0.15, sales: 0.05 }
      })
      assert.isFalse("confidence" in answers.department)

      assert.deepStrictEqual(answers.frustration, {
        rating: 1.4,
        label: "frustrated",
        probabilities: { calm: 0.1, frustrated: 0.5, angry: 0.4 }
      })
      assert.isFalse("confidence" in answers.frustration)
    }).pipe(
      Effect.provide(succeedWith({
        department: {
          _tag: "Classify",
          label: "billing",
          probabilities: { billing: 0.8, technical: 0.15, sales: 0.05 }
        },
        frustration: {
          _tag: "Rate",
          rating: 1.4,
          probabilities: { calm: 0.1, frustrated: 0.5, angry: 0.4 }
        },
        urgent: triageAnswers.urgent
      }))
    ))

  it.effect("the service exposes the same decide operation", () =>
    Effect.gen(function*() {
      const model = yield* DecisionModel.DecisionModel
      const { answers } = yield* model.decide(TicketTriage, { input: ticket })

      assert.strictEqual(answers.department.label, "billing")
      assert.strictEqual(answers.urgent.probability, 0.9)
    }).pipe(
      Effect.provide(succeedWith(triageAnswers))
    ))

  it.effect("the provider receives the encoded input as state and every decision in one call", () => {
    const calls: Array<DecisionModel.ProviderOptions> = []

    return Effect.gen(function*() {
      yield* DecisionModel.decide(TicketTriage, { input: ticket })

      assert.strictEqual(calls.length, 1)
      assert.deepStrictEqual(calls[0].state, { subject: "Card was charged twice", priority: "3" })
      assert.strictEqual(calls[0].decisions, TicketTriage.decisions)
    }).pipe(
      Effect.provide(
        makeLayer((options) => {
          calls.push(options)
          return Effect.succeed({
            answers: triageAnswers,
            usage: { inputTokens: undefined, outputTokens: undefined }
          })
        })
      )
    )
  })

  it.effect("replaces input images with references and sends each distinct image once", () => {
    const calls: Array<DecisionModel.ProviderOptions> = []
    const Describe = Decision.make({
      input: Scene,
      decisions: { urgent: Decision.probability({ instructions: "`photo` shows a fire" }) }
    })
    const bytes: DecisionModel.Image = { mediaType: "image/png", data: new Uint8Array([137, 80, 78, 71]) }
    const remote: DecisionModel.Image = { mediaType: "image/webp", data: new URL("https://example.com/image.webp") }

    return Effect.gen(function*() {
      yield* DecisionModel.decide(Describe, { input: { photo: bytes, frames: [{ frame: bytes }, { frame: remote }] } })

      const [first, second] = calls[0].images ?? []
      assert.deepStrictEqual(calls[0].state, {
        photo: first.reference,
        frames: [{ frame: first.reference }, { frame: second.reference }]
      })
      assert.notStrictEqual(first.reference, second.reference)
      assert.deepStrictEqual(calls[0].images, [
        { reference: first.reference, path: ["photo"], image: { mediaType: "image/png", data: "iVBORw==" } },
        {
          reference: second.reference,
          path: ["frames", 1, "frame"],
          image: { mediaType: "image/webp", data: new URL("https://example.com/image.webp") }
        }
      ])
    }).pipe(
      Effect.provide(Layer.effect(
        DecisionModel.DecisionModel,
        DecisionModel.make({
          supportsImages: true,
          decide: (options) => {
            calls.push(options)
            return Effect.succeed({
              answers: { urgent: { _tag: "Probability", probability: 0.9 } },
              usage: { inputTokens: undefined, outputTokens: undefined }
            })
          }
        })
      ))
    )
  })

  for (const supportsImages of [undefined, false]) {
    it.effect(
      `rejects images with InvalidUserInputError when supportsImages is ${supportsImages}`,
      () =>
        Effect.gen(function*() {
          const error = yield* failureOf(DecisionModel.decide(FindMug, { input: scene }))

          assert.isTrue(AiError.isAiError(error))
          assert.strictEqual(error?.reason._tag, "InvalidUserInputError")
        }).pipe(Effect.provide(Layer.effect(
          DecisionModel.DecisionModel,
          DecisionModel.make({
            supportsImages,
            decide: () => Effect.die("A text-only provider must not be called with images")
          })
        )))
    )
  }

  it.effect("omits images for an input without image fields", () =>
    Effect.gen(function*() {
      const { answers } = yield* DecisionModel.decide(TicketTriage, { input: ticket })

      assert.strictEqual(answers.urgent.probability, 0.9)
    }).pipe(Effect.provide(makeLayer((options) => {
      assert.isFalse("images" in options)
      return Effect.succeed({ answers: triageAnswers, usage: { inputTokens: undefined, outputTokens: undefined } })
    }))))

  it.effect("forwards locate decisions to a locate-capable provider and returns a copy of the box", () => {
    const calls: Array<DecisionModel.ProviderOptions> = []
    const box = { left: 0.44, top: 0.25, right: 0.84, bottom: 0.82 }

    return Effect.gen(function*() {
      const { answers } = yield* DecisionModel.decide(FindMug, { input: scene })

      assert.strictEqual(calls[0].decisions, FindMug.decisions)
      assert.deepStrictEqual(answers, { mug: { box, confidence: 0.92 } })
    }).pipe(Effect.provide(locateWith(
      { _tag: "Locate", box: { ...box, extra: 1 }, confidence: 0.92, extra: "discard" },
      (options) => calls.push(options)
    )))
  })

  for (
    const [name, supportsLocate, definition] of [
      ["a provider without supportsLocate", undefined, FindMug],
      [
        "a path past the end of an array",
        true,
        Decision.make({
          input: Scene,
          decisions: { mug: Decision.locate({ image: "frames[1].frame", instructions: "the coffee mug" }) }
        })
      ]
    ] as const
  ) {
    it.effect(`rejects locate decisions with InvalidUserInputError for ${name}`, () =>
      Effect.gen(function*() {
        const error = yield* failureOf(
          DecisionModel.decide<typeof Scene, { mug: Decision.Locate }>(definition, { input: scene })
        )

        assert.strictEqual(error?.reason._tag, "InvalidUserInputError")
      }).pipe(Effect.provide(Layer.effect(
        DecisionModel.DecisionModel,
        DecisionModel.make({
          supportsImages: true,
          supportsLocate,
          decide: () => Effect.die("A rejected locate decision must not reach the provider")
        })
      ))))
  }

  it.effect("decideSettled rejects a locate decision for a provider without supportsLocate", () =>
    Effect.gen(function*() {
      const error = yield* failureOf(DecisionModel.decideSettled(FindMug, { input: scene }))

      assert.strictEqual(error?.reason._tag, "InvalidUserInputError")
      assert.strictEqual(error?.method, "decideSettled")
    }).pipe(Effect.provide(Layer.effect(
      DecisionModel.DecisionModel,
      DecisionModel.make({
        supportsImages: true,
        decide: () => Effect.die("A rejected locate decision must not reach the provider")
      })
    ))))

  it.effect("a string input is passed to the provider as a string state", () => {
    const states: Array<unknown> = []
    const Sentiment = Decision.make({
      input: Schema.String,
      decisions: {
        tone: Decision.classify({
          instructions: "Tone of the message",
          criteria: { positive: "happy", negative: "unhappy" }
        })
      }
    })

    return Effect.gen(function*() {
      const { answers } = yield* DecisionModel.decide(Sentiment, { input: "I love this" })

      assert.deepStrictEqual(states, ["I love this"])
      assert.strictEqual(answers.tone.label, "positive")
    }).pipe(
      Effect.provide(
        makeLayer(({ state }) => {
          states.push(state)
          return Effect.succeed({
            answers: {
              tone: {
                _tag: "Classify" as const,
                label: "positive",
                probabilities: { positive: 0.95, negative: 0.05 },
                confidence: 0.95
              }
            },
            usage: { inputTokens: undefined, outputTokens: undefined }
          })
        })
      )
    )
  })

  it.effect("derives JSON codecs for nested input before calling the provider", () => {
    const states: Array<unknown> = []
    const definition = Decision.make({
      input: Schema.Struct({
        amount: Schema.BigInt,
        createdAt: Schema.Date,
        priority: Schema.FiniteFromString,
        values: Schema.Array(Schema.BigInt)
      }),
      decisions: TicketTriage.decisions
    })

    return Effect.gen(function*() {
      yield* DecisionModel.decide(definition, {
        input: { amount: 42n, createdAt: new Date("2026-01-01T00:00:00.000Z"), priority: 3, values: [1n, 2n] }
      })

      assert.deepStrictEqual(states, [{
        amount: "42",
        createdAt: "2026-01-01T00:00:00.000Z",
        priority: "3",
        values: ["1", "2"]
      }])
    }).pipe(Effect.provide(makeLayer(({ state }) => {
      states.push(state)
      return Effect.succeed({ answers: triageAnswers, usage: { inputTokens: undefined, outputTokens: undefined } })
    })))
  })

  it.effect("JSON encoding distinguishes absent optional fields from explicit undefined", () => {
    const states: Array<unknown> = []
    const definition = Decision.make({
      input: Schema.Struct({ note: Schema.optional(Schema.String) }),
      decisions: TicketTriage.decisions
    })

    return Effect.gen(function*() {
      yield* DecisionModel.decide(definition, { input: {} })
      yield* DecisionModel.decide(definition, { input: { note: undefined } })

      assert.deepStrictEqual(states, [{}, { note: null }])
    }).pipe(Effect.provide(makeLayer(({ state }) => {
      states.push(state)
      return Effect.succeed({ answers: triageAnswers, usage: { inputTokens: undefined, outputTokens: undefined } })
    })))
  })

  it.effect("JSON codec encoding failures become InvalidUserInputError before the provider runs", () => {
    let calls = 0
    const definition = Decision.make({
      input: Schema.declare<Date>((value): value is Date => value instanceof Date),
      decisions: TicketTriage.decisions
    })

    return Effect.gen(function*() {
      const error = yield* failureOf(DecisionModel.decide(definition, { input: new Date("2026-01-01") }))

      assert.strictEqual(calls, 0)
      assert.isTrue(AiError.isAiError(error))
      assert.strictEqual(error?.reason._tag, "InvalidUserInputError")
    }).pipe(Effect.provide(makeLayer(() => {
      calls++
      return Effect.succeed({ answers: triageAnswers, usage: { inputTokens: undefined, outputTokens: undefined } })
    })))
  })

  it.effect("input encoding services are resolved from the environment", () => {
    const states: Array<unknown> = []
    const Redacted = Decision.make({
      input: Schema.Struct({ body: RedactedString }),
      decisions: {
        urgent: Decision.probability({
          instructions: "Needs action now",
          criteria: { false: "No", true: "Yes" }
        })
      }
    })

    return Effect.gen(function*() {
      yield* DecisionModel.decide(Redacted, { input: { body: "call me at 555-0100" } })

      assert.deepStrictEqual(states, [{ body: "call me at [redacted]" }])
    }).pipe(
      Effect.provide(
        makeLayer(({ state }) => {
          states.push(state)
          return Effect.succeed({
            answers: { urgent: { _tag: "Probability" as const, probability: 0.5 } },
            usage: { inputTokens: undefined, outputTokens: undefined }
          })
        })
      ),
      Effect.provideService(Redactor, {
        redact: (value) => value.replace(/\d{3}-\d{4}/g, "[redacted]")
      })
    )
  })

  it.effect("input encoding failures surface as AiError", () => {
    let calls = 0
    const Strict = Decision.make({
      input: Schema.String.check(Schema.isMinLength(3)),
      decisions: {
        urgent: Decision.probability({
          instructions: "Needs action now",
          criteria: { false: "No", true: "Yes" }
        })
      }
    })

    return Effect.gen(function*() {
      const error = yield* failureOf(DecisionModel.decide(Strict, { input: "hi" }))

      assert.strictEqual(calls, 0)
      assert.isTrue(AiError.isAiError(error))
      assert.strictEqual(error?.reason._tag, "InvalidUserInputError")
    }).pipe(
      Effect.provide(
        makeLayer(() => {
          calls++
          return Effect.die("provider should not be called")
        })
      )
    )
  })

  it.effect("provider AiError propagates through decide and decideSettled", () => {
    const error = AiError.make({
      module: "DecisionModelTest",
      method: "decide",
      reason: new AiError.UnknownError({ description: "boom" })
    })

    return Effect.gen(function*() {
      assert.strictEqual(yield* failureOf(DecisionModel.decide(TicketTriage, { input: ticket })), error)
      assert.strictEqual(yield* failureOf(DecisionModel.decideSettled(TicketTriage, { input: ticket })), error)
    }).pipe(
      Effect.provide(makeLayer(() => Effect.fail(error)))
    )
  })

  it.effect("decide fails with InvalidOutputError when an answer is missing", () =>
    Effect.gen(function*() {
      const error = yield* failureOf(DecisionModel.decide(TicketTriage, { input: ticket }))

      assert.strictEqual(error?.reason._tag, "InvalidOutputError")
    }).pipe(
      Effect.provide(succeedWith({
        department: triageAnswers.department,
        frustration: triageAnswers.frustration
      }))
    ))

  it.effect("decide fails with InvalidOutputError when a classify label is not a criteria key", () =>
    Effect.gen(function*() {
      const error = yield* failureOf(DecisionModel.decide(TicketTriage, { input: ticket }))

      assert.strictEqual(error?.reason._tag, "InvalidOutputError")
    }).pipe(
      Effect.provide(succeedWith({
        ...triageAnswers,
        department: { ...triageAnswers.department, label: "legal" }
      }))
    ))

  it.effect("decide fails with InvalidOutputError when a classify distribution is incomplete", () =>
    Effect.gen(function*() {
      const error = yield* failureOf(DecisionModel.decide(TicketTriage, { input: ticket }))

      assert.strictEqual(error?.reason._tag, "InvalidOutputError")
    }).pipe(
      Effect.provide(succeedWith({
        ...triageAnswers,
        department: { ...triageAnswers.department, probabilities: { billing: 1 } }
      }))
    ))

  it.effect("decide fails with InvalidOutputError when a rate distribution is incomplete", () =>
    Effect.gen(function*() {
      const error = yield* failureOf(DecisionModel.decide(TicketTriage, { input: ticket }))

      assert.strictEqual(error?.reason._tag, "InvalidOutputError")
    }).pipe(
      Effect.provide(succeedWith({
        ...triageAnswers,
        frustration: { ...triageAnswers.frustration, probabilities: { calm: 0.5, angry: 0.5 } }
      }))
    ))

  it.effect("decide fails with InvalidOutputError when a probability is outside [0, 1]", () =>
    Effect.gen(function*() {
      const error = yield* failureOf(DecisionModel.decide(TicketTriage, { input: ticket }))

      assert.strictEqual(error?.reason._tag, "InvalidOutputError")
    }).pipe(
      Effect.provide(succeedWith({
        ...triageAnswers,
        urgent: { _tag: "Probability" as const, probability: 1.5 }
      }))
    ))

  it.effect("decideSettled keeps valid answers beside refused and missing decisions", () =>
    Effect.gen(function*() {
      const { outcomes, usage } = yield* DecisionModel.decideSettled(TicketTriage, { input: ticket })

      assert.deepStrictEqual(Object.keys(outcomes).sort(), ["department", "frustration", "urgent"])
      assert.deepStrictEqual(outcomes.frustration, Result.succeed(expectedAnswers.frustration))
      assert.strictEqual(unanswered(outcomes.department)?.reason, "Refused")
      assert.deepStrictEqual(unanswered(outcomes.urgent), {
        _tag: "Unanswered",
        reason: "Missing",
        description: "Provider returned no answer for decision \"urgent\""
      })
      assert.strictEqual(usage.inputTokens, 12)
    }).pipe(
      Effect.provide(succeedWith({
        department: { _tag: "Refusal" },
        frustration: triageAnswers.frustration
      }, { inputTokens: 12, outputTokens: undefined }))
    ))

  for (
    const [name, key, answer, reason, description] of [
      [
        "an unknown label is Invalid even without probabilities",
        "department",
        { _tag: "Classify", label: "legal" },
        "Invalid",
        "Provider returned an unknown label for decision \"department\""
      ],
      [
        "a classify answer without probabilities is NoDistribution",
        "department",
        { _tag: "Classify", label: "billing" },
        "NoDistribution",
        "Provider returned no probabilities for decision \"department\""
      ],
      [
        "a rate answer without probabilities is NoDistribution",
        "frustration",
        { _tag: "Rate", rating: 1 },
        "NoDistribution",
        "Provider returned no probabilities for decision \"frustration\""
      ],
      [
        "an incomplete distribution is Invalid",
        "department",
        { _tag: "Classify", label: "billing", probabilities: { billing: 1 } },
        "Invalid",
        "Provider returned no probability for label \"technical\" of decision \"department\""
      ]
    ] as const
  ) {
    it.effect(`${name}, with the description strict decide fails with`, () =>
      Effect.gen(function*() {
        const { outcomes } = yield* DecisionModel.decideSettled(TicketTriage, { input: ticket })
        const error = yield* failureOf(DecisionModel.decide(TicketTriage, { input: ticket }))

        assert.deepStrictEqual(unanswered(outcomes[key]), { _tag: "Unanswered", reason, description })
        assert.strictEqual(error?.reason._tag === "InvalidOutputError" && error.reason.description, description)
      }).pipe(
        Effect.provide(succeedWith({ ...triageAnswers, [key]: answer }))
      ))
  }

  it.effect("decide fails with ContentPolicyError for a refusal before reporting earlier invalid answers", () =>
    Effect.gen(function*() {
      const error = yield* failureOf(DecisionModel.decide(TicketTriage, { input: ticket }))

      assert.strictEqual(error?.reason._tag, "ContentPolicyError")
    }).pipe(
      Effect.provide(succeedWith({
        ...triageAnswers,
        department: { ...triageAnswers.department, label: "legal" },
        frustration: { _tag: "Refusal" }
      }))
    ))

  it.effect("Model.make wraps a DecisionModel layer with provider metadata", () =>
    Effect.gen(function*() {
      const provider = yield* Model.ProviderName
      const modelName = yield* Model.ModelName
      const { answers } = yield* DecisionModel.decide(TicketTriage, { input: ticket })

      assert.strictEqual(provider, "fake")
      assert.strictEqual(modelName, "fake-decisions")
      assert.strictEqual(answers.department.label, "billing")
    }).pipe(
      Effect.provide(Model.make("fake", "fake-decisions", succeedWith(triageAnswers)))
    ))
})

describe("Decision validation contracts", () => {
  for (const criteria of [{}, { only: "Only label" }] as Array<Record<string, string>>) {
    it(`classify rejects ${Object.keys(criteria).length} labels`, () => {
      assert.throws(() => Decision.classify({ instructions: "Choose", criteria }))
    })
  }

  it("rate rejects duplicate levels", () => {
    assert.throws(() => Decision.rate({ instructions: "Rate", criteria: ["low", "high", "low"] }))
    assert.throws(() =>
      Decision.rate({ instructions: "Rate", criteria: ["low", { label: "low", description: { what: "Also low" } }] })
    )
  })

  it.effect("rate validates and labels answers by the labels of structured levels", () => {
    const definition = Decision.make({
      input: Schema.String,
      decisions: {
        severity: Decision.rate({
          instructions: { question: "How severe?" },
          criteria: ["low", { label: "high", description: { impact: "outage" } }]
        })
      }
    })

    return Effect.gen(function*() {
      const { answers } = yield* DecisionModel.decide(definition, { input: "Export fails" })

      assert.strictEqual(answers.severity.label, "high")
      assert.deepStrictEqual(answers.severity.probabilities, { low: 0.1, high: 0.9 })
    }).pipe(Effect.provide(succeedWith({
      severity: { _tag: "Rate", rating: 0.9, probabilities: { low: 0.1, high: 0.9 } }
    })))
  })

  it.effect("rate derives the argmax label without a provider label", () =>
    Effect.gen(function*() {
      // Exercise untrusted provider output; the positive typetest pins the provider type separately.
      const { label: _, ...frustration } = triageAnswers.frustration
      const { answers } = yield* DecisionModel.decide(TicketTriage, { input: ticket }).pipe(
        Effect.provide(
          succeedWith({ ...triageAnswers, frustration } as unknown as DecisionModel.ProviderResponse["answers"])
        )
      )
      assert.strictEqual(answers.frustration.label, "frustrated")
    }))

  for (
    const [name, probabilities, expected] of [
      ["ignores a conflicting provider label", { calm: 0.1, frustrated: 0.5, angry: 0.4 }, "frustrated"],
      // Deliberately reverse insertion order: ties follow criteria, not provider key order.
      ["breaks ties in criteria order", { angry: 0.5, frustrated: 0.5, calm: 0 }, "frustrated"]
    ] as const
  ) {
    it.effect(`rate ${name}`, () =>
      Effect.gen(function*() {
        const { answers } = yield* DecisionModel.decide(TicketTriage, { input: ticket })
        assert.strictEqual(answers.frustration.label, expected)
      }).pipe(Effect.provide(succeedWith(
        {
          ...triageAnswers,
          frustration: { ...triageAnswers.frustration, label: "angry", probabilities }
        } as unknown as DecisionModel.ProviderResponse["answers"]
      ))))
  }

  it.effect("classify retains the provider label even when it is not the argmax", () =>
    Effect.gen(function*() {
      const { answers } = yield* DecisionModel.decide(TicketTriage, { input: ticket })
      assert.strictEqual(answers.department.label, "sales")
    }).pipe(Effect.provide(succeedWith({
      ...triageAnswers,
      department: { ...triageAnswers.department, label: "sales" }
    }))))

  for (const key of ["department", "frustration"] as const) {
    for (const confidence of [-Number.EPSILON, 1 + Number.EPSILON, NaN, Infinity, -Infinity]) {
      it.effect(`${key} rejects confidence ${confidence}`, () =>
        Effect.gen(function*() {
          const error = yield* failureOf(DecisionModel.decide(TicketTriage, { input: ticket }))
          assert.strictEqual(error?.reason._tag, "InvalidOutputError")
        }).pipe(Effect.provide(succeedWith({
          ...triageAnswers,
          [key]: { ...triageAnswers[key], confidence }
        }))))
    }
    for (const confidence of [0, 1]) {
      it.effect(`${key} accepts confidence boundary ${confidence}`, () =>
        Effect.gen(function*() {
          const { answers } = yield* DecisionModel.decide(TicketTriage, { input: ticket })
          assert.strictEqual(answers[key].confidence, confidence)
        }).pipe(Effect.provide(succeedWith({
          ...triageAnswers,
          [key]: { ...triageAnswers[key], confidence }
        }))))
    }

    for (
      const [total, accepted] of [
        [1, true],
        [1 - 0.5e-6, true],
        [1 + 0.5e-6, true],
        [1 + 1e-6, true],
        // Adjacent representable totals straddle the lower tolerance boundary.
        [0.9999990000000001, true],
        [0.9999989999999999, false],
        [1 + 1e-6 + Number.EPSILON, false],
        [0.99, false],
        [1.01, false],
        [0, false]
      ] as const
    ) {
      it.effect(`${key} ${accepted ? "accepts" : "rejects"} distribution total ${total}`, () => {
        const probabilities = key === "department"
          ? { billing: total / 2, technical: total / 2, sales: 0 }
          : { calm: total / 2, frustrated: total / 2, angry: 0 }
        return Effect.gen(function*() {
          const result = yield* DecisionModel.decide(TicketTriage, { input: ticket }).pipe(
            Effect.match({ onFailure: (error) => error, onSuccess: (response) => response })
          )
          if (accepted) {
            assert.isFalse(AiError.isAiError(result))
            if (!AiError.isAiError(result)) {
              assert.deepStrictEqual(result.answers[key].probabilities, probabilities)
            }
          } else {
            assert.isTrue(AiError.isAiError(result))
            if (AiError.isAiError(result)) {
              assert.strictEqual(result.reason._tag, "InvalidOutputError")
            }
          }
        }).pipe(Effect.provide(succeedWith({
          ...triageAnswers,
          [key]: { ...triageAnswers[key], probabilities }
        })))
      })
    }
  }

  for (const rating of [-Number.EPSILON, 2 + 2 * Number.EPSILON, NaN, Infinity, -Infinity]) {
    it.effect(`rate rejects rating ${rating}`, () =>
      Effect.gen(function*() {
        const error = yield* failureOf(DecisionModel.decide(TicketTriage, { input: ticket }))
        assert.strictEqual(error?.reason._tag, "InvalidOutputError")
      }).pipe(Effect.provide(succeedWith({
        ...triageAnswers,
        frustration: { ...triageAnswers.frustration, rating }
      }))))
  }
  for (const rating of [0, 1.4, 2]) {
    it.effect(`rate accepts rating ${rating}`, () =>
      Effect.gen(function*() {
        const { answers } = yield* DecisionModel.decide(TicketTriage, { input: ticket })
        assert.strictEqual(answers.frustration.rating, rating)
      }).pipe(Effect.provide(succeedWith({
        ...triageAnswers,
        frustration: { ...triageAnswers.frustration, rating }
      }))))
  }

  it.effect("extra provider keys never leak into answers", () => {
    const raw = {
      ...triageAnswers,
      extraDecision: { _tag: "Probability" as const, probability: 0.5 },
      department: {
        ...triageAnswers.department,
        extra: "discard",
        probabilities: { ...triageAnswers.department.probabilities, extra: 1 }
      },
      frustration: {
        ...triageAnswers.frustration,
        extra: "discard",
        probabilities: { ...triageAnswers.frustration.probabilities, extra: 1 }
      },
      urgent: { ...triageAnswers.urgent, confidence: 1, probabilities: { false: 0.1, true: 0.9 }, extra: "discard" }
    }
    return Effect.gen(function*() {
      const { answers } = yield* DecisionModel.decide(TicketTriage, { input: ticket })
      assert.deepStrictEqual(answers, expectedAnswers)
    }).pipe(Effect.provide(succeedWith(raw)))
  })

  for (
    const [name, box] of [
      ["the full image", { left: 0, top: 0, right: 1, bottom: 1 }],
      ["a zero-area box", { left: 0.5, top: 0.5, right: 0.5, bottom: 0.5 }]
    ] as const
  ) {
    it.effect(`locate accepts ${name}`, () =>
      Effect.gen(function*() {
        const { answers } = yield* DecisionModel.decide(FindMug, { input: scene })

        assert.deepStrictEqual(answers.mug, { box })
      }).pipe(Effect.provide(locateWith({ _tag: "Locate", box }))))
  }

  const box = { left: 0.44, top: 0.25, right: 0.84, bottom: 0.82 }
  for (
    const [name, answer] of [
      ["a missing box", { _tag: "Locate" }],
      ["an edge outside [0, 1]", { _tag: "Locate", box: { ...box, right: 1.01 } }],
      ["crossed horizontal edges", { _tag: "Locate", box: { ...box, left: 0.9 } }],
      ["crossed vertical edges", { _tag: "Locate", box: { ...box, bottom: 0.1 } }],
      ["confidence outside [0, 1]", { _tag: "Locate", box, confidence: 2 }]
    ] as const
  ) {
    it.effect(`locate rejects ${name}`, () =>
      Effect.gen(function*() {
        const error = yield* failureOf(DecisionModel.decide(FindMug, { input: scene }))

        assert.strictEqual(error?.reason._tag, "InvalidOutputError")
      }).pipe(Effect.provide(locateWith(answer))))
  }

  it.effect("decideSettled keeps a valid box beside an invalid one", () =>
    Effect.gen(function*() {
      const FindTwo = Decision.make({
        input: Scene,
        decisions: {
          mug: Decision.locate({ image: "photo", instructions: "the coffee mug" }),
          spoon: Decision.locate({ image: "photo", instructions: "the spoon" })
        }
      })
      const { outcomes } = yield* DecisionModel.decideSettled(FindTwo, { input: scene })

      assert.deepStrictEqual(outcomes.mug, Result.succeed({ box }))
      assert.deepStrictEqual(unanswered(outcomes.spoon), {
        _tag: "Unanswered",
        reason: "Invalid",
        description: "Provider returned a box with crossed edges for decision \"spoon\""
      })
    }).pipe(Effect.provide(Layer.effect(
      DecisionModel.DecisionModel,
      DecisionModel.make({
        supportsImages: true,
        supportsLocate: true,
        decide: () =>
          Effect.succeed({
            answers: {
              mug: { _tag: "Locate", box },
              spoon: { _tag: "Locate", box: { ...box, left: 0.9 } }
            },
            usage: { inputTokens: undefined, outputTokens: undefined }
          })
      })
    ))))
})
