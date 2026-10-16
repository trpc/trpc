/**
 * @title Using LanguageModel for text, objects, and streams
 *
 * Configure a provider once, then use `LanguageModel` for plain text
 * generation, schema-validated object generation, and streaming responses.
 */
import { AnthropicClient, AnthropicLanguageModel } from "@effect/ai-anthropic"
import { OpenAiClient, OpenAiLanguageModel } from "@effect/ai-openai"
import { Config, Context, Effect, ExecutionPlan, Layer, Schema, Stream } from "effect"
import { AiError, LanguageModel, Model, type Response } from "effect/ai"
import { FetchHttpClient } from "effect/http"
import { LaunchPlan } from "./fixtures/domain/LaunchPlan.ts"

// You can use Config to create ai clients
const AnthropicClientLayer = AnthropicClient.layerConfig({
  apiKey: Config.Redacted("ANTHROPIC_API_KEY")
}).pipe(
  // Providers typically require an HttpClient, but you can choose which one to
  // use.
  Layer.provide(FetchHttpClient.layer)
)

const OpenAiClientLayer = OpenAiClient.layerConfig({
  apiKey: Config.Redacted("OPENAI_API_KEY")
}).pipe(
  Layer.provide(FetchHttpClient.layer)
)

export class AiWriterError extends Schema.TaggedError<AiWriterError>()("AiWriterError", {
  // AiErrorReason is a Schema, so we can include it directly in our custom
  // error schema.
  reason: AiError.AiErrorReason
}) {
  static fromAiError(error: AiError.AiError) {
    return new AiWriterError({
      reason: error.reason
    })
  }
}

// You can use `ExecutionPlan` to define a strategy for trying multiple
// providers with different configurations. In this example, we try a cheaper
// OpenAI model first, then fall back to a more expensive Anthropic model if the
// first one fails.
const DraftPlan = ExecutionPlan.make(
  {
    provide: OpenAiLanguageModel.model("gpt-5.2"),
    // Attempt to use the openai model up to 3 times before falling back to the
    // anthropic model.
    attempts: 3
  },
  {
    provide: AnthropicLanguageModel.model("claude-opus-4-6"),
    attempts: 2
  }
)

export class AiWriter extends Context.Service<AiWriter, {
  draftAnnouncement(product: string): Effect.Effect<{
    readonly provider: string
    readonly text: string
  }, AiWriterError>
  extractLaunchPlan(notes: string): Effect.Effect<LaunchPlan, AiWriterError>
  streamReleaseHighlights(version: string): Stream.Stream<string, AiWriterError>
}>()("docs/AiWriter") {
  static readonly layer = Layer.effect(
    AiWriter,
    Effect.gen(function*() {
      // Calling `captureRequirements` on an `ExecutionPlan` will move the
      // requirements of the plan (in this case the ai clients) into the Layer
      // requirements.
      const draftsModel = yield* DraftPlan.captureRequirements

      // Use a different model for the launch plan extraction
      const launchPlanModel = yield* OpenAiLanguageModel.model("gpt-4.1").captureRequirements

      const draftAnnouncement = Effect.fn("AiWriter.draftAnnouncement")(
        function*(product: string) {
          const model = yield* LanguageModel.LanguageModel
          const provider = yield* Model.ProviderName
          const response = yield* model.generateText({
            prompt: `Write a short launch announcement for ${product}. ` +
              "Keep it concise and include one concrete user benefit."
          })

          // `LanguageModel.generateText` exposes convenience fields so you can
          // inspect usage and finish reason without parsing content parts.
          yield* Effect.logInfo(
            `${provider} finished with ${response.finishReason}. outputTokens=${response.usage.outputTokens.total}`
          )

          return {
            provider,
            text: response.text
          }
        },
        // To apply an `ExecutionPlan`, we use `Effect.withExecutionPlan`
        Effect.withExecutionPlan(draftsModel),
        // Map AiError into our custom error type
        Effect.mapError((error) => AiWriterError.fromAiError(error))
      )

      const extractLaunchPlan = Effect.fn("AiWriter.extractLaunchPlan")(
        function*(notes: string) {
          const model = yield* LanguageModel.LanguageModel
          const response = yield* model.generateObject({
            objectName: "launch_plan",
            prompt:
              "Convert these notes into a launch plan object with audience, channels, launchDate, summary, and keyRisks:\n" +
              notes,
            // The generated object is validated and decoded through this schema.
            schema: LaunchPlan
          })

          return response.value
        },
        // The .model(...) apis return a Layer that can be used with
        // Effect.provide
        Effect.provide(launchPlanModel),
        // Map AiError into our custom error type
        Effect.mapError((error) => AiWriterError.fromAiError(error))
      )

      const streamReleaseHighlights = (version: string) =>
        LanguageModel.streamText({
          prompt: `Write release highlights for version ${version} as a short bulleted list.`
        }).pipe(
          Stream.filter((part): part is Response.TextDeltaPart => part.type === "text-delta"),
          Stream.map((part) => part.delta),
          Stream.provide(launchPlanModel),
          // Map AiError into our custom error type
          Stream.mapError((error) => AiWriterError.fromAiError(error))
        )

      return AiWriter.of({
        draftAnnouncement,
        extractLaunchPlan,
        streamReleaseHighlights
      })
    })
  ).pipe(
    // This Layer has requirements for both the OpenAI and Anthropic clients,
    // since the ExecutionPlan includes models from both providers.
    Layer.provide([OpenAiClientLayer, AnthropicClientLayer])
  )
}

// We can now use `AiWriter` like any other Effect service.
export const program: Effect.Effect<
  void,
  AiWriterError,
  AiWriter
> = Effect.gen(function*() {
  const writer = yield* AiWriter
  yield* writer.draftAnnouncement("Effect Cloud")
})
