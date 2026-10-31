/**
 * Cloudflare Clef implementation of DecisionModel over Workers AI REST.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as AiError from "effect/ai/AiError"
import * as DecisionModel from "effect/ai/DecisionModel"
import * as AiModel from "effect/ai/Model"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import type * as Schema from "effect/Schema"
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
 * **Details**
 *
 * Base64 data is sent with its media type, and `data:` URLs are sent
 * unchanged. Clef shows images before the state, so with images the state is
 * sent as text that first lists each image's reference in order. The API
 * enforces image limits.
 *
 * **Gotchas**
 *
 * - Remote URLs fail with `AiError.InvalidUserInputError` because Clef does
 *   not fetch them.
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
      supportsImages: true,
      decide: Effect.fnUntraced(function*({ state, decisions, images }) {
        const questions: Record<string, typeof CloudflareSchema.Question.Encoded> = Object.create(null)
        for (const [key, decision] of Object.entries(decisions)) {
          switch (decision._tag) {
            case "Classify":
              questions[key] = { type: "choice", instructions: decision.instructions, criteria: decision.criteria }
              break
            case "Rate":
              questions[key] = {
                type: "score",
                instructions: decision.instructions,
                criteria: decision.criteria.map((level) => level.description)
              }
              break
            case "Probability":
              questions[key] = { type: "noul", instructions: decision.instructions, criteria: decision.criteria }
              break
          }
        }
        if (images?.some(({ image }) => image.data instanceof URL && image.data.protocol !== "data:")) {
          return yield* Effect.fail(AiError.make({
            module: "CloudflareDecisionModel",
            method: "decide",
            reason: new AiError.InvalidUserInputError({
              description: "Cloudflare Clef accepts base64 or data URL images, not remote URLs"
            })
          }))
        }
        const response = yield* client.createDecisions({
          model: options.model,
          state: images === undefined ? state : labelImages(state, images),
          questions,
          ...(images === undefined ? undefined : { images: images.map(({ image }) => encodeImage(image)) })
        })
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
                if (probability !== undefined) probabilities[levels[index].label] = probability
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

const encodeImage = (image: DecisionModel.ProviderImage["image"]): typeof CloudflareSchema.Image.Encoded =>
  image.data instanceof URL ? image.data.href : { content_type: image.mediaType, base64: image.data }

const labelImages = (state: Schema.Json, images: ReadonlyArray<DecisionModel.ProviderImage>): string =>
  [
    ...images.map(({ reference }, index) => `Image ${index + 1}: ${reference}`),
    "",
    typeof state === "string" ? state : JSON.stringify(state)
  ].join("\n")

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
