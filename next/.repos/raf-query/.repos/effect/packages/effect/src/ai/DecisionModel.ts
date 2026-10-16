/**
 * Defines the provider-neutral service for structured decisions.
 * `decide` encodes one input as JSON, sends its named decisions in one provider
 * call, and validates the answers. Failures are reported as `AiError` values.
 * @stability unstable
 * @since 4.0.0
 */
import * as Context from "../Context.ts"
import * as Effect from "../Effect.ts"
import * as Predicate from "../Predicate.ts"
import * as Schema from "../Schema.ts"
import * as AiError from "./AiError.ts"
import type * as Decision from "./Decision.ts"

/**
 * Service key for answering decisions about an input. Create implementations
 * with `make`.
 *
 * @see {@link decide} for answering a definition through the current service
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export const DecisionModel: Context.Service<DecisionModel, DecisionModel> = Context.Service(
  "effect/ai/DecisionModel"
)

/**
 * Brand type for `DecisionModel`.
 *
 * @stability unstable
 * @category type IDs
 * @since 4.0.0
 */
export type TypeId = "~effect/ai/DecisionModel"

/**
 * Brand for `DecisionModel` implementations.
 *
 * @stability unstable
 * @category type IDs
 * @since 4.0.0
 */
export const TypeId: TypeId = "~effect/ai/DecisionModel"

/**
 * Provider-reported token usage. Unreported counts are `undefined`.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export class DecisionUsage extends Schema.Class<DecisionUsage>(
  "effect/ai/DecisionModel/DecisionUsage"
)({
  inputTokens: Schema.optional(Schema.Finite),
  outputTokens: Schema.optional(Schema.Finite)
}) {}

/**
 * Options for answering a decision definition.
 *
 * @stability unstable
 * @category options
 * @since 4.0.0
 */
export interface DecideOptions<Input extends Schema.Constraint> {
  readonly input: Input["Type"]
}

/**
 * Answers for every decision in a definition together with usage metadata.
 *
 * @see {@link DecisionUsage} for token usage metadata
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface DecideResponse<Decisions extends Record<string, Decision.Any>> {
  readonly answers: Decision.Answers<Decisions>
  readonly usage: DecisionUsage
}

/**
 * Provider input options for a decision request.
 * `state` is encoded with `Schema.toCodecJson`, not stringified.
 * All `decisions` must be answered in one call.
 *
 * @stability unstable
 * @category options
 * @since 4.0.0
 */
export interface ProviderOptions {
  readonly state: Schema.Json
  readonly decisions: Record<string, Decision.Any>
}

/**
 * Provider answer for a classify decision.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface ProviderClassifyAnswer {
  readonly _tag: "Classify"
  readonly label: string
  readonly probabilities: Readonly<Record<string, number>>
  readonly confidence?: number | undefined
}

/**
 * Provider answer for a rate decision.
 * The core derives the label from the highest probability, choosing the
 * first criteria entry on ties.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface ProviderRateAnswer {
  readonly _tag: "Rate"
  readonly rating: number
  readonly probabilities: Readonly<Record<string, number>>
  readonly confidence?: number | undefined
}

/**
 * Provider answer for a probability decision.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface ProviderProbabilityAnswer {
  readonly _tag: "Probability"
  readonly probability: number
}

/**
 * Provider answer for any decision kind.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type ProviderAnswer = ProviderClassifyAnswer | ProviderRateAnswer | ProviderProbabilityAnswer

/**
 * Provider response for a decision request.
 * `answers` is keyed like the requested decisions. Each answer is validated
 * against its decision before it is returned to the caller.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface ProviderResponse {
  readonly answers: Readonly<Record<string, ProviderAnswer>>
  readonly usage: {
    readonly inputTokens: number | undefined
    readonly outputTokens: number | undefined
  }
}

/**
 * Decision operations over a definition.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface DecisionModel {
  readonly [TypeId]: TypeId
  readonly decide: <Input extends Schema.Constraint, Decisions extends Record<string, Decision.Any>>(
    definition: Decision.Definition<Input, Decisions>,
    options: DecideOptions<Input>
  ) => Effect.Effect<DecideResponse<Decisions>, AiError.AiError, Input["EncodingServices"]>
}

const invalidOutput = (description: string): AiError.AiError =>
  AiError.make({
    module: "DecisionModel",
    method: "decide",
    reason: new AiError.InvalidOutputError({ description })
  })

const isFiniteNumber = (value: unknown): value is number => Predicate.isNumber(value) && Number.isFinite(value)

const isUnitInterval = (value: unknown): value is number => isFiniteNumber(value) && value >= 0 && value <= 1

const sumTolerance = 1e-6

/**
 * `roundingError` is the largest error a provider's rounding adds to a single
 * probability (half a unit of its last decimal place). Distributions that sum
 * to 1 within `labels.length * roundingError` are rescaled to sum to 1.
 */
