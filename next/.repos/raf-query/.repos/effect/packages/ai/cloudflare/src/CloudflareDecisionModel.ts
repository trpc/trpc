/**
 * Cloudflare Clef implementation of DecisionModel over Workers AI REST.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as DecisionModel from "effect/ai/DecisionModel"
import * as AiModel from "effect/ai/Model"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { CloudflareClient } from "./CloudflareClient.ts"
import type * as CloudflareSchema from "./CloudflareSchema.ts"

/**
 * Cloudflare Clef model identifiers.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type Model = typeof CloudflareSchema.DecisionsRequest.Encoded["model"]

/**
 * Creates a decision model with Cloudflare provider metadata.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const model = (
  model: Model
): AiModel.Model<"cloudflare", DecisionModel.DecisionModel, CloudflareClient> =>
  AiModel.make("cloudflare", model, layer({ model }))

/**
 * Builds a decision service with tolerance for four-decimal probability rounding.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const make = Effect.fnUntraced(
  function*(
    options: { readonly model: Model }
  ): Effect.fn.Return<DecisionModel.DecisionModel, never, CloudflareClient> {
    const client = yield* CloudflareClient
    return yield* DecisionModel.make({
      probabilityPrecision: 4,
      decide: Effect.fnUntraced(function*({ state, decisions }) {
        const questions: Record<string, typeof CloudflareSchema.Question.Encoded> = Object.create(null)
        for (const [key, decision] of Object.entries(decisions)) {
          switch (decision._tag) {
            case "Classify":
              questions[key] = { type: "choice", instructions: decision.instructions, criteria: decision.criteria }
              break
            case "Rate":
              questions[key] = { type: "score", instructions: decision.instructions, criteria: decision.criteria }
              break
            case "Probability":
              questions[key] = { type: "noul", instructions: decision.instructions, criteria: decision.criteria }
              break
          }
        }
        const response = yield* client.createDecisions({ model: options.model, state, questions })
        const answers: Record<string, DecisionModel.ProviderAnswer> = Object.create(null)
        for (const [key, decision] of Object.entries(decisions)) {
          const answer = response.answers[key]
          switch (answer?.type) {
            case "choice":
              answers[key] = {
                _tag: "Classify",
                label: answer.choice,
                probabilities: answer.probabilities,
                confidence: answer.confidence
              }
              break
            case "score": {
              const levels = decision._tag === "Rate" ? decision.criteria : []
              const probabilities: Record<string, number> = Object.create(null)
              for (let index = 0; index < levels.length; index++) {
                const probability = answer.probabilities[String(index)]
                if (probability !== undefined) probabilities[levels[index]] = probability
              }
              answers[key] = { _tag: "Rate", rating: answer.score, probabilities, confidence: answer.confidence }
              break
            }
            case "noul":
              answers[key] = { _tag: "Probability", probability: answer.noul }
              break
          }
        }
        return {
          answers,
          usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens }
        }
      })
    })
  }
)

/**
 * Provides DecisionModel using an existing CloudflareClient.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layer = (
  options: { readonly model: Model }
): Layer.Layer<DecisionModel.DecisionModel, never, CloudflareClient> =>
  Layer.effect(DecisionModel.DecisionModel, make(options))
