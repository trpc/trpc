/**
 * Defines decisions that a `DecisionModel` answers over a single input.
 * Pair an input schema with named classification, rating, probability, or
 * locate decisions using `make`, then answer them with `DecisionModel.decide`,
 * or with `DecisionModel.decideSettled` to keep valid answers when others fail.
 *
 * @see {@link make} for building a definition from an input schema and decisions
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Base64 from "../encoding/Base64.ts"
import * as Predicate from "../Predicate.ts"
import type * as Result from "../Result.ts"
import * as Schema from "../Schema.ts"
import * as SchemaTransformation from "../SchemaTransformation.ts"
import type * as DecisionModel from "./DecisionModel.ts"

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
 * Decision instructions or descriptions: a string, JSON object, or JSON array.
 *
 * **Details**
 *
 * TypeScript interfaces lack the index signature required by `Schema.JsonObject`;
 * use object literals, type aliases, or Schema types instead.
 *
 * @stability unstable
 * @category models
 * @since 4.0.5
 */
export type Description = string | Schema.JsonObject | Schema.JsonArray

/**
 * Decision that assigns the input one label out of a set of criteria.
 * `criteria` maps labels to descriptions; use `null` for a label without a description.
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
  readonly instructions: Description
  readonly criteria: { readonly [L in Label]: Description | null }
}

/**
 * Decision that places the input on an ordered scale of criteria.
 * `criteria` lists levels from lowest to highest, with labels for answers and
 * descriptions for the provider.
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
  readonly instructions: Description
  readonly criteria: ReadonlyArray<{ readonly label: Level; readonly description: Description }>
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
  readonly instructions: Description
  readonly criteria?: {
    readonly false: Description
    readonly true: Description
  } | undefined
}

/**
 * Decision that finds one target in an image field of the input.
 * `image` is the field's path in the encoded input, such as `"photo"` or
 * `"frames[2].frame"`. The answer is a bounding box around the target.
 *
 * @see {@link locate} for the constructor
 * @see {@link LocateAnswer} for the answer produced by this decision
 *
 * @stability unstable
 * @category models
 * @since 4.1.0
 */
export interface Locate<Field extends string = string> {
  readonly _tag: "Locate"
  readonly image: Field
  readonly instructions: string
}

/**
 * Key that marks an encoded {@link Image}.
 *
 * @stability unstable
 * @category models
 * @since 4.1.0
 */
export const ImageKey = "~effect/ai/Decision/Image"

/**
 * JSON encoding of an {@link Image}: base64 data or a URL with its media type,
 * under {@link ImageKey}.
 *
 * @stability unstable
 * @category models
 * @since 4.1.0
 */
export interface ImageEncoded {
  readonly [ImageKey]: {
    readonly mediaType: string
    readonly base64: string
  } | {
    readonly mediaType: string
    readonly url: string
  }
}

const isImage = (u: unknown): u is DecisionModel.Image =>
  Predicate.isObject(u) && Predicate.isString(u.mediaType) &&
  (Predicate.isString(u.data) || u.data instanceof globalThis.Uint8Array || u.data instanceof globalThis.URL)

/**
 * Type-level representation of the {@link Image} schema.
 *
 * @stability unstable
 * @category models
 * @since 4.1.0
 */
export interface Image extends
  Schema.decodeTo<
    Schema.declare<DecisionModel.Image>,
    Schema.Struct<{
      readonly [ImageKey]: Schema.Union<
        readonly [
          Schema.Struct<{ readonly mediaType: Schema.String; readonly base64: Schema.String }>,
          Schema.Struct<{ readonly mediaType: Schema.String; readonly url: Schema.URLFromString }>
        ]
      >
    }>
  >
{
  readonly "Rebuild": Image
}

/**
 * Schema for an image input field. Its type is `DecisionModel.Image`: a
 * media type with base64 data, bytes, or a URL. Decisions refer to the image
 * by the field's path, like any other field.
 *
 * **Details**
 *
 * The field encodes to an {@link ImageEncoded} object. `DecisionModel.decide`
 * replaces each one in the encoded input with a reference string and sends the
 * images to the provider separately; an image used in several fields is sent
 * once. The encoded shape also appears in JSON Schema generated from the input.
 *
 * **Example** (Declaring an image field)
 *
 * ```ts
 * import { Schema } from "effect"
 * import { Decision } from "effect/ai"
 *
 * const Listing = Schema.Struct({
 *   title: Schema.String,
 *   photo: Decision.Image
 * })
 * ```
 *
 * @stability unstable
 * @category schemas
 * @since 4.1.0
 */