const validateDistribution = (
  key: string,
  labels: ReadonlyArray<string>,
  answer: Record<string, unknown>,
  roundingError: number
): Record<string, number> | AiError.AiError => {
  const raw = answer.probabilities
  if (!Predicate.isObject(raw)) {
    return invalidOutput(`Provider returned no probabilities for decision "${key}"`)
  }
  const probabilities: Record<string, number> = Object.create(null)
  let total = 0
  for (const label of labels) {
    const value = raw[label]
    if (!isUnitInterval(value)) {
      return invalidOutput(`Provider returned no probability for label "${label}" of decision "${key}"`)
    }
    probabilities[label] = value
    total += value
  }
  const drift = Math.abs(total - 1)
  if (total === 0 || drift > labels.length * roundingError + sumTolerance) {
    return invalidOutput(`Provider returned probabilities that do not sum to 1 for decision "${key}"`)
  }
  if (drift > sumTolerance) {
    for (const label of labels) probabilities[label] /= total
  }
  return probabilities
}

const validateConfidence = (
  key: string,
  answer: Record<string, unknown>
): number | undefined | AiError.AiError => {
  if (answer.confidence === undefined) {
    return undefined
  }
  return isUnitInterval(answer.confidence)
    ? answer.confidence
    : invalidOutput(`Provider returned confidence outside [0, 1] for decision "${key}"`)
}

const validateAnswer = (
  key: string,
  decision: Decision.Any,
  answer: unknown,
  roundingError: number
): Decision.Answer<Decision.Any> | AiError.AiError => {
  if (!Predicate.isObject(answer)) {
    return invalidOutput(`Provider returned no answer for decision "${key}"`)
  }
  if (answer._tag !== decision._tag) {
    return invalidOutput(
      `Provider returned a "${String(answer._tag)}" answer for decision "${key}", expected "${decision._tag}"`
    )
  }
  switch (decision._tag) {
    case "Classify": {
      const labels = Object.keys(decision.criteria)
      if (!Predicate.isString(answer.label) || !labels.includes(answer.label)) {
        return invalidOutput(`Provider returned an unknown label for decision "${key}"`)
      }
      const confidence = validateConfidence(key, answer)
      if (AiError.isAiError(confidence)) {
        return confidence
      }
      const probabilities = validateDistribution(key, labels, answer, roundingError)
      if (AiError.isAiError(probabilities)) {
        return probabilities
      }
      return { label: answer.label, probabilities, ...(confidence === undefined ? undefined : { confidence }) }
    }
    case "Rate": {
      const levels = decision.criteria
      if (!isFiniteNumber(answer.rating) || answer.rating < 0 || answer.rating > levels.length - 1) {
        return invalidOutput(`Provider returned a rating outside [0, ${levels.length - 1}] for decision "${key}"`)
      }
      const confidence = validateConfidence(key, answer)
      if (AiError.isAiError(confidence)) {
        return confidence
      }
      const probabilities = validateDistribution(key, levels, answer, roundingError)
      if (AiError.isAiError(probabilities)) {
        return probabilities
      }
      let label = levels[0]
      for (let i = 1; i < levels.length; i++) {
        if (probabilities[levels[i]] > probabilities[label]) {
          label = levels[i]
        }
      }
      return { rating: answer.rating, label, probabilities, ...(confidence === undefined ? undefined : { confidence }) }
    }
    case "Probability": {
      if (!isUnitInterval(answer.probability)) {
        return invalidOutput(`Provider returned a probability outside [0, 1] for decision "${key}"`)
      }
      return { probability: answer.probability }
    }
  }
}

const validateAnswers = <Decisions extends Record<string, Decision.Any>>(
  decisions: Decisions,
  answers: Readonly<Record<string, ProviderAnswer>>,
  roundingError: number
): Effect.Effect<Decision.Answers<Decisions>, AiError.AiError> => {
  const validated: Record<string, Decision.Answer<Decision.Any>> = Object.create(null)
  for (const key of Object.keys(decisions)) {
    const answer = validateAnswer(key, decisions[key], answers[key], roundingError)
    if (AiError.isAiError(answer)) {
      return Effect.fail(answer)
    }
    validated[key] = answer
  }
  return Effect.succeed(validated as Decision.Answers<Decisions>)
}

