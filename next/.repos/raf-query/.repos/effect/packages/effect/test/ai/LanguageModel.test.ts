import { describe, it } from "@effect/vitest"
import { assertDefined, assertTrue, deepStrictEqual, strictEqual } from "@effect/vitest/utils"
import { type Cause, Effect, Fiber, Latch, Option, Queue, Ref, Schema, Stream } from "effect"
import { AiError, LanguageModel, Prompt, Response, ResponseIdTracker, Tool, Toolkit } from "effect/ai"
import { TestClock } from "effect/testing"
import * as TestUtils from "./utils.ts"

const MyTool = Tool.make("MyTool", {
  parameters: Schema.Struct({ testParam: Schema.String }),
  success: Schema.Struct({ testSuccess: Schema.String })
})

const MyToolkit = Toolkit.make(MyTool)

const MyToolkitLayer = MyToolkit.toLayer({
  MyTool: () =>
    Effect.succeed({ testSuccess: "test-success" }).pipe(
      Effect.delay("10 seconds")
    )
})

const TransformTool = Tool.make("TransformTool", {
  parameters: Schema.FiniteFromString,
  success: Schema.Finite
})

const TransformToolkit = Toolkit.make(TransformTool)

const TransformToolkitLayer = TransformToolkit.toLayer({
  TransformTool: (value) => Effect.succeed(value * 2)
})

const ReturnModeTool = Tool.make("ReturnModeTool", {
  failureMode: "return",
  parameters: Schema.Struct({ testParam: Schema.String }),
  success: Schema.Struct({ testSuccess: Schema.String }),
  failure: Schema.Struct({ testFailure: Schema.String })
})

const ReturnModeToolkit = Toolkit.make(ReturnModeTool)

const ApprovalTool = Tool.make("ApprovalTool", {
  parameters: Schema.Struct({ action: Schema.String }),
  success: Schema.Struct({ result: Schema.String }),
  needsApproval: true
})

const DynamicApprovalTool = Tool.make("DynamicApprovalTool", {
  parameters: Schema.Struct({ dangerous: Schema.Boolean }),
  success: Schema.Struct({ result: Schema.String }),
  needsApproval: (params) => params.dangerous
})

const ApprovalToolkit = Toolkit.make(ApprovalTool, DynamicApprovalTool)

const ApprovalToolkitLayer = ApprovalToolkit.toLayer({
  ApprovalTool: () => Effect.succeed({ result: "approved-result" }),
  DynamicApprovalTool: () => Effect.succeed({ result: "dynamic-result" })
})