export const Image: Image = Schema.Struct({
  [ImageKey]: Schema.Union([
    Schema.Struct({ mediaType: Schema.String, base64: Schema.String }),
    Schema.Struct({ mediaType: Schema.String, url: Schema.URLFromString })
  ])
}).pipe(
  Schema.decodeTo(
    Schema.declare(isImage, { expected: "DecisionModel.Image" }),
    SchemaTransformation.transform({
      decode: ({ [ImageKey]: image }): DecisionModel.Image => ({
        mediaType: image.mediaType,
        data: "base64" in image ? image.base64 : image.url
      }),
      encode: ({ mediaType, data }) => ({
        [ImageKey]: data instanceof globalThis.URL
          ? { mediaType, url: data }
          : { mediaType, base64: typeof data === "string" ? data : Base64.encode(data) }
      })
    })
  )
)

type PrevDepth = [never, 0, 1, 2, 3, 4]

type ImagePathSuffixes<A, Depth extends number> = [Depth] extends [never] ? never
  : A extends ImageEncoded ? ""
  : A extends ReadonlyArray<unknown> ?
    number extends A["length"] ? `[${number}]${ImagePathSuffixes<A[number], PrevDepth[Depth]>}`
    : {
      [K in keyof A & `${number}`]: `[${K}]${ImagePathSuffixes<A[K], PrevDepth[Depth]>}`
    }[keyof A & `${number}`]
  : A extends object ? {
      [K in keyof A & string]-?: K extends `${string}.${string}` | `${string}[${string}` ? never
        : {} extends Pick<A, K> ? never
        : `.${K}${ImagePathSuffixes<A[K], PrevDepth[Depth]>}`
    }[keyof A & string]
  : never

/**
 * Paths to the required {@link Image} fields of an encoded input type, as
 * accepted by {@link locate}. Object keys are joined with `.`, and array
 * elements use `[index]`: exact indices for tuples, any number for arrays.
 *
 * **Details**
 *
 * Paths reach four levels deep. Optional fields and keys containing `.` or
 * `[` are excluded.
 *
 * @stability unstable
 * @category utility types
 * @since 4.1.0
 */
export type ImagePaths<A> = ImagePathSuffixes<A, 4> extends infer Path extends string ?
  Path extends "" ? never : Path extends `.${infer Rest}` ? Rest : Path :
  never

/**
 * Union of every decision kind.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type Any = Classify<string> | Rate<string> | Probability | Locate

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
 * between two levels, within `[0, criteria.length - 1]`. `label` is the label
 * of the level with the highest probability, choosing the first criteria entry
 * on ties.
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
 * Smallest rectangle that contains a located target. Each edge is a fraction
 * of the image's size measured from the top-left corner: `left` and `right`
 * of its width, `top` and `bottom` of its height. Edges are in `[0, 1]`, with
 * `left <= right` and `top <= bottom`.
 *
 * @stability unstable
 * @category models
 * @since 4.1.0
 */
export interface BoundingBox {
  readonly left: number
  readonly top: number
  readonly right: number
  readonly bottom: number
}

/**
 * Answer to a {@link Locate} decision.
 * There is no "not found" answer: a target absent from the image still gets a
 * box. Pair the decision with a {@link Probability} that the target is present.
 * `confidence` is an optional, provider-defined measure in `[0, 1]`.
 *
 * @stability unstable
 * @category models
 * @since 4.1.0
 */
