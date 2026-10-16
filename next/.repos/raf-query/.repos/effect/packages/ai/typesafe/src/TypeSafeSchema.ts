/**
 * Codecs for the TypeSafe System One API.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Schema from "effect/Schema"

/**
 * A classification question.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const ChoiceQuestion = Schema.Struct({
  type: Schema.Literal("choice"),
  instructions: Schema.String,
  criteria: Schema.Record(Schema.String, Schema.String)
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
  instructions: Schema.String,
  criteria: Schema.Array(Schema.String)
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
  instructions: Schema.String,
  criteria: Schema.optional(Schema.Struct({ false: Schema.String, true: Schema.String }))
})

/**
 * A System One question.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const Question = Schema.Union([ChoiceQuestion, ScoreQuestion, NoulQuestion])

/**
 * A batch of questions against encoded state.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const SystemOneRequest = Schema.Struct({
  model: Schema.String,
  state: Schema.Json,
  questions: Schema.Record(Schema.String, Question)
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
 * A zero-based rating and index-keyed distribution.
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
  legend: Schema.optional(Schema.Record(Schema.String, Schema.String))
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
 * A System One answer.
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
