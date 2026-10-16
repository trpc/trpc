import { describe, it } from "@effect/vitest"
import { assertFalse, assertTrue, deepStrictEqual, strictEqual } from "@effect/vitest/utils"
import { Context, DateTime, Effect, Fiber, identity, Latch, Schema, SchemaGetter, Stream } from "effect"
import { AiError, LanguageModel, Response, Tool, Toolkit } from "effect/ai"
import { TestClock } from "effect/testing"
import * as TestUtils from "./utils.ts"

describe("Tool", () => {
  describe("User Defined", () => {
    it.effect("decodes parameters with services provided to the outer handle Effect", () =>
      Effect.gen(function*() {
        class Decoder extends Context.Service<Decoder, { readonly value: number }>()("test/ToolkitDecoder") {}
        const parameter = Schema.String.pipe(Schema.decodeTo(Schema.Number, {
          decode: SchemaGetter.transformEffect(() => Effect.map(Decoder, (decoder) => decoder.value)),
          encode: SchemaGetter.transform(String)
        }))
        const toolkit = Toolkit.make(Tool.make("Decode", {
          parameters: Schema.Struct({ n: parameter }),
          success: Schema.Number
        }))
        const handlers = yield* toolkit.pipe(Effect.provide(toolkit.toLayer({
          Decode: ({ n }) => Effect.succeed(n)
        })))

        // Different service values in the two phases show which one decodes
        // the parameters. The Stream's declared requirement is still provided.
        const stream = yield* handlers.handle("Decode", { n: "1" }).pipe(
          Effect.provideService(Decoder, { value: 42 })
        )
        const results = yield* Stream.runCollect(stream).pipe(
          Effect.provideService(Decoder, { value: 1 })
        )
        strictEqual(results[0]?.result, 42)
      }))

    it.effect("should return tool call handler successes", () =>
      Effect.gen(function*() {
        const toolkit = Toolkit.make(FailureModeReturn)

        const toolResult = { testSuccess: "failure-mode-return-tool" }
        const handlers = toolkit.toLayer({
          FailureModeReturn: () => Effect.succeed(toolResult)
        })

        const toolCallId = "tool-123"
        const toolName = "FailureModeReturn"

        const response = yield* LanguageModel.generateText({
          prompt: "Test",
          toolkit
        }).pipe(
          TestUtils.withLanguageModel({
            generateText: [{
              type: "tool-call",
              id: toolCallId,
              name: toolName,
              params: { testParam: "test-param" }
            }]
          }),
          Effect.provide(handlers)
        )

        deepStrictEqual(response.toolResults, [
          Response.makePart("tool-result", {
            id: toolCallId,
            isFailure: false,
            name: toolName,
            result: toolResult,
            encodedResult: toolResult,
            providerExecuted: false,
            preliminary: false
          })
        ])
      }))

    it.effect("should return tool call handler failures when failure mode is return", () =>
      Effect.gen(function*() {
        const toolkit = Toolkit.make(FailureModeReturn)

        const toolResult = { testFailure: "failure-mode-return-tool" }
        const handlers = toolkit.toLayer({
          FailureModeReturn: () => Effect.fail(toolResult)
        })

        const toolCallId = "tool-123"
        const toolName = "FailureModeReturn"

        const response = yield* LanguageModel.generateText({
          prompt: "Test",
          toolkit
        }).pipe(
          TestUtils.withLanguageModel({
            generateText: [{
              type: "tool-call",
              id: toolCallId,
              name: toolName,
              params: { testParam: "test-param" }
            }]
          }),
          Effect.provide(handlers)
        )

        deepStrictEqual(response.toolResults, [
          Response.makePart("tool-result", {
            id: toolCallId,
            name: toolName,
            isFailure: true,
            result: toolResult,
            encodedResult: toolResult,
            providerExecuted: false,
            preliminary: false
          })
        ])
      }))

    it.effect("should encode returned failures with the failure schema", () =>
      Effect.gen(function*() {
        const toolkit = Toolkit.make(Tool.make("FailureEncoding", {
          success: Schema.Number,
          failure: Schema.NumberFromString,
          failureMode: "return"
        }))
        const handlers = yield* toolkit.pipe(Effect.provide(toolkit.toLayer({
          FailureEncoding: () => Effect.fail(404)
        })))
        const results = yield* handlers.handle("FailureEncoding", {}).pipe(Effect.flatMap(Stream.runCollect))

        strictEqual(results[0].encodedResult, "404")
      }))

    it.effect("should fail the extracted return-mode stream on invalid result encoding", () =>
      Effect.gen(function*() {
        const toolkit = Toolkit.make(Tool.make("Positive", {
          failureMode: "return",
          success: Schema.Number.check(Schema.isGreaterThan(0))
        }))
        const handlers = yield* toolkit.pipe(Effect.provide(toolkit.toLayer({
          Positive: () => Effect.succeed(-1)
        })))
        const inner = yield* handlers.handle("Positive", {})
        const error = yield* Stream.runCollect(inner).pipe(Effect.flip)

        strictEqual(error._tag, "AiError")
        strictEqual(error.module, "Toolkit")
        strictEqual(error.method, "Positive.handle")
        strictEqual(error.reason._tag, "ToolResultEncodingError")
      }))

    it.effect("should return tool call handler failures with failure mode return using OpenAI transformer", () =>
      Effect.gen(function*() {
        const toolkit = Toolkit.make(FailureModeReturn)

        const toolResult = { testFailure: "failure-mode-return-tool" }
        const handlers = toolkit.toLayer({
          FailureModeReturn: () => Effect.fail(toolResult)
        })

        const toolCallId = "tool-123"
        const toolName = "FailureModeReturn"

        const response = yield* LanguageModel.generateText({
          prompt: "Test",
          toolkit
        }).pipe(
          TestUtils.withLanguageModel({
            generateText: [{
              type: "tool-call",
              id: toolCallId,
              name: toolName,
              params: { testParam: "test-param" }
            }]
          }),
          Effect.provide(handlers)
        )

        deepStrictEqual(response.toolResults, [
          Response.makePart("tool-result", {
            id: toolCallId,
            name: toolName,
            isFailure: true,
            result: toolResult,
            encodedResult: toolResult,
            providerExecuted: false,
            preliminary: false
          })
        ])
      }))

    it.effect("should raise an error on tool call handler failures when failure mode is error", () =>
      Effect.gen(function*() {
        const toolkit = Toolkit.make(FailureModeError)

        const toolResult = { testFailure: "failure-mode-error-tool" }
        const handlers = toolkit.toLayer({
          FailureModeError: () => Effect.fail(toolResult)
        })

        const toolCallId = "tool-123"
        const toolName = "FailureModeError"

        const response = yield* LanguageModel.generateText({
          prompt: "Test",
          toolkit
        }).pipe(
          TestUtils.withLanguageModel({
            generateText: [{
              type: "tool-call",
              id: toolCallId,
              name: toolName,
              params: { testParam: "test-param" }
            }]
          }),
          Effect.provide(handlers),
          Effect.flip
        )

        deepStrictEqual(response, toolResult)
      }))

    it.effect("should return a failed tool result when tool call parameters are invalid and failure mode is return", () =>
      Effect.gen(function*() {
        const toolkit = Toolkit.make(FailureModeReturn)

        const toolResult = { testSuccess: "failure-mode-return-tool" }
        const handlers = toolkit.toLayer({
          FailureModeReturn: () => Effect.succeed(toolResult)
        })

        const toolCallId = "tool-123"
        const toolName = "FailureModeReturn"

        const response = yield* LanguageModel.generateText({
          prompt: "Test",
          toolkit
        }).pipe(
          TestUtils.withLanguageModel({
            generateText: [{
              type: "tool-call",
              id: toolCallId,
              name: toolName,
              params: {}
            }]
          }),
          Effect.provide(handlers)
        )

        const description = `Missing key\n  at ["testParam"]`
        deepStrictEqual(response.toolResults, [
          Response.toolResultPart({
            id: toolCallId,
            name: toolName,
            isFailure: true,
            providerExecuted: false,
            preliminary: false,
            result: AiError.make({
              module: "Toolkit",
              method: "FailureModeReturn.handle",
              reason: new AiError.ToolParameterValidationError({
                toolName,
                description
              })
            }),
            encodedResult: {
              _tag: "AiError",
              module: "Toolkit",
              method: "FailureModeReturn.handle",
              reason: {
                _tag: "ToolParameterValidationError",
                toolName,
                description
              }
            }
          })
        ])
      }))

    it.effect("should return a failed tool result when tool call parameters contain NaN and failure mode is return", () =>
      Effect.gen(function*() {
        const toolkit = Toolkit.make(FailureModeReturn)

        const handlers = toolkit.toLayer({
          FailureModeReturn: () => Effect.succeed({ testSuccess: "unused" })
        })

        const toolCallId = "tool-123"
        const toolName = "FailureModeReturn"

        const response = yield* LanguageModel.generateText({
          prompt: "Test",
          toolkit
        }).pipe(
          TestUtils.withLanguageModel({
            generateText: [{
              type: "tool-call",
              id: toolCallId,
              name: toolName,
              params: { testParam: NaN }
            }]
          }),
          Effect.provide(handlers)
        )

        strictEqual(response.toolResults.length, 1)
        const toolResult = response.toolResults[0]
        strictEqual(toolResult.isFailure, true)
        const result = toolResult.result as AiError.AiError
        strictEqual(result._tag, "AiError")
        strictEqual(result.reason._tag, "ToolParameterValidationError")
      }))

    it.effect("should raise an error when tool call parameters are invalid and failure mode is error", () =>
      Effect.gen(function*() {
        const toolkit = Toolkit.make(FailureModeError)

        const handlers = toolkit.toLayer({
          FailureModeError: () => Effect.succeed({ testSuccess: "unused" })
        })

        const toolCallId = "tool-123"
        const toolName = "FailureModeError"

        const response = yield* LanguageModel.generateText({
          prompt: "Test",
          toolkit
        }).pipe(
          TestUtils.withLanguageModel({
            generateText: [{
              type: "tool-call",
              id: toolCallId,
              name: toolName,
              params: { testParam: NaN }
            }]
          }),
          Effect.provide(handlers),
          Effect.flip
        )

        deepStrictEqual(
          response,
          AiError.make({
            module: "Toolkit",
            method: "FailureModeError.handle",
            reason: new AiError.ToolParameterValidationError({
              toolName: "FailureModeError",
              description: `Expected string\n  at ["testParam"]`
            })
          })
        )
      }))

    it.effect("should return AiError when user returns an AiErrorReason when failure mode is return", () =>
      Effect.gen(function*() {
        const toolkit = Toolkit.make(FailureModeReturn)

        const reason = new AiError.RateLimitError({})
        const handlers = toolkit.toLayer({
          FailureModeReturn: () => Effect.fail(reason)
        })

        const toolCallId = "tool-123"
        const toolName = "FailureModeReturn"

        const response = yield* LanguageModel.generateText({
          prompt: "Test",
          toolkit
        }).pipe(
          TestUtils.withLanguageModel({
            generateText: [{
              type: "tool-call",
              id: toolCallId,
              name: toolName,
              params: { testParam: "test-param" }
            }]
          }),
          Effect.provide(handlers)
        )

        deepStrictEqual(response.toolResults, [
          Response.toolResultPart({
            id: toolCallId,
            name: toolName,
            isFailure: true,
            providerExecuted: false,
            preliminary: false,
            result: AiError.make({
              module: "Toolkit",
              method: "FailureModeReturn.handle",
              reason
            }),
            encodedResult: {
              _tag: "AiError",
              module: "Toolkit",
              method: "FailureModeReturn.handle",
              reason: { _tag: "RateLimitError", metadata: {} }
            }
          })
        ])
      }))

    it.effect("should raise an AiError when user returns an AiErrorReason when failure mode is error", () =>
      Effect.gen(function*() {
        const toolkit = Toolkit.make(FailureModeError)

        const reason = new AiError.RateLimitError({})
        const handlers = toolkit.toLayer({
          FailureModeError: () => Effect.fail(reason)
        })

        const toolCallId = "tool-123"
        const toolName = "FailureModeError"

        const response = yield* LanguageModel.generateText({
          prompt: "Test",
          toolkit
        }).pipe(
          TestUtils.withLanguageModel({
            generateText: [{
              type: "tool-call",
              id: toolCallId,
              name: toolName,
              params: { testParam: "test-param" }
            }]
          }),
          Effect.provide(handlers),
          Effect.flip
        )

        deepStrictEqual(
          response,
          AiError.make({
            module: "Toolkit",
            method: "FailureModeError.handle",
            reason
          })
        )
      }))

    describe("Preliminary Results", () => {
      it.effect("should not have preliminary results when generateText is used", () =>
        Effect.gen(function*() {
          const toolkit = Toolkit.make(IncrementalTool)

          const toolCallId = "tool-123"
          const toolName = "IncrementalTool"
          const preliminaryResult = { status: "loading", progress: 50 } as const
          const terminalResult = { status: "complete" } as const

          const handlers = toolkit.toLayer({
            IncrementalTool: Effect.fnUntraced(function*(_, ctx) {
              yield* ctx.preliminary(preliminaryResult)
              return terminalResult
            })
          })

          const response = yield* LanguageModel.generateText({
            prompt: "Test",
            toolkit
          }).pipe(
            TestUtils.withLanguageModel({
              generateText: [{
                type: "tool-call",
                id: toolCallId,
                name: toolName,
                params: { input: "test" }
              }]
            }),
            Effect.provide(handlers)
          )

          const hasPreliminaryResults = response.content.some((part) => {
            return part.type === "tool-result" && part.preliminary === true
          })

          assertFalse(hasPreliminaryResults)
          deepStrictEqual(
            response.content[1],
            Response.toolResultPart({
              id: toolCallId,
              name: toolName,
              isFailure: false,
              result: terminalResult,
              encodedResult: terminalResult,
              providerExecuted: false,
              preliminary: false
            })
          )
        }))

      it.effect("should have preliminary results when streamText is used", () =>
        Effect.gen(function*() {
          const toolkit = Toolkit.make(IncrementalTool)

          const toolCallId = "tool-123"
          const toolName = "IncrementalTool"
          const preliminaryResult = { status: "loading", progress: 50 } as const
          const terminalResult = { status: "complete" } as const

          const handlers = toolkit.toLayer({
            IncrementalTool: Effect.fnUntraced(function*(_, ctx) {
              yield* ctx.preliminary(preliminaryResult)
              return terminalResult
            })
          })

          const response = yield* LanguageModel.streamText({
            prompt: "Test",
            toolkit
          }).pipe(
            Stream.runCollect,
            TestUtils.withLanguageModel({
              streamText: [{
                type: "tool-call",
                id: toolCallId,
                name: toolName,
                params: { input: "test" }
              }]
            }),
            Effect.provide(handlers)
          )

          deepStrictEqual(
            response[1],
            Response.toolResultPart({
              id: toolCallId,
              name: toolName,
              isFailure: false,
              result: preliminaryResult,
              encodedResult: preliminaryResult,
              providerExecuted: false,
              preliminary: true
            })
          )

          deepStrictEqual(
            response[2],
            Response.toolResultPart({
              id: toolCallId,
              name: toolName,
              isFailure: false,
              result: terminalResult,
              encodedResult: terminalResult,
              providerExecuted: false,
              preliminary: false
            })
          )
        }))

      it.effect("should handle multiple preliminary results in sequence", () =>
        Effect.gen(function*() {
          const toolkit = Toolkit.make(IncrementalTool)

          const toolCallId = "tool-123"
          const toolName = "IncrementalTool"

          const handlers = toolkit.toLayer({
            IncrementalTool: Effect.fnUntraced(function*(_, ctx) {
              yield* ctx.preliminary({ status: "loading", progress: 0 })
              yield* ctx.preliminary({ status: "processing", progress: 50 })
              yield* ctx.preliminary({ status: "finalizing", progress: 90 })
              return { status: "complete" }
            })
          })

          const response = yield* LanguageModel.streamText({
            prompt: "Test",
            toolkit
          }).pipe(
            Stream.runCollect,
            TestUtils.withLanguageModel({
              streamText: [{
                type: "tool-call",
                id: toolCallId,
                name: toolName,
                params: { input: "test" }
              }]
            }),
            Effect.provide(handlers)
          )

          const toolResults = response.filter((part) => part.type === "tool-result")

          // Should have 3 preliminary + 1 final = 4 results
          strictEqual(toolResults.length, 4)

          // Verify ordering and preliminary flags
          strictEqual(toolResults[0].preliminary, true)
          deepStrictEqual(toolResults[0].result, { status: "loading", progress: 0 })

          strictEqual(toolResults[1].preliminary, true)
          deepStrictEqual(toolResults[1].result, { status: "processing", progress: 50 })

          strictEqual(toolResults[2].preliminary, true)
          deepStrictEqual(toolResults[2].result, { status: "finalizing", progress: 90 })

          strictEqual(toolResults[3].preliminary, false)
          deepStrictEqual(toolResults[3].result, { status: "complete" })
        }))

      it.effect("should handle preliminary results for long-running tools", () =>
        Effect.gen(function*() {
          const toolkit = Toolkit.make(IncrementalTool)

          const toolCallId = "tool-123"
          const toolName = "IncrementalTool"

          const handlers = toolkit.toLayer({
            IncrementalTool: Effect.fnUntraced(function*(_, ctx) {
              yield* ctx.preliminary({ status: "loading", progress: 0 })
              yield* Effect.sleep("5 seconds")
              return { status: "complete" }
            })
          })

          const terminalLatch = yield* Latch.make()
          const assertions = { preliminary: false, terminal: false }

          const fiber = yield* LanguageModel.streamText({
            prompt: "Test",
            toolkit
          }).pipe(
            Stream.tap(Effect.fnUntraced(function*(part) {
              if (part.type === "tool-result") {
                if (!assertions.preliminary) {
                  yield* terminalLatch.open
                  strictEqual(part.preliminary, true)
                  deepStrictEqual(part.result, { status: "loading", progress: 0 })
                  assertions.preliminary = true
                } else {
                  strictEqual(part.preliminary, false)
                  deepStrictEqual(part.result, { status: "complete" })
                  assertions.terminal = true
                }
              }
            })),
            Stream.runCollect,
            TestUtils.withLanguageModel({
              streamText: [{
                type: "tool-call",
                id: toolCallId,
                name: toolName,
                params: { input: "test" }
              }]
            }),
            Effect.provide(handlers),
            Effect.forkScoped
          )

          yield* terminalLatch.await
          yield* TestClock.adjust("5 seconds")
          const response = yield* Fiber.join(fiber)

          assertTrue(Object.values(assertions).every(identity))

          // Should have 1 preliminary + 1 final = 2 results
          const toolResults = response.filter((part) => part.type === "tool-result")
          strictEqual(toolResults.length, 2)
        }))

      it.effect("should emit preliminary results before failure when handler fails", () =>
        Effect.gen(function*() {
          const toolkit = Toolkit.make(IncrementalToolWithFailure)

          const toolCallId = "tool-123"
          const toolName = "IncrementalToolWithFailure"

          const handlers = toolkit.toLayer({
            IncrementalToolWithFailure: Effect.fnUntraced(function*(_, ctx) {
              yield* ctx.preliminary({ status: "loading" })
              yield* ctx.preliminary({ status: "processing" })
              return yield* Effect.fail({ error: "Something went wrong" })
            })
          })

          const response = yield* LanguageModel.streamText({
            prompt: "Test",
            toolkit
          }).pipe(
            Stream.runCollect,
            TestUtils.withLanguageModel({
              streamText: [{
                type: "tool-call",
                id: toolCallId,
                name: toolName,
                params: { input: "test" }
              }]
            }),
            Effect.provide(handlers)
          )

          const toolResults = response.filter((part) => part.type === "tool-result")

          // Should have 2 preliminary + 1 final (failure) = 3 results
          strictEqual(toolResults.length, 3)

          // Preliminary results emitted before failure
          strictEqual(toolResults[0].preliminary, true)
          strictEqual(toolResults[0].isFailure, false)
          deepStrictEqual(toolResults[0].result, { status: "loading" })

          strictEqual(toolResults[1].preliminary, true)
          strictEqual(toolResults[1].isFailure, false)
          deepStrictEqual(toolResults[1].result, { status: "processing" })

          // Final result is the failure
          strictEqual(toolResults[2].preliminary, false)
          strictEqual(toolResults[2].isFailure, true)
          deepStrictEqual(toolResults[2].result, { error: "Something went wrong" })
        }))

      it.effect("should interleave results from concurrent tools with preliminary results", () =>
        Effect.gen(function*() {
          const toolkit = Toolkit.make(ConcurrentIncrementalTool)

          const handlers = toolkit.toLayer({
            ConcurrentIncrementalTool: Effect.fnUntraced(function*({ name, delay }, ctx) {
              yield* ctx.preliminary({ status: `loading`, job: name, progress: 50 })
              yield* Effect.sleep(delay)
              return { status: `complete`, job: name }
            })
          })

          const latch = yield* Latch.make()
          const toolResults: Array<Response.ToolResultParts<Toolkit.Tools<typeof toolkit>>> = []

          const fiber = yield* LanguageModel.streamText({
            prompt: "Test",
            toolkit
          }).pipe(
            Stream.tap(() => latch.open),
            Stream.tap((part) => {
              if (part.type === "tool-result") {
                return Effect.sync(() => toolResults.push(part))
              }
              return Effect.void
            }),
            Stream.runCollect,
            TestUtils.withLanguageModel({
              streamText: [
                {
                  type: "tool-call",
                  id: "tool-fast",
                  name: "ConcurrentIncrementalTool",
                  params: { name: "fast", delay: 1000 }
                },
                {
                  type: "tool-call",
                  id: "tool-slow",
                  name: "ConcurrentIncrementalTool",
                  params: { name: "slow", delay: 2000 }
                }
              ]
            }),
            Effect.provide(handlers),
            Effect.forkScoped
          )

          // Wait for stream to start (first item emitted)
          yield* latch.await

          // Give forked tool handlers time to emit preliminary results
          yield* Effect.yieldNow
          yield* Effect.yieldNow
          yield* Effect.yieldNow

          // Initially both preliminary results should be emitted immediately
          strictEqual(toolResults.length, 2)
          strictEqual(toolResults[0].preliminary, true)
          deepStrictEqual(toolResults[0].result, { status: "loading", job: "fast", progress: 50 })
          strictEqual(toolResults[1].preliminary, true)
          deepStrictEqual(toolResults[1].result, { status: "loading", job: "slow", progress: 50 })

          // After 1 second, fast tool completes
          yield* TestClock.adjust("1 second")
          yield* Effect.yieldNow
          strictEqual(toolResults.length, 3)
          strictEqual(toolResults[2].preliminary, false)
          deepStrictEqual(toolResults[2].result, { status: "complete", job: "fast" })

          // After 2 more seconds (3 total), slow tool completes
          yield* TestClock.adjust("2 seconds")
          yield* Effect.yieldNow
          yield* Fiber.join(fiber)

          strictEqual(toolResults.length, 4)
          strictEqual(toolResults[3].preliminary, false)
          deepStrictEqual(toolResults[3].result, { status: "complete", job: "slow" })
        }))
    })
  })

  describe("Provider Defined", () => {
    it.effect("should return tool call successes from the model", () =>
      Effect.gen(function*() {
        const tool = NoHandlerRequired({
          testArg: "test-arg"
        })
        const toolkit = Toolkit.make(tool)

        const toolCallId = "tool-123"
        const toolResult = { testSuccess: "provider-defined-tool" }

        const response = yield* LanguageModel.generateText({
          prompt: "Test",
          toolkit
        }).pipe(
          TestUtils.withLanguageModel({
            generateText: [
              {
                type: "tool-call",
                id: toolCallId,
                name: tool.name,
                providerExecuted: true,
                params: { testParam: "test-param" }
              },
              {
                type: "tool-result",
                id: toolCallId,
                name: tool.name,
                isFailure: false,
                result: toolResult,
                providerExecuted: true
              }
            ]
          })
        )

        deepStrictEqual(response.toolResults, [
          Response.makePart("tool-result", {
            id: toolCallId,
            name: tool.name,
            isFailure: false,
            result: toolResult,
            encodedResult: toolResult,
            providerExecuted: true,
            preliminary: false
          })
        ])
      }))

    it.effect("should return tool call failures from the model", () =>
      Effect.gen(function*() {
        const tool = NoHandlerRequired({
          testArg: "test-arg"
        })
        const toolkit = Toolkit.make(tool)

        const toolCallId = "tool-123"
        const toolResult = { testFailure: "provider-defined-tool" }

        const response = yield* LanguageModel.generateText({
          prompt: "Test",
          toolkit
        }).pipe(
          TestUtils.withLanguageModel({
            generateText: [
              {
                type: "tool-call",
                id: toolCallId,
                name: tool.name,
                providerExecuted: true,
                params: { testParam: "test-param" }
              },
              {
                type: "tool-result",
                id: toolCallId,
                isFailure: true,
                name: tool.name,
                result: toolResult,
                providerExecuted: true
              }
            ]
          })
        )

        deepStrictEqual(response.toolResults, [
          Response.makePart("tool-result", {
            id: toolCallId,
            name: tool.name,
            isFailure: true,
            result: toolResult,
            encodedResult: toolResult,
            providerExecuted: true,
            preliminary: false
          })
        ])
      }))

    it.effect("should return tool call handler successes", () =>
      Effect.gen(function*() {
        const tool = HandlerRequired({
          testArg: "test-arg"
        })

        const toolCallId = "tool-123"
        const toolResult = { testSuccess: "provider-defined-tool" }

        const toolkit = Toolkit.make(tool)
        const handlers = toolkit.toLayer({
          HandlerRequired: () => Effect.succeed(toolResult)
        })

        const response = yield* LanguageModel.generateText({
          prompt: "Test",
          toolkit
        }).pipe(
          TestUtils.withLanguageModel({
            generateText: [
              {
                type: "tool-call",
                id: toolCallId,
                name: tool.name,
                // Given this provider-defined tool requires a user-space
                // handler, it is not considered `providerExecuted`
                providerExecuted: false,
                params: { testParam: "test-param" }
              }
            ]
          }),
          Effect.provide(handlers)
        )

        deepStrictEqual(response.toolResults, [
          Response.makePart("tool-result", {
            id: toolCallId,
            name: tool.name,
            isFailure: false,
            result: toolResult,
            encodedResult: toolResult,
            providerExecuted: false,
            preliminary: false
          })
        ])
      }))

    it.effect("should return tool call handler failures when failure mode is return", () =>
      Effect.gen(function*() {
        const tool = HandlerRequired({
          failureMode: "return",
          testArg: "test-arg"
        })

        const toolCallId = "tool-123"
        const toolResult = { testFailure: "provider-defined-tool" }

        const toolkit = Toolkit.make(tool)
        const handlers = toolkit.toLayer({
          HandlerRequired: () => Effect.fail(toolResult)
        })

        const response = yield* LanguageModel.generateText({
          prompt: "Test",
          toolkit
        }).pipe(
          TestUtils.withLanguageModel({
            generateText: [
              {
                type: "tool-call",
                id: toolCallId,
                name: tool.name,
                // Given this provider-defined tool requires a user-space
                // handler, it is not considered `providerExecuted`
                providerExecuted: false,
                params: { testParam: "test-param" }
              }
            ]
          }),
          Effect.provide(handlers)
        )

        deepStrictEqual(response.toolResults, [
          Response.makePart("tool-result", {
            id: toolCallId,
            name: tool.name,
            isFailure: true,
            result: toolResult,
            encodedResult: toolResult,
            providerExecuted: false,
            preliminary: false
          })
        ])
      }))

    it.effect("should raise an error on tool call handler failures when failure mode is error", () =>
      Effect.gen(function*() {
        const tool = HandlerRequired({
          testArg: "test-arg"
        })

        const toolCallId = "tool-123"
        const toolResult = { testFailure: "provider-defined-tool" }

        const toolkit = Toolkit.make(tool)
        const handlers = toolkit.toLayer({
          HandlerRequired: () => Effect.fail(toolResult)
        })

        const response = yield* LanguageModel.generateText({
          prompt: "Test",
          toolkit
        }).pipe(
          TestUtils.withLanguageModel({
            generateText: [
              {
                type: "tool-call",
                id: toolCallId,
                name: tool.name,
                // Given this provider-defined tool requires a user-space
                // handler, it is not considered `providerExecuted`
                providerExecuted: false,
                params: { testParam: "test-param" }
              }
            ]
          }),
          Effect.provide(handlers),
          Effect.flip
        )

        deepStrictEqual(response, toolResult)
      }))

    it.effect("should return a failed tool result when tool call parameters are invalid and failure mode is return", () =>
      Effect.gen(function*() {
        const tool = HandlerRequired({
          failureMode: "return",
          testArg: "test-arg"
        })

        const toolCallId = "tool-123"
        const toolResult = { testSuccess: "provider-defined-tool" }

        const toolkit = Toolkit.make(tool)
        const handlers = toolkit.toLayer({
          HandlerRequired: () => Effect.succeed(toolResult)
        })

        const response = yield* LanguageModel.generateText({
          prompt: "Test",
          toolkit
        }).pipe(
          TestUtils.withLanguageModel({
            generateText: [
              {
                type: "tool-call",
                id: toolCallId,
                name: tool.name,
                // Given this provider-defined tool requires a user-space
                // handler, it is not considered `providerExecuted`
                providerExecuted: false,
                params: {}
              }
            ]
          }),
          Effect.provide(handlers)
        )

        const description = `Missing key\n  at ["testParam"]`
        deepStrictEqual(response.toolResults, [
          Response.toolResultPart({
            id: toolCallId,
            name: tool.name,
            isFailure: true,
            providerExecuted: false,
            preliminary: false,
            result: AiError.make({
              module: "Toolkit",
              method: "HandlerRequired.handle",
              reason: new AiError.ToolParameterValidationError({
                toolName: "HandlerRequired",
                description
              })
            }),
            encodedResult: {
              _tag: "AiError",
              module: "Toolkit",
              method: "HandlerRequired.handle",
              reason: {
                _tag: "ToolParameterValidationError",
                toolName: "HandlerRequired",
                description
              }
            }
          })
        ])
      }))

    describe("addDependency", () => {
      it("preserves the provider-defined tool identity", () => {
        const tool = HandlerRequired({ testArg: "test-arg" })
        const withDep = tool.addDependency(TestDependency)
        assertTrue(Tool.isProviderDefined(withDep))
        assertFalse(Tool.isUserDefined(withDep))
        assertFalse(Tool.isDynamic(withDep))
      })

      it("preserves the provider-defined tool id", () => {
        const tool = HandlerRequired({ testArg: "test-arg" })
        const withDep = tool.addDependency(TestDependency)
        strictEqual(withDep.id, "test.handler_required")
      })
    })

    it("getStrictMode returns undefined without throwing", () => {
      const tool = NoHandlerRequired({ testArg: "test-arg" })
      strictEqual(Tool.getStrictMode(tool), undefined)
    })

    it("annotate preserves the provider-defined tool identity", () => {
      const tool = NoHandlerRequired({ testArg: "test-arg" }).annotate(Tool.Strict, false)
      assertTrue(Tool.isProviderDefined(tool))
      strictEqual(Tool.getStrictMode(tool), false)
    })
  })
})

