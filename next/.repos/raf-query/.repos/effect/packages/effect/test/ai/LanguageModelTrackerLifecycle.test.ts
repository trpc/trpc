import { assert, describe, it } from "@effect/vitest"
import { Effect, flow, Schema, Stream } from "effect"
import { LanguageModel, Prompt, type Response, ResponseIdTracker, Tool, Toolkit } from "effect/ai"

const finishPart: Response.FinishPartEncoded = {
  type: "finish",
  reason: "stop",
  usage: {
    inputTokens: { uncached: 5, total: 5, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: 5, text: undefined, reasoning: undefined }
  },
  response: undefined
}

const responseMetadataPart = (id: string): Response.ResponseMetadataPartEncoded => ({
  type: "response-metadata",
  id,
  modelId: undefined,
  timestamp: undefined,
  request: undefined
})

const textMessage = (text: string) => Prompt.textPart({ text })

const userMessage = (text: string) =>
  Prompt.userMessage({
    content: [textMessage(text)]
  })

const assistantMessage = (text: string) =>
  Prompt.assistantMessage({
    content: [textMessage(text)]
  })

const ApprovalTool = Tool.make("ApprovalTool", {
  parameters: Schema.Struct({ action: Schema.String }),
  success: Schema.Struct({ result: Schema.String }),
  needsApproval: true
})

const ApprovalToolkit = Toolkit.make(ApprovalTool)

const ApprovalToolkitLayer = ApprovalToolkit.toLayer({
  ApprovalTool: () => Effect.succeed({ result: "approved-result" })
})

