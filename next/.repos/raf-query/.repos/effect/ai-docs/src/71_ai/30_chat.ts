/**
 * @title Stateful chat sessions
 *
 * The AI `Chat` module maintains conversation history automatically. Build
 * AI agents or chat assistants.
 */
import { OpenAiClient, OpenAiLanguageModel } from "@effect/ai-openai"
import { Config, Context, DateTime, Effect, Layer, Ref, Schema } from "effect"
import { AiError, Chat, Prompt, Tool, Toolkit } from "effect/ai"
import { FetchHttpClient } from "effect/http"

// ---------------------------------------------------------------------------
// Provider setup
// ---------------------------------------------------------------------------

const OpenAiClientLayer = OpenAiClient.layerConfig({
  apiKey: Config.Redacted("OPENAI_API_KEY")
}).pipe(Layer.provide(FetchHttpClient.layer))

// ---------------------------------------------------------------------------
// Tools for the agentic loop
// ---------------------------------------------------------------------------

const Tools = Toolkit.make(Tool.make("getCurrentTime", {
  description: "Get the current time in ISO format",
  parameters: Schema.Struct({
    id: Schema.String
  }),
  success: Schema.String
}))

const ToolsLayer = Tools.toLayer(Effect.gen(function*() {
  yield* Effect.logDebug("Initializing tools...")
  return Tools.of({
    getCurrentTime: Effect.fn("Tools.getCurrentTime")(function*(_) {
      const now = yield* DateTime.now
      return DateTime.formatIso(now)
    })
  })
}))

// ---------------------------------------------------------------------------
// Service that wraps Chat for a domain use-case
// ---------------------------------------------------------------------------

export class AiAssistantError extends Schema.TaggedError<AiAssistantError>()("AiAssistantError", {
  reason: AiError.AiErrorReason
}) {
  static fromAiError(error: AiError.AiError) {
    return new AiAssistantError({ reason: error.reason })
  }
}

export class AiAssistant extends Context.Service<AiAssistant, {
  // Send a message while maintaining conversation history across turns.
  chat(message: string): Effect.Effect<string, AiAssistantError>
  // Ask a question and use an agentic loop with tool calls to answer it.
  agent(question: string): Effect.Effect<string, AiAssistantError>
}>()("acme/AiAssistant") {
  static readonly layer = Layer.effect(
    AiAssistant,
    Effect.gen(function*() {
      // Choose the model you want to use for the chat sessions.
      const modelLayer = yield* OpenAiLanguageModel.model("gpt-5.2").captureRequirements

      // ---------------------------------------------------------------------------
      // 1. Chat.empty — basic multi-turn conversation
      // ---------------------------------------------------------------------------

      // Create a new chat session with `Chat.empty` or `Chat.fromPrompt`. The
      // session maintains conversation history automatically, so you can focus on
      // the current turn without having to manage context.
      const newSession = yield* Chat.fromPrompt(Prompt.empty.pipe(
        Prompt.setSystem("You are a helpful assistant that answers questions.")
      ))

      // You can also create a chat using a json export.
      const json = yield* newSession.exportJson
      const session = yield* Chat.fromJson(json)

      const chat = Effect.fn("AiAssistant.chat")(
        function*(message: string) {
          // Create a new turn in the conversation by passing the user's message
          // to `session.generateText`.
          const response = yield* session.generateText({ prompt: message }).pipe(
            // Provide the model layer to use.
            // You could potentially use different models for different turns,
            // or even switch models in the middle of a conversation.
            Effect.provide(modelLayer)
          )

          // You can inspect the accumulated history at any point through the
          // `history` ref on the chat instance.
          const history = yield* Ref.get(session.history)
          yield* Effect.logInfo(
            `Conversation has ${history.content.length} messages`
          )

          return response.text
        },
        Effect.mapError((error) => AiAssistantError.fromAiError(error))
      )

      // ---------------------------------------------------------------------------
      // 2. Create agentic loops with tools
      // ---------------------------------------------------------------------------

      const tools = yield* Tools
      const agent = Effect.fn("AiAssistant.agent")(
        function*(question: string) {
          // We start the agent with a system prompt and the user question. The
          // agent can then call tools in a loop until it decides to return a
          // final answer.
          const session = yield* Chat.fromPrompt([
            { role: "system", content: "You are an assistant that can use tools to answer questions." },
            { role: "user", content: question }
          ])

          while (true) {
            const response = yield* session.generateText({
              prompt: [], // No additional prompt — the model has full access to the conversation history
              toolkit: tools // Provide the tools to the model
            }).pipe(
              // Provide the model layer to use.
              // You could potentially use different models for different turns,
              // or even switch models in the middle of a conversation.
              Effect.provide(modelLayer)
            )
            if (response.toolCalls.length > 0) {
              // If the model called any tools, execute them and the Chat module
              // will automatically add the tool results to the conversation
              // history before the next turn.
              continue
            }
            // If there are no tool calls, the model has returned a final answer
            // and we can exit the loop.
            return response.text
          }
        },
        // Remap AI errors to our domain-specific error type, but die on
        // unexpected errors.
        Effect.catchTag(
          "AiError",
          (error) => Effect.fail(AiAssistantError.fromAiError(error)),
          (e) => Effect.die(e)
        )
      )

      return AiAssistant.of({
        chat,
        agent
      })
    })
  ).pipe(
    // Provide the OpenAI client and tools layers to the AiAssistant service.
    Layer.provide([OpenAiClientLayer, ToolsLayer])
  )
}
