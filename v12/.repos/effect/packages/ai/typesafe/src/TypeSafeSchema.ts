/**
 * Codecs for the TypeSafe System One API.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Schema from "effect/Schema"

const Entry = Schema.NullOr(Schema.Union([Schema.String, Schema.JsonObject, Schema.Array(Schema.Json)]))

/**
 * A classification question.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const ChoiceQuestion = Schema.Struct({
  type: Schema.Literal("choice"),
  instructions: Entry,
  criteria: Schema.Record(Schema.String, Entry)
})

/**
 * An ordered rating question.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const ScoreQuestion = Schema.Struct({
  type: Schema.Literal("score"),
  instructions: Entry,
  criteria: Schema.Array(Entry)
})

/**
 * A probability question.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const NoulQuestion = Schema.Struct({
  type: Schema.Literal("noul"),
  instructions: Entry,
  criteria: Schema.optional(Schema.Struct({ false: Entry, true: Entry }))
})

/**
 * A question that finds where something is in an image. Needs Jev 1.14 and
 * the `TypeSafe-Danger-Zone-Images: true` header.
 *
 * @stability unstable
 * @category schemas
 * @since 4.1.0
 */
export const BoxQuestion = Schema.Struct({
  type: Schema.Literal("box"),
  instructions: Entry
})

/**
 * A System One question with string, JSON object, JSON array, or `null` instructions and descriptions.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const Question = Schema.Union([ChoiceQuestion, ScoreQuestion, NoulQuestion, BoxQuestion])

/**
 * A base64-encoded PNG or JPEG image. Standard alphabet with `=` padding, no
 * whitespace, and no `data:` prefix.
 *
 * @stability unstable
 * @category schemas
 * @since 4.1.0
 */
export const ImageAsset = Schema.Struct({
  type: Schema.optional(Schema.Literal("image")),
  format: Schema.Literals(["png", "jpg", "jpeg"]),
  data_base64: Schema.String
})

/**
 * A batch of questions against encoded state. `assets` maps placeholder
 * strings to images; the model sees each image wherever its placeholder
 * appears in `state`, `instructions`, or `criteria`.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const SystemOneRequest = Schema.Struct({
  model: Schema.String,
  state: Schema.Json,
  questions: Schema.Record(Schema.String, Question),
  assets: Schema.optional(Schema.Record(Schema.String, ImageAsset))
})

/**
 * A classification distribution.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const ChoiceAnswer = Schema.Struct({
  type: Schema.Literal("choice"),
  choice: Schema.String,
  probabilities: Schema.Record(Schema.String, Schema.Number),
  confidence: Schema.Number
})

/**
 * A zero-based rating and index-keyed distribution. `legend` maps indices to descriptions.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const ScoreAnswer = Schema.Struct({
  type: Schema.Literal("score"),
  score: Schema.Number,
  probabilities: Schema.Record(Schema.String, Schema.Number),
  confidence: Schema.Number,
  legend: Schema.optional(Schema.Record(Schema.String, Schema.Json))
})

/**
 * A Bernoulli probability.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const NoulAnswer = Schema.Struct({ type: Schema.Literal("noul"), noul: Schema.Number })

/**
 * A bounding box whose edges are fractions of the image's width and height.
 *
 * @stability unstable
 * @category schemas
 * @since 4.1.0
 */
export const BoxAnswer = Schema.Struct({
  type: Schema.Literal("box"),
  box: Schema.Struct({ top: Schema.Number, bottom: Schema.Number, left: Schema.Number, right: Schema.Number }),
  confidence: Schema.Number
})

/**
 * A System One answer.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const Answer = Schema.Union([ChoiceAnswer, ScoreAnswer, NoulAnswer, BoxAnswer])

/**
 * Answers and token usage for a batch.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const SystemOneResponse = Schema.Struct({
  model: Schema.String,
  answers: Schema.Record(Schema.String, Answer),
  usage: Schema.optional(Schema.Struct({
    input_tokens: Schema.optional(Schema.Number),
    output_tokens: Schema.optional(Schema.Number)
  }))
})

/**
 * Available TypeSafe models.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const ListModelsResponse = Schema.Struct({
  models: Schema.Array(Schema.Struct({
    name: Schema.String,
    description: Schema.optional(Schema.String),
    release_date: Schema.optional(Schema.String)
  }))
})
