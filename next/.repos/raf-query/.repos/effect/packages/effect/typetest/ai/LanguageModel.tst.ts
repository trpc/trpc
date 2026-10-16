import { Context, Effect, Schema, SchemaGetter, type Stream } from "effect"
import { type AiError, type Chat, LanguageModel, Tool, Toolkit } from "effect/ai"
import type * as Response from "effect/ai/Response"
import { describe, expect, it } from "tstyche"

type IsExact<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false

const FailureModeErrorTool = Tool.make("FailureModeErrorTool", {
  parameters: Schema.Struct({
    input: Schema.String
  }),
  success: Schema.Struct({
    output: Schema.String
  }),
  failure: Schema.Struct({
    message: Schema.String
  })
})

class RequestContext extends Context.Service<RequestContext, {
  readonly requestId: string
}>()("RequestContext") {}

const ToolWithRequestContext = Tool.make("ToolWithRequestContext", {
  parameters: Schema.Struct({
    input: Schema.String
  }),
  success: Schema.Struct({
    output: Schema.String
  }),
  dependencies: [RequestContext]
})

const TransformTool = Tool.make("TransformTool", {
  parameters: Schema.FiniteFromString,
  success: Schema.Finite
})

class ParamEncodeService extends Context.Service<ParamEncodeService, {
  readonly use: Effect.Effect<void>
}>()("ParamEncodeService") {}

const AsymmetricParam = Schema.String.pipe(
  Schema.decodeTo(Schema.String, {
    decode: SchemaGetter.passthrough(),
    encode: SchemaGetter.transformEffect<string, string, ParamEncodeService>((value) =>
      Effect.as(Effect.service(ParamEncodeService), value)
    )
  })
)

const AsymmetricParamsTool = Tool.make("AsymmetricParamsTool", {
  parameters: Schema.Struct({ input: AsymmetricParam }),
  success: Schema.Struct({ output: Schema.String })
})

