/**
 * Service for model-specific token counting and prompt truncation. Tokenization
 * depends on the target provider, model, and encoding rules, so this module
 * leaves the actual tokenization function to the service implementation.
 *
 * The `Tokenizer` service can count tokens for raw prompt input and shorten a
 * prompt to a token limit by keeping the newest messages that fit. This module
 * defines the service tag, the service interface, and a `make` constructor that
 * builds a full tokenizer service from a token-counting function.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Context from "../Context.ts"
import * as Effect from "../Effect.ts"
import * as Predicate from "../Predicate.ts"
import type * as AiError from "./AiError.ts"
import * as Prompt from "./Prompt.ts"

/**
 * Service tag for model tokenization services.
 *
 * **When to use**
 *
 * Use to access or provide model-specific token counting and prompt truncation
 * operations.
 *
 * **Details**
 *
 * This tag provides access to tokenization functionality throughout your
 * application, enabling token counting and prompt truncation capabilities.
 *
 * **Example** (Accessing the Tokenizer service)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 * import { Tokenizer } from "effect/ai"
 *
 * const useTokenizer = Effect.gen(function*() {
 *   const tokenizer = yield* Tokenizer.Tokenizer
 *   const tokens = yield* tokenizer.tokenize("Hello, world!")
 *   return tokens.length
 * })
 *
 * const tokenizer = Tokenizer.make({
 *   tokenize: (prompt) => Effect.succeed(prompt.content.map((_, index) => index))
 * })
 * const result = useTokenizer.pipe(Effect.provideService(Tokenizer.Tokenizer, tokenizer))
 * await Effect.runPromise(result) // => 1
 * ```
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class Tokenizer extends Context.Service<Tokenizer, Service>()(
  "effect/ai/Tokenizer"
) {}

/**
 * Tokenizer service interface providing text tokenization and truncation
 * operations.
 *
 * **Details**
 *
 * This interface defines the core operations for converting text to tokens and
 * managing content length within token limits for AI model compatibility.
 *
 * **Example** (Implementing a custom tokenizer)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 * import { Prompt } from "effect/ai"
 * import type { Tokenizer } from "effect/ai"
 *
 * const customTokenizer: Tokenizer.Service = {
 *   tokenize: (input) =>
 *     Effect.succeed(input.toString().split(" ").map((_, i) => i)),
 *   truncate: (input, maxTokens) =>
 *     Effect.succeed(Prompt.make(input.toString().slice(0, maxTokens * 5)))
 * }
 *
 * const tokenCount = (await Effect.runPromise(customTokenizer.tokenize("one two three"))).length // => 3
 * const messageCount = (await Effect.runPromise(customTokenizer.truncate("hello world", 1))).content.length // => 1
 * ```
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Service {
  /**
   * Converts text input into an array of token numbers.
   */
  readonly tokenize: (
    /**
     * The text input to tokenize.
     */
    input: Prompt.RawInput
  ) => Effect.Effect<Array<number>, AiError.AiError>
  /**
   * Truncates text input to fit within the specified token limit.
   */
  readonly truncate: (
    /**
     * The text input to truncate.
     */
    input: Prompt.RawInput,
    /**
     * Maximum number of tokens to retain.
     */
    tokens: number
  ) => Effect.Effect<Prompt.Prompt, AiError.AiError>
}

/**
 * Creates a Tokenizer service implementation from tokenization options.
 *
 * **Details**
 *
 * This function constructs a complete Tokenizer service by providing a
 * tokenization function. The service handles both tokenization and
 * truncation operations using the provided tokenizer.
 *
 * **Example** (Creating a word tokenizer)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 * import { Tokenizer } from "effect/ai"
 *
 * // Simple word-based tokenizer
 * const wordTokenizer = Tokenizer.make({
 *   tokenize: (prompt) =>
 *     Effect.succeed(
 *       prompt.content
 *         .flatMap((msg) =>
 *           typeof msg.content === "string"
 *             ? msg.content.split(" ")
 *             : msg.content.flatMap((part) =>
 *               part.type === "text" ? part.text.split(" ") : []
 *             )
 *         )
 *         .map((_, index) => index)
 *     )
 * })
 *
 * await Effect.runPromise(wordTokenizer.tokenize("hello effect world")) // => [0, 1, 2]
 * ```
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const make = (options: {
  readonly tokenize: (content: Prompt.Prompt) => Effect.Effect<Array<number>, AiError.AiError>
}): Service =>
  Tokenizer.of({
    tokenize(input) {
      return options.tokenize(Prompt.make(input))
    },
    truncate(input, tokens) {
      return truncate(Prompt.make(input), options.tokenize, tokens)
    }
  })

const truncate = (
  self: Prompt.Prompt,
  tokenize: (input: Prompt.Prompt) => Effect.Effect<Array<number>, AiError.AiError>,
  maxTokens: number
): Effect.Effect<Prompt.Prompt, AiError.AiError> =>
  Effect.suspend(() => {
    let inputMessages = self.content
    let outputMessages: Array<Prompt.Message> = []
    const loop: Effect.Effect<Prompt.Prompt, AiError.AiError> = Effect.suspend(() => {
      const message = inputMessages[inputMessages.length - 1]
      if (Predicate.isUndefined(message)) {
        return Effect.succeed(Prompt.fromMessages(outputMessages))
      }
      inputMessages = inputMessages.slice(0, inputMessages.length - 1)
      const candidate = [message, ...outputMessages]
      return Effect.flatMap(tokenize(Prompt.fromMessages(candidate)), (tokens) => {
        if (tokens.length > maxTokens) {
          return Effect.succeed(Prompt.fromMessages(outputMessages))
        }
        outputMessages = candidate
        return loop
      })
    })
    return loop
  })
