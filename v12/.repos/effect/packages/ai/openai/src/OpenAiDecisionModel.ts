/**
 * OpenAI implementation of DecisionModel over the Decisions API.
 *
 * @stability unstable
 * @since 4.0.5
 */
import * as AiError from "effect/ai/AiError"
import type * as Decision from "effect/ai/Decision"
import * as DecisionModel from "effect/ai/DecisionModel"
import * as AiModel from "effect/ai/Model"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Record from "effect/Record"
import { OpenAiClient } from "./OpenAiClient.ts"
import type * as OpenAiSchema from "./OpenAiSchema.ts"

/**
 * OpenAI decision model identifiers.
 *
 * @stability unstable
 * @category models
 * @since 4.0.5
 */
export type Model = typeof OpenAiSchema.CreateDecisionsRequest.Encoded["model"]

/**
 * Creates a decision model with OpenAI provider metadata.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.5
 */
export const model = (
  model: Model
): AiModel.Model<"openai", DecisionModel.DecisionModel, OpenAiClient> => AiModel.make("openai", model, layer({ model }))

/**
 * Builds a decision service with tolerance for two-decimal probability rounding.
 *
 * **Details**
 *
 * String state is sent as `input` unchanged, and other state is sent as JSON.
 * With images, `input` becomes one user message with the state as text,
 * followed by each image after a label naming the reference that replaces it
 * in the state. Base64 data is sent as `data:` URLs, and `data:` URLs are sent
 * unchanged.
 *
 * Probability criteria are appended to the question instructions, and each
 * rating level is sent with its label and description.
 * String instructions and descriptions are unchanged; structured values and
 * null descriptions are serialized with `JSON.stringify`.
 *
 * **Gotchas**
 *
 * - Remote URLs fail with `AiError.InvalidUserInputError` because OpenAI only
 *   accepts inline images.
 * - Refusals yield `"Refused"` with `decideSettled`; `decide` fails with
 *   `AiError.ContentPolicyError` naming the refused decisions.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.5
 */
export const make = Effect.fnUntraced(
  function*(
    options: { readonly model: Model }
  ): Effect.fn.Return<DecisionModel.DecisionModel, never, OpenAiClient> {
    const client = yield* OpenAiClient
    return yield* DecisionModel.make({
      probabilityPrecision: 2,
      supportsImages: true,
      decide: Effect.fnUntraced(function*({ state, decisions, images }) {
        if (images?.some(({ image }) => image.data instanceof URL && image.data.protocol !== "data:")) {
          return yield* invalidUserInput("OpenAI decisions accept base64 or data URL images, not remote URLs")
        }
        const questions: Array<typeof OpenAiSchema.DecisionQuestion.Encoded> = []
        for (const [name, decision] of Object.entries(decisions)) {
          questions.push(encodeQuestion(name, decision))
        }
        const text = typeof state === "string" ? state : JSON.stringify(state)
        const response = yield* client.createDecisions({
          model: options.model,
          input: images === undefined ? text : [{
            role: "user",
            content: [
              { type: "input_text", text },
              ...images.flatMap(({ reference, image }) => [
                { type: "input_text" as const, text: `Image ${reference}:` },
                { type: "input_image" as const, image_url: encodeImage(image) }
              ])
            ]
          }],
          questions
        })
        const answers: Record<string, DecisionModel.ProviderAnswer> = Object.create(null)
        for (const answer of response.answers) {
          if (answers[answer.name]?._tag === "Refusal") continue
          switch (answer.type) {
            case "refusal":
              answers[answer.name] = { _tag: "Refusal" }
              break
            case "choice":
              answers[answer.name] = {
                _tag: "Classify",
                label: answer.choice,
                probabilities: Record.fromIterableWith(answer.probabilities, (p) => [p.value, p.probability]),
                confidence: answer.confidence
              }
              break
            case "score": {
              const decision = decisions[answer.name]
              const levels = decision?._tag === "Rate" ? decision.criteria : []
              const probabilities: Record<string, number> = Object.create(null)
              for (const { value, probability } of answer.probabilities) {
                const level = levels[value]
                if (level !== undefined) probabilities[level.label] = probability
              }
              answers[answer.name] = {
                _tag: "Rate",
                rating: answer.score,
                probabilities,
                confidence: answer.confidence
              }
              break
            }
            case "predicate":
              answers[answer.name] = { _tag: "Probability", probability: answer.probability }
              break
          }
        }
        return {
          answers,
          usage: { inputTokens: response.usage?.input_tokens, outputTokens: response.usage?.output_tokens }
        }
      })
    })
  }
)

const invalidUserInput = (description: string) =>
  Effect.fail(AiError.make({
    module: "OpenAiDecisionModel",
    method: "decide",
    reason: new AiError.InvalidUserInputError({ description })
  }))

const encodeQuestion = (
  name: string,
  decision: Exclude<Decision.Any, Decision.Locate>
): typeof OpenAiSchema.DecisionQuestion.Encoded => {
  const instructions = encodeDescription(decision.instructions)
  switch (decision._tag) {
    case "Classify": {
      const choices = Object.entries(decision.criteria).map(([value, description]) => ({
        value,
        description: encodeDescription(description)
      }))
      return { type: "choice", name, instructions, choices }
    }
    case "Rate":
      return {
        type: "score",
        name,
        instructions,
        levels: decision.criteria.map(({ label, description }) => ({
          label,
          description: encodeDescription(description)
        }))
      }
    case "Probability": {
      if (decision.criteria === undefined) return { type: "predicate", name, instructions }
      const { false: no, true: yes } = decision.criteria
      return {
        type: "predicate",
        name,
        instructions: `${instructions}\n\nfalse: ${encodeDescription(no)}\ntrue: ${encodeDescription(yes)}`
      }
    }
  }
}

const encodeDescription = (description: Decision.Description | null): string =>
  typeof description === "string" ? description : JSON.stringify(description)

const encodeImage = (image: DecisionModel.ProviderImage["image"]): string =>
  image.data instanceof URL ? image.data.href : `data:${image.mediaType};base64,${image.data}`

/**
 * Provides DecisionModel using an existing OpenAiClient.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.5
 */
export const layer = (
  options: { readonly model: Model }
): Layer.Layer<DecisionModel.DecisionModel, never, OpenAiClient> =>
  Layer.effect(DecisionModel.DecisionModel, make(options))