class TestDependency extends Context.Service<TestDependency, { readonly value: number }>()("TestDependency") {}

const FailureModeError = Tool.make("FailureModeError", {
  description: "A test tool",
  parameters: Schema.Struct({
    testParam: Schema.String
  }),
  success: Schema.Struct({
    testSuccess: Schema.String
  }),
  failure: Schema.Struct({
    testFailure: Schema.String
  })
})

const FailureModeReturn = Tool.make("FailureModeReturn", {
  description: "A test tool",
  failureMode: "return",
  parameters: Schema.Struct({
    testParam: Schema.String
  }),
  success: Schema.Struct({
    testSuccess: Schema.String
  }),
  failure: Schema.Struct({
    testFailure: Schema.String
  })
})

const IncrementalTool = Tool.make("IncrementalTool", {
  description: "A test tool",
  parameters: Schema.Struct({ input: Schema.String }),
  success: Schema.Union([
    Schema.Struct({ status: Schema.Literal("loading"), progress: Schema.Number }),
    Schema.Struct({ status: Schema.Literal("processing"), progress: Schema.Number }),
    Schema.Struct({ status: Schema.Literal("finalizing"), progress: Schema.Number }),
    Schema.Struct({ status: Schema.Literal("complete") })
  ])
})

const ConcurrentIncrementalTool = Tool.make("ConcurrentIncrementalTool", {
  description: "A test tool",
  parameters: Schema.Struct({ name: Schema.String, delay: Schema.DurationFromMillis }),
  success: Schema.Union([
    Schema.Struct({ status: Schema.Literal("loading"), job: Schema.String, progress: Schema.Number }),
    Schema.Struct({ status: Schema.Literal("complete"), job: Schema.String })
  ])
})