describe("LanguageModel", () => {
  describe("generateText", () => {
    it("uses encoded tool parameters when tool call resolution is disabled", () => {
      const toolkit = Toolkit.make(TransformTool)
      const program = LanguageModel.generateText({
        prompt: "hello",
        toolkit,
        disableToolCallResolution: true
      })

      type ProgramSuccess = typeof program extends Effect.Effect<infer A, any, any> ? A : never
      type ToolCallParams = ProgramSuccess["toolCalls"][number]["params"]

      expect<ToolCallParams>().type.toBe<string>()
    })

    it("uses opaque tool parameters when tool call resolution is enabled", () => {
      const toolkit = Toolkit.make(TransformTool)
      const program = LanguageModel.generateText({
        prompt: "hello",
        toolkit
      })

      type ProgramSuccess = typeof program extends Effect.Effect<infer A, any, any> ? A : never
      type ToolCallParams = ProgramSuccess["toolCalls"][number]["params"]

      expect<ToolCallParams>().type.toBe<unknown>()
    })

    it("uses opaque tool parameters for a non-literal resolution flag", () => {
      const toolkit = Toolkit.make(TransformTool)
      const disableToolCallResolution = null as unknown as boolean
      const program = LanguageModel.generateText({
        prompt: "hello",
        toolkit,
        disableToolCallResolution
      })

      type ProgramSuccess = typeof program extends Effect.Effect<infer A, any, any> ? A : never
      type ToolCallParams = ProgramSuccess["toolCalls"][number]["params"]

      expect<ToolCallParams>().type.toBe<unknown>()
    })

    it("returns an empty tool record when no toolkit is provided", () => {
      const program = LanguageModel.generateText({
        prompt: "hello"
      })

      type ProgramSuccess = typeof program extends Effect.Effect<infer A, any, any> ? A : never

      expect<ProgramSuccess>().type.toBe<LanguageModel.GenerateTextResponse<{}>>()
      expect<IsExact<ProgramSuccess, LanguageModel.GenerateTextResponse<{}>>>().type.toBe<true>()
    })

    it("tool handlers do not leak AiErrorReason into the error channel", () => {
      const toolkit = Toolkit.make(FailureModeErrorTool)
      const program = LanguageModel.generateText({
        prompt: "hello",
        toolkit
      })

      type ProgramError = typeof program extends Effect.Effect<any, infer E, any> ? E : never

      expect<ProgramError>().type.toBe<AiError.AiError | { readonly message: string }>()
      expect<Extract<ProgramError, AiError.AiErrorReason>>().type.toBe<never>()
    })

    it("includes tool request dependencies when a toolkit is provided", () => {
      const toolkit = Toolkit.make(ToolWithRequestContext)
      const program = LanguageModel.generateText({
        prompt: "hello",
        toolkit
      })

      type ProgramRequirements = typeof program extends Effect.Effect<any, any, infer R> ? R : never

      expect<ProgramRequirements>().type.toBe<
        LanguageModel.LanguageModel | RequestContext | Tool.HandlersFor<Toolkit.Tools<typeof toolkit>>
      >()
    })

    it("includes parameter encoding services in the requirements", () => {
      const toolkit = Toolkit.make(AsymmetricParamsTool)
      const program = LanguageModel.generateText({
        prompt: "hello",
        toolkit
      })

      type ProgramRequirements = typeof program extends Effect.Effect<any, any, infer R> ? R : never

      expect<ProgramRequirements>().type.toBe<
        LanguageModel.LanguageModel | ParamEncodeService | Tool.HandlersFor<Toolkit.Tools<typeof toolkit>>
      >()
    })

    it("includes parameter encoding services when tool call resolution is disabled", () => {
      const toolkit = Toolkit.make(AsymmetricParamsTool)
      const program = LanguageModel.generateText({
        prompt: "hello",
        toolkit,
        disableToolCallResolution: true
      })

      type ProgramRequirements = typeof program extends Effect.Effect<any, any, infer R> ? R : never

      expect<ProgramRequirements>().type.toBe<LanguageModel.LanguageModel | ParamEncodeService>()
    })

    it("omits handler and result requirements when tool call resolution is disabled", () => {
      const toolkit = Toolkit.make(ToolWithRequestContext)
      const program = LanguageModel.generateText({
        prompt: "hello",
        toolkit,
        disableToolCallResolution: true
      })

      type ProgramRequirements = typeof program extends Effect.Effect<any, any, infer R> ? R : never

      expect<ProgramRequirements>().type.toBe<LanguageModel.LanguageModel>()
    })

    it("includes tool request dependencies for resolved toolkits with handlers", () => {
      const toolkit: Toolkit.WithHandler<{
        readonly ToolWithRequestContext: typeof ToolWithRequestContext
      }> = {
        tools: {
          ToolWithRequestContext
        },
        handle: () => Effect.die("not implemented")
      }
      const program = LanguageModel.generateText({
        prompt: "hello",
        toolkit
      })

      type ProgramRequirements = typeof program extends Effect.Effect<any, any, infer R> ? R : never

      expect<ProgramRequirements>().type.toBe<LanguageModel.LanguageModel | RequestContext>()
    })

    it("supports toolkit unions in options", () => {
      const toolkitA = Toolkit.make(ToolWithRequestContext)
      const toolkitB = Toolkit.make(FailureModeErrorTool)
      const cond = Math.random() > 0.5
      const toolkit = cond ? toolkitA : toolkitB
      type ToolkitUnionHandlers =
        | Tool.Handler<"ToolWithRequestContext">
        | Tool.Handler<"FailureModeErrorTool">

      const program = LanguageModel.generateText({
        prompt: "hello",
        toolkit
      })

      type ProgramError = typeof program extends Effect.Effect<any, infer E, any> ? E : never
      type ProgramRequirements = typeof program extends Effect.Effect<any, any, infer R> ? R : never

      expect<ProgramError>().type.toBe<AiError.AiError | { readonly message: string }>()
      expect<ProgramRequirements>().type.toBe<
        LanguageModel.LanguageModel | RequestContext | ToolkitUnionHandlers
      >()
    })

    it("extracts services and tools from toolkit unions", () => {
      const toolkitA = Toolkit.make(ToolWithRequestContext)
      const toolkitB = Toolkit.make(FailureModeErrorTool)

      type ToolkitUnion = typeof toolkitA | typeof toolkitB
      type ToolkitUnionHandlers =
        | Tool.Handler<"ToolWithRequestContext">
        | Tool.Handler<"FailureModeErrorTool">
      type ToolkitUnionTools =
        | { readonly ToolWithRequestContext: typeof ToolWithRequestContext }
        | { readonly FailureModeErrorTool: typeof FailureModeErrorTool }

      expect<LanguageModel.ExtractServices<{ readonly toolkit: ToolkitUnion }>>().type.toBe<
        RequestContext | ToolkitUnionHandlers
      >()
      expect<LanguageModel.ExtractTools<{ readonly toolkit: ToolkitUnion }>>().type.toBe<
        ToolkitUnionTools
      >()
    })

    it("preserves generic toolkit tool records", () => {
      const helper = <Tools extends Record<string, Tool.Any>>(toolkit: Toolkit.WithHandler<Tools>) =>
        LanguageModel.generateText({
          prompt: "hello",
          toolkit
        })

      type ProgramSuccess = ReturnType<
        typeof helper<{
          readonly ToolWithRequestContext: typeof ToolWithRequestContext
        }>
      > extends Effect.Effect<infer A, any, any> ? A
        : never

      expect<ProgramSuccess>().type.toBe<
        LanguageModel.GenerateTextResponse<{
          readonly ToolWithRequestContext: typeof ToolWithRequestContext
        }, "opaque">
      >()
    })
  })

  describe("streamText", () => {
    it("uses encoded tool parameters when tool call resolution is disabled", () => {
      const toolkit = Toolkit.make(TransformTool)
      const stream = LanguageModel.streamText({
        prompt: "hello",
        toolkit,
        disableToolCallResolution: true
      })

      type StreamPart = typeof stream extends Stream.Stream<infer A, any, any> ? A : never
      type ToolCallParams = Extract<StreamPart, { readonly type: "tool-call" }>["params"]

      expect<ToolCallParams>().type.toBe<string>()
    })

    it("returns an empty tool record when no toolkit is provided", () => {
      const stream = LanguageModel.streamText({
        prompt: "hello"
      })

      type StreamPart = typeof stream extends Stream.Stream<infer A, any, any> ? A : never

      expect<StreamPart>().type.toBe<Response.StreamPart<{}>>()
      expect<IsExact<StreamPart, Response.StreamPart<{}>>>().type.toBe<true>()
    })

    it("preserves generic toolkit tool records", () => {
      const helper = <Tools extends Record<string, Tool.Any>>(toolkit: Toolkit.WithHandler<Tools>) =>
        LanguageModel.streamText({
          prompt: "hello",
          toolkit
        })

      type StreamPart = ReturnType<
        typeof helper<{
          readonly ToolWithRequestContext: typeof ToolWithRequestContext
        }>
      > extends Stream.Stream<infer A, any, any> ? A
        : never

      expect<StreamPart>().type.toBe<
        Response.StreamPart<{
          readonly ToolWithRequestContext: typeof ToolWithRequestContext
        }, "opaque">
      >()
    })

    it("uses opaque tool parameters when tool call resolution is enabled", () => {
      const toolkit = Toolkit.make(TransformTool)
      const stream = LanguageModel.streamText({
        prompt: "hello",
        toolkit
      })

      type StreamPart = typeof stream extends Stream.Stream<infer A, any, any> ? A : never
      type ToolCallParams = Extract<StreamPart, { readonly type: "tool-call" }>["params"]

      expect<ToolCallParams>().type.toBe<unknown>()
    })
  })

  describe("generateObject", () => {
    it("uses encoded tool parameters when tool call resolution is disabled", () => {
      const toolkit = Toolkit.make(TransformTool)
      const program = LanguageModel.generateObject({
        prompt: "hello",
        toolkit,
        schema: Schema.Struct({ answer: Schema.Number }),
        disableToolCallResolution: true
      })

      type ProgramSuccess = typeof program extends Effect.Effect<infer A, any, any> ? A : never
      type ToolCallParams = ProgramSuccess["toolCalls"][number]["params"]

      expect<ToolCallParams>().type.toBe<string>()
    })
  })

  describe("Chat", () => {
    it("uses encoded tool parameters when tool call resolution is disabled", () => {
      const chat = null as unknown as Chat.Chat
      const toolkit = Toolkit.make(TransformTool)
      const program = chat.generateText({
        prompt: "hello",
        toolkit,
        disableToolCallResolution: true
      })

      type ProgramSuccess = typeof program extends Effect.Effect<infer A, any, any> ? A : never
      type ToolCallParams = ProgramSuccess["toolCalls"][number]["params"]

      expect<ToolCallParams>().type.toBe<string>()
    })
  })
})