export interface LocateAnswer {
  readonly box: BoundingBox
  readonly confidence?: number | undefined
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
  : D extends Locate ? LocateAnswer
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
 * Reason and description of the first failed answer validation check.
 *
 * **Details**
 *
 * - `"Missing"`: the provider returned no answer for the decision.
 * - `"Refused"`: the provider declined to answer the decision.
 * - `"Invalid"`: the answer has an invalid kind, value, confidence, or distribution.
 * - `"NoDistribution"`: a classify or rate answer is otherwise valid but has
 *   no probabilities.
 *
 * Except for refusals, `description` is the message `DecisionModel.decide`
 * fails with for the same answer.
 *
 * @stability unstable
 * @category models
 * @since 4.0.6
 */
export interface Unanswered {
  readonly _tag: "Unanswered"
  readonly reason: "Missing" | "Refused" | "NoDistribution" | "Invalid"
  readonly description: string
}

/**
 * Validated answer or the reason the decision is unanswered.
 *
 * @see {@link Unanswered} for the failure reasons
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.6
 */
export type Outcome<D extends Any> = Result.Result<Answer<D>, Unanswered>

/**
 * Settled results keyed by decision name.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.6
 */
export type Outcomes<Decisions extends Record<string, Any>> = {
  readonly [K in keyof Decisions]: Outcome<Decisions[K]>
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
 * Descriptions can be `null` when the label needs no explanation.
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
  readonly instructions: Description
  readonly criteria: { readonly [L in Label]: Description | null }
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
 * Strings serve as both label and description; use `{ label, description }`
 * to separate them. Answers use the label.
 * Throws if fewer than two levels or duplicate labels are supplied.
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
 * **Example** (Describing levels with structure)
 *
 * ```ts
 * import { Decision } from "effect/ai"
 *
 * const severity = Decision.rate({
 *   instructions: "How severe is the reported issue?",
 *   criteria: [
 *     "cosmetic",
 *     {
 *       label: "degraded",
 *       description: {
 *         what: "Broken or degraded feature, but workaround exists",
 *         examples: ["export fails in one browser but works in another"]
 *       }
 *     },
 *     {
 *       label: "blocking",
 *       description: {
 *         what: "Blocking issue; no workaround exists",
 *         examples: ["cannot log in", "data loss"]
 *       }
 *     }
 *   ]
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
  readonly instructions: Description
  readonly criteria: ReadonlyArray<Level | { readonly label: Level; readonly description: Description }>
}): Rate<Level> => {
  if (options.criteria.length < 2) {
    throw new Error("Decision.rate: criteria must contain at least two levels")
  }
  const criteria = options.criteria.map((level) =>
    typeof level === "string" ? { label: level, description: level } : level
  )
  if (new Set(criteria.map((level) => level.label)).size !== criteria.length) {
    throw new Error("Decision.rate: criteria must contain distinct levels")
  }
  return {
    _tag: "Rate",
    instructions: options.instructions,
    criteria
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
  readonly instructions: Description
  readonly criteria?: {
    readonly false: Description
    readonly true: Description
  } | undefined
}): Probability => ({
  _tag: "Probability",
  instructions: options.instructions,
  criteria: options.criteria
})

/**
 * Creates a decision that finds one target in an image field of the input.
 * `image` is the field's path in the encoded input: keys joined with `.` and
 * array indices in brackets, such as `"frames[2].frame"`. The model must be
 * created with `supportsLocate: true`.
 *
 * **Details**
 *
 * Paths use encoded key names, so a key renamed with `Schema.encodeKeys` is
 * targeted by its encoded name. `make` accepts only paths to required
 * {@link Image} fields, and `DecisionModel.decide` fails with
 * `AiError.InvalidUserInputError` when the path holds no image, such as an
 * index past the end of an array.
 *
 * The answer is always one box, even when the target is absent. Pair the
 * decision with a {@link probability} decision that the target is present.
 *
 * **Gotchas**
 *
 * - For a generic input schema, the compiler error for an invalid path names
 *   the whole decision type rather than the path.
 *
 * **Example** (Finding a mug in a photo)
 *
 * ```ts
 * import { Schema } from "effect"
 * import { Decision } from "effect/ai"
 *
 * const FindMug = Decision.make({
 *   input: Schema.Struct({ photo: Decision.Image }),
 *   decisions: {
 *     present: Decision.probability({ instructions: "`photo` shows a coffee mug" }),
 *     mug: Decision.locate({ image: "photo", instructions: "the coffee mug" })
 *   }
 * })
 * ```
 *
 * @see {@link LocateAnswer} for the answer
 *
 * @stability unstable
 * @category constructors
 * @since 4.1.0
 */
export const locate = <const Field extends string>(options: {
  readonly image: Field
  readonly instructions: string
}): Locate<Field> => ({
  _tag: "Locate",
  image: options.image,
  instructions: options.instructions
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
export const make = <
  Input extends Schema.Constraint,
  Decisions extends Record<
    string,
    Classify<string> | Rate<string> | Probability | Locate<ImagePaths<Input["Encoded"]>>
  >
>(options: {
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