describe("LanguageModel", () => {
  const finishPart: Response.FinishPartEncoded = {
    type: "finish",
    reason: "stop",
    usage: {
      inputTokens: { uncached: 5, total: 5, cacheRead: undefined, cacheWrite: undefined },
      outputTokens: { total: 5, text: undefined, reasoning: undefined }
    },
    response: undefined
  }

  describe("generateText", () => {
    it.effect("does not resolve tool calls after an incomplete finish", () =>
      Effect.gen(function*() {
        const calls = yield* Ref.make(0)
        const handlers = MyToolkit.toLayer({
          MyTool: () =>
            Ref.update(calls, (n) => n + 1).pipe(
              Effect.as({ testSuccess: "test-success" })
            )
        })

        for (const reason of ["length", "content-filter", "error", "unknown", "other"] as const) {
          const response = yield* LanguageModel.generateText({
            prompt: [],
            toolkit: MyToolkit
          }).pipe(
            TestUtils.withLanguageModel({
              generateText: [
                {
                  type: "tool-call",
                  id: `tool-${reason}`,
                  name: "MyTool",
                  params: { testParam: "test-param" }
                },
                { ...finishPart, reason }
              ]
            }),
            Effect.provide(handlers)
          )

          strictEqual(response.finishReason, reason)
          strictEqual(response.toolCalls.length, 1)
          strictEqual(response.toolResults.length, 1)

          const toolResult = response.toolResults[0]!
          strictEqual(toolResult.isFailure, true)
          deepStrictEqual<unknown>(toolResult.result, {
            type: "execution-interrupted",
            reason: `Tool call execution was interrupted because the response finished with reason "${reason}"`
          })
        }

        strictEqual(yield* Ref.get(calls), 0)
      }))

    it.effect("validates the complete response before resolving tool calls", () =>
      Effect.gen(function*() {
        const calls = yield* Ref.make(0)
        const handlers = MyToolkit.toLayer({
          MyTool: () =>
            Ref.update(calls, (n) => n + 1).pipe(
              Effect.as({ testSuccess: "test-success" })
            )
        })

        const error = yield* LanguageModel.generateText({
          prompt: [],
          toolkit: MyToolkit
        }).pipe(
          TestUtils.withLanguageModel({
            generateText: [
              {
                type: "tool-call",
                id: "tool-before-invalid-part",
                name: "MyTool",
                params: { testParam: "test-param" }
              },
              { type: "text", text: 123 } as any
            ]
          }),
          Effect.provide(handlers),
          Effect.flip
        )

        strictEqual(error.reason._tag, "InvalidOutputError")
        strictEqual(yield* Ref.get(calls), 0)
      }))

    it.effect("fails cleanly for a tool call with a missing params field", () =>
      Effect.gen(function*() {
        const calls = yield* Ref.make(0)
        const handlers = MyToolkit.toLayer({
          MyTool: () =>
            Ref.update(calls, (n) => n + 1).pipe(
              Effect.as({ testSuccess: "test-success" })
            )
        })

        const error = yield* LanguageModel.generateText({
          prompt: [],
          toolkit: MyToolkit
        }).pipe(
          TestUtils.withLanguageModel({
            generateText: [
              { type: "tool-call", id: "tool-no-params", name: "MyTool" } as any,
              finishPart
            ]
          }),
          Effect.provide(handlers),
          Effect.flip
        )

        strictEqual(error.reason._tag, "InvalidOutputError")
        strictEqual(yield* Ref.get(calls), 0)
      }))

    it.effect("validates encoded tool parameters when tool call resolution is disabled", () =>
      Effect.gen(function*() {
        const error = yield* LanguageModel.generateText({
          prompt: [],
          toolkit: TransformToolkit,
          disableToolCallResolution: true
        }).pipe(
          TestUtils.withLanguageModel({
            generateText: [{
              type: "tool-call",
              id: "tool-invalid-transform",
              name: "TransformTool",
              params: { invalid: true }
            }]
          }),
          Effect.provide(TransformToolkitLayer),
          Effect.flip
        )

        strictEqual(error.reason._tag, "InvalidOutputError")
      }))

    it.effect("preserves encoded tool parameters when tool call resolution is disabled", () =>
      Effect.gen(function*() {
        const response = yield* LanguageModel.generateText({
          prompt: [],
          toolkit: TransformToolkit,
          disableToolCallResolution: true
        })
        const toolCall = response.toolCalls[0]!

        strictEqual(toolCall.params, "21")

        const toolkit = yield* TransformToolkit
        const results = yield* toolkit.handle(toolCall.name, toolCall.params).pipe(
          Effect.flatMap(Stream.runCollect)
        )

        strictEqual(results[0].result, 42)
      }).pipe(
        TestUtils.withLanguageModel({
          generateText: [{
            type: "tool-call",
            id: "tool-transform",
            name: "TransformTool",
            params: "21"
          }]
        }),
        Effect.provide(TransformToolkitLayer)
      ))

    it.effect("preserves encoded tool parameters when tool call resolution is enabled", () =>
      Effect.gen(function*() {
        const response = yield* LanguageModel.generateText({
          prompt: [],
          toolkit: TransformToolkit
        })

        const toolCall = response.toolCalls[0]!
        strictEqual(toolCall.params, "21")

        const toolResult = response.toolResults[0]!
        strictEqual(toolResult.isFailure, false)
        strictEqual(toolResult.result, 42)
      }).pipe(
        TestUtils.withLanguageModel({
          generateText: [{
            type: "tool-call",
            id: "tool-transform",
            name: "TransformTool",
            params: "21"
          }]
        }),
        Effect.provide(TransformToolkitLayer)
      ))

    it.effect("validates tool parameters against the schemas of each request", () =>
      Effect.gen(function*() {
        const StructTransformToolkit = Toolkit.make(Tool.make("TransformTool", {
          parameters: Schema.Struct({ value: Schema.Finite }),
          success: Schema.Finite
        }))

        yield* LanguageModel.generateText({
          prompt: [],
          toolkit: TransformToolkit,
          disableToolCallResolution: true
        }).pipe(Effect.provide(TransformToolkitLayer))

        const error = yield* LanguageModel.generateText({
          prompt: [],
          toolkit: StructTransformToolkit,
          disableToolCallResolution: true
        }).pipe(
          Effect.provide(StructTransformToolkit.toLayer({ TransformTool: ({ value }) => Effect.succeed(value) })),
          Effect.flip
        )

        strictEqual(error.reason._tag, "InvalidOutputError")
      }).pipe(
        TestUtils.withLanguageModel({
          generateText: [{
            type: "tool-call",
            id: "tool-transform",
            name: "TransformTool",
            params: "21"
          }]
        })
      ))

    it.effect("validates encoded tool parameters after a request with tool call resolution enabled", () => {
      // A tool unused by other tests, so the opaque request decodes it first
      const toolkit = Toolkit.make(Tool.make("TransformTool", {
        parameters: Schema.FiniteFromString,
        success: Schema.Finite
      }))
      const responses: Array<Array<Response.PartEncoded>> = [
        [{ type: "tool-call", id: "tool-valid", name: "TransformTool", params: "21" }],
        [{ type: "tool-call", id: "tool-invalid", name: "TransformTool", params: { invalid: true } }]
      ]
      return Effect.gen(function*() {
        yield* LanguageModel.generateText({
          prompt: [],
          toolkit
        })

        const error = yield* LanguageModel.generateText({
          prompt: [],
          toolkit,
          disableToolCallResolution: true
        }).pipe(Effect.flip)

        strictEqual(error.reason._tag, "InvalidOutputError")
      }).pipe(
        TestUtils.withLanguageModel({
          generateText: () => responses.shift()!
        }),
        Effect.provide(toolkit.toLayer({ TransformTool: (value) => Effect.succeed(value * 2) }))
      )
    })

    it.effect("validates provider-executed tool call parameters", () =>
      Effect.gen(function*() {
        const calls = yield* Ref.make(0)
        const handlers = MyToolkit.toLayer({
          MyTool: () =>
            Ref.update(calls, (n) => n + 1).pipe(
              Effect.as({ testSuccess: "test-success" })
            )
        })

        const error = yield* LanguageModel.generateText({
          prompt: [],
          toolkit: MyToolkit
        }).pipe(
          TestUtils.withLanguageModel({
            generateText: [
              {
                type: "tool-call",
                id: "tool-provider-executed",
                name: "MyTool",
                providerExecuted: true,
                params: { testParam: 123 }
              } as any,
              finishPart
            ]
          }),
          Effect.provide(handlers),
          Effect.flip
        )

        strictEqual(error.reason._tag, "InvalidOutputError")
        strictEqual(yield* Ref.get(calls), 0)
      }))

    it.effect("accepts provider-executed tool calls with valid parameters", () =>
      Effect.gen(function*() {
        const calls = yield* Ref.make(0)
        const handlers = MyToolkit.toLayer({
          MyTool: () =>
            Ref.update(calls, (n) => n + 1).pipe(
              Effect.as({ testSuccess: "test-success" })
            )
        })

        const response = yield* LanguageModel.generateText({
          prompt: [],
          toolkit: MyToolkit
        }).pipe(
          TestUtils.withLanguageModel({
            generateText: [
              {
                type: "tool-call",
                id: "tool-provider-executed",
                name: "MyTool",
                providerExecuted: true,
                params: { testParam: "test-param" }
              },
              finishPart
            ]
          }),
          Effect.provide(handlers)
        )

        strictEqual(response.toolCalls.length, 1)
        deepStrictEqual(response.toolCalls[0]!.params, { testParam: "test-param" })
        strictEqual(yield* Ref.get(calls), 0)
      }))
  })

  describe("streamText", () => {
    it.effect("interrupts in-flight tool handlers on an incomplete finish", () =>
      Effect.gen(function*() {
        const toolCallObserved = yield* Latch.make()
        const handlerStarted = yield* Latch.make()
        const handlerInterrupted = yield* Latch.make()
        const handlers = MyToolkit.toLayer({
          MyTool: () =>
            handlerStarted.open.pipe(
              Effect.andThen(Effect.never),
              Effect.onInterrupt(() => handlerInterrupted.open),
              Effect.as({ testSuccess: "test-success" })
            )
        })
        const providerQueue = yield* Queue.make<Response.StreamPartEncoded, Cause.Done>()
        const parts: Array<Response.StreamPart<Toolkit.Tools<typeof MyToolkit>, "opaque">> = []

        const fiber = yield* LanguageModel.streamText({
          prompt: [],
          toolkit: MyToolkit
        }).pipe(
          Stream.runForEach((part) =>
            Effect.sync(() => {
              parts.push(part)
            }).pipe(
              Effect.andThen(part.type === "tool-call" ? toolCallObserved.open : Effect.void)
            )
          ),
          TestUtils.withLanguageModel({
            streamText: () => Stream.fromQueue(providerQueue)
          }),
          Effect.provide(handlers),
          Effect.forkScoped
        )

        yield* Queue.offer(providerQueue, {
          type: "tool-call",
          id: "tool-interrupted",
          name: "MyTool",
          params: { testParam: "test-param" }
        })
        yield* toolCallObserved.await
        // The handler starts once the stream moves past the tool call
        yield* Queue.offer(providerQueue, { type: "text-delta", id: "text-1", delta: "more" })
        yield* handlerStarted.await

        yield* Queue.offer(providerQueue, { ...finishPart, reason: "length" })
        yield* Queue.end(providerQueue)
        yield* Fiber.join(fiber)

        yield* handlerInterrupted.await
        deepStrictEqual(parts.map((part) => part.type), ["tool-call", "text-delta", "tool-result", "finish"])
        strictEqual(parts.find((part) => part.type === "finish")?.reason, "length")

        // The interrupted handler produced no result, so a synthesized
        // failure result resolves the tool call instead
        const toolResult = parts.find((part) => part.type === "tool-result")!
        strictEqual(toolResult.id, "tool-interrupted")
        strictEqual(toolResult.isFailure, true)
        deepStrictEqual<unknown>(toolResult.result, {
          type: "execution-interrupted",
          reason: `Tool call execution was interrupted because the response finished with reason "length"`
        })
      }))

    it.effect("does not start tool handlers when an incomplete finish arrives in the same chunk", () =>
      Effect.gen(function*() {
        const calls = yield* Ref.make(0)
        const handlers = MyToolkit.toLayer({
          MyTool: () =>
            Ref.update(calls, (n) => n + 1).pipe(
              Effect.as({ testSuccess: "test-success" })
            )
        })

        for (const reason of ["length", "content-filter", "error", "unknown", "other"] as const) {
          const parts = yield* LanguageModel.streamText({
            prompt: [],
            toolkit: MyToolkit
          }).pipe(
            Stream.runCollect,
            TestUtils.withLanguageModel({
              streamText: [
                {
                  type: "tool-call",
                  id: `tool-${reason}`,
                  name: "MyTool",
                  params: { testParam: "test-param" }
                },
                { ...finishPart, reason }
              ]
            }),
            Effect.provide(handlers)
          )

          deepStrictEqual(parts.map((part) => part.type), ["tool-call", "tool-result", "finish"])

          const toolResult = parts.find((part) => part.type === "tool-result")!
          strictEqual(toolResult.isFailure, true)
          deepStrictEqual<unknown>(toolResult.result, {
            type: "execution-interrupted",
            reason: `Tool call execution was interrupted because the response finished with reason "${reason}"`
          })
        }

        strictEqual(yield* Ref.get(calls), 0)
      }))

    it.effect("does not start tool handlers when an incomplete finish arrives in the next chunk", () =>
      Effect.gen(function*() {
        const calls = yield* Ref.make(0)
        const handlers = MyToolkit.toLayer({
          MyTool: () =>
            Ref.update(calls, (n) => n + 1).pipe(
              Effect.as({ testSuccess: "test-success" })
            )
        })
        const providerQueue = yield* Queue.make<Response.StreamPartEncoded, Cause.Done>()

        const fiber = yield* LanguageModel.streamText({
          prompt: [],
          toolkit: MyToolkit
        }).pipe(
          Stream.runCollect,
          TestUtils.withLanguageModel({
            streamText: () => Stream.fromQueue(providerQueue)
          }),
          Effect.provide(handlers),
          Effect.forkScoped
        )

        // The tool call and the truncating finish arrive back-to-back as
        // separate chunks - the handler must never start
        yield* Queue.offer(providerQueue, {
          type: "tool-call",
          id: "tool-next-chunk",
          name: "MyTool",
          params: { testParam: "test-param" }
        })
        yield* Queue.offer(providerQueue, { ...finishPart, reason: "length" })
        yield* Queue.end(providerQueue)
        const parts = yield* Fiber.join(fiber)

        strictEqual(yield* Ref.get(calls), 0)
        deepStrictEqual(parts.map((part) => part.type), ["tool-call", "tool-result", "finish"])

        const toolResult = parts.find((part) => part.type === "tool-result")!
        strictEqual(toolResult.isFailure, true)
        deepStrictEqual<unknown>(toolResult.result, {
          type: "execution-interrupted",
          reason: `Tool call execution was interrupted because the response finished with reason "length"`
        })
      }))

    it.effect("keeps results of handlers that completed before an incomplete finish", () =>
      Effect.gen(function*() {
        const parts: Array<Response.StreamPart<Toolkit.Tools<typeof MyToolkit>, "opaque">> = []
        const toolCallObserved = yield* Latch.make()
        const resultObserved = yield* Latch.make()
        const providerQueue = yield* Queue.make<Response.StreamPartEncoded, Cause.Done>()
        const handlers = MyToolkit.toLayer({
          MyTool: () => Effect.succeed({ testSuccess: "test-success" })
        })

        const fiber = yield* LanguageModel.streamText({
          prompt: [],
          toolkit: MyToolkit
        }).pipe(
          Stream.runForEach((part) =>
            Effect.sync(() => {
              parts.push(part)
            }).pipe(
              Effect.andThen(
                part.type === "tool-call"
                  ? toolCallObserved.open
                  : part.type === "tool-result"
                  ? resultObserved.open
                  : Effect.void
              )
            )
          ),
          TestUtils.withLanguageModel({
            streamText: () => Stream.fromQueue(providerQueue)
          }),
          Effect.provide(handlers),
          Effect.forkScoped
        )

        yield* Queue.offer(providerQueue, {
          type: "tool-call",
          id: "tool-completed",
          name: "MyTool",
          params: { testParam: "test-param" }
        })
        yield* toolCallObserved.await
        yield* Queue.offer(providerQueue, { type: "text-delta", id: "text-1", delta: "more" })
        yield* resultObserved.await

        yield* Queue.offer(providerQueue, { ...finishPart, reason: "length" })
        yield* Queue.end(providerQueue)
        yield* Fiber.join(fiber)

        // The completed handler keeps its real result and no synthesized
        // failure result is added for the same call
        deepStrictEqual(parts.map((part) => part.type), ["tool-call", "text-delta", "tool-result", "finish"])
        const toolResult = parts.find((part) => part.type === "tool-result")!
        strictEqual(toolResult.isFailure, false)
        deepStrictEqual(toolResult.result, { testSuccess: "test-success" })
      }))

    it.effect("does not synthesize results for tool calls awaiting approval on an incomplete finish", () =>
      Effect.gen(function*() {
        const parts: Array<Response.StreamPart<Toolkit.Tools<typeof ApprovalToolkit>, "opaque">> = []
        const toolCallObserved = yield* Latch.make()
        const approvalObserved = yield* Latch.make()
        const providerQueue = yield* Queue.make<Response.StreamPartEncoded, Cause.Done>()

        const fiber = yield* LanguageModel.streamText({
          prompt: [],
          toolkit: ApprovalToolkit
        }).pipe(
          Stream.runForEach((part) =>
            Effect.sync(() => {
              parts.push(part)
            }).pipe(
              Effect.andThen(
                part.type === "tool-call"
                  ? toolCallObserved.open
                  : part.type === "tool-approval-request"
                  ? approvalObserved.open
                  : Effect.void
              )
            )
          ),
          TestUtils.withLanguageModel({
            streamText: () => Stream.fromQueue(providerQueue)
          }),
          Effect.provide(ApprovalToolkitLayer),
          Effect.forkScoped
        )

        yield* Queue.offer(providerQueue, {
          type: "tool-call",
          id: "tool-awaiting-approval",
          name: "ApprovalTool",
          params: { action: "test-action" }
        })
        yield* toolCallObserved.await
        yield* Queue.offer(providerQueue, { type: "text-delta", id: "text-1", delta: "more" })
        yield* approvalObserved.await

        yield* Queue.offer(providerQueue, { ...finishPart, reason: "length" })
        yield* Queue.end(providerQueue)
        yield* Fiber.join(fiber)

        // The approval request already resolves the call for this turn
        deepStrictEqual(
          parts.map((part) => part.type),
          ["tool-call", "text-delta", "tool-approval-request", "finish"]
        )
      }))

    it.effect("validates encoded tool parameters when tool call resolution is disabled", () =>
      Effect.gen(function*() {
        const error = yield* LanguageModel.streamText({
          prompt: [],
          toolkit: TransformToolkit,
          disableToolCallResolution: true
        }).pipe(
          Stream.runDrain,
          TestUtils.withLanguageModel({
            streamText: [{
              type: "tool-call",
              id: "tool-invalid-transform",
              name: "TransformTool",
              params: { invalid: true }
            }]
          }),
          Effect.provide(TransformToolkitLayer),
          Effect.flip
        )

        strictEqual(error.reason._tag, "InvalidOutputError")
      }))

    it.effect("preserves encoded tool parameters when tool call resolution is disabled", () =>
      Effect.gen(function*() {
        const parts = yield* LanguageModel.streamText({
          prompt: [],
          toolkit: TransformToolkit,
          disableToolCallResolution: true
        }).pipe(Stream.runCollect)
        const toolCall = parts.find((part) => part.type === "tool-call")!

        strictEqual(toolCall.params, "21")

        const toolkit = yield* TransformToolkit
        const results = yield* toolkit.handle(toolCall.name, toolCall.params).pipe(
          Effect.flatMap(Stream.runCollect)
        )

        strictEqual(results[0].result, 42)
      }).pipe(
        TestUtils.withLanguageModel({
          streamText: [{
            type: "tool-call",
            id: "tool-transform",
            name: "TransformTool",
            params: "21"
          }]
        }),
        Effect.provide(TransformToolkitLayer)
      ))

    it.effect("preserves encoded tool parameters when tool call resolution is enabled", () =>
      Effect.gen(function*() {
        const parts = yield* LanguageModel.streamText({
          prompt: [],
          toolkit: TransformToolkit
        }).pipe(Stream.runCollect)

        const toolCall = parts.find((part) => part.type === "tool-call")!
        strictEqual(toolCall.params, "21")

        const toolResult = parts.find((part) => part.type === "tool-result")!
        strictEqual(toolResult.isFailure, false)
        strictEqual(toolResult.result, 42)
      }).pipe(
        TestUtils.withLanguageModel({
          streamText: [
            {
              type: "tool-call",
              id: "tool-transform",
              name: "TransformTool",
              params: "21"
            },
            finishPart
          ]
        }),
        Effect.provide(TransformToolkitLayer)
      ))

    it.effect("validates provider-executed tool call parameters", () =>
      Effect.gen(function*() {
        const calls = yield* Ref.make(0)
        const handlers = MyToolkit.toLayer({
          MyTool: () =>
            Ref.update(calls, (n) => n + 1).pipe(
              Effect.as({ testSuccess: "test-success" })
            )
        })

        const error = yield* LanguageModel.streamText({
          prompt: [],
          toolkit: MyToolkit
        }).pipe(
          Stream.runDrain,
          TestUtils.withLanguageModel({
            streamText: [
              {
                type: "tool-call",
                id: "tool-provider-executed",
                name: "MyTool",
                providerExecuted: true,
                params: { testParam: 123 }
              } as any,
              finishPart
            ]
          }),
          Effect.provide(handlers),
          Effect.flip
        )

        strictEqual(error._tag, "AiError")
        strictEqual((error as AiError.AiError).reason._tag, "InvalidOutputError")
        strictEqual(yield* Ref.get(calls), 0)
      }))

    it.effect("executes tool handlers once the stream moves past the tool call", () =>
      Effect.gen(function*() {
        const parts: Array<Response.StreamPart<Toolkit.Tools<typeof MyToolkit>, "opaque">> = []
        const toolCallObserved = yield* Latch.make()
        const handlerCalled = yield* Latch.make()
        const providerQueue = yield* Queue.make<Response.StreamPartEncoded, Cause.Done>()
        const calls = yield* Ref.make(0)
        const handlers = MyToolkit.toLayer({
          MyTool: () =>
            Ref.update(calls, (n) => n + 1).pipe(
              Effect.andThen(handlerCalled.open),
              Effect.as({ testSuccess: "test-success" })
            )
        })

        const fiber = yield* LanguageModel.streamText({
          prompt: [],
          toolkit: MyToolkit
        }).pipe(
          Stream.runForEach((part) =>
            Effect.sync(() => {
              parts.push(part)
            }).pipe(
              Effect.andThen(part.type === "tool-call" ? toolCallObserved.open : Effect.void)
            )
          ),
          TestUtils.withLanguageModel({
            streamText: () => Stream.fromQueue(providerQueue)
          }),
          Effect.provide(handlers),
          Effect.forkScoped
        )

        yield* Queue.offer(providerQueue, {
          type: "tool-call",
          id: "tool-abc123",
          name: "MyTool",
          params: { testParam: "test-param" }
        })
        yield* toolCallObserved.await
        yield* Queue.offer(providerQueue, { type: "text-delta", id: "text-1", delta: "more" })

        // The handler runs while the provider stream is still open
        yield* handlerCalled.await
        strictEqual(yield* Ref.get(calls), 1)

        yield* Queue.offer(providerQueue, finishPart)
        yield* Queue.end(providerQueue)
        yield* Fiber.join(fiber)

        deepStrictEqual(parts.map((part) => part.type), ["tool-call", "text-delta", "tool-result", "finish"])
      }))

    it.effect("interrupts in-flight tool handlers when the provider stream fails", () =>
      Effect.gen(function*() {
        const toolCallObserved = yield* Latch.make()
        const handlerStarted = yield* Latch.make()
        const handlerInterrupted = yield* Latch.make()
        const handlers = MyToolkit.toLayer({
          MyTool: () =>
            handlerStarted.open.pipe(
              Effect.andThen(Effect.never),
              Effect.onInterrupt(() => handlerInterrupted.open),
              Effect.as({ testSuccess: "test-success" })
            )
        })
        const providerQueue = yield* Queue.make<Response.StreamPartEncoded, Cause.Done>()
        const providerError = AiError.make({
          module: "LanguageModelTest",
          method: "streamText",
          reason: new AiError.InvalidRequestError({ description: "provider stream failed" })
        })

        const fiber = yield* LanguageModel.streamText({
          prompt: [],
          toolkit: MyToolkit
        }).pipe(
          Stream.runForEach((part) => part.type === "tool-call" ? toolCallObserved.open : Effect.void),
          TestUtils.withLanguageModel({
            streamText: () =>
              Stream.fromQueue(providerQueue).pipe(
                Stream.concat(Stream.fail(providerError))
              )
          }),
          Effect.provide(handlers),
          Effect.forkScoped
        )

        yield* Queue.offer(providerQueue, {
          type: "tool-call",
          id: "tool-before-failure",
          name: "MyTool",
          params: { testParam: "test-param" }
        })
        yield* toolCallObserved.await
        yield* Queue.offer(providerQueue, { type: "text-delta", id: "text-1", delta: "more" })
        yield* handlerStarted.await
        yield* Queue.end(providerQueue)

        const error = yield* Fiber.join(fiber).pipe(Effect.flip)
        strictEqual(error, providerError)
        yield* handlerInterrupted.await
      }))

    it.effect("does not execute tool handlers when response content is malformed", () =>
      Effect.gen(function*() {
        const calls = yield* Ref.make(0)
        const handlers = MyToolkit.toLayer({
          MyTool: () =>
            Ref.update(calls, (n) => n + 1).pipe(
              Effect.as({ testSuccess: "test-success" })
            )
        })

        const error = yield* LanguageModel.streamText({
          prompt: [],
          toolkit: MyToolkit
        }).pipe(
          Stream.runDrain,
          TestUtils.withLanguageModel({
            streamText: [
              {
                type: "tool-call",
                id: "tool-before-invalid-part",
                name: "MyTool",
                params: { testParam: "test-param" }
              },
              { type: "text", text: 123 } as any,
              finishPart
            ]
          }),
          Effect.provide(handlers),
          Effect.flip
        )

        strictEqual(error._tag, "AiError")
        strictEqual((error as AiError.AiError).reason._tag, "InvalidOutputError")
        strictEqual(yield* Ref.get(calls), 0)
      }))

    it.effect("emits a failed tool result and keeps streaming when tool params are invalid and failure mode is return", () =>
      Effect.gen(function*() {
        const calls = yield* Ref.make(0)
        const handlers = ReturnModeToolkit.toLayer({
          ReturnModeTool: () =>
            Ref.update(calls, (n) => n + 1).pipe(
              Effect.as({ testSuccess: "test-success" })
            )
        })

        const parts = yield* LanguageModel.streamText({
          prompt: [],
          toolkit: ReturnModeToolkit
        }).pipe(
          Stream.runCollect,
          TestUtils.withLanguageModel({
            streamText: [
              {
                type: "tool-call",
                id: "tool-invalid-params",
                name: "ReturnModeTool",
                params: { testParam: 123 }
              } as any,
              finishPart
            ]
          }),
          Effect.provide(handlers)
        )

        const toolResults = parts.filter((part) => part.type === "tool-result")
        strictEqual(toolResults.length, 1)
        strictEqual(toolResults[0].isFailure, true)
        const result = toolResults[0].result as AiError.AiError
        strictEqual(result._tag, "AiError")
        strictEqual(result.reason._tag, "ToolParameterValidationError")
        strictEqual(parts.some((part) => part.type === "finish"), true)
        strictEqual(yield* Ref.get(calls), 0)
      }))

    it.effect("fails the stream when tool params are invalid and failure mode is error", () =>
      Effect.gen(function*() {
        const calls = yield* Ref.make(0)
        const handlers = MyToolkit.toLayer({
          MyTool: () =>
            Ref.update(calls, (n) => n + 1).pipe(
              Effect.as({ testSuccess: "test-success" })
            )
        })

        const error = yield* LanguageModel.streamText({
          prompt: [],
          toolkit: MyToolkit
        }).pipe(
          Stream.runDrain,
          TestUtils.withLanguageModel({
            streamText: [
              {
                type: "tool-call",
                id: "tool-invalid-params",
                name: "MyTool",
                params: { testParam: 123 }
              } as any,
              finishPart
            ]
          }),
          Effect.provide(handlers),
          Effect.flip
        )

        strictEqual(error._tag, "AiError")
        strictEqual((error as AiError.AiError).reason._tag, "ToolParameterValidationError")
        strictEqual(yield* Ref.get(calls), 0)
      }))

    it.effect("emits finish after resolved tool results", () =>
      Effect.gen(function*() {
        const parts: Array<Response.StreamPart<Toolkit.Tools<typeof MyToolkit>, "opaque">> = []
        const latch = yield* Latch.make()

        const fiber = yield* LanguageModel.streamText({
          prompt: [],
          toolkit: MyToolkit
        }).pipe(
          Stream.runForEach((part) =>
            Effect.andThen(
              latch.open,
              Effect.sync(() => {
                parts.push(part)
              })
            )
          ),
          TestUtils.withLanguageModel({
            streamText: [
              {
                type: "tool-call",
                id: "tool-finish-order",
                name: "MyTool",
                params: { testParam: "test-param" }
              },
              finishPart
            ]
          }),
          Effect.provide(MyToolkitLayer),
          Effect.forkScoped
        )

        yield* latch.await

        strictEqual(parts[0]?.type, "tool-call")
        strictEqual(parts.some((part) => part.type === "finish"), false)

        yield* TestClock.adjust("10 seconds")
        yield* Fiber.join(fiber)

        strictEqual(parts.length, 3)
        strictEqual(parts[0]?.type, "tool-call")
        strictEqual(parts[1]?.type, "tool-result")
        strictEqual(parts[2]?.type, "finish")
      }))

    it.effect("runs tool handlers sequentially with concurrency: 1", () =>
      Effect.gen(function*() {
        const active = yield* Ref.make(0)
        const maxActive = yield* Ref.make(0)
        const started = yield* Latch.make()
        const release = yield* Latch.make()

        const handlers = MyToolkit.toLayer({
          MyTool: () =>
            Effect.gen(function*() {
              const current = yield* Ref.updateAndGet(active, (n) => n + 1)
              yield* Ref.update(maxActive, (n) => Math.max(n, current))
              yield* started.open
              yield* release.await
              return { testSuccess: "test-success" }
            }).pipe(Effect.ensuring(Ref.update(active, (n) => n - 1)))
        })

        const fiber = yield* LanguageModel.streamText({
          prompt: [],
          toolkit: MyToolkit,
          concurrency: 1
        }).pipe(
          Stream.runDrain,
          TestUtils.withLanguageModel({
            streamText: [
              {
                type: "tool-call",
                id: "tool-1",
                name: "MyTool",
                params: { testParam: "test-1" }
              },
              {
                type: "tool-call",
                id: "tool-2",
                name: "MyTool",
                params: { testParam: "test-2" }
              },
              {
                type: "tool-call",
                id: "tool-3",
                name: "MyTool",
                params: { testParam: "test-3" }
              }
            ]
          }),
          Effect.provide(handlers),
          Effect.forkScoped
        )

        yield* started.await
        strictEqual(yield* Ref.get(active), 1)
        strictEqual(yield* Ref.get(maxActive), 1)

        yield* release.open
        yield* Fiber.join(fiber)

        strictEqual(yield* Ref.get(active), 0)
        strictEqual(yield* Ref.get(maxActive), 1)
      }))

    it.effect("allows tool handler overlap up to a bounded concurrency", () =>
      Effect.gen(function*() {
        const active = yield* Ref.make(0)
        const maxActive = yield* Ref.make(0)
        const twoStarted = yield* Latch.make()
        const release = yield* Latch.make()

        const handlers = MyToolkit.toLayer({
          MyTool: () =>
            Effect.gen(function*() {
              const current = yield* Ref.updateAndGet(active, (n) => n + 1)
              yield* Ref.update(maxActive, (n) => Math.max(n, current))
              if (current === 2) {
                yield* twoStarted.open
              }
              yield* release.await
              return { testSuccess: "test-success" }
            }).pipe(Effect.ensuring(Ref.update(active, (n) => n - 1)))
        })

        const fiber = yield* LanguageModel.streamText({
          prompt: [],
          toolkit: MyToolkit,
          concurrency: 2
        }).pipe(
          Stream.runDrain,
          TestUtils.withLanguageModel({
            streamText: [
              {
                type: "tool-call",
                id: "tool-1",
                name: "MyTool",
                params: { testParam: "test-1" }
              },
              {
                type: "tool-call",
                id: "tool-2",
                name: "MyTool",
                params: { testParam: "test-2" }
              },
              {
                type: "tool-call",
                id: "tool-3",
                name: "MyTool",
                params: { testParam: "test-3" }
              }
            ]
          }),
          Effect.provide(handlers),
          Effect.forkScoped
        )

        yield* twoStarted.await
        strictEqual(yield* Ref.get(active), 2)
        strictEqual(yield* Ref.get(maxActive), 2)

        yield* release.open
        yield* Fiber.join(fiber)

        strictEqual(yield* Ref.get(active), 0)
        strictEqual(yield* Ref.get(maxActive), 2)
      }))

    it.effect("provides tool call IDs to concurrent identical tool handlers", () =>
      Effect.gen(function*() {
        const toolCallIds = yield* Ref.make<Array<string>>([])
        const twoStarted = yield* Latch.make()
        const release = yield* Latch.make()

        const handlers = MyToolkit.toLayer({
          MyTool: (_, context) =>
            Effect.gen(function*() {
              const toolCallId = context.toolCallId
              assertDefined(toolCallId)
              const ids = yield* Ref.updateAndGet(toolCallIds, (ids) => [...ids, toolCallId])
              if (ids.length === 2) {
                yield* twoStarted.open
              }
              yield* release.await
              return { testSuccess: "test-success" }
            })
        })

        const fiber = yield* LanguageModel.streamText({
          prompt: [],
          toolkit: MyToolkit
        }).pipe(
          Stream.runDrain,
          TestUtils.withLanguageModel({
            streamText: [
              {
                type: "tool-call",
                id: "tool-1",
                name: "MyTool",
                params: { testParam: "identical" }
              },
              {
                type: "tool-call",
                id: "tool-2",
                name: "MyTool",
                params: { testParam: "identical" }
              }
            ]
          }),
          Effect.provide(handlers),
          Effect.forkScoped
        )

        yield* twoStarted.await
        deepStrictEqual((yield* Ref.get(toolCallIds)).sort(), ["tool-1", "tool-2"])

        yield* release.open
        yield* Fiber.join(fiber)
      }))

    it.effect("bounds needsApproval evaluation with the tool handler concurrency", () =>
      Effect.gen(function*() {
        const active = yield* Ref.make(0)
        const maxActive = yield* Ref.make(0)
        const started = yield* Latch.make()
        const release = yield* Latch.make()

        const tool = Tool.make("ApprovalConcurrencyTool", {
          parameters: Schema.Struct({ input: Schema.String }),
          success: Schema.Struct({ output: Schema.String }),
          needsApproval: () =>
            Effect.gen(function*() {
              const current = yield* Ref.updateAndGet(active, (n) => n + 1)
              yield* Ref.update(maxActive, (n) => Math.max(n, current))
              yield* started.open
              yield* release.await
              return false
            }).pipe(Effect.ensuring(Ref.update(active, (n) => n - 1)))
        })
        const toolkit = Toolkit.make(tool)
        const handlers = toolkit.toLayer({
          ApprovalConcurrencyTool: () => Effect.succeed({ output: "done" })
        })

        const fiber = yield* LanguageModel.streamText({
          prompt: [],
          toolkit,
          concurrency: 1
        }).pipe(
          Stream.runDrain,
          TestUtils.withLanguageModel({
            streamText: [
              {
                type: "tool-call",
                id: "tool-1",
                name: "ApprovalConcurrencyTool",
                params: { input: "test-1" }
              },
              {
                type: "tool-call",
                id: "tool-2",
                name: "ApprovalConcurrencyTool",
                params: { input: "test-2" }
              }
            ]
          }),
          Effect.provide(handlers),
          Effect.forkScoped
        )

        yield* started.await
        strictEqual(yield* Ref.get(active), 1)
        strictEqual(yield* Ref.get(maxActive), 1)

        yield* release.open
        yield* Fiber.join(fiber)

        strictEqual(yield* Ref.get(active), 0)
        strictEqual(yield* Ref.get(maxActive), 1)
      }))
  })

  describe("generateObject", () => {
    it.effect("includes full generated text in StructuredOutputError", () =>
      Effect.gen(function*() {
        const error = yield* LanguageModel.generateObject({
          prompt: [],
          schema: Schema.Struct({ count: Schema.Number })
        }).pipe(
          TestUtils.withLanguageModel({
            generateText: [{
              type: "text",
              text: "{\"count\":\"oops\"}"
            }]
          }),
          Effect.flip
        )

        strictEqual(error.reason._tag, "StructuredOutputError")
        if (error.reason._tag === "StructuredOutputError") {
          strictEqual(error.reason.responseText, "{\"count\":\"oops\"}")
        }
      }))

    it("resolves the canonical top-level $ref for class schemas in defaultCodecTransformer", () => {
      class Person extends Schema.Class<Person>("Person")({
        name: Schema.String
      }) {}

      const transformed = LanguageModel.defaultCodecTransformer(Person)

      deepStrictEqual(transformed.jsonSchema, {
        type: "object",
        properties: {
          name: {
            type: "string"
          }
        },
        required: ["name"],
        additionalProperties: true,
        $defs: {
          "PersonEncoded": {
            type: "object",
            properties: {
              name: {
                type: "string"
              }
            },
            required: ["name"],
            additionalProperties: true
          }
        }
      })
    })
  })

  describe("provider options", () => {
    it.effect("initialize incremental fields as undefined in generateText", () =>
      Effect.gen(function*() {
        let capturedOptions: LanguageModel.ProviderOptions | undefined

        yield* LanguageModel.generateText({
          prompt: []
        }).pipe(
          TestUtils.withLanguageModel({
            generateText: (options) => {
              capturedOptions = options
              return Effect.succeed([finishPart])
            }
          })
        )

        assertDefined(capturedOptions)
        strictEqual(capturedOptions.previousResponseId, undefined)
        strictEqual(capturedOptions.incrementalPrompt, undefined)
      }))

    it.effect("initialize incremental fields as undefined in generateObject", () =>
      Effect.gen(function*() {
        let capturedOptions: LanguageModel.ProviderOptions | undefined

        yield* LanguageModel.generateObject({
          prompt: [],
          schema: Schema.Struct({ count: Schema.Number })
        }).pipe(
          TestUtils.withLanguageModel({
            generateText: (options) => {
              capturedOptions = options
              return Effect.succeed([
                {
                  type: "text",
                  text: "{\"count\":1}"
                },
                finishPart
              ])
            }
          })
        )

        assertDefined(capturedOptions)
        strictEqual(capturedOptions.previousResponseId, undefined)
        strictEqual(capturedOptions.incrementalPrompt, undefined)
      }))

    it.effect("initialize incremental fields as undefined in streamText", () =>
      Effect.gen(function*() {
        let capturedOptions: LanguageModel.ProviderOptions | undefined

        yield* LanguageModel.streamText({
          prompt: []
        }).pipe(
          Stream.runDrain,
          TestUtils.withLanguageModel({
            streamText: (options) => {
              capturedOptions = options
              return [finishPart]
            }
          })
        )

        assertDefined(capturedOptions)
        strictEqual(capturedOptions.previousResponseId, undefined)
        strictEqual(capturedOptions.incrementalPrompt, undefined)
      }))

    it.effect("falls back to full prompt in generateText when incremental request fails", () =>
      Effect.gen(function*() {
        const fullPrompt = Prompt.make([
          Prompt.systemMessage({ content: "system" }),
          Prompt.userMessage({ content: [Prompt.textPart({ text: "user" })] }),
          Prompt.assistantMessage({ content: [Prompt.textPart({ text: "assistant" })] }),
          Prompt.userMessage({ content: [Prompt.textPart({ text: "next" })] })
        ])

        const incrementalPrompt = Prompt.make([
          Prompt.userMessage({ content: [Prompt.textPart({ text: "next" })] })
        ])

        const calls: Array<LanguageModel.ProviderOptions> = []

        yield* LanguageModel.generateText({
          prompt: fullPrompt
        }).pipe(
          Effect.provideServiceEffect(
            LanguageModel.LanguageModel,
            LanguageModel.make({
              generateText: (options) => {
                calls.push(options)
                if (calls.length === 1) {
                  ;(options as any).prompt = options.incrementalPrompt ?? options.prompt
                  return Effect.fail(AiError.make({
                    module: "LanguageModelTest",
                    method: "generateText",
                    reason: new AiError.InvalidRequestError({
                      description: "invalid previous response id"
                    })
                  }))
                }
                return Effect.succeed([finishPart])
              },
              streamText: () => Stream.empty
            })
          ),
          Effect.provideService(ResponseIdTracker.ResponseIdTracker, {
            clearUnsafe() {},
            markParts() {},
            prepareUnsafe: () =>
              Option.some({
                previousResponseId: "resp_prev",
                prompt: incrementalPrompt
              })
          })
        )

        strictEqual(calls.length, 2)
        strictEqual(calls[0]!.previousResponseId, "resp_prev")
        strictEqual(calls[0]!.incrementalPrompt, incrementalPrompt)
        strictEqual(calls[1]!.previousResponseId, undefined)
        strictEqual(calls[1]!.incrementalPrompt, undefined)
        deepStrictEqual(calls[1]!.prompt, fullPrompt)
      }))

    it.effect("falls back to full prompt in streamText when incremental request fails", () =>
      Effect.gen(function*() {
        const fullPrompt = Prompt.make([
          Prompt.systemMessage({ content: "system" }),
          Prompt.userMessage({ content: [Prompt.textPart({ text: "user" })] }),
          Prompt.assistantMessage({ content: [Prompt.textPart({ text: "assistant" })] }),
          Prompt.userMessage({ content: [Prompt.textPart({ text: "next" })] })
        ])

        const incrementalPrompt = Prompt.make([
          Prompt.userMessage({ content: [Prompt.textPart({ text: "next" })] })
        ])

        const calls: Array<LanguageModel.ProviderOptions> = []

        yield* LanguageModel.streamText({
          prompt: fullPrompt
        }).pipe(
          Stream.runDrain,
          Effect.provideServiceEffect(
            LanguageModel.LanguageModel,
            LanguageModel.make({
              generateText: () => Effect.succeed([finishPart]),
              streamText: (options) => {
                calls.push(options)
                if (calls.length === 1) {
                  ;(options as any).prompt = options.incrementalPrompt ?? options.prompt
                  return Stream.fail(AiError.make({
                    module: "LanguageModelTest",
                    method: "streamText",
                    reason: new AiError.InvalidRequestError({
                      description: "invalid previous response id"
                    })
                  }))
                }
                return Stream.fromIterable([finishPart])
              }
            })
          ),
          Effect.provideService(ResponseIdTracker.ResponseIdTracker, {
            clearUnsafe() {},
            markParts() {},
            prepareUnsafe: () =>
              Option.some({
                previousResponseId: "resp_prev",
                prompt: incrementalPrompt
              })
          })
        )

        strictEqual(calls.length, 2)
        strictEqual(calls[0]!.previousResponseId, "resp_prev")
        strictEqual(calls[0]!.incrementalPrompt, incrementalPrompt)
        strictEqual(calls[1]!.previousResponseId, undefined)
        strictEqual(calls[1]!.incrementalPrompt, undefined)
        deepStrictEqual(calls[1]!.prompt, fullPrompt)
      }))

    it.effect("does not retry an incremental stream after emitting a tool call", () =>
      Effect.gen(function*() {
        const prompt = Prompt.make([
          Prompt.userMessage({ content: [Prompt.textPart({ text: "full prompt" })] })
        ])
        const incrementalPrompt = Prompt.make([
          Prompt.userMessage({ content: [Prompt.textPart({ text: "incremental prompt" })] })
        ])
        const handlerCalls = yield* Ref.make(0)
        const handlers = MyToolkit.toLayer({
          MyTool: () =>
            Ref.update(handlerCalls, (n) => n + 1).pipe(
              Effect.as({ testSuccess: "test-success" })
            )
        })
        let providerCalls = 0
        const providerError = AiError.make({
          module: "LanguageModelTest",
          method: "streamText",
          reason: new AiError.InvalidRequestError({ description: "incremental stream failed" })
        })

        yield* LanguageModel.streamText({ prompt, toolkit: MyToolkit }).pipe(
          Stream.runDrain,
          TestUtils.withLanguageModel({
            streamText: () => {
              providerCalls++
              return Stream.succeed<Response.StreamPartEncoded>({
                type: "tool-call",
                id: "tool-before-incremental-failure",
                name: "MyTool",
                params: { testParam: "test-param" }
              }).pipe(Stream.concat(Stream.fail(providerError)))
            }
          }),
          Effect.provideService(ResponseIdTracker.ResponseIdTracker, {
            clearUnsafe() {},
            markParts() {},
            prepareUnsafe: () =>
              Option.some({
                previousResponseId: "resp_prev",
                prompt: incrementalPrompt
              })
          }),
          Effect.provide(handlers),
          Effect.flip
        )

        strictEqual(providerCalls, 1)
        strictEqual(yield* Ref.get(handlerCalls), 0)
      }))

    it.effect("uses tracker prepareUnsafe and markParts in generateText without toolkit", () =>
      Effect.gen(function*() {
        let capturedOptions: LanguageModel.ProviderOptions | undefined
        let preparedPrompt: LanguageModel.ProviderOptions["prompt"] | undefined
        let markedParts: ReadonlyArray<object> | undefined
        let markedResponseId: string | undefined

        const incrementalPrompt = Prompt.make([
          Prompt.userMessage({ content: [Prompt.textPart({ text: "incremental" })] })
        ])

        yield* LanguageModel.generateText({
          prompt: [Prompt.userMessage({ content: [Prompt.textPart({ text: "hello" })] })]
        }).pipe(
          Effect.provideServiceEffect(
            LanguageModel.LanguageModel,
            LanguageModel.make({
              generateText: (options) => {
                capturedOptions = options
                return Effect.succeed([
                  {
                    type: "response-metadata",
                    id: "resp_next",
                    modelId: undefined,
                    timestamp: undefined,
                    request: undefined
                  },
                  finishPart
                ])
              },
              streamText: () => Stream.empty
            })
          ),
          Effect.provideService(ResponseIdTracker.ResponseIdTracker, {
            clearUnsafe() {},
            markParts: (parts, responseId) => {
              markedParts = parts
              markedResponseId = responseId
            },
            prepareUnsafe: (prompt) => {
              preparedPrompt = prompt
              return Option.some({
                previousResponseId: "resp_prev",
                prompt: incrementalPrompt
              })
            }
          })
        )

        assertDefined(capturedOptions)
        assertDefined(preparedPrompt)
        strictEqual(preparedPrompt, capturedOptions.prompt)
        strictEqual(capturedOptions.previousResponseId, "resp_prev")
        strictEqual(capturedOptions.incrementalPrompt, incrementalPrompt)
        assertDefined(markedParts)
        strictEqual(markedParts, capturedOptions.prompt.content)
        strictEqual(markedResponseId, "resp_next")
      }))

    it.effect("uses tracker prepareUnsafe and markParts in generateText with empty toolkit", () =>
      Effect.gen(function*() {
        let capturedOptions: LanguageModel.ProviderOptions | undefined
        let prepareCalls = 0
        let markCalls = 0

        yield* LanguageModel.generateText({
          prompt: [Prompt.userMessage({ content: [Prompt.textPart({ text: "hello" })] })],
          toolkit: Toolkit.empty
        }).pipe(
          Effect.provideServiceEffect(
            LanguageModel.LanguageModel,
            LanguageModel.make({
              generateText: (options) => {
                capturedOptions = options
                return Effect.succeed([
                  {
                    type: "response-metadata",
                    id: "resp_next",
                    modelId: undefined,
                    timestamp: undefined,
                    request: undefined
                  },
                  finishPart
                ])
              },
              streamText: () => Stream.empty
            })
          ),
          Effect.provideService(ResponseIdTracker.ResponseIdTracker, {
            clearUnsafe() {},
            markParts: () => {
              markCalls++
            },
            prepareUnsafe: () => {
              prepareCalls++
              return Option.some({
                previousResponseId: "resp_prev",
                prompt: Prompt.make([])
              })
            }
          })
        )

        assertDefined(capturedOptions)
        strictEqual(capturedOptions.previousResponseId, "resp_prev")
        strictEqual(prepareCalls, 1)
        strictEqual(markCalls, 1)
      }))

    it.effect("calls tracker.prepareUnsafe after stripping resolved approvals in toolkit flow", () =>
      Effect.gen(function*() {
        const toolCallId = "call-tracker"
        const approvalId = "approval-tracker"

        let preparedPrompt: LanguageModel.ProviderOptions["prompt"] | undefined
        let markedParts: ReadonlyArray<object> | undefined

        const prompt: Array<Prompt.Message> = [
          Prompt.assistantMessage({
            content: [
              Prompt.makePart("tool-call", {
                id: toolCallId,
                name: "ApprovalTool",
                params: { action: "delete" },
                providerExecuted: false
              }),
              Prompt.makePart("tool-approval-request", {
                approvalId,
                toolCallId
              })
            ]
          }),
          Prompt.toolMessage({
            content: [
              Prompt.toolApprovalResponsePart({
                approvalId,
                approved: true
              }),
              Prompt.toolResultPart({
                id: toolCallId,
                name: "ApprovalTool",
                result: { result: "approved-result" },
                isFailure: false,
                providerExecuted: false
              })
            ]
          }),
          Prompt.userMessage({ content: [Prompt.textPart({ text: "continue" })] })
        ]

        yield* LanguageModel.generateText({
          prompt,
          toolkit: ApprovalToolkit
        }).pipe(
          Effect.provideServiceEffect(
            LanguageModel.LanguageModel,
            LanguageModel.make({
              generateText: () =>
                Effect.succeed([
                  {
                    type: "response-metadata",
                    id: "resp_next",
                    modelId: undefined,
                    timestamp: undefined,
                    request: undefined
                  },
                  finishPart
                ]),
              streamText: () => Stream.empty
            })
          ),
          Effect.provideService(ResponseIdTracker.ResponseIdTracker, {
            clearUnsafe() {},
            markParts(parts) {
              markedParts = parts
            },
            prepareUnsafe(prompt) {
              preparedPrompt = prompt
              return Option.none()
            }
          }),
          Effect.provide(ApprovalToolkitLayer)
        )

        assertDefined(preparedPrompt)
        for (const msg of preparedPrompt.content) {
          if (msg.role === "assistant") {
            strictEqual(msg.content.filter((p) => p.type === "tool-approval-request").length, 0)
          }
          if (msg.role === "tool") {
            strictEqual(msg.content.filter((p) => p.type === "tool-approval-response").length, 0)
          }
        }
        assertDefined(markedParts)
        strictEqual(markedParts, preparedPrompt.content)
      }))

    it.effect("uses tracker prepareUnsafe and markParts in streamText without toolkit", () =>
      Effect.gen(function*() {
        let capturedOptions: LanguageModel.ProviderOptions | undefined
        let preparedPrompt: LanguageModel.ProviderOptions["prompt"] | undefined
        let markedParts: ReadonlyArray<object> | undefined
        let markedResponseId: string | undefined

        const incrementalPrompt = Prompt.make([
          Prompt.userMessage({ content: [Prompt.textPart({ text: "incremental" })] })
        ])

        yield* LanguageModel.streamText({
          prompt: [Prompt.userMessage({ content: [Prompt.textPart({ text: "hello" })] })]
        }).pipe(
          Stream.runDrain,
          Effect.provideServiceEffect(
            LanguageModel.LanguageModel,
            LanguageModel.make({
              generateText: () => Effect.succeed([]),
              streamText: (options) => {
                capturedOptions = options
                return Stream.fromIterable([
                  {
                    type: "response-metadata",
                    id: "resp_next",
                    modelId: undefined,
                    timestamp: undefined,
                    request: undefined
                  },
                  finishPart
                ])
              }
            })
          ),
          Effect.provideService(ResponseIdTracker.ResponseIdTracker, {
            clearUnsafe() {},
            markParts: (parts, responseId) => {
              markedParts = parts
              markedResponseId = responseId
            },
            prepareUnsafe: (prompt) => {
              preparedPrompt = prompt
              return Option.some({
                previousResponseId: "resp_prev",
                prompt: incrementalPrompt
              })
            }
          })
        )

        assertDefined(capturedOptions)
        assertDefined(preparedPrompt)
        strictEqual(preparedPrompt, capturedOptions.prompt)
        strictEqual(capturedOptions.previousResponseId, "resp_prev")
        strictEqual(capturedOptions.incrementalPrompt, incrementalPrompt)
        assertDefined(markedParts)
        strictEqual(markedParts, capturedOptions.prompt.content)
        strictEqual(markedResponseId, "resp_next")
      }))

    it.effect("uses tracker prepareUnsafe and markParts in streamText with empty toolkit", () =>
      Effect.gen(function*() {
        let capturedOptions: LanguageModel.ProviderOptions | undefined
        let preparedPrompt: LanguageModel.ProviderOptions["prompt"] | undefined
        let markedParts: ReadonlyArray<object> | undefined
        let markedResponseId: string | undefined

        const incrementalPrompt = Prompt.make([
          Prompt.userMessage({ content: [Prompt.textPart({ text: "incremental" })] })
        ])

        yield* LanguageModel.streamText({
          prompt: [Prompt.userMessage({ content: [Prompt.textPart({ text: "hello" })] })],
          toolkit: Toolkit.empty
        }).pipe(
          Stream.runDrain,
          Effect.provideServiceEffect(
            LanguageModel.LanguageModel,
            LanguageModel.make({
              generateText: () => Effect.succeed([]),
              streamText: (options) => {
                capturedOptions = options
                return Stream.fromIterable([
                  {
                    type: "response-metadata",
                    id: "resp_next",
                    modelId: undefined,
                    timestamp: undefined,
                    request: undefined
                  },
                  finishPart
                ])
              }
            })
          ),
          Effect.provideService(ResponseIdTracker.ResponseIdTracker, {
            clearUnsafe() {},
            markParts: (parts, responseId) => {
              markedParts = parts
              markedResponseId = responseId
            },
            prepareUnsafe: (prompt) => {
              preparedPrompt = prompt
              return Option.some({
                previousResponseId: "resp_prev",
                prompt: incrementalPrompt
              })
            }
          })
        )

        assertDefined(capturedOptions)
        assertDefined(preparedPrompt)
        strictEqual(preparedPrompt, capturedOptions.prompt)
        strictEqual(capturedOptions.previousResponseId, "resp_prev")
        strictEqual(capturedOptions.incrementalPrompt, incrementalPrompt)
        assertDefined(markedParts)
        strictEqual(markedParts, capturedOptions.prompt.content)
        strictEqual(markedResponseId, "resp_next")
      }))

    it.effect("calls tracker.prepareUnsafe after stripping resolved approvals in streamText toolkit flow", () =>
      Effect.gen(function*() {
        const toolCallId = "call-tracker-stream"
        const approvalId = "approval-tracker-stream"

        let preparedPrompt: LanguageModel.ProviderOptions["prompt"] | undefined
        let markedParts: ReadonlyArray<object> | undefined

        const prompt: Array<Prompt.Message> = [
          Prompt.assistantMessage({
            content: [
              Prompt.makePart("tool-call", {
                id: toolCallId,
                name: "ApprovalTool",
                params: { action: "delete" },
                providerExecuted: false
              }),
              Prompt.makePart("tool-approval-request", {
                approvalId,
                toolCallId
              })
            ]
          }),
          Prompt.toolMessage({
            content: [
              Prompt.toolApprovalResponsePart({
                approvalId,
                approved: true
              }),
              Prompt.toolResultPart({
                id: toolCallId,
                name: "ApprovalTool",
                result: { result: "approved-result" },
                isFailure: false,
                providerExecuted: false
              })
            ]
          }),
          Prompt.userMessage({ content: [Prompt.textPart({ text: "continue" })] })
        ]

        yield* LanguageModel.streamText({
          prompt,
          toolkit: ApprovalToolkit
        }).pipe(
          Stream.runDrain,
          Effect.provideServiceEffect(
            LanguageModel.LanguageModel,
            LanguageModel.make({
              generateText: () => Effect.succeed([]),
              streamText: () =>
                Stream.fromIterable([
                  {
                    type: "response-metadata",
                    id: "resp_next",
                    modelId: undefined,
                    timestamp: undefined,
                    request: undefined
                  },
                  finishPart
                ])
            })
          ),
          Effect.provideService(ResponseIdTracker.ResponseIdTracker, {
            clearUnsafe() {},
            markParts: (parts) => {
              markedParts = parts
            },
            prepareUnsafe: (prompt) => {
              preparedPrompt = prompt
              return Option.none()
            }
          }),
          Effect.provide(ApprovalToolkitLayer)
        )

        assertDefined(preparedPrompt)
        for (const msg of preparedPrompt.content) {
          if (msg.role === "assistant") {
            strictEqual(msg.content.filter((p) => p.type === "tool-approval-request").length, 0)
          }
          if (msg.role === "tool") {
            strictEqual(msg.content.filter((p) => p.type === "tool-approval-response").length, 0)
          }
        }
        assertDefined(markedParts)
        strictEqual(markedParts, preparedPrompt.content)
      }))

    it.effect("uses tracker prepareUnsafe and markParts when disableToolCallResolution is true", () =>
      Effect.gen(function*() {
        const toolCallId = "call-tracker-stream-disable"
        const approvalId = "approval-tracker-stream-disable"

        let capturedOptions: LanguageModel.ProviderOptions | undefined
        let preparedPrompt: LanguageModel.ProviderOptions["prompt"] | undefined
        let markedParts: ReadonlyArray<object> | undefined
        let markedResponseId: string | undefined

        const incrementalPrompt = Prompt.make([
          Prompt.userMessage({ content: [Prompt.textPart({ text: "incremental" })] })
        ])

        const prompt: Array<Prompt.Message> = [
          Prompt.assistantMessage({
            content: [
              Prompt.makePart("tool-call", {
                id: toolCallId,
                name: "ApprovalTool",
                params: { action: "delete" },
                providerExecuted: false
              }),
              Prompt.makePart("tool-approval-request", {
                approvalId,
                toolCallId
              })
            ]
          }),
          Prompt.toolMessage({
            content: [
              Prompt.toolApprovalResponsePart({
                approvalId,
                approved: true
              }),
              Prompt.toolResultPart({
                id: toolCallId,
                name: "ApprovalTool",
                result: { result: "approved-result" },
                isFailure: false,
                providerExecuted: false
              })
            ]
          }),
          Prompt.userMessage({ content: [Prompt.textPart({ text: "continue" })] })
        ]

        yield* LanguageModel.streamText({
          prompt,
          toolkit: ApprovalToolkit,
          disableToolCallResolution: true
        }).pipe(
          Stream.runDrain,
          Effect.provideServiceEffect(
            LanguageModel.LanguageModel,
            LanguageModel.make({
              generateText: () => Effect.succeed([]),
              streamText: (options) => {
                capturedOptions = options
                return Stream.fromIterable([
                  {
                    type: "response-metadata",
                    id: "resp_next",
                    modelId: undefined,
                    timestamp: undefined,
                    request: undefined
                  },
                  finishPart
                ])
              }
            })
          ),
          Effect.provideService(ResponseIdTracker.ResponseIdTracker, {
            markParts: (parts, responseId) => {
              markedParts = parts
              markedResponseId = responseId
            },
            prepareUnsafe: (prompt) => {
              preparedPrompt = prompt
              return Option.some({
                previousResponseId: "resp_prev",
                prompt: incrementalPrompt
              })
            },
            clearUnsafe() {}
          }),
          Effect.provide(ApprovalToolkitLayer)
        )

        assertDefined(capturedOptions)
        assertDefined(preparedPrompt)
        strictEqual(preparedPrompt, capturedOptions.prompt)
        strictEqual(capturedOptions.previousResponseId, "resp_prev")
        strictEqual(capturedOptions.incrementalPrompt, incrementalPrompt)
        for (const msg of preparedPrompt.content) {
          if (msg.role === "assistant") {
            strictEqual(msg.content.filter((p) => p.type === "tool-approval-request").length, 0)
          }
          if (msg.role === "tool") {
            strictEqual(msg.content.filter((p) => p.type === "tool-approval-response").length, 0)
          }
        }
        assertDefined(markedParts)
        strictEqual(markedParts, capturedOptions.prompt.content)
        strictEqual(markedResponseId, "resp_next")
      }))
  })

  describe("tool approval", () => {
    it.effect("emits tool-approval-request when tool has needsApproval: true", () =>
      Effect.gen(function*() {
        const parts: Array<Response.StreamPart<Toolkit.Tools<typeof ApprovalToolkit>, "opaque">> = []

        const toolCallId = "call-123"
        const toolName = "ApprovalTool"
        const toolParams = { action: "delete" }

        yield* LanguageModel.streamText({
          prompt: [],
          toolkit: ApprovalToolkit
        }).pipe(
          Stream.runForEach((part) =>
            Effect.sync(() => {
              parts.push(part)
            })
          ),
          TestUtils.withLanguageModel({
            streamText: [
              {
                type: "tool-call",
                id: toolCallId,
                name: toolName,
                params: toolParams
              }
            ]
          }),
          Effect.provide(ApprovalToolkitLayer)
        )

        strictEqual(parts.length, 2)
        deepStrictEqual(
          parts[0],
          Response.makePart("tool-call", {
            id: toolCallId,
            name: toolName,
            params: toolParams,
            providerExecuted: false
          })
        )

        const approvalPart = parts[1]
        strictEqual(approvalPart.type, "tool-approval-request")
        if (approvalPart.type === "tool-approval-request") {
          strictEqual(approvalPart.toolCallId, toolCallId)
          assertDefined(approvalPart.approvalId)
        }
      }))

    it.effect("pre-resolves approved tool calls before calling LLM", () =>
      Effect.gen(function*() {
        const toolCallId = "call-456"
        const approvalId = "approval-456"
        let capturedPrompt: LanguageModel.ProviderOptions["prompt"] | undefined

        const prompt: Array<Prompt.Message> = [
          Prompt.assistantMessage({
            content: [
              Prompt.makePart("tool-call", {
                id: toolCallId,
                name: "ApprovalTool",
                params: { action: "delete" },
                providerExecuted: false
              }),
              Prompt.makePart("tool-approval-request", {
                approvalId,
                toolCallId
              })
            ]
          }),
          Prompt.toolMessage({
            content: [
              Prompt.toolApprovalResponsePart({
                approvalId,
                approved: true
              })
            ]
          })
        ]

        yield* LanguageModel.streamText({
          prompt,
          toolkit: ApprovalToolkit
        }).pipe(
          Stream.runDrain,
          TestUtils.withLanguageModel({
            streamText: (opts) => {
              capturedPrompt = opts.prompt
              return [finishPart]
            }
          }),
          Effect.provide(ApprovalToolkitLayer)
        )

        // Verify the prompt sent to LLM contains pre-resolved tool result
        assertDefined(capturedPrompt)
        const messages = capturedPrompt.content
        const lastMessage = messages[messages.length - 1]
        strictEqual(lastMessage.role, "tool")
        assertTrue(Array.isArray(lastMessage.content))
        const toolResults = (lastMessage.content as Array<Prompt.ToolMessagePart>).filter(
          (p): p is Prompt.ToolResultPart => p.type === "tool-result"
        )
        strictEqual(toolResults.length, 1)
        strictEqual(toolResults[0].id, toolCallId)
        deepStrictEqual(toolResults[0].result, { result: "approved-result" })
        strictEqual(toolResults[0].isFailure, false)
      }))

    it.effect("pre-resolves denied tool calls with execution-denied before calling LLM", () =>
      Effect.gen(function*() {
        const toolCallId = "call-789"
        const approvalId = "approval-789"
        let capturedPrompt: LanguageModel.ProviderOptions["prompt"] | undefined

        const prompt: Array<Prompt.Message> = [
          Prompt.assistantMessage({
            content: [
              Prompt.makePart("tool-call", {
                id: toolCallId,
                name: "ApprovalTool",
                params: { action: "delete" },
                providerExecuted: false
              }),
              Prompt.makePart("tool-approval-request", {
                approvalId,
                toolCallId
              })
            ]
          }),
          Prompt.toolMessage({
            content: [
              Prompt.toolApprovalResponsePart({
                approvalId,
                approved: false,
                reason: "User declined"
              })
            ]
          })
        ]

        yield* LanguageModel.streamText({
          prompt,
          toolkit: ApprovalToolkit
        }).pipe(
          Stream.runDrain,
          TestUtils.withLanguageModel({
            streamText: (opts) => {
              capturedPrompt = opts.prompt
              return [finishPart]
            }
          }),
          Effect.provide(ApprovalToolkitLayer)
        )

        // Verify the prompt sent to LLM contains pre-resolved denial result
        assertDefined(capturedPrompt)
        const messages = capturedPrompt.content
        const lastMessage = messages[messages.length - 1]
        strictEqual(lastMessage.role, "tool")
        assertTrue(Array.isArray(lastMessage.content))
        const toolResults = (lastMessage.content as Array<Prompt.ToolMessagePart>).filter(
          (p): p is Prompt.ToolResultPart => p.type === "tool-result"
        )
        strictEqual(toolResults.length, 1)
        strictEqual(toolResults[0].id, toolCallId)
        const result = toolResults[0].result as { type: string; reason: string }
        strictEqual(result.type, "execution-denied")
        strictEqual(result.reason, "User declined")
        strictEqual(toolResults[0].isFailure, true)
      }))

    it.effect("strips approved approval artifacts from prompt sent to provider (streamText)", () =>
      Effect.gen(function*() {
        const toolCallId = "call-strip"
        const approvalId = "approval-strip"
        let capturedPrompt: LanguageModel.ProviderOptions["prompt"] | undefined

        const prompt: Array<Prompt.Message> = [
          Prompt.assistantMessage({
            content: [
              Prompt.makePart("tool-call", {
                id: toolCallId,
                name: "ApprovalTool",
                params: { action: "delete" },
                providerExecuted: false
              }),
              Prompt.makePart("tool-approval-request", {
                approvalId,
                toolCallId
              })
            ]
          }),
          Prompt.toolMessage({
            content: [
              Prompt.toolApprovalResponsePart({
                approvalId,
                approved: true
              })
            ]
          })
        ]

        yield* LanguageModel.streamText({
          prompt,
          toolkit: ApprovalToolkit
        }).pipe(
          Stream.runDrain,
          TestUtils.withLanguageModel({
            streamText: (opts) => {
              capturedPrompt = opts.prompt
              return [finishPart]
            }
          }),
          Effect.provide(ApprovalToolkitLayer)
        )

        assertDefined(capturedPrompt)
        const messages = capturedPrompt.content

        // Assistant message should retain tool-call but not tool-approval-request
        const assistantMsg = messages.find((m) => m.role === "assistant")
        assertDefined(assistantMsg)
        if (assistantMsg.role === "assistant") {
          strictEqual(assistantMsg.content.filter((p) => p.type === "tool-approval-request").length, 0)
          strictEqual(assistantMsg.content.filter((p) => p.type === "tool-call").length, 1)
        }

        // No tool message should contain tool-approval-response parts
        for (const msg of messages) {
          if (msg.role === "tool") {
            strictEqual(msg.content.filter((p) => p.type === "tool-approval-response").length, 0)
          }
        }
      }))

    it.effect("strips denied approval artifacts from prompt sent to provider", () =>
      Effect.gen(function*() {
        const toolCallId = "call-strip-deny"
        const approvalId = "approval-strip-deny"
        let capturedPrompt: LanguageModel.ProviderOptions["prompt"] | undefined

        const prompt: Array<Prompt.Message> = [
          Prompt.assistantMessage({
            content: [
              Prompt.makePart("tool-call", {
                id: toolCallId,
                name: "ApprovalTool",
                params: { action: "delete" },
                providerExecuted: false
              }),
              Prompt.makePart("tool-approval-request", {
                approvalId,
                toolCallId
              })
            ]
          }),
          Prompt.toolMessage({
            content: [
              Prompt.toolApprovalResponsePart({
                approvalId,
                approved: false,
                reason: "Denied"
              })
            ]
          })
        ]

        yield* LanguageModel.streamText({
          prompt,
          toolkit: ApprovalToolkit
        }).pipe(
          Stream.runDrain,
          TestUtils.withLanguageModel({
            streamText: (opts) => {
              capturedPrompt = opts.prompt
              return [finishPart]
            }
          }),
          Effect.provide(ApprovalToolkitLayer)
        )

        assertDefined(capturedPrompt)
        const messages = capturedPrompt.content

        // Approval artifacts stripped
        for (const msg of messages) {
          if (msg.role === "assistant") {
            strictEqual(msg.content.filter((p) => p.type === "tool-approval-request").length, 0)
          }
          if (msg.role === "tool") {
            strictEqual(msg.content.filter((p) => p.type === "tool-approval-response").length, 0)
          }
        }

        // Denial result should still be present
        const lastMessage = messages[messages.length - 1]
        strictEqual(lastMessage.role, "tool")
        if (lastMessage.role === "tool") {
          const toolResults = lastMessage.content.filter(
            (p): p is Prompt.ToolResultPart => p.type === "tool-result"
          )
          strictEqual(toolResults.length, 1)
          strictEqual(toolResults[0].isFailure, true)
        }
      }))

    it.effect("strips only resolved approvals, preserves unrelated parts", () =>
      Effect.gen(function*() {
        const resolvedCallId = "call-resolved"
        const resolvedApprovalId = "approval-resolved"
        const unresolvedCallId = "call-unresolved"
        const unresolvedApprovalId = "approval-unresolved"
        let capturedPrompt: LanguageModel.ProviderOptions["prompt"] | undefined

        const prompt: Array<Prompt.Message> = [
          Prompt.assistantMessage({
            content: [
              Prompt.makePart("tool-call", {
                id: resolvedCallId,
                name: "ApprovalTool",
                params: { action: "delete" },
                providerExecuted: false
              }),
              Prompt.makePart("tool-approval-request", {
                approvalId: resolvedApprovalId,
                toolCallId: resolvedCallId
              }),
              Prompt.makePart("tool-call", {
                id: unresolvedCallId,
                name: "ApprovalTool",
                params: { action: "read" },
                providerExecuted: false
              }),
              Prompt.makePart("tool-approval-request", {
                approvalId: unresolvedApprovalId,
                toolCallId: unresolvedCallId
              })
            ]
          }),
          // Only resolve one of the two approvals
          Prompt.toolMessage({
            content: [
              Prompt.toolApprovalResponsePart({
                approvalId: resolvedApprovalId,
                approved: true
              })
            ]
          })
        ]

        yield* LanguageModel.streamText({
          prompt,
          toolkit: ApprovalToolkit
        }).pipe(
          Stream.runDrain,
          TestUtils.withLanguageModel({
            streamText: (opts) => {
              capturedPrompt = opts.prompt
              return [finishPart]
            }
          }),
          Effect.provide(ApprovalToolkitLayer)
        )

        assertDefined(capturedPrompt)
        const messages = capturedPrompt.content

        // The assistant message should have the resolved approval-request stripped
        // but the unresolved one preserved
        const assistantMsg = messages.find((m) => m.role === "assistant")
        assertDefined(assistantMsg)
        if (assistantMsg.role === "assistant") {
          const approvalRequests = assistantMsg.content.filter(
            (p) => p.type === "tool-approval-request"
          )
          strictEqual(approvalRequests.length, 1)
          if (approvalRequests[0].type === "tool-approval-request") {
            strictEqual(approvalRequests[0].approvalId, unresolvedApprovalId)
          }
          // Both tool-calls should survive
          strictEqual(assistantMsg.content.filter((p) => p.type === "tool-call").length, 2)
        }
      }))

    it.effect("strips approval artifacts via generateText path", () =>
      Effect.gen(function*() {
        const toolCallId = "call-gen"
        const approvalId = "approval-gen"
        let capturedPrompt: LanguageModel.ProviderOptions["prompt"] | undefined

        const prompt: Array<Prompt.Message> = [
          Prompt.assistantMessage({
            content: [
              Prompt.makePart("tool-call", {
                id: toolCallId,
                name: "ApprovalTool",
                params: { action: "delete" },
                providerExecuted: false
              }),
              Prompt.makePart("tool-approval-request", {
                approvalId,
                toolCallId
              })
            ]
          }),
          Prompt.toolMessage({
            content: [
              Prompt.toolApprovalResponsePart({
                approvalId,
                approved: true
              })
            ]
          })
        ]

        yield* LanguageModel.generateText({
          prompt,
          toolkit: ApprovalToolkit
        }).pipe(
          TestUtils.withLanguageModel({
            generateText: (opts) => {
              capturedPrompt = opts.prompt
              return Effect.succeed([finishPart])
            }
          }),
          Effect.provide(ApprovalToolkitLayer)
        )

        assertDefined(capturedPrompt)
        const messages = capturedPrompt.content

        for (const msg of messages) {
          if (msg.role === "assistant") {
            strictEqual(msg.content.filter((p) => p.type === "tool-approval-request").length, 0)
            strictEqual(msg.content.filter((p) => p.type === "tool-call").length, 1)
          }
          if (msg.role === "tool") {
            strictEqual(msg.content.filter((p) => p.type === "tool-approval-response").length, 0)
          }
        }
      }))

    it.effect("dynamic needsApproval returns true when condition met", () =>
      Effect.gen(function*() {
        const parts: Array<Response.StreamPart<Toolkit.Tools<typeof ApprovalToolkit>, "opaque">> = []

        const toolCallId = "call-dyn-1"

        yield* LanguageModel.streamText({
          prompt: [],
          toolkit: ApprovalToolkit
        }).pipe(
          Stream.runForEach((part) =>
            Effect.sync(() => {
              parts.push(part)
            })
          ),
          TestUtils.withLanguageModel({
            streamText: [
              {
                type: "tool-call",
                id: toolCallId,
                name: "DynamicApprovalTool",
                params: { dangerous: true }
              }
            ]
          }),
          Effect.provide(ApprovalToolkitLayer)
        )

        strictEqual(parts.length, 2)
        strictEqual(parts[0].type, "tool-call")
        strictEqual(parts[1].type, "tool-approval-request")
        if (parts[1].type === "tool-approval-request") {
          strictEqual(parts[1].toolCallId, toolCallId)
        }
      }))

    it.effect("dynamic needsApproval returns false when condition not met", () =>
      Effect.gen(function*() {
        const parts: Array<Response.StreamPart<Toolkit.Tools<typeof ApprovalToolkit>, "opaque">> = []

        const toolCallId = "call-dyn-2"

        yield* LanguageModel.streamText({
          prompt: [],
          toolkit: ApprovalToolkit
        }).pipe(
          Stream.runForEach((part) =>
            Effect.sync(() => {
              parts.push(part)
            })
          ),
          TestUtils.withLanguageModel({
            streamText: [
              {
                type: "tool-call",
                id: toolCallId,
                name: "DynamicApprovalTool",
                params: { dangerous: false }
              }
            ]
          }),
          Effect.provide(ApprovalToolkitLayer)
        )

        strictEqual(parts.length, 2)
        strictEqual(parts[0].type, "tool-call")
        strictEqual(parts[1].type, "tool-result")
        if (parts[1].type === "tool-result") {
          deepStrictEqual(parts[1].result, { result: "dynamic-result" })
        }
      }))

    it.effect("tool without needsApproval executes normally", () =>
      Effect.gen(function*() {
        const parts: Array<Response.StreamPart<Toolkit.Tools<typeof MyToolkit>, "opaque">> = []

        const toolCallId = "call-normal"
        const latch = yield* Latch.make()

        const fiber = yield* LanguageModel.streamText({
          prompt: [],
          toolkit: MyToolkit
        }).pipe(
          Stream.runForEach((part) =>
            Effect.andThen(
              latch.open,
              Effect.sync(() => {
                parts.push(part)
              })
            )
          ),
          TestUtils.withLanguageModel({
            streamText: [
              {
                type: "tool-call",
                id: toolCallId,
                name: "MyTool",
                params: { testParam: "test" }
              }
            ]
          }),
          Effect.provide(MyToolkitLayer),
          Effect.forkScoped
        )

        yield* latch.await
        yield* TestClock.adjust("10 seconds")
        yield* Fiber.join(fiber)

        strictEqual(parts.length, 2)
        strictEqual(parts[0].type, "tool-call")
        strictEqual(parts[1].type, "tool-result")
        if (parts[1].type === "tool-result") {
          deepStrictEqual(parts[1].result, { testSuccess: "test-success" })
        }
      }))

    it.effect("strips previous-round approval artifacts even when no new pending approvals (streamText)", () =>
      Effect.gen(function*() {
        const toolCallId = "call-prev"
        const approvalId = "approval-prev"
        let capturedPrompt: LanguageModel.ProviderOptions["prompt"] | undefined

        // Simulate a prompt where a previous round's approval was already
        // resolved (tool-result exists), but the approval artifacts remain.
        const prompt: Array<Prompt.Message> = [
          Prompt.assistantMessage({
            content: [
              Prompt.makePart("tool-call", {
                id: toolCallId,
                name: "ApprovalTool",
                params: { action: "delete" },
                providerExecuted: false
              }),
              Prompt.makePart("tool-approval-request", {
                approvalId,
                toolCallId
              })
            ]
          }),
          Prompt.toolMessage({
            content: [
              Prompt.toolApprovalResponsePart({
                approvalId,
                approved: true
              }),
              Prompt.toolResultPart({
                id: toolCallId,
                name: "ApprovalTool",
                result: { result: "approved-result" },
                isFailure: false,
                providerExecuted: false
              })
            ]
          }),
          // A new user message triggers another round with no new approvals
          Prompt.userMessage({ content: [Prompt.textPart({ text: "continue" })] })
        ]

        yield* LanguageModel.streamText({
          prompt,
          toolkit: ApprovalToolkit
        }).pipe(
          Stream.runDrain,
          TestUtils.withLanguageModel({
            streamText: (opts) => {
              capturedPrompt = opts.prompt
              return [finishPart]
            }
          }),
          Effect.provide(ApprovalToolkitLayer)
        )

        assertDefined(capturedPrompt)
        const messages = capturedPrompt.content

        // Previous-round approval artifacts should be stripped
        for (const msg of messages) {
          if (msg.role === "assistant") {
            strictEqual(msg.content.filter((p) => p.type === "tool-approval-request").length, 0)
          }
          if (msg.role === "tool") {
            strictEqual(msg.content.filter((p) => p.type === "tool-approval-response").length, 0)
          }
        }

        // The tool-result and tool-call should be preserved
        const assistantMsg = messages.find((m) => m.role === "assistant")
        assertDefined(assistantMsg)
        if (assistantMsg.role === "assistant") {
          strictEqual(assistantMsg.content.filter((p) => p.type === "tool-call").length, 1)
        }
        const toolMsg = messages.find((m) => m.role === "tool")
        assertDefined(toolMsg)
        if (toolMsg.role === "tool") {
          strictEqual(toolMsg.content.filter((p) => p.type === "tool-result").length, 1)
        }
      }))

    it.effect("strips previous-round approval artifacts even when no new pending approvals (generateText)", () =>
      Effect.gen(function*() {
        const toolCallId = "call-prev-gen"
        const approvalId = "approval-prev-gen"
        let capturedPrompt: LanguageModel.ProviderOptions["prompt"] | undefined

        const prompt: Array<Prompt.Message> = [
          Prompt.assistantMessage({
            content: [
              Prompt.makePart("tool-call", {
                id: toolCallId,
                name: "ApprovalTool",
                params: { action: "delete" },
                providerExecuted: false
              }),
              Prompt.makePart("tool-approval-request", {
                approvalId,
                toolCallId
              })
            ]
          }),
          Prompt.toolMessage({
            content: [
              Prompt.toolApprovalResponsePart({
                approvalId,
                approved: true
              }),
              Prompt.toolResultPart({
                id: toolCallId,
                name: "ApprovalTool",
                result: { result: "approved-result" },
                isFailure: false,
                providerExecuted: false
              })
            ]
          }),
          Prompt.userMessage({ content: [Prompt.textPart({ text: "continue" })] })
        ]

        yield* LanguageModel.generateText({
          prompt,
          toolkit: ApprovalToolkit
        }).pipe(
          TestUtils.withLanguageModel({
            generateText: (opts) => {
              capturedPrompt = opts.prompt
              return Effect.succeed([finishPart])
            }
          }),
          Effect.provide(ApprovalToolkitLayer)
        )

        assertDefined(capturedPrompt)
        const messages = capturedPrompt.content

        for (const msg of messages) {
          if (msg.role === "assistant") {
            strictEqual(msg.content.filter((p) => p.type === "tool-approval-request").length, 0)
          }
          if (msg.role === "tool") {
            strictEqual(msg.content.filter((p) => p.type === "tool-approval-response").length, 0)
          }
        }
      }))

    it.effect("streamText emits pre-resolved tool results as stream parts", () =>
      Effect.gen(function*() {
        const toolCallId = "call-emit"
        const approvalId = "approval-emit"
        const parts: Array<Response.StreamPart<Toolkit.Tools<typeof ApprovalToolkit>, "opaque">> = []

        const prompt: Array<Prompt.Message> = [
          Prompt.assistantMessage({
            content: [
              Prompt.makePart("tool-call", {
                id: toolCallId,
                name: "ApprovalTool",
                params: { action: "delete" },
                providerExecuted: false
              }),
              Prompt.makePart("tool-approval-request", {
                approvalId,
                toolCallId
              })
            ]
          }),
          Prompt.toolMessage({
            content: [
              Prompt.toolApprovalResponsePart({
                approvalId,
                approved: true
              })
            ]
          })
        ]

        yield* LanguageModel.streamText({
          prompt,
          toolkit: ApprovalToolkit
        }).pipe(
          Stream.runForEach((part) =>
            Effect.sync(() => {
              parts.push(part)
            })
          ),
          TestUtils.withLanguageModel({
            streamText: [finishPart]
          }),
          Effect.provide(ApprovalToolkitLayer)
        )

        // Should contain the pre-resolved tool-result as a stream part
        const toolResultParts = parts.filter((p) => p.type === "tool-result")
        strictEqual(toolResultParts.length, 1)
        if (toolResultParts[0].type === "tool-result") {
          strictEqual(toolResultParts[0].id, toolCallId)
          strictEqual(toolResultParts[0].name, "ApprovalTool")
          deepStrictEqual(toolResultParts[0].result, { result: "approved-result" })
          strictEqual(toolResultParts[0].isFailure, false)
        }
      }))
  })
})