/**
 * Creates a `DecisionModel` that encodes inputs as JSON and validates provider answers.
 * Answers must cover every decision and use its labels. Distributions must
 * sum to 1 within `1e-6`, optional confidence must be in `[0, 1]`, and ratings must be
 * in `[0, criteria.length - 1]`. Invalid answers fail with
 * `AiError.InvalidOutputError`; encoding failures use `AiError.InvalidUserInputError`.
 *
 * **Details**
 *
 * Providers that round each probability to `probabilityPrecision` decimal
 * places may return distributions whose sum drifts from 1 by up to half a unit
 * of the last place per label. Setting `probabilityPrecision` accepts that
 * drift and rescales the distribution to sum to 1; larger drift still fails.
 *
 * @see {@link DecisionModel} for the service shape returned by this constructor
 * @see {@link ProviderOptions} for the input passed to the provider implementation
 * @see {@link ProviderResponse} for the provider response contract consumed by this constructor
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const make = (params: {
  readonly decide: (options: ProviderOptions) => Effect.Effect<ProviderResponse, AiError.AiError>
  readonly probabilityPrecision?: number | undefined
}): Effect.Effect<DecisionModel> =>
  Effect.sync(() => {
    const roundingError = params.probabilityPrecision === undefined ? 0 : 0.5 * 10 ** -params.probabilityPrecision
    return DecisionModel.of({
      [TypeId]: TypeId,
      decide: <Input extends Schema.Constraint, Decisions extends Record<string, Decision.Any>>(
        definition: Decision.Definition<Input, Decisions>,
        options: DecideOptions<Input>
      ): Effect.Effect<DecideResponse<Decisions>, AiError.AiError, Input["EncodingServices"]> =>
        Schema.encodeEffect(Schema.toCodecJson(definition.input))(options.input).pipe(
          Effect.mapError((error) =>
            AiError.make({
              module: "DecisionModel",
              method: "decide",
              reason: new AiError.InvalidUserInputError({ description: error.message })
            })
          ),
          Effect.flatMap((state) => params.decide({ state, decisions: definition.decisions })),
          Effect.flatMap((response) =>
            Effect.map(
              validateAnswers(definition.decisions, response.answers, roundingError),
              (answers): DecideResponse<Decisions> => ({
                answers,
                usage: new DecisionUsage({
                  inputTokens: response.usage.inputTokens,
                  outputTokens: response.usage.outputTokens
                })
              })
            )
          ),
          (effect) => Effect.withSpan(effect, "DecisionModel.decide", { captureStackTrace: false })
        )
    })
  })

/**
 * Answers a decision definition using the current `DecisionModel` service.
 * Encodes the input with `Schema.toCodecJson`, requiring the schema's encoding services.
 * Explicit `undefined` fields become `null`; absent fields stay absent.
 * Custom declarations need a JSON codec annotation or encoding fails.
 * Returned answers and probability dictionaries have null prototypes.
 *
 * **Example** (Triaging a ticket)
 *
 * ```ts
 * import { Effect, Schema } from "effect"
 * import { Decision, DecisionModel } from "effect/ai"
 *
 * const TicketTriage = Decision.make({
 *   input: Schema.String,
 *   decisions: {
 *     urgent: Decision.probability({
 *       instructions: "The message is time-sensitive",
 *       criteria: { false: "No time pressure", true: "Needs action now" }
 *     })
 *   }
 * })
 *
 * const program = Effect.gen(function*() {
 *   const { answers, usage } = yield* DecisionModel.decide(TicketTriage, {
 *     input: "My card was charged twice, please fix this today"
 *   })
 *   return { probability: answers.urgent.probability, usage }
 * })
 * ```
 *
 * @see {@link DecisionModel} for the service this function requires
 *
 * @stability unstable
 * @category decisions
 * @since 4.0.0
 */
export const decide = <Input extends Schema.Constraint, Decisions extends Record<string, Decision.Any>>(
  definition: Decision.Definition<Input, Decisions>,
  options: DecideOptions<Input>
): Effect.Effect<DecideResponse<Decisions>, AiError.AiError, DecisionModel | Input["EncodingServices"]> =>
  DecisionModel.use((model) => model.decide(definition, options))
