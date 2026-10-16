import { Effect, Predicate, Stream } from "effect"
import type { AiError, IdGenerator, Response } from "effect/ai"
import { LanguageModel } from "effect/ai"
import { dual } from "effect/Function"

interface WithLanguageModelOptions {
  readonly generateText?:
    | Array<Response.PartEncoded>
    | ((options: LanguageModel.ProviderOptions) =>
      | Array<Response.PartEncoded>
      | Effect.Effect<Array<Response.PartEncoded>, AiError.AiError, IdGenerator.IdGenerator>)
  readonly streamText?:
    | Array<Response.StreamPartEncoded>
    | ((options: LanguageModel.ProviderOptions) =>
      | Array<Response.StreamPartEncoded>
      | Stream.Stream<Response.StreamPartEncoded, AiError.AiError, IdGenerator.IdGenerator>)
}

export const withLanguageModel: {
  (options: WithLanguageModelOptions): <A, E, R>(
    effect: Effect.Effect<A, E, R>
  ) => Effect.Effect<A, E, Exclude<R, LanguageModel.LanguageModel>>
  <A, E, R>(
    effect: Effect.Effect<A, E, R>,
    options: WithLanguageModelOptions
  ): Effect.Effect<A, E, Exclude<R, LanguageModel.LanguageModel>>
} = dual(2, <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  options: WithLanguageModelOptions
): Effect.Effect<A, E, Exclude<R, LanguageModel.LanguageModel>> =>
  Effect.provideServiceEffect(
    effect,
    LanguageModel.LanguageModel,
    LanguageModel.make({
      generateText: (opts) => {
        if (Predicate.isUndefined(options.generateText)) {
          return Effect.succeed([])
        }
        if (Array.isArray(options.generateText)) {
          return Effect.succeed(options.generateText)
        }
        const result = options.generateText(opts)
        return Effect.isEffect(result) ? result : Effect.succeed(result)
      },
      streamText: (opts) => {
        if (Predicate.isUndefined(options.streamText)) {
          return Stream.empty
        }
        if (Array.isArray(options.streamText)) {
          return Stream.fromIterable(options.streamText)
        }
        const result = options.streamText(opts)
        return Array.isArray(result) ? Stream.fromIterable(result) : result
      }
    })
  ))