describe("LanguageModel tracker lifecycle integration", () => {
  it.effect("tracks generateText across turns and recovers after session drop", () =>
    Effect.gen(function*() {
      const tracker = yield* ResponseIdTracker.make
      const providerOptions: Array<LanguageModel.ProviderOptions> = []
      const responseIds = ["resp_1", "resp_2", "resp_3", "resp_4"] as const
      let responseIndex = 0

      const languageModel = yield* LanguageModel.make({
        generateText: (options) =>
          Effect.sync(() => {
            const responseId = responseIds[responseIndex]!
            responseIndex += 1
            providerOptions.push(options)
            return [
              responseMetadataPart(responseId),
              { type: "text", text: `assistant-${responseId}` },
              finishPart
            ]
          }),
        streamText: () => Stream.empty
      })

      const provideModel = Effect.provideService(LanguageModel.LanguageModel, languageModel)

      const system = Prompt.systemMessage({ content: "system" })
      const user1 = userMessage("user1")
      const assistant1 = assistantMessage("assistant1")
      const user2 = userMessage("user2")
      const assistant2 = assistantMessage("assistant2")
      const user3 = userMessage("user3")
      const assistant3 = assistantMessage("assistant3")
      const user4 = userMessage("user4")

      yield* LanguageModel.generateText({
        prompt: Prompt.fromMessages([system, user1])
      }).pipe(provideModel, Effect.provideService(ResponseIdTracker.ResponseIdTracker, tracker))

      const firstSentPrompt = providerOptions[0]!.prompt

      yield* LanguageModel.generateText({
        prompt: Prompt.fromMessages([...firstSentPrompt.content, assistant1, user2])
      }).pipe(provideModel, Effect.provideService(ResponseIdTracker.ResponseIdTracker, tracker))

      tracker.clearUnsafe()

      const secondSentPrompt = providerOptions[1]!.prompt

      yield* LanguageModel.generateText({
        prompt: Prompt.fromMessages([...secondSentPrompt.content, assistant2, user3])
      }).pipe(provideModel, Effect.provideService(ResponseIdTracker.ResponseIdTracker, tracker))

      const thirdSentPrompt = providerOptions[2]!.prompt
      const expectedPostDropFullPrompt = Prompt.fromMessages([...secondSentPrompt.content, assistant2, user3])

      yield* LanguageModel.generateText({
        prompt: Prompt.fromMessages([...thirdSentPrompt.content, assistant3, user4])
      }).pipe(provideModel, Effect.provideService(ResponseIdTracker.ResponseIdTracker, tracker))

      assert.strictEqual(providerOptions.length, 4)
      assert.strictEqual(providerOptions[0]!.previousResponseId, undefined)
      assert.strictEqual(providerOptions[0]!.incrementalPrompt, undefined)
      assert.strictEqual(providerOptions[1]!.previousResponseId, "resp_1")
      assert.deepStrictEqual(providerOptions[1]!.incrementalPrompt, Prompt.fromMessages([user2]))
      assert.strictEqual(providerOptions[2]!.previousResponseId, undefined)
      assert.strictEqual(providerOptions[2]!.incrementalPrompt, undefined)
      assert.deepStrictEqual(providerOptions[2]!.prompt, expectedPostDropFullPrompt)
      assert.strictEqual(providerOptions[3]!.previousResponseId, "resp_3")
      assert.deepStrictEqual(providerOptions[3]!.incrementalPrompt, Prompt.fromMessages([user4]))
    }))

  it.effect("falls back to full prompt after stale previous response id and keeps tracking", () =>
    Effect.gen(function*() {
      const tracker = yield* ResponseIdTracker.make
      const providerOptions: Array<LanguageModel.ProviderOptions> = []
      const responseIds = ["resp_object_1", "resp_object_2"] as const
      let responseIndex = 0

      const languageModel = yield* LanguageModel.make({
        generateText: (options) =>
          Effect.sync(() => {
            const responseId = responseIds[responseIndex]!
            responseIndex += 1
            providerOptions.push(options)
            return [
              responseMetadataPart(responseId),
              { type: "text", text: "{\"count\":1}" },
              finishPart
            ]
          }),
        streamText: () => Stream.empty
      })

      const provideModel = flow(
        Effect.provideService(LanguageModel.LanguageModel, languageModel),
        Effect.provideService(ResponseIdTracker.ResponseIdTracker, tracker)
      )
      const schema = Schema.Struct({ count: Schema.Number })

      const system = Prompt.systemMessage({ content: "system" })
      const user1 = userMessage("user1")
      const assistant1 = assistantMessage("assistant1")
      const user2 = userMessage("user2")

      yield* LanguageModel.generateObject({
        prompt: Prompt.fromMessages([system, user1]),
        schema
      }).pipe(provideModel)

      const firstSentPrompt = providerOptions[0]!.prompt

      yield* LanguageModel.generateObject({
        prompt: Prompt.fromMessages([...firstSentPrompt.content, assistant1, user2]),
        schema
      }).pipe(provideModel)

      assert.strictEqual(providerOptions.length, 2)
      assert.strictEqual(providerOptions[0]!.previousResponseId, undefined)
      assert.strictEqual(providerOptions[0]!.incrementalPrompt, undefined)
      assert.strictEqual(providerOptions[1]!.previousResponseId, "resp_object_1")
      assert.deepStrictEqual(providerOptions[1]!.incrementalPrompt, Prompt.fromMessages([user2]))
    }))

  it.effect("tracks streamText with metadata parts across turns", () =>
    Effect.gen(function*() {
      const tracker = yield* ResponseIdTracker.make
      const providerOptions: Array<LanguageModel.ProviderOptions> = []
      const responseIds = ["resp_stream_1", "resp_stream_2"] as const
      let responseIndex = 0

      const languageModel = yield* LanguageModel.make({
        generateText: () => Effect.succeed([]),
        streamText: (options) => {
          const responseId = responseIds[responseIndex]!
          responseIndex += 1
          providerOptions.push(options)
          return Stream.fromIterable([
            responseMetadataPart(responseId),
            finishPart
          ])
        }
      })

      const provideModel = flow(
        Effect.provideService(LanguageModel.LanguageModel, languageModel),
        Effect.provideService(ResponseIdTracker.ResponseIdTracker, tracker)
      )

      const system = Prompt.systemMessage({ content: "system" })
      const user1 = userMessage("user1")
      const assistant1 = assistantMessage("assistant1")
      const user2 = userMessage("user2")

      yield* LanguageModel.streamText({
        prompt: Prompt.fromMessages([system, user1])
      }).pipe(
        Stream.runDrain,
        provideModel
      )

      const firstSentPrompt = providerOptions[0]!.prompt

      yield* LanguageModel.streamText({
        prompt: Prompt.fromMessages([...firstSentPrompt.content, assistant1, user2])
      }).pipe(
        Stream.runDrain,
        provideModel
      )

      assert.strictEqual(providerOptions.length, 2)
      assert.strictEqual(providerOptions[0]!.previousResponseId, undefined)
      assert.strictEqual(providerOptions[0]!.incrementalPrompt, undefined)
      assert.strictEqual(providerOptions[1]!.previousResponseId, "resp_stream_1")
      assert.deepStrictEqual(providerOptions[1]!.incrementalPrompt, Prompt.fromMessages([user2]))
    }))

  it.effect("emits finish parts in streamText when toolkit is provided and no tool calls are returned", () =>
    Effect.gen(function*() {
      const languageModel = yield* LanguageModel.make({
        generateText: () => Effect.succeed([]),
        streamText: () => Stream.fromIterable([finishPart])
      })

      const parts = yield* LanguageModel.streamText({
        prompt: [userMessage("hello")],
        toolkit: ApprovalToolkit
      }).pipe(
        Stream.runCollect,
        Effect.map((parts) => Array.from(parts)),
        Effect.provideService(LanguageModel.LanguageModel, languageModel),
        Effect.provide(ApprovalToolkitLayer)
      )

      assert.strictEqual(parts.length, 1)
      assert.strictEqual(parts[0]?.type, "finish")
    }))

  it.effect("keeps incremental provider fields undefined when tracker is omitted", () =>
    Effect.gen(function*() {
      const generateTextOptions: Array<LanguageModel.ProviderOptions> = []
      const streamTextOptions: Array<LanguageModel.ProviderOptions> = []

      const languageModel = yield* LanguageModel.make({
        generateText: (options) =>
          Effect.sync(() => {
            generateTextOptions.push(options)
            return [
              responseMetadataPart("resp_none"),
              { type: "text", text: "{\"count\":1}" },
              finishPart
            ]
          }),
        streamText: (options) => {
          streamTextOptions.push(options)
          return Stream.fromIterable([
            responseMetadataPart("resp_none_stream"),
            finishPart
          ])
        }
      })

      const provideModel = Effect.provideService(LanguageModel.LanguageModel, languageModel)
      const schema = Schema.Struct({ count: Schema.Number })

      const system = Prompt.systemMessage({ content: "system" })
      const user1 = userMessage("user1")
      const assistant1 = assistantMessage("assistant1")
      const user2 = userMessage("user2")

      yield* LanguageModel.generateText({
        prompt: [system, user1]
      }).pipe(provideModel)

      yield* LanguageModel.generateText({
        prompt: [system, user1, assistant1, user2]
      }).pipe(provideModel)

      yield* LanguageModel.generateObject({
        prompt: [system, user1],
        schema
      }).pipe(provideModel)

      yield* LanguageModel.generateObject({
        prompt: [system, user1, assistant1, user2],
        schema
      }).pipe(provideModel)

      yield* LanguageModel.streamText({
        prompt: [system, user1]
      }).pipe(
        Stream.runDrain,
        provideModel
      )

      yield* LanguageModel.streamText({
        prompt: [system, user1, assistant1, user2]
      }).pipe(
        Stream.runDrain,
        provideModel
      )

      for (const options of [...generateTextOptions, ...streamTextOptions]) {
        assert.strictEqual(options.previousResponseId, undefined)
        assert.strictEqual(options.incrementalPrompt, undefined)
      }
    }))

  it.effect("prepares after approval pre-resolution using stripped prompt", () =>
    Effect.gen(function*() {
      const tracker = yield* ResponseIdTracker.make
      const providerOptions: Array<LanguageModel.ProviderOptions> = []
      const responseIds = ["resp_tool_1", "resp_tool_2"] as const
      let responseIndex = 0

      const languageModel = yield* LanguageModel.make({
        generateText: (options) =>
          Effect.sync(() => {
            const responseId = responseIds[responseIndex]!
            responseIndex += 1
            providerOptions.push(options)
            return [
              responseMetadataPart(responseId),
              finishPart
            ]
          }),
        streamText: () => Stream.empty
      })

      const provideModel = flow(
        Effect.provideService(LanguageModel.LanguageModel, languageModel),
        Effect.provideService(ResponseIdTracker.ResponseIdTracker, tracker)
      )

      const system = Prompt.systemMessage({ content: "system" })
      const user1 = userMessage("user1")
      const toolCallId = "call-approval"
      const approvalId = "approval-1"

      yield* LanguageModel.generateText({
        prompt: Prompt.fromMessages([system, user1])
      }).pipe(provideModel)

      const firstSentPrompt = providerOptions[0]!.prompt

      const promptWithPendingApproval: Array<Prompt.Message> = [
        ...firstSentPrompt.content,
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
        prompt: Prompt.fromMessages(promptWithPendingApproval),
        toolkit: ApprovalToolkit
      }).pipe(
        provideModel,
        Effect.provide(ApprovalToolkitLayer)
      )

      assert.strictEqual(providerOptions.length, 2)
      const secondCall = providerOptions[1]!
      assert.strictEqual(secondCall.previousResponseId, "resp_tool_1")

      const expectedIncremental = Prompt.fromMessages([
        Prompt.toolMessage({
          content: [
            Prompt.toolResultPart({
              id: toolCallId,
              name: "ApprovalTool",
              result: { result: "approved-result" },
              isFailure: false,
              providerExecuted: false
            })
          ]
        })
      ])

      assert.deepStrictEqual(secondCall.incrementalPrompt, expectedIncremental)

      for (const message of secondCall.prompt.content) {
        if (message.role === "assistant") {
          assert.strictEqual(message.content.filter((part) => part.type === "tool-approval-request").length, 0)
        }
        if (message.role === "tool") {
          assert.strictEqual(message.content.filter((part) => part.type === "tool-approval-response").length, 0)
        }
      }
    }))
})
