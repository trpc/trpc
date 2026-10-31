/**
 * Codecs for text and JSON decisions from Cloudflare Clef models.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Schema from "effect/Schema"

const Entry = Schema.Union([Schema.String, Schema.JsonObject, Schema.Array(Schema.Json)])

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
  criteria: Schema.Record(Schema.String, Schema.NullOr(Entry))
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
  criteria: Schema.Array(Schema.Json)
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
  criteria: Schema.optional(Schema.Struct({ false: Schema.Json, true: Schema.Json }))
})

/**
 * A Clef question with string, JSON object, or JSON array instructions.
 * Choice descriptions also accept `null`; Score and Noul descriptions accept any JSON value.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const Question = Schema.Union([ChoiceQuestion, ScoreQuestion, NoulQuestion])

/**
 * An image as a `data:` URL or as base64 data with its media type. Clef
 * rejects remote URLs.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.5
 */
export const Image = Schema.Union([
  Schema.String,
  Schema.Struct({
    content_type: Schema.Union([
      Schema.Literals(["image/png", "image/jpeg", "image/webp"]),
      Schema.StringForLiteralAutocomplete
    ]),
    base64: Schema.String
  })
])

/**
 * A batch of questions about text or JSON state, with optional images shown
 * to the model before the state.
 *
 * **Details**
 *
 * Clef accepts up to 4 images of at most 4 MiB and 16 megapixels each, 8 MiB
 * of decoded images in total, and 13 MiB per request body.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const DecisionsRequest = Schema.Struct({
  model: Schema.Union([Schema.Literals(["clef", "clef-flash"]), Schema.StringForLiteralAutocomplete]),
  state: Schema.Json,
  questions: Schema.Record(Schema.String, Question),
  images: Schema.optional(Schema.Array(Image))
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
  legend: Schema.Record(Schema.String, Schema.Json)
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
 * A Clef classification, rating, or probability answer.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const Answer = Schema.Union([ChoiceAnswer, ScoreAnswer, NoulAnswer])

/**
 * Answers and token usage for a batch.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const DecisionsResponse = Schema.Struct({
  model: Schema.String,
  answers: Schema.Record(Schema.String, Answer),
  usage: Schema.Struct({
    input_tokens: Schema.Int,
    output_tokens: Schema.Int
  })
})
