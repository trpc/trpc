/**
 * @title Defining and using AI tools
 *
 * Define tools with schemas, group them into toolkits, implement handlers,
 * and pass them to `LanguageModel.generateText`.
 */
import { OpenAiClient, OpenAiLanguageModel, OpenAiTool } from "@effect/ai-openai"
import { Config, Context, Effect, Layer, Schema } from "effect"
import { AiError, LanguageModel, Tool, Toolkit } from "effect/ai"
import { FetchHttpClient } from "effect/http"

// ---------------------------------------------------------------------------
// 1. Defining tools
// ---------------------------------------------------------------------------

const ProductId = Schema.String.pipe(Schema.brand("ProductId")).annotate({
  description: "A unique identifier for a product, e.g. 'p-123'"
})

class Product extends Schema.Class<Product>("acme/domain/Product")({
  id: ProductId,
  name: Schema.String,
  price: Schema.Finite
}) {}

// Each tool has a name, an optional description, a parameters schema that the
// model fills in, and a success schema for the handler result. The description
// is shown to the model to help it decide when to call the tool.
const SearchProducts = Tool.make("SearchProducts", {
  description: "Search the product catalog by keyword",
  parameters: Schema.Struct({
    query: Schema.String.annotate({
      // Add a description to individual parameters for even better model
      // guidance.
      description: "The search query, e.g. 'wireless headphones'"
    }),
    maxResults: Schema.Natural.pipe(Schema.withDecodingDefault(Effect.succeed(10))).annotate({
      description: "The maximum number of results to return"
    })
  }),
  success: Schema.Array(Product),
  // The strategy used for handling errors returned from tool call handler
  // execution.
  //
  // If set to `"error"` (the default), errors that occur during tool call handler
  // execution will be returned in the error channel of the calling effect.
  //
  // If set to `"return"`, errors that occur during tool call handler execution
  // will be captured and returned as part of the tool call result.
  failureMode: "error"
})

const GetInventory = Tool.make("GetInventory", {
  description: "Check current stock level for a product",
  parameters: Schema.Struct({
    productId: ProductId
  }),
  success: Schema.Struct({
    productId: ProductId,
    available: Schema.Natural
  })
})

// ---------------------------------------------------------------------------
// 2. Grouping tools into a Toolkit
// ---------------------------------------------------------------------------

// `Toolkit.make` accepts any number of tools and produces a typed toolkit that
// knows the names and schemas of every tool it contains.
const ProductToolkit = Toolkit.make(SearchProducts, GetInventory)

// ---------------------------------------------------------------------------
// 3. Implementing handlers via toLayer
// ---------------------------------------------------------------------------

// `toLayer` returns a `Layer` that satisfies the handler requirements for every
// tool in the toolkit. Each handler receives the decoded parameters and returns
// an Effect producing the success type.
const ProductToolkitLayer = ProductToolkit.toLayer(Effect.gen(function*() {
  yield* Effect.log("Initializing ProductToolkitLive")
  // Here you could access other services or resources needed to implement the
  // handlers, e.g. a database client or external API client.
  //
  // const client = yield* SomeDatabaseClient
  return ProductToolkit.of({
    SearchProducts: Effect.fn("ProductToolkit.SearchProducts")(function*({ query, maxResults }) {
      return [
        new Product({ id: ProductId.make("p-1"), name: `${query} widget`, price: 19.99 }),
        new Product({ id: ProductId.make("p-2"), name: `${query} gadget`, price: 29.99 })
      ].slice(0, maxResults)
    }),
    GetInventory: Effect.fn("ProductToolkit.GetInventory")(function*({ productId }) {
      return { productId, available: 42 }
    })
  })
}))

// ---------------------------------------------------------------------------
// 4. Using tools with LanguageModel
// ---------------------------------------------------------------------------

// Provider setup (same pattern as the language-model example).
const OpenAiClientLayer = OpenAiClient.layerConfig({
  apiKey: Config.Redacted("OPENAI_API_KEY")
}).pipe(Layer.provide(FetchHttpClient.layer))

export class ProductAssistantError extends Schema.TaggedError<ProductAssistantError>()(
  "ProductAssistantError",
  { reason: AiError.AiErrorReason }
) {}