const IncrementalToolWithFailure = Tool.make("IncrementalToolWithFailure", {
  description: "A test tool",
  failureMode: "return",
  parameters: Schema.Struct({ input: Schema.String }),
  success: Schema.Struct({
    status: Schema.String,
    progress: Schema.optional(Schema.Number)
  }),
  failure: Schema.Struct({
    error: Schema.String
  })
})

const NoHandlerRequired = Tool.providerDefined({
  id: "test.no_handler_required",
  customName: "NoHandlerRequired",
  providerName: "no_handler_required",
  args: Schema.Struct({
    testArg: Schema.String
  }),
  parameters: Schema.Struct({
    testParam: Schema.String
  }),
  success: Schema.Struct({
    testSuccess: Schema.String
  }),
  failure: Schema.Struct({
    testFailure: Schema.String
  })
})

const HandlerRequired = Tool.providerDefined({
  id: "test.handler_required",
  customName: "HandlerRequired",
  providerName: "handler_required",
  requiresHandler: true,
  args: Schema.Struct({
    testArg: Schema.String
  }),
  parameters: Schema.Struct({
    testParam: Schema.String
  }),
  success: Schema.Struct({
    testSuccess: Schema.String
  }),
  failure: Schema.Struct({
    testFailure: Schema.String
  })
})

