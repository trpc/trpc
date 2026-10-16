/**
 * Defines decisions that a `DecisionModel` answers over a single input.
 * Pair an input schema with named classification, rating, or probability
 * decisions using `make`, then answer them with `DecisionModel.decide`.
 *
 * @see {@link make} for building a definition from an input schema and decisions
 *
 * @stability unstable
 * @since 4.0.0
 */
import type * as Schema from "../Schema.ts"

/**
 * Brand type for decision definitions.
 *
 * @stability unstable
 * @category type IDs
 * @since 4.0.0
 */
export type TypeId = "~effect/ai/Decision"

/**
 * Brand for decision definitions.
 *
 * @stability unstable
 * @category type IDs
 * @since 4.0.0
 */
export const TypeId: TypeId = "~effect/ai/Decision"

/**
 * Decision that assigns the input one label out of a set of criteria.
 * `criteria` maps labels to descriptions.
 *
 * @see {@link classify} for the constructor
 * @see {@link ClassifyAnswer} for the answer produced by this decision
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Classify<Label extends string> {
  readonly _tag: "Classify"
  readonly instructions: string
  readonly criteria: { readonly [L in Label]: string }
}

/**
 * Decision that places the input on an ordered scale of criteria.
 * `criteria` lists levels from lowest to highest.
 *
 * @see {@link rate} for the constructor
 * @see {@link RateAnswer} for the answer produced by this decision
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Rate<Level extends string> {
  readonly _tag: "Rate"
  readonly instructions: string
  readonly criteria: ReadonlyArray<Level>
}

/**
 * Decision that estimates how likely a statement about the input is to hold.
 * Optional `criteria` describes both outcomes when supplied.
 * The answer is the probability of `true`.
 *
 * @see {@link probability} for the constructor
 * @see {@link ProbabilityAnswer} for the answer produced by this decision
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Probability {
  readonly _tag: "Probability"
  readonly instructions: string
  readonly criteria?: {
    readonly false: string
    readonly true: string
  } | undefined
}

/**
 * Union of every decision kind.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type Any = Classify<string> | Rate<string> | Probability

/**
 * Answer to a {@link Classify} decision.
 * `label` is chosen by the provider and need not have the highest probability.
 * `confidence` is an optional, provider-defined measure in `[0, 1]`.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface ClassifyAnswer<Label extends string> {
  readonly label: Label
  readonly probabilities: { readonly [L in Label]: number }
  readonly confidence?: number | undefined
}

/**
 * Answer to a {@link Rate} decision.
 * `rating` is the probability-weighted position on the scale and may fall
 * between two levels, within `[0, criteria.length - 1]`. `label` is the level
 * with the highest probability, choosing the first criteria entry on ties.
 * `confidence` is an optional, provider-defined measure in `[0, 1]`.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface RateAnswer<Level extends string> {
  readonly rating: number
  readonly label: Level
  readonly probabilities: { readonly [L in Level]: number }
  readonly confidence?: number | undefined
}

/**
 * Answer to a {@link Probability} decision.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface ProbabilityAnswer {
  readonly probability: number
}

/**
 * Answer type for a single decision.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type Answer<D extends Any> = D extends Classify<infer Label> ? ClassifyAnswer<Label>
  : D extends Rate<infer Level> ? RateAnswer<Level>
  : D extends Probability ? ProbabilityAnswer
  : never

/**
 * Answers keyed by decision name.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type Answers<Decisions extends Record<string, Any>> = {
  readonly [K in keyof Decisions]: Answer<Decisions[K]>
}

/**
 * Input schema and named decisions that run together in one provider call.
 *
 * @see {@link make} for the constructor
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Definition<Input extends Schema.Constraint, Decisions extends Record<string, Any>> {
  readonly [TypeId]: TypeId
  readonly input: Input
  readonly decisions: Decisions
}

/**
 * Creates a classification decision from labelled criteria.
 * Throws if fewer than two labels are supplied.
 *
 * **Example** (Choosing a department)
 *
 * ```ts
 * import { Decision } from "effect/ai"
 *
 * const department = Decision.classify({
 *   instructions: "Which team should handle this",
 *   criteria: {
 *     billing: "payments",
 *     technical: "bugs",
 *     sales: "pricing"
 *   }
 * })
 * ```
 *
 * @see {@link rate} for an ordered scale
 * @see {@link probability} for a single yes or no likelihood
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const classify = <Label extends string>(options: {
  readonly instructions: string
  readonly criteria: { readonly [L in Label]: string }
}): Classify<Label> => {
  if (Object.keys(options.criteria).length < 2) {
    throw new Error("Decision.classify: criteria must contain at least two labels")
  }
  return {
    _tag: "Classify",
    instructions: options.instructions,
    criteria: options.criteria
  }
}

/**
 * Creates a rating decision from an ordered list of criteria.
 * Throws if fewer than two levels or duplicate levels are supplied.
 *
 * **Example** (Rating frustration)
 *
 * ```ts
 * import { Decision } from "effect/ai"
 *
 * const frustration = Decision.rate({
 *   instructions: "How frustrated",
 *   criteria: ["calm", "frustrated", "angry"]
 * })
 * ```
 *
 * @see {@link classify} for unordered labels
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const rate = <const Level extends string>(options: {
  readonly instructions: string
  readonly criteria: ReadonlyArray<Level>
}): Rate<Level> => {
  if (options.criteria.length < 2) {
    throw new Error("Decision.rate: criteria must contain at least two levels")
  }
  if (new Set(options.criteria).size !== options.criteria.length) {
    throw new Error("Decision.rate: criteria must contain distinct levels")
  }
  return {
    _tag: "Rate",
    instructions: options.instructions,
    criteria: options.criteria
  }
}

/**
 * Creates a probability decision from instructions and optional outcome descriptions.
 * When `criteria` is supplied, descriptions for both `false` and `true` are required.
 *
 * **Example** (Estimating urgency)
 *
 * ```ts
 * import { Decision } from "effect/ai"
 *
 * const urgent = Decision.probability({
 *   instructions: "The message is time-sensitive"
 * })
 * ```
 *
 * **Example** (Providing outcome descriptions)
 *
 * ```ts
 * import { Decision } from "effect/ai"
 *
 * const urgent = Decision.probability({
 *   instructions: "The message is time-sensitive",
 *   criteria: {
 *     false: "The message can wait",
 *     true: "The message needs immediate attention"
 *   }
 * })
 * ```
 *
 * @see {@link classify} for more than two outcomes
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const probability = (options: {
  readonly instructions: string
  readonly criteria?: {
    readonly false: string
    readonly true: string
  } | undefined
}): Probability => ({
  _tag: "Probability",
  instructions: options.instructions,
  criteria: options.criteria
})

/**
 * Creates a decision definition from an input schema and named decisions.
 * `DecisionModel.decide` encodes the input with `Schema.toCodecJson` before
 * calling the provider. Answer keys and types are inferred from the decisions.
 * Throws if `decisions` is empty.
 *
 * **Example** (Defining ticket triage)
 *
 * ```ts
 * import { Schema } from "effect"
 * import { Decision } from "effect/ai"
 *
 * const Ticket = Schema.Struct({
 *   subject: Schema.String,
 *   body: Schema.String
 * })
 *
 * const TicketTriage = Decision.make({
 *   input: Ticket,
 *   decisions: {
 *     department: Decision.classify({
 *       instructions: "Which team should handle this",
 *       criteria: { billing: "payments", technical: "bugs" }
 *     }),
 *     urgent: Decision.probability({
 *       instructions: "The message is time-sensitive",
 *       criteria: { false: "No time pressure", true: "Needs action now" }
 *     })
 *   }
 * })
 * ```
 *
 * @see {@link Definition} for the returned shape
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const make = <Input extends Schema.Constraint, Decisions extends Record<string, Any>>(options: {
  readonly input: Input
  readonly decisions: Decisions
}): Definition<Input, Decisions> => {
  if (Object.keys(options.decisions).length === 0) {
    throw new Error("Decision.make: decisions must not be empty")
  }
  return {
    [TypeId]: TypeId,
    input: options.input,
    decisions: options.decisions
  }
}