// Wrap tool-enabled generation in a service
export class ProductAssistant extends Context.Service<ProductAssistant, {
  answer(question: string): Effect.Effect<{
    readonly text: string
    readonly toolCallCount: number
  }, ProductAssistantError>
}>()("docs/ProductAssistant") {
  static readonly layer = Layer.effect(
    ProductAssistant,
    Effect.gen(function*() {
      // Access the toolkit's handlers by yielding the toolkit definition.
      const toolkit = yield* ProductToolkit

      // Choose a model to use
      const model = yield* OpenAiLanguageModel.model("gpt-5.2").captureRequirements

      const answer = Effect.fn("ProductAssistant.answer")(
        function*(question: string) {
          // Pass the toolkit to `generateText`. The model can call any tool in
          // the toolkit; the framework resolves parameters, invokes handlers,
          // and feeds results back automatically.
          const response = yield* LanguageModel.generateText({
            prompt: question,
            toolkit,
            // You can set `toolChoice` to "required" to force the model to call
            // a tool before responding with text.
            //
            // By default it is set to "auto"
            toolChoice: "required"
          })

          // -------------------------------------------------------------------
          // 5. Inspecting tool calls and results
          // -------------------------------------------------------------------

          // `response.toolCalls` lists every tool the model invoked, each with
          // the tool name, a unique id, and the decoded parameters.
          for (const call of response.toolCalls) {
            yield* Effect.log(`Tool call: ${call.name} id=${call.id}`)
          }

          // `response.toolResults` lists the resolved results, each with the
          // tool name, id, decoded result, and an `isFailure` flag.
          for (const result of response.toolResults) {
            yield* Effect.log(
              `Tool result: ${result.name} id=${result.id} isFailure=${result.isFailure}`
            )
          }

          return {
            text: response.text,
            toolCallCount: response.toolCalls.length
          }
        },
        // Provide the chosen model to use
        Effect.provide(model),
        (_) => _,
        // Map AI errors into our domain error type
        Effect.catchTag(
          "AiError",
          (error) =>
            Effect.fail(
              new ProductAssistantError({
                reason: error.reason
              })
            ),
          // For unexpected errors, die with the original error
          (e) => Effect.die(e)
        )
      )

      return ProductAssistant.of({ answer })
    })
  ).pipe(
    // The toolkit handler layer must be provided so the framework can invoke
    // the tool handlers when the model makes tool calls.
    Layer.provide(ProductToolkitLayer),
    // Also provide the openai client required by OpenAiLanguageModel.model
    Layer.provide(OpenAiClientLayer)
  )
}

// ---------------------------------------------------------------------------
// 6. Provider-defined tools
// ---------------------------------------------------------------------------

// Some providers offer built-in tools (web search, code interpreter, etc.)
// that run server-side. Use `Tool.providerDefined` or the pre-built
// definitions from provider packages.

// OpenAI's web search tool is pre-defined in `@effect/ai-openai`. Calling it
// produces a tool instance that can be merged into any toolkit.
const webSearch = OpenAiTool.WebSearch({
  search_context_size: "medium"
})

// Combine user-defined and provider-defined tools in a single toolkit.
const AssistantToolkit = Toolkit.make(SearchProducts, GetInventory, webSearch)

// Only user-defined tools that require handlers appear in `toLayer`. The
// provider-defined `WebSearch` is executed server-side by the provider.
export const AssistantToolkitLayer = AssistantToolkit.toLayer(Effect.gen(function*() {
  yield* Effect.log("Initializing AssistantToolkitLive")
  return AssistantToolkit.of({
    SearchProducts: Effect.fn("AssistantToolkit.SearchProducts")(function*({ query, maxResults }) {
      return [
        new Product({ id: ProductId.make("p-1"), name: `${query} widget`, price: 19.99 }),
        new Product({ id: ProductId.make("p-2"), name: `${query} gadget`, price: 29.99 })
      ].slice(0, maxResults)
    }),
    GetInventory: Effect.fn("AssistantToolkit.GetInventory")(function*({ productId }) {
      return { productId, available: 42 }
    })
  })
}))