describe("setNeedsApproval", () => {
  it("sets a static approval requirement without mutating the original tool", () => {
    const tool = Tool.make("TestTool", { needsApproval: true })
    const updated = tool.setNeedsApproval(false)

    strictEqual(tool.needsApproval, true)
    strictEqual(updated.needsApproval, false)
  })

  it("sets a dynamic approval requirement", () => {
    const needsApproval = (params: { readonly dangerous: boolean }) => params.dangerous
    const tool = Tool.make("TestTool", {
      parameters: Schema.Struct({ dangerous: Schema.Boolean })
    }).setNeedsApproval(needsApproval)

    strictEqual(tool.needsApproval, needsApproval)
  })

  it("preserves dynamic tool identity", () => {
    const tool = Tool.dynamic("TestTool", {
      parameters: { type: "object", properties: {} }
    }).setNeedsApproval(true)

    assertTrue(Tool.isDynamic(tool))
    strictEqual(tool.needsApproval, true)
  })
})

describe("Dynamic", () => {
  it("setParameters replaces a raw JSON Schema", () => {
    const tool = Tool.dynamic("TestTool", {
      parameters: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"]
      }
    }).setParameters(Schema.Struct({ count: Schema.Number }))

    deepStrictEqual(Tool.getJsonSchema(tool).required, ["count"], "expected the replacement schema")
  })

  describe("isDynamic", () => {
    it.effect("returns true for dynamic tools with Effect Schema", () =>
      Effect.gen(function*() {
        const tool = Tool.dynamic("TestTool", {
          parameters: Schema.Struct({ query: Schema.String })
        })
        assertTrue(Tool.isDynamic(tool))
      }))

    it.effect("returns true for dynamic tools with JSON Schema", () =>
      Effect.gen(function*() {
        const tool = Tool.dynamic("TestTool", {
          parameters: { type: "object", properties: {} }
        })
        assertTrue(Tool.isDynamic(tool))
      }))

    it.effect("returns false for user-defined tools", () =>
      Effect.gen(function*() {
        const tool = Tool.make("TestTool", {
          parameters: Schema.Struct({ query: Schema.String })
        })
        assertFalse(Tool.isDynamic(tool))
      }))

    it.effect("returns false for provider-defined tools", () =>
      Effect.gen(function*() {
        const tool = Tool.providerDefined({
          id: "test.provider_tool",
          customName: "ProviderTool",
          providerName: "provider_tool"
        })()
        assertFalse(Tool.isDynamic(tool))
      }))

    it.effect("returns false for non-tool values", () =>
      Effect.gen(function*() {
        assertFalse(Tool.isDynamic(null))
        assertFalse(Tool.isDynamic(undefined))
        assertFalse(Tool.isDynamic({}))
        assertFalse(Tool.isDynamic({ name: "fake" }))
      }))
  })

  describe("getJsonSchema", () => {
    it.effect("Tool.make EmptyParams produces same output as omitting parameters", () =>
      Effect.gen(function*() {
        const withEmpty = Tool.make("A", { parameters: Tool.EmptyParams })
        const withoutParams = Tool.make("B")
        const withEmptyJsonSchema = Tool.getJsonSchema(withEmpty)
        deepStrictEqual(withEmptyJsonSchema, Tool.getJsonSchema(withoutParams))
        deepStrictEqual(withEmptyJsonSchema, {
          "type": "object",
          "additionalProperties": false
        })
      }))

    it.effect("derives JSON Schema from Effect Schema parameters", () =>
      Effect.gen(function*() {
        const tool = Tool.dynamic("TestTool", {
          parameters: Schema.Struct({
            query: Schema.String,
            limit: Schema.optional(Schema.Number)
          })
        })

        const jsonSchema = Tool.getJsonSchema(tool)

        strictEqual(jsonSchema.type, "object")
        deepStrictEqual(jsonSchema.required, ["query"])
        assertTrue("properties" in jsonSchema && "query" in (jsonSchema.properties as object))
        assertTrue("properties" in jsonSchema && "limit" in (jsonSchema.properties as object))
      }))

    it.effect("returns JSON Schema directly when provided as parameters", () =>
      Effect.gen(function*() {
        const inputSchema = {
          type: "object",
          properties: {
            query: { type: "string", description: "Search query" },
            limit: { type: "number", minimum: 1, maximum: 100 }
          },
          required: ["query"],
          additionalProperties: false
        } as const

        const tool = Tool.dynamic("TestTool", { parameters: inputSchema })
        const jsonSchema = Tool.getJsonSchema(tool)

        deepStrictEqual(jsonSchema, inputSchema)
      }))

    it.effect("preserves complex JSON Schema features like $ref and oneOf", () =>
      Effect.gen(function*() {
        const inputSchema = {
          type: "object",
          properties: {
            value: { oneOf: [{ type: "string" }, { type: "number" }] },
            item: { $ref: "#/$defs/Item" }
          },
          $defs: {
            Item: { type: "object", properties: { name: { type: "string" } } }
          }
        } as const

        const tool = Tool.dynamic("TestTool", { parameters: inputSchema })
        const jsonSchema = Tool.getJsonSchema(tool)

        deepStrictEqual(jsonSchema, inputSchema)
      }))
  })

  describe("handler execution", () => {
    it.effect("decodes parameters with Effect Schema before calling handler", () =>
      Effect.gen(function*() {
        const SearchTool = Tool.dynamic("SearchTool", {
          parameters: Schema.Struct({
            query: Schema.String,
            limit: Schema.Number
          }),
          success: Schema.Array(Schema.String)
        })

        const toolkit = Toolkit.make(SearchTool)

        const layer = toolkit.toLayer({
          SearchTool: ({ query, limit }) => Effect.succeed(Array.from({ length: limit }, (_, i) => `${query}-${i}`))
        })

        const response = yield* LanguageModel.generateText({
          prompt: "Test",
          toolkit
        }).pipe(
          TestUtils.withLanguageModel({
            generateText: [{
              type: "tool-call",
              id: "tool-123",
              name: "SearchTool",
              params: { query: "test", limit: 3 }
            }]
          }),
          Effect.provide(layer)
        )

        deepStrictEqual(response.toolResults[0].result, ["test-0", "test-1", "test-2"])
      }))

    it.effect("passes parameters through as unknown with JSON Schema", () =>
      Effect.gen(function*() {
        const SearchTool = Tool.dynamic("SearchTool", {
          parameters: {
            type: "object",
            properties: { query: { type: "string" }, limit: { type: "number" } }
          },
          success: Schema.Array(Schema.String)
        })

        const toolkit = Toolkit.make(SearchTool)

        const layer = toolkit.toLayer({
          SearchTool: (params: unknown) =>
            Effect.gen(function*() {
              const { query, limit } = params as { query: string; limit: number }
              return Array.from({ length: limit }, (_, i) => `${query}-${i}`)
            })
        })

        const response = yield* LanguageModel.generateText({
          prompt: "Test",
          toolkit
        }).pipe(
          TestUtils.withLanguageModel({
            generateText: [{
              type: "tool-call",
              id: "tool-123",
              name: "SearchTool",
              params: { query: "test", limit: 3 }
            }]
          }),
          Effect.provide(layer)
        )

        deepStrictEqual(response.toolResults[0].result, ["test-0", "test-1", "test-2"])
      }))

    it.effect("encodes success result using success schema", () =>
      Effect.gen(function*() {
        const tool = Tool.dynamic("TestTool", {
          parameters: { type: "object", properties: {} },
          success: Schema.Struct({ timestamp: Schema.DateTimeUtcFromMillis })
        })

        const toolkit = Toolkit.make(tool)

        const layer = toolkit.toLayer({
          TestTool: () => Effect.succeed({ timestamp: DateTime.fromDateUnsafe(new Date(1000)) })
        })

        const response = yield* LanguageModel.generateText({
          prompt: "Test",
          toolkit
        }).pipe(
          TestUtils.withLanguageModel({
            generateText: [{
              type: "tool-call",
              id: "tool-123",
              name: "TestTool",
              params: {}
            }]
          }),
          Effect.provide(layer)
        )

        const toolResult = response.toolResults[0]
        assertTrue(!toolResult.isFailure, "expected a successful tool result")
        deepStrictEqual(toolResult.result.timestamp, DateTime.makeUnsafe(new Date(1000)))
      }))
  })

  describe("Strict", () => {
    it("defaults to undefined", () => {
      const tool = Tool.make("TestTool")
      strictEqual(Tool.getStrictMode(tool), undefined)
    })

    it("can be set to true", () => {
      const tool = Tool.make("TestTool").annotate(Tool.Strict, true)
      strictEqual(Tool.getStrictMode(tool), true)
    })

    it("can be set to false", () => {
      const tool = Tool.make("TestTool").annotate(Tool.Strict, false)
      strictEqual(Tool.getStrictMode(tool), false)
    })

    it("works with dynamic tools", () => {
      const tool = Tool.dynamic("TestTool", {
        parameters: { type: "object", properties: {} }
      }).annotate(Tool.Strict, false)
      strictEqual(Tool.getStrictMode(tool), false)
    })

    it("works with provider-defined tools", () => {
      const tool = Tool.providerDefined({
        id: "test.provider_tool",
        customName: "ProviderTool",
        providerName: "provider_tool"
      })().annotate(Tool.Strict, false)
      strictEqual(Tool.getStrictMode(tool), false)
    })
  })
})
