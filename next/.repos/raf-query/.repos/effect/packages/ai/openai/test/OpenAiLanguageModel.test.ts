import { type Generated, OpenAiClient, OpenAiLanguageModel, OpenAiSchema, OpenAiTool } from "@effect/ai-openai"
import { assert, describe, it } from "@effect/vitest"
import { assertTrue, deepStrictEqual, strictEqual } from "@effect/vitest/utils"
import { Array, Context, Effect, Layer, Redacted, Ref, Schema, SchemaGetter, Stream } from "effect"
import { AiError, LanguageModel, Prompt, Response as AiResponse, Tool, Toolkit } from "effect/ai"
import { HttpClient, type HttpClientError, HttpClientRequest, HttpClientResponse } from "effect/http"

const webSearchFailures = [
  { tool: OpenAiTool.WebSearch({}), status: "failed" },
  { tool: OpenAiTool.WebSearch({}), status: "incomplete" },
  { tool: OpenAiTool.WebSearchPreview({}), status: "searching" }
] as const

const fileSearchOutcomes = [
  { status: "completed", isFailure: false, results: undefined },
  { status: "failed", isFailure: true, results: null },
  { status: "incomplete", isFailure: true, results: [{ file_id: "file_123", text: "Matching text" }] }
] as const

describe("OpenAiLanguageModel", () => {
  describe("make", () => {
    it.effect("sends correct model in request", () =>
      Effect.gen(function*() {
        const result = yield* LanguageModel.generateText({ prompt: "test" }).pipe(
          Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini"))
        )

        const metadata = result.content.find((part) => part.type === "response-metadata")

        strictEqual(metadata?.modelId, "gpt-4o-mini")
      }).pipe(Effect.provide(makeTestLayer())))

    it.effect("sends custom model string in request", () =>
      Effect.gen(function*() {
        const result = yield* LanguageModel.generateText({ prompt: "test" }).pipe(
          Effect.provide(OpenAiLanguageModel.model("ft:gpt-4o-mini:custom"))
        )

        const metadata = result.content.find((part) => part.type === "response-metadata")
        strictEqual(metadata?.modelId, "ft:gpt-4o-mini:custom")
      }).pipe(Effect.provide(makeTestLayer({ body: { model: "ft:gpt-4o-mini:custom" as any } }))))
  })

  describe("web search sources", () => {
    it.effect.each(["generateText", "streamText"] as const)(
      "preserves URL and API sources with %s",
      (method) =>
        Effect.gen(function*() {
          const sources = [
            { type: "url", url: "https://example.com/weather" },
            { type: "api", name: "oai-weather" }
          ] as const
          const action = { type: "search", query: "weather in London", sources } as const
          const item = makeWebSearchCall({ action })
          const event = { type: "response.output_item.done", sequence_number: 1, output_index: 0, item }
          const body = method === "generateText"
            ? JSON.stringify(makeDefaultResponse({ output: [item] }))
            : `data: ${JSON.stringify(event)}\n\n`
          const client = makeRawResponseClient(
            body,
            method === "generateText" ? "application/json" : "text/event-stream"
          )
          const options = { prompt: "Weather in London", toolkit: Toolkit.make(OpenAiTool.WebSearch({})) }
          const parts = yield* Effect.gen(function*() {
            if (method === "generateText") {
              const response = yield* LanguageModel.generateText(options)
              return response.content
            }
            return yield* LanguageModel.streamText(options).pipe(Stream.runCollect)
          }).pipe(
            Effect.provide(OpenAiLanguageModel.model("gpt-5.6")),
            Effect.provide(OpenAiClient.layer({ apiKey: Redacted.make("sk-test-key") })),
            Effect.provideService(HttpClient.HttpClient, client)
          )

          const calls = parts.filter((part) => part.type === "tool-call")
          deepStrictEqual(calls.map((part) => part.params), [{ action }])

          const results = parts.filter((part) => part.type === "tool-result")
          deepStrictEqual(results.map((part) => part.result), [{ action, status: "completed" }])
        })
    )
  })

  describe("web search without an action", () => {
    it.effect.each(
      [
        { method: "streamText", status: "incomplete", isFailure: true },
        { method: "generateText", status: "incomplete", isFailure: true },
        { method: "generateText", status: "completed", isFailure: false }
      ] as const
    )("preserves omitted actions for $status with $method", ({ method, status, isFailure }) =>
      Effect.gen(function*() {
        const item: Generated.WebSearchToolCall = { type: "web_search_call", id: "ws_123", status }
        const event = { type: "response.output_item.done", sequence_number: 1, output_index: 0, item }
        const body = method === "generateText"
          ? JSON.stringify(makeDefaultResponse({ output: [item] }))
          : `data: ${JSON.stringify(event)}\n\n`
        const client = makeRawResponseClient(body, method === "generateText" ? "application/json" : "text/event-stream")
        const options = { prompt: "Search the web", toolkit: Toolkit.make(OpenAiTool.WebSearch({})) }
        const parts = yield* Effect.gen(function*() {
          if (method === "generateText") return (yield* LanguageModel.generateText(options)).content
          return yield* LanguageModel.streamText(options).pipe(Stream.runCollect)
        }).pipe(
          Effect.provide(OpenAiLanguageModel.model("gpt-6-luna")),
          Effect.provide(OpenAiClient.layer({ apiKey: Redacted.make("sk-test-key") })),
          Effect.provideService(HttpClient.HttpClient, client)
        )

        deepStrictEqual(
          parts.filter((part) => part.type === "tool-call" || part.type === "tool-result")
            .map((part) => ({
              type: part.type,
              id: part.id,
              providerExecuted: part.providerExecuted,
              ...(part.type === "tool-call"
                ? { params: part.params }
                : { result: part.result, isFailure: part.isFailure })
            })),
          [
            { type: "tool-call", id: "ws_123", providerExecuted: true, params: {} },
            { type: "tool-result", id: "ws_123", providerExecuted: true, result: { status }, isFailure }
          ]
        )
      }))

    it.effect("rejects null and malformed actions when present", () =>
      Effect.forEach([null, { type: "find_in_page", url: "https://example.com" }], (action) => {
        const event = {
          type: "response.output_item.done",
          sequence_number: 1,
          output_index: 0,
          item: { type: "web_search_call", id: "ws_123", status: "completed", action }
        }
        const client = makeRawResponseClient(`data: ${JSON.stringify(event)}\n\n`, "text/event-stream")
        return LanguageModel.streamText({ prompt: "Search", toolkit: Toolkit.make(OpenAiTool.WebSearch({})) }).pipe(
          Stream.runCollect,
          Effect.flip,
          Effect.tap((error) => {
            assert(AiError.isAiError(error))
            strictEqual(error.reason._tag, "InvalidOutputError")
            return Effect.void
          }),
          Effect.provide(OpenAiLanguageModel.model("gpt-6-luna")),
          Effect.provide(OpenAiClient.layer({ apiKey: Redacted.make("sk-test-key") })),
          Effect.provideService(HttpClient.HttpClient, client)
        )
      }))
  })

  describe("generateText", () => {
    describe("message preparation", () => {
      it.effect("forwards prompt cache configuration and text breakpoints", () =>
        Effect.gen(function*() {
          const breakpoint = { mode: "explicit" } as const
          yield* LanguageModel.generateText({
            prompt: Prompt.make([
              Prompt.systemMessage({
                content: "Stable instructions",
                options: { openai: { promptCacheBreakpoint: breakpoint } }
              }),
              Prompt.userMessage({
                content: [Prompt.textPart({
                  text: "Stable context",
                  options: { openai: { promptCacheBreakpoint: breakpoint } }
                })]
              })
            ])
          }).pipe(
            Effect.provide(OpenAiLanguageModel.model("gpt-5.6", {
              prompt_cache_key: "assistant:v1",
              prompt_cache_options: { mode: "explicit", ttl: "30m", comparison_response_id: "resp_baseline" }
            }))
          )

          const requests = yield* MockHttpClient.requests
          const body = yield* getRequestBody(requests[0])

          strictEqual(body.prompt_cache_key, "assistant:v1")
          deepStrictEqual(body.prompt_cache_options, {
            mode: "explicit",
            ttl: "30m",
            comparison_response_id: "resp_baseline"
          })
          deepStrictEqual(body.input, [{
            role: "developer",
            content: [{
              type: "input_text",
              text: "Stable instructions",
              prompt_cache_breakpoint: breakpoint
            }]
          }, {
            role: "user",
            content: [{
              type: "input_text",
              text: "Stable context",
              prompt_cache_breakpoint: breakpoint
            }]
          }])
        }).pipe(Effect.provide(makeTestLayer({ body: { model: "gpt-5.6" as any } }))))

      it.effect("forwards implicit prompt cache mode without text breakpoints", () =>
        Effect.gen(function*() {
          yield* LanguageModel.generateText({ prompt: "Stable context" }).pipe(
            Effect.provide(OpenAiLanguageModel.model("gpt-5.6", {
              prompt_cache_options: { mode: "implicit" }
            }))
          )

          const requests = yield* MockHttpClient.requests
          const body = yield* getRequestBody(requests[0])

          deepStrictEqual(body.prompt_cache_options, { mode: "implicit" })
          deepStrictEqual(body.input, [{
            role: "user",
            content: [{ type: "input_text", text: "Stable context" }]
          }])
        }).pipe(Effect.provide(makeTestLayer({ body: { model: "gpt-5.6" as any } }))))

      describe("system messages", () => {
        it.effect("uses system role for standard models", () =>
          Effect.gen(function*() {
            yield* LanguageModel.generateText({
              prompt: Prompt.make([
                { role: "system", content: "You are a helpful assistant" },
                { role: "user", content: "Hello" }
              ])
            }).pipe(Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini")))

            const requests = yield* MockHttpClient.requests
            const body = yield* getRequestBody(requests[0])

            const systemMessage = body.input.find((m: any) => m.role === "system")
            assert.isDefined(systemMessage)
            deepStrictEqual(systemMessage.content, [{
              type: "input_text",
              text: "You are a helpful assistant"
            }])
          }).pipe(Effect.provide(makeTestLayer())))

        it.effect("uses developer role for reasoning models", () =>
          Effect.gen(function*() {
            yield* LanguageModel.generateText({
              prompt: Prompt.make([
                { role: "system", content: "You are a helpful assistant" },
                { role: "user", content: "Hello" }
              ])
            }).pipe(Effect.provide(OpenAiLanguageModel.model("o1")))

            const requests = yield* MockHttpClient.requests
            const body = yield* getRequestBody(requests[0])

            const devMessage = body.input.find((m: any) => m.role === "developer")
            assert.isDefined(devMessage)
            deepStrictEqual(devMessage.content, [{
              type: "input_text",
              text: "You are a helpful assistant"
            }])
          }).pipe(Effect.provide(makeTestLayer({ body: { model: "o1" } }))))

        it.effect("uses developer role for gpt-5 models", () =>
          Effect.gen(function*() {
            yield* LanguageModel.generateText({
              prompt: Prompt.make([
                { role: "system", content: "You are a helpful assistant" },
                { role: "user", content: "Hello" }
              ])
            }).pipe(Effect.provide(OpenAiLanguageModel.model("gpt-5")))

            const requests = yield* MockHttpClient.requests
            const body = yield* getRequestBody(requests[0])

            const devMessage = body.input.find((m: any) => m.role === "developer")
            assert.isDefined(devMessage)
          }).pipe(Effect.provide(makeTestLayer({ body: { model: "gpt-5" } }))))

        it.effect("uses developer role for o3 models", () =>
          Effect.gen(function*() {
            yield* LanguageModel.generateText({
              prompt: Prompt.make([
                { role: "system", content: "You are a helpful assistant" },
                { role: "user", content: "Hello" }
              ])
            }).pipe(Effect.provide(OpenAiLanguageModel.model("o3-mini")))

            const requests = yield* MockHttpClient.requests
            const body = yield* getRequestBody(requests[0])

            const devMessage = body.input.find((m: any) => m.role === "developer")
            assert.isDefined(devMessage)
          }).pipe(Effect.provide(makeTestLayer({ body: { model: "o3-mini" } }))))
      })

      describe("user messages", () => {
        it.effect("converts text parts to input_text", () =>
          Effect.gen(function*() {
            yield* LanguageModel.generateText({
              prompt: "Hello world"
            }).pipe(Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini")))

            const requests = yield* MockHttpClient.requests
            const body = yield* getRequestBody(requests[0])

            const userMessage = body.input.find((m: any) => m.role === "user")
            assert.isDefined(userMessage)
            deepStrictEqual(userMessage.content, [{ type: "input_text", text: "Hello world" }])
          }).pipe(Effect.provide(makeTestLayer())))

        it.effect("handles image URLs", () =>
          Effect.gen(function*() {
            yield* LanguageModel.generateText({
              prompt: Prompt.make([{
                role: "user",
                content: [
                  Prompt.filePart({
                    mediaType: "image/png",
                    data: new URL("https://example.com/image.png")
                  })
                ]
              }])
            }).pipe(Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini")))

            const requests = yield* MockHttpClient.requests
            const body = yield* getRequestBody(requests[0])

            const userMessage = body.input.find((m: any) => m.role === "user")
            deepStrictEqual(userMessage.content, [{
              type: "input_image",
              image_url: "https://example.com/image.png",
              detail: "auto"
            }])
          }).pipe(Effect.provide(makeTestLayer())))

        it.effect("handles image strings", () =>
          Effect.gen(function*() {
            const base64 = "iVBORw0KGgo="
            const dataUrl = `data:image/png;base64,${base64}`
            const upperCaseDataUrl = `DATA:image/png;base64,${base64}`
            const url = "https://example.com/image.png"

            yield* LanguageModel.generateText({
              prompt: Prompt.make([Prompt.userMessage({
                content: [base64, dataUrl, upperCaseDataUrl, url].map((data) =>
                  Prompt.filePart({ mediaType: "image/png", data })
                )
              })])
            }).pipe(Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini")))

            const requests = yield* MockHttpClient.requests
            const body = yield* getRequestBody(requests[0])

            assert.deepStrictEqual(body.input, [{
              role: "user",
              content: [
                { type: "input_image", image_url: `data:image/png;base64,${base64}`, detail: "auto" },
                { type: "input_image", image_url: dataUrl, detail: "auto" },
                { type: "input_image", image_url: upperCaseDataUrl, detail: "auto" },
                { type: "input_image", image_url: url, detail: "auto" }
              ]
            }])
          }).pipe(Effect.provide(makeTestLayer())))

        it.effect("handles image with custom detail level", () =>
          Effect.gen(function*() {
            yield* LanguageModel.generateText({
              prompt: Prompt.make([{
                role: "user",
                content: [
                  Prompt.filePart({
                    mediaType: "image/png",
                    data: new URL("https://example.com/image.png"),
                    options: { openai: { imageDetail: "high" } }
                  })
                ]
              }])
            }).pipe(Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini")))

            const requests = yield* MockHttpClient.requests
            const body = yield* getRequestBody(requests[0])

            const userMessage = body.input.find((m: any) => m.role === "user")
            strictEqual(userMessage.content[0].detail, "high")
          }).pipe(Effect.provide(makeTestLayer())))

        it.effect("handles image file IDs with configured prefixes", () =>
          Effect.gen(function*() {
            yield* LanguageModel.generateText({
              prompt: Prompt.make([{
                role: "user",
                content: [
                  Prompt.filePart({
                    mediaType: "image/png",
                    data: "file-abc123"
                  })
                ]
              }])
            }).pipe(
              Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini", {
                fileIdPrefixes: ["file-"]
              }))
            )

            const requests = yield* MockHttpClient.requests
            const body = yield* getRequestBody(requests[0])

            const userMessage = body.input.find((m: any) => m.role === "user")
            deepStrictEqual(userMessage.content, [{
              type: "input_image",
              file_id: "file-abc123",
              detail: "auto"
            }])
          }).pipe(Effect.provide(makeTestLayer())))

        it.effect("handles image base64 data", () =>
          Effect.gen(function*() {
            const imageData = new Uint8Array([137, 80, 78, 71]) // PNG magic bytes

            yield* LanguageModel.generateText({
              prompt: Prompt.make([{
                role: "user",
                content: [
                  Prompt.filePart({
                    mediaType: "image/png",
                    data: imageData
                  })
                ]
              }])
            }).pipe(Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini")))

            const requests = yield* MockHttpClient.requests
            const body = yield* getRequestBody(requests[0])

            const userMessage = body.input.find((m: any) => m.role === "user")
            assert.isTrue(userMessage.content[0].image_url.startsWith("data:image/png;base64,"))
          }).pipe(Effect.provide(makeTestLayer())))

        it.effect("handles PDF URLs", () =>
          Effect.gen(function*() {
            yield* LanguageModel.generateText({
              prompt: Prompt.make([{
                role: "user",
                content: [
                  Prompt.filePart({
                    mediaType: "application/pdf",
                    data: new URL("https://example.com/document.pdf")
                  })
                ]
              }])
            }).pipe(Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini")))

            const requests = yield* MockHttpClient.requests
            const body = yield* getRequestBody(requests[0])

            const userMessage = body.input.find((m: any) => m.role === "user")
            deepStrictEqual(userMessage.content, [{
              type: "input_file",
              file_url: "https://example.com/document.pdf"
            }])
          }).pipe(Effect.provide(makeTestLayer())))

        it.effect("handles PDF base64 data with filename", () =>
          Effect.gen(function*() {
            const pdfData = new Uint8Array([0x25, 0x50, 0x44, 0x46]) // %PDF

            yield* LanguageModel.generateText({
              prompt: Prompt.make([{
                role: "user",
                content: [
                  Prompt.filePart({
                    mediaType: "application/pdf",
                    data: pdfData,
                    fileName: "document.pdf"
                  })
                ]
              }])
            }).pipe(Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini")))

            const requests = yield* MockHttpClient.requests
            const body = yield* getRequestBody(requests[0])

            const userMessage = body.input.find((m: any) => m.role === "user")
            strictEqual(userMessage.content[0].type, "input_file")
            strictEqual(userMessage.content[0].filename, "document.pdf")
            assert.isTrue(userMessage.content[0].file_data.startsWith("data:application/pdf;base64,"))
          }).pipe(Effect.provide(makeTestLayer())))
      })

      describe("assistant messages", () => {
        it.effect("converts text parts to message output", () =>
          Effect.gen(function*() {
            yield* LanguageModel.generateText({
              prompt: Prompt.make([
                { role: "user", content: "Hello" },
                {
                  role: "assistant",
                  content: [Prompt.textPart({ text: "Hi there!" })]
                },
                { role: "user", content: "How are you?" }
              ])
            }).pipe(Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini")))

            const requests = yield* MockHttpClient.requests
            const body = yield* getRequestBody(requests[0])

            const assistantMessage = body.input.find((m: any) => m.type === "message" && m.role === "assistant")
            assert.isDefined(assistantMessage)
            strictEqual(assistantMessage.content[0].type, "output_text")
            strictEqual(assistantMessage.content[0].text, "Hi there!")
          }).pipe(Effect.provide(makeTestLayer())))

        it.effect("converts reasoning parts", () =>
          Effect.gen(function*() {
            yield* LanguageModel.generateText({
              prompt: Prompt.make([
                { role: "user", content: "Think step by step" },
                {
                  role: "assistant",
                  content: [
                    Prompt.reasoningPart({
                      text: "Let me think...",
                      options: { openai: { itemId: "reasoning_123" } }
                    })
                  ]
                },
                { role: "user", content: "Continue" }
              ])
            }).pipe(Effect.provide(OpenAiLanguageModel.model("o1")))

            const requests = yield* MockHttpClient.requests
            const body = yield* getRequestBody(requests[0])

            const reasoningItem = body.input.find((m: any) => m.type === "reasoning")
            assert.isDefined(reasoningItem)
            strictEqual(reasoningItem.id, "reasoning_123")
          }).pipe(Effect.provide(makeTestLayer({ body: { model: "o1" } }))))

        it.effect("replays encrypted reasoning from response parts", () =>
          Effect.gen(function*() {
            const history = Prompt.fromResponseParts([
              AiResponse.makePart("reasoning-start", {
                id: "reasoning_123:0",
                metadata: { openai: { itemId: "reasoning_123" } }
              }),
              AiResponse.makePart("reasoning-delta", {
                id: "reasoning_123:0",
                delta: "Let me think..."
              }),
              AiResponse.makePart("reasoning-end", {
                id: "reasoning_123:0",
                metadata: {
                  openai: {
                    itemId: "reasoning_123",
                    encryptedContent: "encrypted-reasoning"
                  }
                }
              })
            ])

            yield* LanguageModel.generateText({
              prompt: Prompt.concat(history, Prompt.make("Continue"))
            }).pipe(Effect.provide(OpenAiLanguageModel.model("o1")))

            const requests = yield* MockHttpClient.requests
            const body = yield* getRequestBody(requests[0])
            const reasoningItem = body.input.find((item: any) => item.type === "reasoning")

            assert.isDefined(reasoningItem)
            deepStrictEqual(reasoningItem, {
              type: "reasoning",
              id: "reasoning_123",
              summary: [{ type: "summary_text", text: "Let me think..." }],
              encrypted_content: "encrypted-reasoning"
            })
          }).pipe(Effect.provide(makeTestLayer({ body: { model: "o1" } }))))

        it.effect("serializes stored assistant history according to item reference config", () =>
          Effect.gen(function*() {
            yield* LanguageModel.generateText({
              prompt: storedHistoryPrompt,
              toolkit: TestToolkit,
              disableToolCallResolution: true
            }).pipe(Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini", { store: true })))

            yield* LanguageModel.generateText({
              prompt: storedHistoryPrompt,
              toolkit: TestToolkit,
              disableToolCallResolution: true
            }).pipe(Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini", {
              store: true,
              useItemReferences: false
            })))

            const requests = yield* MockHttpClient.requests
            const referencedBody = yield* getRequestBody(requests[0])
            const inlineBody = yield* getRequestBody(requests[1])

            assert.deepStrictEqual(referencedBody.input, [
              { role: "user", content: [{ type: "input_text", text: "Question" }] },
              { type: "item_reference", id: "msg_1" },
              { type: "item_reference", id: "rs_1" },
              { type: "item_reference", id: "fc_1" },
              { type: "function_call_output", call_id: "call_1", output: "{\"output\":\"result\"}" },
              { role: "user", content: [{ type: "input_text", text: "Continue" }] }
            ])

            assert.deepStrictEqual(inlineBody.input, [
              { role: "user", content: [{ type: "input_text", text: "Question" }] },
              {
                id: "msg_1",
                type: "message",
                role: "assistant",
                status: "completed",
                content: [{
                  type: "output_text",
                  text: "Answer",
                  annotations: [],
                  logprobs: []
                }]
              },
              {
                type: "reasoning",
                id: "rs_1",
                summary: [{ type: "summary_text", text: "Thinking" }],
                encrypted_content: "encrypted-reasoning"
              },
              {
                type: "function_call",
                name: "TestTool",
                call_id: "call_1",
                arguments: "{\"input\":\"value\"}",
                id: "fc_1"
              },
              { type: "function_call_output", call_id: "call_1", output: "{\"output\":\"result\"}" },
              { role: "user", content: [{ type: "input_text", text: "Continue" }] }
            ])
            strictEqual(inlineBody.useItemReferences, undefined)
          }).pipe(Effect.provide(makeTestLayer())))

        it.effect("replays matched provider-executed history inline", () =>
          Effect.gen(function*() {
            yield* LanguageModel.generateText({
              prompt: providerExecutedHistoryPrompt,
              toolkit: Toolkit.make(OpenAiTool.WebSearch({})),
              disableToolCallResolution: true
            }).pipe(Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini", {
              store: true,
              useItemReferences: false
            })))

            const requests = yield* MockHttpClient.requests
            const body = yield* getRequestBody(requests[0])

            assert.deepStrictEqual(body.input, [
              { role: "user", content: [{ type: "input_text", text: "Search" }] },
              {
                type: "web_search_call",
                id: "ws_1",
                status: "completed",
                action: { type: "search", query: "Effect TypeScript" }
              },
              { role: "user", content: [{ type: "input_text", text: "Continue" }] }
            ])
          }).pipe(Effect.provide(makeTestLayer())))

        it.effect("replays web search history with an omitted action", () =>
          Effect.gen(function*() {
            yield* LanguageModel.generateText({
              prompt: Prompt.make([
                { role: "user", content: "Search" },
                {
                  role: "assistant",
                  content: [
                    Prompt.toolCallPart({ id: "ws_1", name: "OpenAiWebSearch", params: {}, providerExecuted: true }),
                    Prompt.toolResultPart({
                      id: "ws_1",
                      name: "OpenAiWebSearch",
                      providerExecuted: true,
                      isFailure: true,
                      result: { status: "incomplete" }
                    })
                  ]
                },
                { role: "user", content: "Continue" }
              ]),
              toolkit: Toolkit.make(OpenAiTool.WebSearch({})),
              disableToolCallResolution: true
            }).pipe(Effect.provide(OpenAiLanguageModel.model("gpt-6-luna", {
              store: true,
              useItemReferences: false
            })))

            const body = yield* getRequestBody((yield* MockHttpClient.requests)[0])
            deepStrictEqual(body.input?.[1], { type: "web_search_call", id: "ws_1", status: "incomplete" })
          }).pipe(Effect.provide(makeTestLayer())))

        it.effect("fails locally when provider-executed history cannot be replayed inline", () =>
          Effect.gen(function*() {
            const cases = [
              providerExecutedCall,
              providerExecutedResult
            ] as const
            yield* Effect.forEach(cases, (part) =>
              LanguageModel.generateText({
                prompt: Prompt.make([
                  { role: "user", content: "Search" },
                  {
                    role: "assistant",
                    content: [part]
                  },
                  { role: "user", content: "Continue" }
                ]),
                toolkit: Toolkit.make(OpenAiTool.WebSearch({})),
                disableToolCallResolution: true
              }).pipe(
                Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini", {
                  store: true,
                  useItemReferences: false
                })),
                Effect.flip,
                Effect.tap((error) =>
                  Effect.sync(() => {
                    strictEqual(error.reason._tag, "InvalidRequestError")
                    if (error.reason._tag === "InvalidRequestError") {
                      assert.include(error.reason.description, "OpenAiWebSearch")
                      assert.include(error.reason.description, "ws_1")
                    }
                  })
                )
              ))

            strictEqual((yield* MockHttpClient.requests).length, 0)
          }).pipe(Effect.provide(makeTestLayer())))

        it.effect("converts tool call parts to function_call", () =>
          Effect.gen(function*() {
            yield* LanguageModel.generateText({
              prompt: Prompt.make([
                { role: "user", content: "Use the tool" },
                {
                  role: "assistant",
                  content: [
                    Prompt.toolCallPart({
                      id: "call_abc",
                      name: "TestTool",
                      params: { input: "test" },
                      providerExecuted: false
                    })
                  ]
                },
                {
                  role: "tool",
                  content: [
                    Prompt.toolResultPart({
                      id: "call_abc",
                      name: "TestTool",
                      isFailure: false,
                      result: { output: "result" },
                      providerExecuted: false
                    })
                  ]
                }
              ]),
              toolkit: TestToolkit
            }).pipe(Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini")))

            const requests = yield* MockHttpClient.requests
            const body = yield* getRequestBody(requests[0])

            const functionCall = body.input.find((m: any) => m.type === "function_call")
            assert.isDefined(functionCall)
            strictEqual(functionCall.name, "TestTool")
            strictEqual(functionCall.call_id, "call_abc")
          }).pipe(Effect.provide([makeTestLayer(), TestToolkitLayer])))
      })

      describe("tool messages", () => {
        it.effect("converts tool results to function_call_output", () =>
          Effect.gen(function*() {
            yield* LanguageModel.generateText({
              prompt: Prompt.make([
                { role: "user", content: "Use the tool" },
                {
                  role: "assistant",
                  content: [
                    Prompt.toolCallPart({
                      id: "call_abc",
                      name: "TestTool",
                      params: { input: "test" },
                      providerExecuted: false
                    })
                  ]
                },
                {
                  role: "tool",
                  content: [
                    Prompt.toolResultPart({
                      id: "call_abc",
                      name: "TestTool",
                      isFailure: false,
                      result: { output: "result" },
                      providerExecuted: false
                    })
                  ]
                }
              ]),
              toolkit: TestToolkit
            }).pipe(Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini")))

            const requests = yield* MockHttpClient.requests
            const body = yield* getRequestBody(requests[0])

            const toolOutput = body.input.find((m: any) => m.type === "function_call_output")
            assert.isDefined(toolOutput)
            strictEqual(toolOutput.call_id, "call_abc")
            strictEqual(toolOutput.output, JSON.stringify({ output: "result" }))
          }).pipe(Effect.provide([makeTestLayer(), TestToolkitLayer])))

        it.effect("preserves string tool results", () =>
          Effect.gen(function*() {
            yield* LanguageModel.generateText({
              prompt: Prompt.make([
                { role: "user", content: "Use the tool" },
                {
                  role: "assistant",
                  content: [
                    Prompt.toolCallPart({
                      id: "call_text",
                      name: "TestTool",
                      params: { input: "test" },
                      providerExecuted: false
                    })
                  ]
                },
                {
                  role: "tool",
                  content: [
                    Prompt.toolResultPart({
                      id: "call_text",
                      name: "TestTool",
                      isFailure: false,
                      result: "PLAIN_TEXT_SENTINEL\n",
                      providerExecuted: false
                    })
                  ]
                }
              ]),
              toolkit: TestToolkit
            }).pipe(Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini")))

            const requests = yield* MockHttpClient.requests
            const body = yield* getRequestBody(requests[0])
            const toolOutput = body.input.find((item: any) => item.type === "function_call_output")

            assert.isDefined(toolOutput)
            strictEqual(toolOutput.output, "PLAIN_TEXT_SENTINEL\n")
          }).pipe(Effect.provide([makeTestLayer(), TestToolkitLayer])))

        it.effect("emits only the specialized output for apply_patch results", () =>
          Effect.gen(function*() {
            const toolkit = Toolkit.make(OpenAiTool.ApplyPatch({}))
            yield* LanguageModel.generateText({
              prompt: Prompt.make([
                { role: "user", content: "Apply a patch" },
                {
                  role: "assistant",
                  content: [Prompt.toolCallPart({
                    id: "call_apply_patch",
                    name: "OpenAiApplyPatch",
                    params: {
                      call_id: "call_apply_patch",
                      operation: { type: "delete_file", path: "old.ts" }
                    },
                    providerExecuted: false
                  })]
                },
                {
                  role: "tool",
                  content: [Prompt.toolResultPart({
                    id: "call_apply_patch",
                    name: "OpenAiApplyPatch",
                    isFailure: false,
                    result: { status: "completed", output: "deleted" },
                    providerExecuted: false
                  })]
                }
              ]),
              toolkit,
              disableToolCallResolution: true
            }).pipe(Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini")))

            const requests = yield* MockHttpClient.requests
            const body = yield* getRequestBody(requests[0])
            const outputs = body.input.filter((item: any) =>
              item.call_id === "call_apply_patch" && item.type.endsWith("_output")
            )

            deepStrictEqual(outputs.map((item: any) => item.type), ["apply_patch_call_output"])
          }).pipe(Effect.provide(makeTestLayer())))

        it.effect("emits only the specialized output for shell results", () =>
          Effect.gen(function*() {
            const toolkit = Toolkit.make(OpenAiTool.Shell({}))
            yield* LanguageModel.generateText({
              prompt: Prompt.make([
                { role: "user", content: "Run a shell command" },
                {
                  role: "assistant",
                  content: [Prompt.toolCallPart({
                    id: "call_shell",
                    name: "OpenAiShell",
                    params: {
                      action: {
                        commands: ["echo hello"],
                        timeout_ms: null,
                        max_output_length: null
                      }
                    },
                    providerExecuted: false
                  })]
                },
                {
                  role: "tool",
                  content: [Prompt.toolResultPart({
                    id: "call_shell",
                    name: "OpenAiShell",
                    isFailure: false,
                    result: {
                      output: [{
                        stdout: "hello\n",
                        stderr: "",
                        outcome: { type: "exit", exit_code: 0 }
                      }]
                    },
                    providerExecuted: false
                  })]
                }
              ]),
              toolkit,
              disableToolCallResolution: true
            }).pipe(Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini")))

            const requests = yield* MockHttpClient.requests
            const body = yield* getRequestBody(requests[0])
            const outputs = body.input.filter((item: any) =>
              item.call_id === "call_shell" && item.type.endsWith("_output")
            )

            deepStrictEqual(outputs.map((item: any) => item.type), ["shell_call_output"])
          }).pipe(Effect.provide(makeTestLayer())))

        it.effect("emits only the specialized output for local_shell results", () =>
          Effect.gen(function*() {
            const toolkit = Toolkit.make(OpenAiTool.LocalShell({}))
            yield* LanguageModel.generateText({
              prompt: Prompt.make([
                { role: "user", content: "Run a local shell command" },
                {
                  role: "assistant",
                  content: [Prompt.toolCallPart({
                    id: "call_local_shell",
                    name: "OpenAiLocalShell",
                    params: {
                      action: {
                        type: "exec",
                        command: ["echo", "hello"],
                        env: {}
                      }
                    },
                    providerExecuted: false
                  })]
                },
                {
                  role: "tool",
                  content: [Prompt.toolResultPart({
                    id: "call_local_shell",
                    name: "OpenAiLocalShell",
                    isFailure: false,
                    result: { output: "hello\n" },
                    providerExecuted: false
                  })]
                }
              ]),
              toolkit,
              disableToolCallResolution: true
            }).pipe(Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini")))

            const requests = yield* MockHttpClient.requests
            const body = yield* getRequestBody(requests[0])
            const outputs = body.input.filter((item: any) =>
              item.call_id === "call_local_shell" && item.type.endsWith("_output")
            )

            deepStrictEqual(outputs.map((item: any) => item.type), ["local_shell_call_output"])
          }).pipe(Effect.provide(makeTestLayer())))
      })
    })

    describe("tool preparation", () => {
      it.effect("converts user-defined tools to function type", () =>
        Effect.gen(function*() {
          yield* LanguageModel.generateText({
            prompt: "Use the tool",
            toolkit: TestToolkit
          }).pipe(Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini")))

          const requests = yield* MockHttpClient.requests
          const body = yield* getRequestBody(requests[0])

          const tool = body.tools?.find((t: any) => t.type === "function")
          assert.isDefined(tool)
          strictEqual(tool.name, "TestTool")
          strictEqual(tool.description, "A test tool")
          strictEqual(tool.strict, true)
        }).pipe(Effect.provide([makeTestLayer(), TestToolkitLayer])))

      it.effect("empty object on properties for empty parameters", () =>
        Effect.gen(function*() {
          const EmptyTool = Tool.make("EmptyParamsTool", {
            description: "Empty params tool",
            parameters: Tool.EmptyParams,
            success: Schema.String
          })
          const toolkit = Toolkit.make(EmptyTool)
          const toolkitLayer = toolkit.toLayer({
            EmptyParamsTool: () => Effect.succeed("ok")
          })

          yield* LanguageModel.generateText({
            prompt: "Use the tool",
            toolkit
          }).pipe(Effect.provide([OpenAiLanguageModel.model("gpt-4o-mini"), toolkitLayer]))

          const requests = yield* MockHttpClient.requests
          const body = yield* getRequestBody(requests[0])

          const tool = body.tools?.find((t: any) => t.type === "function" && t.name === "EmptyParamsTool")
          assert.isDefined(tool)
          deepStrictEqual(tool.parameters, {
            type: "object",
            properties: {},
            additionalProperties: false
          })
        }).pipe(Effect.provide(makeTestLayer())))

      it.effect("converts dynamic tools to function type", () =>
        Effect.gen(function*() {
          const inputSchema = {
            type: "object",
            properties: {
              query: { type: "string" },
              limit: { type: "number" }
            },
            required: ["query"],
            additionalProperties: false
          } as const

          const DynamicTool = Tool.dynamic("DynamicTool", {
            description: "A dynamic tool",
            parameters: inputSchema
          })

          yield* LanguageModel.generateText({
            prompt: "Use the dynamic tool",
            toolkit: Toolkit.make(DynamicTool),
            disableToolCallResolution: true
          }).pipe(Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini")))

          const requests = yield* MockHttpClient.requests
          const body = yield* getRequestBody(requests[0])

          const tool = body.tools?.find((entry: any) => entry.type === "function" && entry.name === "DynamicTool")
          assert.isDefined(tool)
          strictEqual(tool.description, "A dynamic tool")
          deepStrictEqual(tool.parameters, inputSchema)
        }).pipe(Effect.provide(makeTestLayer())))

      it.effect("empty object on properties for empty parameters", () =>
        Effect.gen(function*() {
          const EmptyTool = Tool.make("EmptyParamsTool", {
            description: "Empty params tool",
            parameters: Tool.EmptyParams,
            success: Schema.String
          })
          const toolkit = Toolkit.make(EmptyTool)
          const toolkitLayer = toolkit.toLayer({
            EmptyParamsTool: () => Effect.succeed("ok")
          })

          yield* LanguageModel.generateText({
            prompt: "Use the tool",
            toolkit
          }).pipe(Effect.provide([OpenAiLanguageModel.model("gpt-4o-mini"), toolkitLayer]))

          const requests = yield* MockHttpClient.requests
          const body = yield* getRequestBody(requests[0])

          const tool = body.tools?.find((t: any) => t.type === "function" && t.name === "EmptyParamsTool")
          assert.isDefined(tool)
          deepStrictEqual(tool.parameters, {
            type: "object",
            properties: {},
            additionalProperties: false
          })
        }).pipe(Effect.provide(makeTestLayer())))

      it.effect("handles tool choice auto", () =>
        Effect.gen(function*() {
          yield* LanguageModel.generateText({
            prompt: "Use the tool",
            toolkit: TestToolkit,
            toolChoice: "auto"
          }).pipe(Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini")))

          const requests = yield* MockHttpClient.requests
          const body = yield* getRequestBody(requests[0])

          strictEqual(body.tool_choice, "auto")
        }).pipe(Effect.provide([makeTestLayer(), TestToolkitLayer])))

      it.effect("handles tool choice none", () =>
        Effect.gen(function*() {
          yield* LanguageModel.generateText({
            prompt: "Use the tool",
            toolkit: TestToolkit,
            toolChoice: "none"
          }).pipe(Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini")))

          const requests = yield* MockHttpClient.requests
          const body = yield* getRequestBody(requests[0])

          strictEqual(body.tool_choice, "none")
        }).pipe(Effect.provide([makeTestLayer(), TestToolkitLayer])))

      it.effect("handles tool choice required", () =>
        Effect.gen(function*() {
          yield* LanguageModel.generateText({
            prompt: "Use the tool",
            toolkit: TestToolkit,
            toolChoice: "required"
          }).pipe(Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini")))

          const requests = yield* MockHttpClient.requests
          const body = yield* getRequestBody(requests[0])

          strictEqual(body.tool_choice, "required")
        }).pipe(Effect.provide([makeTestLayer(), TestToolkitLayer])))

      it.effect("handles specific tool choice", () =>
        Effect.gen(function*() {
          yield* LanguageModel.generateText({
            prompt: "Use the tool",
            toolkit: TestToolkit,
            toolChoice: { tool: "TestTool" }
          }).pipe(Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini")))

          const requests = yield* MockHttpClient.requests
          const body = yield* getRequestBody(requests[0])

          deepStrictEqual(body.tool_choice, { type: "function", name: "TestTool" })
        }).pipe(Effect.provide([makeTestLayer(), TestToolkitLayer])))

      it.effect("adds code_interpreter tool", () =>
        Effect.gen(function*() {
          const toolkit = Toolkit.make(OpenAiTool.CodeInterpreter({ container: { type: "auto" } }))

          yield* LanguageModel.generateText({
            prompt: "Run some code",
            toolkit
          }).pipe(Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini")))

          const requests = yield* MockHttpClient.requests
          const body = yield* getRequestBody(requests[0])

          const tool = body.tools?.find((t: any) => t.type === "code_interpreter")
          assert.isDefined(tool)
        }).pipe(Effect.provide(makeTestLayer())))

      it.effect("adds web_search tool", () =>
        Effect.gen(function*() {
          const toolkit = Toolkit.make(OpenAiTool.WebSearch({}))

          yield* LanguageModel.generateText({
            prompt: "Search the web",
            toolkit
          }).pipe(Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini")))

          const requests = yield* MockHttpClient.requests
          const body = yield* getRequestBody(requests[0])

          const tool = body.tools?.find((t: any) => t.type === "web_search")
          assert.isDefined(tool)
        }).pipe(Effect.provide(makeTestLayer())))

      it.effect("adds file_search tool with vector store IDs", () =>
        Effect.gen(function*() {
          const toolkit = Toolkit.make(OpenAiTool.FileSearch({
            vector_store_ids: ["vs_123"]
          }))

          yield* LanguageModel.generateText({
            prompt: "Search files",
            toolkit
          }).pipe(Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini")))

          const requests = yield* MockHttpClient.requests
          const body = yield* getRequestBody(requests[0])

          const tool = body.tools?.find((t: any) => t.type === "file_search")
          assert.isDefined(tool)
          deepStrictEqual(tool.vector_store_ids, ["vs_123"])
        }).pipe(Effect.provide(makeTestLayer())))
    })

    describe("response format", () => {
      it.effect("uses text format by default", () =>
        Effect.gen(function*() {
          yield* LanguageModel.generateText({
            prompt: "Hello"
          }).pipe(Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini")))

          const requests = yield* MockHttpClient.requests
          const body = yield* getRequestBody(requests[0])

          strictEqual(body.text?.format?.type, "text")
        }).pipe(Effect.provide(makeTestLayer())))

      it.effect("uses json_schema format for structured output", () =>
        Effect.gen(function*() {
          yield* LanguageModel.generateObject({
            prompt: "Give me a person",
            schema: Schema.Struct({
              name: Schema.String,
              age: Schema.Number
            })
          }).pipe(Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini")))

          const requests = yield* MockHttpClient.requests
          const body = yield* getRequestBody(requests[0])

          strictEqual(body.text?.format?.type, "json_schema")
          strictEqual(body.text?.format?.strict, true)
        }).pipe(Effect.provide(makeTestLayer({
          body: {
            output: [makeTextOutput(JSON.stringify({ name: "John", age: 30 }))]
          }
        }))))
    })

    describe("response handling", () => {
      it.effect("preserves prompt cache diagnostics alongside the service tier", () =>
        Effect.gen(function*() {
          const diagnostics = {
            type: "cache_miss",
            reason: "tools_changed",
            cache_missed_tokens: 1024,
            comparison_reusable_tokens: 2048
          } as const
          const body = JSON.stringify({
            ...makeDefaultResponse({ service_tier: "priority" }),
            prompt_cache_diagnostics: diagnostics
          })
          const result = yield* LanguageModel.generateText({ prompt: "test" }).pipe(
            Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini")),
            Effect.provide(OpenAiClient.layer({ apiKey: Redacted.make("sk-test-key") })),
            Effect.provideService(HttpClient.HttpClient, makeRawResponseClient(body, "application/json"))
          )

          const finish = result.content.find((part) => part.type === "finish")
          assert.isDefined(finish)
          deepStrictEqual(finish.metadata.openai, {
            serviceTier: "priority",
            promptCacheDiagnostics: diagnostics
          })
        }))

      it.effect("extracts text from output_text", () =>
        Effect.gen(function*() {
          const result = yield* LanguageModel.generateText({
            prompt: "Hello"
          }).pipe(Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini")))

          strictEqual(result.text, "Hello, world!")
        }).pipe(Effect.provide(makeTestLayer({
          body: { output: [makeTextOutput("Hello, world!")] }
        }))))

      it.effect("extracts multiple text parts", () =>
        Effect.gen(function*() {
          const result = yield* LanguageModel.generateText({
            prompt: "Hello"
          }).pipe(Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini")))

          const textParts = result.content.filter((p) => p.type === "text")
          strictEqual(textParts.length, 2)
        }).pipe(Effect.provide(makeTestLayer({
          body: {
            output: [
              makeTextOutput("First"),
              makeTextOutput("Second", { id: "msg_456" })
            ]
          }
        }))))

      it.effect("handles refusal content", () =>
        Effect.gen(function*() {
          const result = yield* LanguageModel.generateText({
            prompt: "Do something bad"
          }).pipe(Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini")))

          const textPart = result.content.find((p) => p.type === "text")
          strictEqual(textPart?.text, "")
          strictEqual(textPart?.metadata?.openai?.refusal, "I cannot do that")
        }).pipe(Effect.provide(makeTestLayer({
          body: {
            output: [{
              type: "message",
              id: "msg_123",
              role: "assistant",
              status: "completed",
              content: [{ type: "refusal", refusal: "I cannot do that" }]
            }]
          }
        }))))

      it.effect("parses function call arguments", () =>
        Effect.gen(function*() {
          const result = yield* LanguageModel.generateText({
            prompt: "Use the tool",
            toolkit: TestToolkit
          }).pipe(Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini")))

          const toolCall = result.content.find((p) => p.type === "tool-call")
          assert.isDefined(toolCall)
          if (toolCall?.type === "tool-call") {
            strictEqual(toolCall.name, "TestTool")
            deepStrictEqual(toolCall.params, { input: "hello" })
          }
        }).pipe(
          Effect.provide([
            makeTestLayer({
              body: { output: [makeFunctionCall("TestTool", { input: "hello" })] }
            }),
            TestToolkitLayer
          ])
        ))

      it.effect("preserves raw JSON Schema dynamic tool call params", () =>
        Effect.gen(function*() {
          const DynamicTool = Tool.dynamic("DynamicTool", {
            parameters: {
              type: "object",
              properties: { query: { type: "string" } },
              required: ["query"],
              additionalProperties: false
            } as const
          })
          const params = { query: "effect" }
          const result = yield* LanguageModel.generateText({
            prompt: "Use the dynamic tool",
            toolkit: Toolkit.make(DynamicTool),
            disableToolCallResolution: true
          }).pipe(
            Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini")),
            Effect.provide(makeTestLayer({
              body: { output: [makeFunctionCall("DynamicTool", params)] }
            }))
          )

          deepStrictEqual(result.toolCalls[0]?.params, params)
        }))

      it.effect("decodes Effect Schema dynamic tool call params with the OpenAI codec", () =>
        Effect.gen(function*() {
          const DynamicTool = Tool.dynamic("DynamicTool", {
            parameters: Schema.Struct({
              env: Schema.Record(Schema.String, Schema.String)
            })
          })
          const result = yield* LanguageModel.generateText({
            prompt: "Use the dynamic tool",
            toolkit: Toolkit.make(DynamicTool),
            disableToolCallResolution: true
          }).pipe(
            Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini")),
            Effect.provide(makeTestLayer({
              body: {
                output: [makeFunctionCall("DynamicTool", { env: [{ 0: "PATH", 1: "/usr/bin" }] })]
              }
            }))
          )

          deepStrictEqual(result.toolCalls[0]?.params, { env: { PATH: "/usr/bin" } })
        }))

      it.effect("routes invalid tool call params through failureMode: return without failing the effect", () =>
        Effect.gen(function*() {
          const toolkit = Toolkit.make(ReturnModeTool)
          const handlers = toolkit.toLayer({
            ReturnModeTool: ({ input }) => Effect.succeed({ output: `processed: ${input}` })
          })

          const result = yield* LanguageModel.generateText({
            prompt: "Use the tool",
            toolkit
          }).pipe(
            Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini")),
            Effect.provide(handlers)
          )

          strictEqual(result.toolResults.length, 1)
          const toolResult = result.toolResults[0]!
          strictEqual(toolResult.isFailure, true)
          const failure = toolResult.result as AiError.AiError
          strictEqual(failure._tag, "AiError")
          strictEqual(failure.reason._tag, "ToolParameterValidationError")
        }).pipe(
          Effect.provide(makeTestLayer({
            body: { output: [makeFunctionCall("ReturnModeTool", { input: 123 })] }
          }))
        ))

      it.effect("converts transformed tool call params to the tool's standard encoded form", () =>
        Effect.gen(function*() {
          const received = yield* Ref.make<number | undefined>(undefined)
          const toolkit = Toolkit.make(TransformParamsTool)
          const handlers = toolkit.toLayer({
            TransformParamsTool: ({ input }) =>
              Ref.set(received, input).pipe(
                Effect.as({ output: input * 2 })
              )
          })

          const result = yield* LanguageModel.generateText({
            prompt: "Use the tool",
            toolkit
          }).pipe(
            Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini")),
            Effect.provide(handlers)
          )

          const toolCall = result.toolCalls[0]!
          deepStrictEqual(toolCall.params, { input: "21" })
          strictEqual(yield* Ref.get(received), 21)
          strictEqual(result.toolResults[0]!.isFailure, false)
          deepStrictEqual(result.toolResults[0]!.result, { output: 42 })
        }).pipe(
          Effect.provide(makeTestLayer({
            body: { output: [makeFunctionCall("TransformParamsTool", { input: "21" })] }
          }))
        ))

      it.effect("provides parameter encoding services to provider normalization", () =>
        Effect.gen(function*() {
          const used = yield* Ref.make(false)
          const toolkit = Toolkit.make(AsymmetricParamsTool)
          const handlers = toolkit.toLayer({
            AsymmetricParamsTool: ({ input }) => Effect.succeed({ output: `processed: ${input}` })
          })

          const result = yield* LanguageModel.generateText({
            prompt: "Use the tool",
            toolkit
          }).pipe(
            Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini")),
            Effect.provide(handlers),
            Effect.provideService(ParamEncodeService, { use: Ref.set(used, true) })
          )

          strictEqual(yield* Ref.get(used), true)
          strictEqual(result.toolResults[0]!.isFailure, false)
          deepStrictEqual(result.toolResults[0]!.result, { output: "processed: hello" })
        }).pipe(
          Effect.provide(makeTestLayer({
            body: { output: [makeFunctionCall("AsymmetricParamsTool", { input: "hello" })] }
          }))
        ))

      it.effect("provides parameter encoding services to provider normalization when tool call resolution is disabled", () =>
        Effect.gen(function*() {
          const used = yield* Ref.make(false)
          const toolkit = Toolkit.make(AsymmetricParamsTool)

          const result = yield* LanguageModel.generateText({
            prompt: "Use the tool",
            toolkit,
            disableToolCallResolution: true
          }).pipe(
            Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini")),
            Effect.provideService(ParamEncodeService, { use: Ref.set(used, true) })
          )

          strictEqual(yield* Ref.get(used), true)
          const toolCall = result.toolCalls[0]!
          deepStrictEqual(toolCall.params, { input: "hello" })
        }).pipe(
          Effect.provide(makeTestLayer({
            body: { output: [makeFunctionCall("AsymmetricParamsTool", { input: "hello" })] }
          }))
        ))

      it.effect("uses canonical OpenAiMcp name for mcp_call", () =>
        Effect.gen(function*() {
          const result = yield* LanguageModel.generateText({
            prompt: "Use MCP",
            toolkit: McpToolkit
          }).pipe(Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini")))

          const toolCall = result.content.find((part) => part.type === "tool-call")
          assert.isDefined(toolCall)
          if (toolCall?.type === "tool-call") {
            strictEqual(toolCall.name, "OpenAiMcp")
            deepStrictEqual(toolCall.params, { packageName: "effect" })
          }

          const toolResult = result.content.find((part) => part.type === "tool-result")
          assert.isDefined(toolResult)
          if (toolResult?.type === "tool-result") {
            strictEqual(toolResult.name, "OpenAiMcp")
            assertTrue(!toolResult.isFailure, "expected a successful MCP result")
            strictEqual(toolResult.result.name, "CheckPackage")
          }
        }).pipe(Effect.provide(makeTestLayer({
          body: {
            output: [makeMcpCall("CheckPackage", { packageName: "effect" })]
          }
        }))))

      it.each(["gpt-4.1", "gpt-5.6"] as const)(
        "maps stable web search action to tool call parameters with %s",
        (model) =>
          Effect.runPromise(
            Effect.gen(function*() {
              const toolkit = Toolkit.make(OpenAiTool.WebSearch({}))
              const result = yield* LanguageModel.generateText({
                prompt: "Search the web",
                toolkit
              }).pipe(Effect.provide(OpenAiLanguageModel.model(model)))

              const toolCall = result.content.find((part) => part.type === "tool-call")
              assert.isDefined(toolCall)
              assert.deepStrictEqual(toolCall.params, {
                action: { type: "search", query: "Effect TypeScript" }
              })

              const toolResult = result.content.find((part) => part.type === "tool-result")
              assert.isDefined(toolResult)
              assert.deepStrictEqual(toolResult.result, {
                action: { type: "search", query: "Effect TypeScript" },
                status: "completed"
              })
            }).pipe(Effect.provide(makeTestLayer({
              body: {
                model,
                output: [makeWebSearchCall()]
              }
            })))
          )
      )

      for (const { tool, status } of webSearchFailures) {
        it.effect(
          `${tool.name} preserves ${status} results`,
          () =>
            Effect.gen(function*() {
              const result = yield* LanguageModel.generateText({
                prompt: "Search the web",
                toolkit: Toolkit.make(tool)
              }).pipe(Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini")))
              const toolResult = result.toolResults[0]!
              strictEqual(toolResult.isFailure, true)
              deepStrictEqual(toolResult.result, {
                action: { type: "search", query: "Effect TypeScript" },
                status
              })
            }).pipe(Effect.provide(makeTestLayer({
              body: { output: [makeWebSearchCall({ status })] }
            })))
        )
      }

      it.effect.each(fileSearchOutcomes)(
        "OpenAiFileSearch reports $status results",
        ({ status, isFailure, results }) =>
          Effect.gen(function*() {
            const result = yield* LanguageModel.generateText({
              prompt: "Search the files",
              toolkit: Toolkit.make(OpenAiTool.FileSearch({ vector_store_ids: ["vs_123"] }))
            }).pipe(Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini")))
            const toolResult = result.toolResults[0]!
            strictEqual(toolResult.isFailure, isFailure)
            deepStrictEqual(toolResult.result, {
              status,
              queries: ["Effect TypeScript"],
              results: results ?? null
            })
          }).pipe(Effect.provide(makeTestLayer({
            body: { output: [makeFileSearchCall({ status, ...(results === undefined ? {} : { results }) })] }
          })))
      )

      it.effect("uses canonical OpenAiMcp name for mcp_approval_request", () =>
        Effect.gen(function*() {
          const result = yield* LanguageModel.generateText({
            prompt: "Use MCP",
            toolkit: McpToolkit
          }).pipe(Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini")))

          const toolCall = result.content.find((part) => part.type === "tool-call")
          assert.isDefined(toolCall)
          if (toolCall?.type === "tool-call") {
            strictEqual(toolCall.name, "OpenAiMcp")
            deepStrictEqual(toolCall.params, { packageName: "effect" })
          }

          const approvalRequest = result.content.find((part) => part.type === "tool-approval-request")
          assert.isDefined(approvalRequest)
          if (toolCall?.type === "tool-call" && approvalRequest?.type === "tool-approval-request") {
            strictEqual(approvalRequest.toolCallId, toolCall.id)
          }
        }).pipe(Effect.provide(makeTestLayer({
          body: {
            output: [makeMcpApprovalRequest("CheckPackage", { packageName: "effect" })]
          }
        }))))

      it.effect("extracts reasoning parts", () =>
        Effect.gen(function*() {
          const result = yield* LanguageModel.generateText({
            prompt: "Think about this"
          }).pipe(Effect.provide(OpenAiLanguageModel.model("o1")))

          const reasoningParts = result.content.filter((p) => p.type === "reasoning")
          strictEqual(reasoningParts.length, 2)
          if (reasoningParts[0]?.type === "reasoning") {
            strictEqual(reasoningParts[0].text, "First thought")
          }
        }).pipe(Effect.provide(makeTestLayer({
          body: {
            model: "o1",
            output: [makeReasoningOutput(["First thought", "Second thought"])]
          }
        }))))

      it.effect("extracts usage information", () =>
        Effect.gen(function*() {
          const result = yield* LanguageModel.generateText({
            prompt: "Hello"
          }).pipe(Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini")))

          const finishPart = result.content.find((p) => p.type === "finish")
          assert.isDefined(finishPart)
          if (finishPart?.type === "finish") {
            deepStrictEqual(finishPart.usage.inputTokens, {
              uncached: 7,
              total: 10,
              cacheRead: 3,
              cacheWrite: 4
            })
            deepStrictEqual(finishPart.usage.outputTokens, { total: 20, text: 20, reasoning: 0 })
          }
        }).pipe(Effect.provide(makeTestLayer({
          body: {
            output: [makeTextOutput("Hello")],
            usage: makeUsage({
              input_tokens_details: {
                cached_tokens: 3,
                cache_write_tokens: 4
              }
            })
          }
        }))))

      it.effect("determines finish reason from incomplete_details", () =>
        Effect.gen(function*() {
          const result = yield* LanguageModel.generateText({
            prompt: "Hello"
          }).pipe(Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini")))

          const finishPart = result.content.find((p) => p.type === "finish")
          if (finishPart?.type === "finish") {
            strictEqual(finishPart.reason, "content-filter")
          }
        }).pipe(Effect.provide(makeTestLayer({
          body: {
            output: [makeTextOutput("Hello")],
            incomplete_details: { reason: "content_filter" }
          }
        }))))

      it.effect("defaults finish reason to stop", () =>
        Effect.gen(function*() {
          const result = yield* LanguageModel.generateText({
            prompt: "Hello"
          }).pipe(Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini")))

          const finishPart = result.content.find((p) => p.type === "finish")
          if (finishPart?.type === "finish") {
            strictEqual(finishPart.reason, "stop")
          }
        }).pipe(Effect.provide(makeTestLayer({
          body: { output: [makeTextOutput("Hello")] }
        }))))

      it.effect("sets finish reason to tool-calls when has tool calls", () =>
        Effect.gen(function*() {
          const result = yield* LanguageModel.generateText({
            prompt: "Use the tool",
            toolkit: TestToolkit
          }).pipe(Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini")))

          const finishPart = result.content.find((p) => p.type === "finish")
          if (finishPart?.type === "finish") {
            strictEqual(finishPart.reason, "tool-calls")
          }
        }).pipe(
          Effect.provide([
            makeTestLayer({
              body: { output: [makeFunctionCall("TestTool", { input: "test" })] }
            }),
            TestToolkitLayer
          ])
        ))

      it.effect("extracts url citations as source parts", () =>
        Effect.gen(function*() {
          const result = yield* LanguageModel.generateText({
            prompt: "Hello"
          }).pipe(Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini")))

          const sourcePart = result.content.find((p) => p.type === "source")
          assert.isDefined(sourcePart)
          if (sourcePart?.type === "source" && sourcePart.sourceType === "url") {
            strictEqual(sourcePart.url.href, "https://example.com/")
            strictEqual(sourcePart.title, "Example")
          }
        }).pipe(Effect.provide(makeTestLayer({
          body: {
            output: [{
              type: "message",
              id: "msg_123",
              role: "assistant",
              status: "completed",
              content: [{
                type: "output_text",
                text: "Check this out",
                annotations: [{
                  type: "url_citation",
                  url: "https://example.com",
                  title: "Example",
                  start_index: 0,
                  end_index: 14
                }],
                logprobs: []
              }]
            }]
          }
        }))))
    })
  })

  describe("streamText", () => {
    it.effect.each(["completed", "failed"] as const)(
      "preserves prompt cache diagnostics in response.%s",
      (status) =>
        Effect.gen(function*() {
          const event = {
            type: `response.${status}`,
            sequence_number: 1,
            response: {
              ...makeDefaultResponse({
                status,
                error: status === "failed" ? { code: "server_error", message: "generation failed" } : null
              }),
              service_tier: "fast",
              prompt_cache_diagnostics: { type: "cache_hit" }
            }
          }
          const parts = yield* LanguageModel.streamText({ prompt: "test" }).pipe(
            Stream.runCollect,
            Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini")),
            Effect.provide(OpenAiClient.layer({ apiKey: Redacted.make("sk-test-key") })),
            Effect.provideService(
              HttpClient.HttpClient,
              makeRawResponseClient(
                `data: ${JSON.stringify(event)}\n\n`,
                "text/event-stream"
              )
            )
          )

          const finish = parts.find((part) => part.type === "finish")
          assert.isDefined(finish)
          deepStrictEqual(finish.metadata.openai, { promptCacheDiagnostics: { type: "cache_hit" } })
        })
    )

    it.effect("extracts usage information", () =>
      Effect.gen(function*() {
        const streamEvents = [
          {
            type: "response.created",
            sequence_number: 1,
            response: makeDefaultResponse({ status: "in_progress" })
          },
          {
            type: "response.completed",
            sequence_number: 2,
            response: makeDefaultResponse({
              usage: makeUsage({
                input_tokens_details: {
                  cached_tokens: 3,
                  cache_write_tokens: 4
                }
              })
            })
          }
        ] as unknown as ReadonlyArray<typeof Generated.ResponseStreamEvent.Type>

        const partsChunk = yield* LanguageModel.streamText({
          prompt: "Hello"
        }).pipe(
          Stream.runCollect,
          Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini")),
          Effect.provide(makeStreamTestLayer(streamEvents))
        )

        const finishPart = globalThis.Array.from(partsChunk).find((part) => part.type === "finish")
        assert.isDefined(finishPart)
        if (finishPart?.type === "finish") {
          deepStrictEqual(finishPart.usage.inputTokens, {
            uncached: 7,
            total: 10,
            cacheRead: 3,
            cacheWrite: 4
          })
        }
      }))

    it.effect("emits valid apply_patch tool params JSON for update_file diffs", () =>
      Effect.gen(function*() {
        const diff = "@@ -1 +1 @@\n-old\n+new\n"
        const outputItem = {
          type: "apply_patch_call",
          id: "patch_item_1",
          call_id: "patch_call_1",
          status: "in_progress",
          operation: {
            type: "update_file",
            path: "src/example.ts",
            diff
          }
        } as const

        const streamEvents = [
          {
            type: "response.created",
            sequence_number: 1,
            response: makeDefaultResponse({
              id: "resp_patch_stream",
              status: "in_progress",
              output: []
            })
          },
          {
            type: "response.output_item.added",
            output_index: 0,
            sequence_number: 2,
            item: outputItem
          },
          {
            type: "response.apply_patch_call_operation_diff.delta",
            sequence_number: 3,
            output_index: 0,
            item_id: outputItem.id,
            delta: diff
          },
          {
            type: "response.apply_patch_call_operation_diff.done",
            sequence_number: 4,
            output_index: 0,
            item_id: outputItem.id
          }
        ] as unknown as ReadonlyArray<typeof Generated.ResponseStreamEvent.Type>

        const partsChunk = yield* LanguageModel.streamText({
          prompt: "Update src/example.ts",
          disableToolCallResolution: true
        }).pipe(
          Stream.runCollect,
          Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini")),
          Effect.provide(makeStreamTestLayer(streamEvents))
        )

        const parts = globalThis.Array.from(partsChunk)
        const params = decodeToolParamsFromStream(parts, outputItem.call_id)

        deepStrictEqual(params, {
          call_id: outputItem.call_id,
          operation: {
            type: "update_file",
            path: "src/example.ts",
            diff
          }
        })
      }))

    it.effect("emits tool call from function_call_arguments.done when output_item.done is missing", () =>
      Effect.gen(function*() {
        const streamEvents = [
          {
            type: "response.created",
            sequence_number: 1,
            response: makeDefaultResponse({
              id: "resp_function_call_done",
              status: "in_progress",
              output: []
            })
          },
          {
            type: "response.output_item.added",
            sequence_number: 2,
            output_index: 0,
            item: {
              type: "function_call",
              id: "fc_1",
              call_id: "call_1",
              name: "TestTool",
              arguments: "",
              status: "in_progress"
            }
          },
          {
            type: "response.function_call_arguments.delta",
            sequence_number: 3,
            output_index: 0,
            item_id: "fc_1",
            delta: "{\"input\":\"hel"
          },
          {
            type: "response.function_call_arguments.done",
            sequence_number: 4,
            output_index: 0,
            item_id: "fc_1",
            name: "TestTool",
            arguments: "{\"input\":\"hello\"}"
          },
          {
            type: "response.completed",
            sequence_number: 5,
            response: makeDefaultResponse({
              id: "resp_function_call_done",
              status: "completed",
              output: []
            })
          }
        ] as unknown as ReadonlyArray<typeof Generated.ResponseStreamEvent.Type>

        const partsChunk = yield* LanguageModel.streamText({
          prompt: "Use the test tool",
          toolkit: TestToolkit,
          disableToolCallResolution: true
        }).pipe(
          Stream.runCollect,
          Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini")),
          Effect.provide(makeStreamTestLayer(streamEvents)),
          Effect.provide(TestToolkitLayer)
        )

        const parts = globalThis.Array.from(partsChunk)
        const toolCalls = parts.filter((part) => part.type === "tool-call" && part.id === "call_1")
        strictEqual(toolCalls.length, 1)
        const toolCall = toolCalls[0]
        assert.isDefined(toolCall)
        if (toolCall?.type === "tool-call") {
          strictEqual(toolCall.name, "TestTool")
          deepStrictEqual(toolCall.params, { input: "hello" })
        }

        const toolParamsEnd = parts.find((part) => part.type === "tool-params-end" && part.id === "call_1")
        assert.isDefined(toolParamsEnd)
      }))

    it.effect("routes invalid tool call params through failureMode: return without failing the stream", () =>
      Effect.gen(function*() {
        const toolkit = Toolkit.make(ReturnModeTool)
        const handlers = toolkit.toLayer({
          ReturnModeTool: ({ input }) => Effect.succeed({ output: `processed: ${input}` })
        })

        const streamEvents = [
          {
            type: "response.created",
            sequence_number: 1,
            response: makeDefaultResponse({
              id: "resp_invalid_params",
              status: "in_progress",
              output: []
            })
          },
          {
            type: "response.output_item.added",
            sequence_number: 2,
            output_index: 0,
            item: {
              type: "function_call",
              id: "fc_1",
              call_id: "call_1",
              name: "ReturnModeTool",
              arguments: "",
              status: "in_progress"
            }
          },
          {
            type: "response.function_call_arguments.done",
            sequence_number: 3,
            output_index: 0,
            item_id: "fc_1",
            name: "ReturnModeTool",
            arguments: "{\"input\":123}"
          },
          {
            type: "response.completed",
            sequence_number: 4,
            response: makeDefaultResponse({
              id: "resp_invalid_params",
              status: "completed",
              output: []
            })
          }
        ] as unknown as ReadonlyArray<typeof Generated.ResponseStreamEvent.Type>

        const partsChunk = yield* LanguageModel.streamText({
          prompt: "Use the test tool",
          toolkit
        }).pipe(
          Stream.runCollect,
          Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini")),
          Effect.provide(makeStreamTestLayer(streamEvents)),
          Effect.provide(handlers)
        )

        const parts = globalThis.Array.from(partsChunk)
        const toolResults = parts.filter((part) => part.type === "tool-result")
        strictEqual(toolResults.length, 1)
        const toolResult = toolResults[0]
        if (toolResult?.type === "tool-result") {
          strictEqual(toolResult.isFailure, true)
          const result = toolResult.result as AiError.AiError
          strictEqual(result._tag, "AiError")
          strictEqual(result.reason._tag, "ToolParameterValidationError")
        }
        assert.isDefined(parts.find((part) => part.type === "finish"))
      }))

    it.effect("waits for the stable streamed web search action before emitting the tool call", () =>
      Effect.gen(function*() {
        const toolkit = Toolkit.make(OpenAiTool.WebSearch({}))
        const streamEvents = [
          {
            type: "response.created",
            sequence_number: 1,
            response: makeDefaultResponse({ status: "in_progress" })
          },
          {
            type: "response.output_item.added",
            sequence_number: 2,
            output_index: 0,
            item: {
              type: "web_search_call",
              id: "ws_123",
              status: "in_progress"
            }
          },
          {
            type: "response.output_item.done",
            sequence_number: 3,
            output_index: 0,
            item: makeWebSearchCall()
          }
        ] as unknown as ReadonlyArray<typeof Generated.ResponseStreamEvent.Type>

        const parts = yield* LanguageModel.streamText({
          prompt: "Search the web",
          toolkit,
          disableToolCallResolution: true
        }).pipe(
          Stream.runCollect,
          Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini")),
          Effect.provide(makeStreamTestLayer(streamEvents))
        )

        const toolCalls = parts.filter((part) => part.type === "tool-call")
        strictEqual(toolCalls.length, 1)
        const toolCall = toolCalls[0]
        assert.isDefined(toolCall)
        assert.deepStrictEqual(toolCall.params, {
          action: { type: "search", query: "Effect TypeScript" }
        })

        const toolResult = parts.find((part) => part.type === "tool-result")
        assert.isDefined(toolResult)
        assert.deepStrictEqual(toolResult.result, {
          action: { type: "search", query: "Effect TypeScript" },
          status: "completed"
        })
      }))

    for (const { tool, status } of webSearchFailures) {
      it.effect(
        `${tool.name} preserves ${status} results from output_item.done`,
        () =>
          Effect.gen(function*() {
            const parts = yield* LanguageModel.streamText({
              prompt: "Search the web",
              toolkit: Toolkit.make(tool)
            }).pipe(
              Stream.runCollect,
              Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini")),
              Effect.provide(makeStreamTestLayer([{
                type: "response.output_item.done",
                sequence_number: 1,
                output_index: 0,
                item: makeWebSearchCall({ status })
              }]))
            )

            const toolResult = parts.find((part) => part.type === "tool-result")!
            strictEqual(toolResult.isFailure, true)
            deepStrictEqual(toolResult.result, {
              action: { type: "search", query: "Effect TypeScript" },
              status
            })
          })
      )
    }

    it.effect.each(fileSearchOutcomes)(
      "OpenAiFileSearch reports $status results from output_item.done",
      ({ status, isFailure, results }) =>
        Effect.gen(function*() {
          const parts = yield* LanguageModel.streamText({
            prompt: "Search the files",
            toolkit: Toolkit.make(OpenAiTool.FileSearch({ vector_store_ids: ["vs_123"] }))
          }).pipe(
            Stream.runCollect,
            Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini")),
            Effect.provide(makeStreamTestLayer([{
              type: "response.output_item.done",
              sequence_number: 1,
              output_index: 0,
              item: makeFileSearchCall({ status, ...(results === undefined ? {} : { results }) })
            }]))
          )

          const toolResult = parts.find((part) => part.type === "tool-result")!
          strictEqual(toolResult.isFailure, isFailure)
          deepStrictEqual(toolResult.result, {
            status,
            queries: ["Effect TypeScript"],
            results: results ?? null
          })
        })
    )

    it.effect("handles reasoning summary events when reasoning state is missing", () =>
      Effect.gen(function*() {
        const streamEvents = [
          {
            type: "response.created",
            sequence_number: 1,
            response: makeDefaultResponse({
              id: "resp_reasoning_missing_state",
              status: "in_progress",
              output: []
            })
          },
          {
            type: "response.reasoning_summary_part.added",
            sequence_number: 2,
            output_index: 0,
            item_id: "rs_missing",
            summary_index: 1
          },
          {
            type: "response.reasoning_summary_text.delta",
            sequence_number: 3,
            output_index: 0,
            item_id: "rs_missing",
            summary_index: 1,
            delta: "thinking"
          },
          {
            type: "response.reasoning_summary_part.done",
            sequence_number: 4,
            output_index: 0,
            item_id: "rs_missing",
            summary_index: 1
          },
          {
            type: "response.output_item.done",
            sequence_number: 5,
            output_index: 0,
            item: makeReasoningOutput(["thinking"], { id: "rs_missing" })
          },
          {
            type: "response.output_item.done",
            sequence_number: 6,
            output_index: 1,
            item: makeReasoningOutput([], { id: "rs_done_only" })
          },
          {
            type: "response.completed",
            sequence_number: 7,
            response: makeDefaultResponse({
              id: "resp_reasoning_missing_state",
              status: "completed",
              output: []
            })
          }
        ] as unknown as ReadonlyArray<typeof Generated.ResponseStreamEvent.Type>

        const partsChunk = yield* LanguageModel.streamText({
          prompt: "reason"
        }).pipe(
          Stream.runCollect,
          Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini")),
          Effect.provide(makeStreamTestLayer(streamEvents))
        )

        const parts = globalThis.Array.from(partsChunk)
        assert.isDefined(parts.find((part) => part.type === "reasoning-start" && part.id === "rs_missing:1"))
        assert.isDefined(parts.find((part) => part.type === "reasoning-end" && part.id === "rs_missing:1"))
        assert.isDefined(parts.find((part) => part.type === "finish"))
      }))

    it.effect("uses canonical OpenAiMcp name for streamed mcp_call", () =>
      Effect.gen(function*() {
        const outputItem = makeMcpCall("CheckPackage", { packageName: "effect" }, { id: "mcp_call_1" })
        const streamEvents = [
          {
            type: "response.created",
            sequence_number: 1,
            response: makeDefaultResponse({
              id: "resp_mcp_stream",
              status: "in_progress",
              output: []
            })
          },
          {
            type: "response.output_item.done",
            output_index: 0,
            sequence_number: 2,
            item: outputItem
          }
        ] as unknown as ReadonlyArray<typeof Generated.ResponseStreamEvent.Type>

        const partsChunk = yield* LanguageModel.streamText({
          prompt: "Use MCP",
          toolkit: McpToolkit,
          disableToolCallResolution: true
        }).pipe(
          Stream.runCollect,
          Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini")),
          Effect.provide(makeStreamTestLayer(streamEvents))
        )

        const parts = globalThis.Array.from(partsChunk)
        const toolCall = parts.find((part) => part.type === "tool-call")
        assert.isDefined(toolCall)
        if (toolCall?.type === "tool-call") {
          strictEqual(toolCall.name, "OpenAiMcp")
          deepStrictEqual(toolCall.params, { packageName: "effect" })
        }

        const toolResult = parts.find((part) => part.type === "tool-result")
        assert.isDefined(toolResult)
        if (toolResult?.type === "tool-result") {
          strictEqual(toolResult.name, "OpenAiMcp")
          assertTrue(!toolResult.isFailure, "expected a successful MCP result")
          strictEqual(toolResult.result.name, "CheckPackage")
        }
      }))

    it.effect("uses canonical OpenAiMcp name for streamed mcp_approval_request", () =>
      Effect.gen(function*() {
        const outputItem = makeMcpApprovalRequest("CheckPackage", { packageName: "effect" }, { id: "approval_1" })
        const streamEvents = [
          {
            type: "response.created",
            sequence_number: 1,
            response: makeDefaultResponse({
              id: "resp_mcp_approval_stream",
              status: "in_progress",
              output: []
            })
          },
          {
            type: "response.output_item.done",
            output_index: 0,
            sequence_number: 2,
            item: outputItem
          }
        ] as unknown as ReadonlyArray<typeof Generated.ResponseStreamEvent.Type>

        const partsChunk = yield* LanguageModel.streamText({
          prompt: "Use MCP",
          toolkit: McpToolkit,
          disableToolCallResolution: true
        }).pipe(
          Stream.runCollect,
          Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini")),
          Effect.provide(makeStreamTestLayer(streamEvents))
        )

        const parts = globalThis.Array.from(partsChunk)
        const toolCall = parts.find((part) => part.type === "tool-call")
        assert.isDefined(toolCall)
        if (toolCall?.type === "tool-call") {
          strictEqual(toolCall.name, "OpenAiMcp")
          deepStrictEqual(toolCall.params, { packageName: "effect" })
        }

        const approvalRequest = parts.find((part) => part.type === "tool-approval-request")
        assert.isDefined(approvalRequest)
        if (toolCall?.type === "tool-call" && approvalRequest?.type === "tool-approval-request") {
          strictEqual(approvalRequest.toolCallId, toolCall.id)
        }
      }))

    it.effect("pre-resolves denied OpenAiMcp approvals without lookup failure", () =>
      Effect.gen(function*() {
        const result = yield* LanguageModel.generateText({
          prompt: Prompt.make([
            {
              role: "assistant",
              content: [
                Prompt.toolCallPart({
                  id: "mcp_tool_call_1",
                  name: "OpenAiMcp",
                  params: { packageName: "effect" },
                  providerExecuted: true
                }),
                Prompt.makePart("tool-approval-request", {
                  approvalId: "approval_1",
                  toolCallId: "mcp_tool_call_1"
                })
              ]
            },
            {
              role: "tool",
              content: [
                Prompt.toolApprovalResponsePart({
                  approvalId: "approval_1",
                  approved: false,
                  reason: "Denied"
                })
              ]
            },
            { role: "user", content: "Continue" }
          ]),
          toolkit: McpToolkit
        }).pipe(
          Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini")),
          Effect.provide(makeTestLayer({
            body: {
              output: [makeTextOutput("Handled denied MCP approval")]
            }
          }))
        )

        strictEqual(result.text, "Handled denied MCP approval")
      }))
  })

  describe("withConfigOverride", () => {
    it.effect("merges config overrides", () =>
      Effect.gen(function*() {
        yield* LanguageModel.generateText({ prompt: "test" }).pipe(
          OpenAiLanguageModel.withConfigOverride({ temperature: 0.5 }),
          Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini"))
        )

        const requests = yield* MockHttpClient.requests
        const body = yield* getRequestBody(requests[0])

        strictEqual(body.temperature, 0.5)
      }).pipe(Effect.provide(makeTestLayer())))

    it.effect("override takes precedence", () =>
      Effect.gen(function*() {
        yield* LanguageModel.generateText({ prompt: "test" }).pipe(
          OpenAiLanguageModel.withConfigOverride({ temperature: 0.9 }),
          Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini", { temperature: 0.5 }))
        )

        const requests = yield* MockHttpClient.requests
        const body = yield* getRequestBody(requests[0])

        strictEqual(body.temperature, 0.9)
      }).pipe(Effect.provide(makeTestLayer())))
  })

  describe("config", () => {
    it.effect("does not leak library-only fields into request body", () =>
      Effect.gen(function*() {
        yield* LanguageModel.generateText({ prompt: "test" }).pipe(
          Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini", {
            fileIdPrefixes: ["file-"],
            strictJsonSchema: false,
            useItemReferences: false,
            temperature: 0.5
          }))
        )

        const requests = yield* MockHttpClient.requests
        const body = yield* getRequestBody(requests[0])

        strictEqual(body.fileIdPrefixes, undefined)
        strictEqual(body.strictJsonSchema, undefined)
        strictEqual(body.useItemReferences, undefined)
        strictEqual(body.temperature, 0.5)
      }).pipe(Effect.provide(makeTestLayer())))
  })
})

// =============================================================================
// Test Infrastructure
// =============================================================================

class MockOpenAiResponse extends Context.Service<MockOpenAiResponse, {
  readonly status: number
  readonly body: Generated.Response
  readonly headers?: Record<string, string> | undefined
}>()("MockOpenAiResponse") {}

class MockHttpClient extends Context.Service<MockHttpClient, {
  readonly requests: Effect.Effect<ReadonlyArray<HttpClientRequest.HttpClientRequest>>
}>()("MockHttpClient") {
  static requests = Effect.service(MockHttpClient).pipe(
    Effect.flatMap((client) => client.requests)
  )
}

const encodeResponse = Schema.encodeUnknownEffect(OpenAiSchema.Response)

const makeHttpClient = Effect.gen(function*() {
  const capturedRequests = yield* Ref.make<ReadonlyArray<HttpClientRequest.HttpClientRequest>>([])
  const response = yield* MockOpenAiResponse
  const body = yield* Effect.orDie(encodeResponse(response.body))

  const httpClient = HttpClient.makeWith(
    Effect.fnUntraced(function*(requestEffect) {
      const request = yield* requestEffect
      yield* Ref.update(capturedRequests, Array.append(request))
      return HttpClientResponse.fromWeb(
        request,
        new Response(JSON.stringify(body), {
          headers: response.headers ?? {},
          status: response.status
        })
      )
    }),
    Effect.succeed as HttpClient.HttpClient.Preprocess<HttpClientError.HttpClientError, never>
  )

  return Context.make(HttpClient.HttpClient, httpClient).pipe(
    Context.add(MockHttpClient, MockHttpClient.of({ requests: Ref.get(capturedRequests) }))
  )
})

const HttpClientLayer = Layer.effectContext(makeHttpClient)

const makeRawResponseClient = (body: string, contentType: string) =>
  HttpClient.make((request) =>
    Effect.succeed(HttpClientResponse.fromWeb(
      request,
      new Response(body, { headers: { "content-type": contentType } })
    ))
  )

const makeStreamTestLayer = (events: ReadonlyArray<typeof Generated.ResponseStreamEvent.Type>) => {
  const response = HttpClientResponse.fromWeb(
    HttpClientRequest.get("https://api.openai.com/v1/responses"),
    new Response("", {
      status: 200,
      headers: { "content-type": "text/event-stream" }
    })
  )

  return Layer.succeed(
    OpenAiClient.OpenAiClient,
    OpenAiClient.OpenAiClient.of({
      client: undefined as any,
      createResponse: () => Effect.die(new Error("unexpected createResponse call")),
      createResponseStream: () => Effect.succeed([response, Stream.fromIterable(events)]),
      createEmbedding: () => Effect.die(new Error("unexpected createEmbedding call"))
    })
  )
}

const makeDefaultResponse = (
  overrides: Partial<Generated.Response> = {}
): Generated.Response => ({
  id: "resp_test123",
  object: "response",
  created_at: Math.floor(Date.now() / 1000),
  model: "gpt-4o-mini",
  status: "completed",
  output: [],
  metadata: null,
  temperature: null,
  top_p: null,
  tools: [],
  tool_choice: "auto",
  error: null,
  incomplete_details: null,
  instructions: null,
  parallel_tool_calls: false,
  ...overrides
})

const makeTestLayer = (options: {
  readonly body?: Partial<Generated.Response>
  readonly status?: number
  readonly headers?: Record<string, string>
} = {}) =>
  OpenAiClient.layer({ apiKey: Redacted.make("sk-test-key") }).pipe(
    Layer.provideMerge(HttpClientLayer),
    Layer.provide(Layer.succeed(MockOpenAiResponse, {
      body: makeDefaultResponse(options.body),
      status: options.status ?? 200,
      headers: options.headers ?? {}
    }))
  )

const getRequestBody = (request: HttpClientRequest.HttpClientRequest) =>
  Effect.gen(function*() {
    const body = request.body
    if (body._tag === "Uint8Array") {
      const text = new TextDecoder().decode(body.body)
      return JSON.parse(text)
    }
    return yield* Effect.die(new Error("Expected Uint8Array body"))
  })

const decodeToolParamsFromStream = (
  parts: ReadonlyArray<any>,
  toolCallId: string
): Record<string, unknown> => {
  const start = parts.find((part) => part.type === "tool-params-start" && part.id === toolCallId)
  const end = parts.find((part) => part.type === "tool-params-end" && part.id === toolCallId)
  assert.isDefined(start)
  assert.isDefined(end)

  const deltas = parts
    .filter((part) => part.type === "tool-params-delta" && part.id === toolCallId)
    .map((part) => part.delta)
    .join("")

  return JSON.parse(deltas) as Record<string, unknown>
}

const makeTextOutput = (
  text: string,
  overrides: Partial<Generated.OutputMessage> = {}
): Generated.OutputMessage => ({
  type: "message",
  id: "msg_123",
  role: "assistant" as const,
  status: "completed",
  content: [{ type: "output_text", text, annotations: [], logprobs: [] }],
  ...overrides
})

const makeFunctionCall = (
  name: string,
  args: Record<string, unknown>,
  overrides: Partial<Generated.FunctionToolCall> = {}
): Generated.FunctionToolCall => ({
  type: "function_call",
  id: "fc_123",
  call_id: "call_123",
  name,
  arguments: JSON.stringify(args),
  status: "completed",
  ...overrides
})

const makeWebSearchCall = (
  overrides: Partial<Generated.WebSearchToolCall> = {}
): Generated.WebSearchToolCall => ({
  type: "web_search_call",
  id: "ws_123",
  status: "completed",
  action: { type: "search", query: "Effect TypeScript" },
  ...overrides
})

const makeFileSearchCall = (
  overrides: Partial<Generated.FileSearchToolCall> = {}
): Generated.FileSearchToolCall => ({
  type: "file_search_call",
  id: "fs_123",
  status: "completed",
  queries: ["Effect TypeScript"],
  ...overrides
})

const makeMcpCall = (
  name: string,
  args: Record<string, unknown>,
  overrides: Partial<Generated.MCPToolCall> = {}
): Generated.MCPToolCall => ({
  type: "mcp_call",
  id: "mcp_call_123",
  server_label: "npm",
  name,
  arguments: JSON.stringify(args),
  output: "ok",
  status: "completed",
  ...overrides
})

const makeMcpApprovalRequest = (
  name: string,
  args: Record<string, unknown>,
  overrides: Partial<Generated.MCPApprovalRequest> & { readonly approval_request_id?: string } = {}
): Generated.MCPApprovalRequest => ({
  type: "mcp_approval_request",
  id: "approval_123",
  server_label: "npm",
  name,
  arguments: JSON.stringify(args),
  ...overrides
})

const makeReasoningOutput = (
  summaries: Array<string>,
  overrides: Partial<Generated.ReasoningItem> = {}
): Generated.ReasoningItem => ({
  type: "reasoning",
  id: "rs_123",
  summary: summaries.map((text) => ({ type: "summary_text", text })),
  encrypted_content: null,
  ...overrides
})

type TestResponseUsage = Omit<Generated.ResponseUsage, "input_tokens_details"> & {
  readonly input_tokens_details: {
    readonly cached_tokens: number
    readonly cache_write_tokens?: number
  }
}

const makeUsage = (
  overrides: Partial<TestResponseUsage> = {}
): TestResponseUsage => ({
  input_tokens: 10,
  output_tokens: 20,
  total_tokens: 30,
  input_tokens_details: { cached_tokens: 0 },
  output_tokens_details: { reasoning_tokens: 0 },
  ...overrides
})

const TestTool = Tool.make("TestTool", {
  description: "A test tool",
  parameters: Schema.Struct({ input: Schema.String }),
  success: Schema.Struct({ output: Schema.String })
})

const ReturnModeTool = Tool.make("ReturnModeTool", {
  description: "A test tool",
  failureMode: "return",
  parameters: Schema.Struct({ input: Schema.String }),
  success: Schema.Struct({ output: Schema.String }),
  failure: Schema.Struct({ error: Schema.String })
})

const TransformParamsTool = Tool.make("TransformParamsTool", {
  description: "A test tool",
  parameters: Schema.Struct({ input: Schema.FiniteFromString }),
  success: Schema.Struct({ output: Schema.Finite })
})

class ParamEncodeService extends Context.Service<ParamEncodeService, {
  readonly use: Effect.Effect<void>
}>()("ParamEncodeService") {}

const AsymmetricParam = Schema.String.pipe(
  Schema.decodeTo(Schema.String, {
    decode: SchemaGetter.passthrough(),
    encode: SchemaGetter.transformEffect<string, string, ParamEncodeService>((value) =>
      Effect.service(ParamEncodeService).pipe(
        Effect.flatMap((service) => service.use),
        Effect.as(value)
      )
    )
  })
)

const AsymmetricParamsTool = Tool.make("AsymmetricParamsTool", {
  description: "A test tool",
  parameters: Schema.Struct({ input: AsymmetricParam }),
  success: Schema.Struct({ output: Schema.String })
})

const TestToolkit = Toolkit.make(TestTool)

const storedHistoryPrompt = Prompt.make([
  { role: "user", content: "Question" },
  {
    role: "assistant",
    content: [
      Prompt.textPart({
        text: "Answer",
        options: { openai: { itemId: "msg_1" } }
      }),
      Prompt.reasoningPart({
        text: "Thinking",
        options: {
          openai: {
            itemId: "rs_1",
            encryptedContent: "encrypted-reasoning"
          }
        }
      }),
      Prompt.toolCallPart({
        id: "call_1",
        name: "TestTool",
        params: { input: "value" },
        providerExecuted: false,
        options: { openai: { itemId: "fc_1" } }
      })
    ]
  },
  {
    role: "tool",
    content: [Prompt.toolResultPart({
      id: "call_1",
      name: "TestTool",
      isFailure: false,
      result: { output: "result" },
      providerExecuted: false
    })]
  },
  { role: "user", content: "Continue" }
])

const providerExecutedCall = Prompt.toolCallPart({
  id: "ws_1",
  name: "OpenAiWebSearch",
  params: {
    action: { type: "search", query: "Effect TypeScript" }
  },
  providerExecuted: true,
  options: { openai: { itemId: "ws_1", status: "completed" } }
})

const providerExecutedResult = Prompt.toolResultPart({
  id: "ws_1",
  name: "OpenAiWebSearch",
  isFailure: false,
  result: {
    action: { type: "search", query: "Effect TypeScript" },
    status: "completed"
  },
  providerExecuted: true,
  options: { openai: { itemId: "ws_1", status: "completed" } }
})

const providerExecutedHistoryPrompt = Prompt.make([
  { role: "user", content: "Search" },
  { role: "assistant", content: [providerExecutedCall, providerExecutedResult] },
  { role: "user", content: "Continue" }
])

const McpToolkit = Toolkit.make(OpenAiTool.Mcp({
  server_label: "npm",
  server_url: "https://example.com/mcp",
  require_approval: "never"
}))

const TestToolkitLayer = TestToolkit.toLayer({
  TestTool: ({ input }) => Effect.succeed({ output: `processed: ${input}` })
})
