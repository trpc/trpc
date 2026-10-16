/**
 * Schemas for OpenRouter's alpha Decisions API.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Schema from "effect/Schema"
import * as Generated from "./Generated.ts"

/**
 * A choice question with descriptions keyed by choice label.
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
 * A score question with ordered criteria.
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
 * A probability question with optional true and false descriptions.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const NoulQuestion = Schema.Struct({
  type: Schema.Literal("noul"),
  instructions: Schema.String,
  criteria: Schema.optional(Schema.Struct({ true: Schema.String, false: Schema.String }))
})

/**
 * A choice, ordered score, or probability question.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const DecisionsQuestion = Schema.Union([
  ChoiceQuestion,
  ScoreQuestion,
  NoulQuestion
])

/**
 * A provider answer with optional probabilities and confidence.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const Answer = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("choice"),
    choice: Schema.String,
    confidence: Schema.optional(Schema.Finite),
    probabilities: Schema.optional(Schema.Record(Schema.String, Schema.Finite))
  }),
  Schema.Struct({
    type: Schema.Literal("score"),
    score: Schema.Finite,
    confidence: Schema.optional(Schema.Finite),
    probabilities: Schema.optional(Schema.Record(Schema.String, Schema.Finite)),
    legend: Schema.optional(Schema.Record(Schema.String, Schema.String))
  }),
  Schema.Struct({ type: Schema.Literal("noul"), noul: Schema.Finite })
])

/**
 * Request body for the alpha Decisions endpoint.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const DecisionsRequest = Schema.Struct({
  model: Schema.String,
  state: Schema.Unknown,
  questions: Schema.Record(Schema.String, DecisionsQuestion),
  provider: Schema.optional(Generated.ProviderPreferences),
  session_id: Schema.optional(Schema.String),
  user: Schema.optional(Schema.String),
  trace: Schema.optional(Schema.Record(Schema.String, Schema.Unknown))
})

/**
 * Response body for the alpha Decisions endpoint.
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
    output_tokens: Schema.Int,
    cost: Schema.optional(Schema.Finite)
  }),
  id: Schema.optional(Schema.String),
  provider: Schema.optional(Schema.String)
})
