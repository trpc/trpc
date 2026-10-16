import { Generated, OpenRouterClient, OpenRouterLanguageModel } from "@effect/ai-openrouter"
import { assert, describe, it } from "@effect/vitest"
import { deepStrictEqual, strictEqual } from "@effect/vitest/utils"
import { Array, Context, Effect, Layer, Redacted, Ref, Schema, Stream } from "effect"
import { LanguageModel, Prompt, Tool, Toolkit } from "effect/ai"
import { HttpClient, type HttpClientError, type HttpClientRequest, HttpClientResponse } from "effect/http"

describe("OpenRouterLanguageModel", () => {
  describe("strictJsonSchema", () => {
    it.effect("omits false from requests while preserving response strictness", () =>
      Effect.gen(function*() {
        yield* LanguageModel.generateObject({
          prompt: "Give me a name",
          schema: Schema.Struct({ name: Schema.String })
        }).pipe(Effect.provide(OpenRouterLanguageModel.model("openai/gpt-4o-mini", { strictJsonSchema: false })))

        const requests = yield* MockHttpClient.requests
        const body = yield* getRequestBody(requests[0])
        strictEqual(body.response_format.json_schema.strict, false)
        assert.notProperty(body, "strictJsonSchema")
      }).pipe(Effect.provide(makeTestLayer({
        body: {
          choices: [{
            finish_reason: "stop",
            index: 0,
            message: { role: "assistant", content: JSON.stringify({ name: "Alice" }) }
          }]
        }
      }))))

    it.effect("omits true from streaming requests while preserving tool strictness", () =>
      Effect.gen(function*() {
        const tool = Tool.make("FlexibleTool", { parameters: Schema.Struct({ query: Schema.String }) })
          .annotate(Tool.Strict, false)
        yield* LanguageModel.streamText({
          prompt: "Use a tool",
          toolkit: Toolkit.make(tool),
          disableToolCallResolution: true
        }).pipe(
          Stream.runDrain,
          Effect.provide(OpenRouterLanguageModel.model("openai/gpt-4o-mini", { strictJsonSchema: true }))
        )

        const requests = yield* MockHttpClient.requests
        const body = yield* getRequestBody(requests[0])
        strictEqual(body.stream, true)
        strictEqual(body.tools[0].function.strict, false)
        assert.notProperty(body, "strictJsonSchema")
      }).pipe(Effect.provide(makeStreamTestLayer([]))))
  })

  describe("generateText", () => {
    describe("message preparation", () => {
      describe("audio file parts", () => {
        it.effect("converts audio bytes to input_audio", () =>
          Effect.gen(function*() {
            const audioData = new Uint8Array([0x49, 0x44, 0x33, 0x04]) // ID3v2 magic bytes

            yield* LanguageModel.generateText({
              prompt: Prompt.make([{
                role: "user",
                content: [
                  Prompt.filePart({
                    mediaType: "audio/mpeg",
                    data: audioData
                  })
                ]
              }])
            }).pipe(Effect.provide(OpenRouterLanguageModel.model("google/gemini-2.5-flash")))

            const requests = yield* MockHttpClient.requests
            const body = yield* getRequestBody(requests[0])

            const userMessage = body.messages.find((message: any) => message.role === "user")
            deepStrictEqual(userMessage.content, [{
              type: "input_audio",
              input_audio: {
                data: "SUQzBA==",
                format: "mp3"
              }
            }])
          }).pipe(Effect.provide(makeTestLayer())))

        it.effect("converts base64 data url audio to input_audio", () =>
          Effect.gen(function*() {
            yield* LanguageModel.generateText({
              prompt: Prompt.make([{
                role: "user",
                content: [
                  Prompt.filePart({
                    mediaType: "audio/wav",
                    data: "data:audio/wav;base64,UklGRg=="
                  })
                ]
              }])
            }).pipe(Effect.provide(OpenRouterLanguageModel.model("google/gemini-2.5-flash")))

            const requests = yield* MockHttpClient.requests
            const body = yield* getRequestBody(requests[0])

            const userMessage = body.messages.find((message: any) => message.role === "user")
            deepStrictEqual(userMessage.content, [{
              type: "input_audio",
              input_audio: {
                data: "UklGRg==",
                format: "wav"
              }
            }])
          }).pipe(Effect.provide(makeTestLayer())))

        it.effect("maps audio media types to OpenRouter audio formats", () =>
          Effect.gen(function*() {
            const mediaTypes: ReadonlyArray<readonly [mediaType: string, format: string]> = [
              ["audio/aac", "aac"],
              ["audio/x-aiff", "aiff"],
              ["audio/flac", "flac"],
              ["audio/L16", "pcm16"],
              ["audio/mp4", "m4a"],
              ["audio/mp3", "mp3"],
              ["audio/ogg", "ogg"],
              ["audio/x-wav", "wav"]
            ]

            yield* LanguageModel.generateText({
              prompt: Prompt.make([{
                role: "user",
                content: mediaTypes.map(([mediaType]) =>
                  Prompt.filePart({
                    mediaType,
                    data: new Uint8Array([0x00])
                  })
                )
              }])
            }).pipe(Effect.provide(OpenRouterLanguageModel.model("google/gemini-2.5-flash")))

            const requests = yield* MockHttpClient.requests
            const body = yield* getRequestBody(requests[0])

            const userMessage = body.messages.find((message: any) => message.role === "user")
            deepStrictEqual(
              userMessage.content.map((item: any) => item.input_audio.format),
              mediaTypes.map(([, format]) => format)
            )
          }).pipe(Effect.provide(makeTestLayer())))

        it.effect("fails on unsupported audio media types", () =>
          Effect.gen(function*() {
            const error = yield* LanguageModel.generateText({
              prompt: Prompt.make([{
                role: "user",
                content: [
                  Prompt.filePart({
                    mediaType: "audio/webm",
                    data: new Uint8Array([0x00])
                  })
                ]
              }])
            }).pipe(
              Effect.provide(OpenRouterLanguageModel.model("google/gemini-2.5-flash")),
              Effect.flip
            )

            strictEqual(error.reason._tag, "InvalidUserInputError")
            assert.include(error.message, "audio/webm")
          }).pipe(Effect.provide(makeTestLayer())))

        it.effect("fails on audio URLs", () =>
          Effect.gen(function*() {
            const error = yield* LanguageModel.generateText({
              prompt: Prompt.make([{
                role: "user",
                content: [
                  Prompt.filePart({
                    mediaType: "audio/mpeg",
                    data: new URL("https://example.com/audio.mp3")
                  })
                ]
              }])
            }).pipe(
              Effect.provide(OpenRouterLanguageModel.model("google/gemini-2.5-flash")),
              Effect.flip
            )

            strictEqual(error.reason._tag, "InvalidUserInputError")
          }).pipe(Effect.provide(makeTestLayer())))

        it.effect("converts non-audio files to file blocks", () =>
          Effect.gen(function*() {
            const pdfData = new Uint8Array([0x25, 0x50, 0x44, 0x46]) // %PDF

            yield* LanguageModel.generateText({
              prompt: Prompt.make([{
                role: "user",
                content: [
                  Prompt.filePart({
                    mediaType: "application/pdf",
                    fileName: "document.pdf",
                    data: pdfData
                  })
                ]
              }])
            }).pipe(Effect.provide(OpenRouterLanguageModel.model("google/gemini-2.5-flash")))

            const requests = yield* MockHttpClient.requests
            const body = yield* getRequestBody(requests[0])

            const userMessage = body.messages.find((message: any) => message.role === "user")
            deepStrictEqual(userMessage.content, [{
              type: "file",
              file: {
                filename: "document.pdf",
                file_data: "data:application/pdf;base64,JVBERg=="
              }
            }])
          }).pipe(Effect.provide(makeTestLayer())))
      })

      it.effect("preserves string tool results", () =>
        Effect.gen(function*() {
          yield* LanguageModel.generateText({
            prompt: Prompt.make([
              { role: "user", content: "Use the tool" },
              {
                role: "assistant",
                content: [Prompt.toolCallPart({
                  id: "call_text",
                  name: "text_tool",
                  params: {},
                  providerExecuted: false
                })]
              },
              {
                role: "tool",
                content: [Prompt.toolResultPart({
                  id: "call_text",
                  name: "text_tool",
                  result: "PLAIN_TEXT_SENTINEL\n",
                  isFailure: false,
                  providerExecuted: false
                })]
              }
            ]),
            disableToolCallResolution: true
          }).pipe(Effect.provide(OpenRouterLanguageModel.model("google/gemini-2.5-flash")))

          const requests = yield* MockHttpClient.requests
          const body = yield* getRequestBody(requests[0])
          const toolResult = body.messages.find((message: any) => message.role === "tool")

          assert.isDefined(toolResult)
          strictEqual(toolResult.content, "PLAIN_TEXT_SENTINEL\n")
        }).pipe(Effect.provide(makeTestLayer())))
    })

    describe("tool preparation", () => {
      it.effect("passes raw JSON schema for dynamic tools", () =>
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
          }).pipe(Effect.provide(OpenRouterLanguageModel.model("google/gemini-2.5-flash")))

          const requests = yield* MockHttpClient.requests
          const body = yield* getRequestBody(requests[0])

          const tool = body.tools?.find((entry: any) =>
            entry.type === "function" && entry.function.name === "DynamicTool"
          )
          assert.isDefined(tool)
          strictEqual(tool.function.description, "A dynamic tool")
          deepStrictEqual(tool.function.parameters, inputSchema)
        }).pipe(Effect.provide(makeTestLayer())))
    })

    describe("usage", () => {
      it.effect("derives text and uncached tokens when details are subsets of their totals", () =>
        Effect.gen(function*() {
          const result = yield* LanguageModel.generateText({ prompt: "Hello" }).pipe(
            Effect.provide(OpenRouterLanguageModel.model("openai/gpt-4o-mini"))
          )

          deepStrictEqual(
            result.usage.inputTokens,
            { uncached: 70, total: 100, cacheRead: 30, cacheWrite: 0 },
            "subset input usage"
          )
          deepStrictEqual(result.usage.outputTokens, { total: 50, text: 30, reasoning: 20 }, "subset output usage")
        }).pipe(Effect.provide(makeTestLayer({
          body: {
            usage: {
              prompt_tokens: 100,
              prompt_tokens_details: { cached_tokens: 30 },
              completion_tokens: 50,
              completion_tokens_details: { reasoning_tokens: 20 },
              total_tokens: 150
            }
          }
        }))))

      it.effect("preserves totals when detail counts equal their parent counts", () =>
        Effect.gen(function*() {
          const result = yield* LanguageModel.generateText({ prompt: "Hello" }).pipe(
            Effect.provide(OpenRouterLanguageModel.model("openai/gpt-4o-mini"))
          )

          deepStrictEqual(
            result.usage.inputTokens,
            { uncached: 0, total: 100, cacheRead: 100, cacheWrite: 0 },
            "input usage at equality"
          )
          deepStrictEqual(result.usage.outputTokens, { total: 20, text: 0, reasoning: 20 }, "output usage at equality")
        }).pipe(Effect.provide(makeTestLayer({
          body: {
            usage: {
              prompt_tokens: 100,
              prompt_tokens_details: { cached_tokens: 100 },
              completion_tokens: 20,
              completion_tokens_details: { reasoning_tokens: 20 },
              total_tokens: 120
            }
          }
        }))))

      it.effect("treats reasoning tokens as disjoint when they exceed completion tokens", () =>
        Effect.gen(function*() {
          const result = yield* LanguageModel.generateText({ prompt: "Hello" }).pipe(
            Effect.provide(OpenRouterLanguageModel.model("openai/gpt-4o-mini"))
          )

          deepStrictEqual(result.usage.outputTokens, { total: 30, text: 10, reasoning: 20 }, "disjoint reasoning usage")
        }).pipe(Effect.provide(makeTestLayer({
          body: {
            usage: {
              prompt_tokens: 100,
              completion_tokens: 10,
              completion_tokens_details: { reasoning_tokens: 20 },
              total_tokens: 110
            }
          }
        }))))

      it.effect("treats cached tokens as disjoint when they exceed prompt tokens", () =>
        Effect.gen(function*() {
          const result = yield* LanguageModel.generateText({ prompt: "Hello" }).pipe(
            Effect.provide(OpenRouterLanguageModel.model("openai/gpt-4o-mini"))
          )

          deepStrictEqual(
            result.usage.inputTokens,
            { uncached: 100, total: 400, cacheRead: 300, cacheWrite: 0 },
            "disjoint cached usage"
          )
        }).pipe(Effect.provide(makeTestLayer({
          body: {
            usage: {
              prompt_tokens: 100,
              prompt_tokens_details: { cached_tokens: 300 },
              completion_tokens: 10,
              total_tokens: 110
            }
          }
        }))))
    })
  })

  describe("streamText", () => {
    describe("usage", () => {
      it.effect("treats streamed reasoning tokens as disjoint when they exceed completion tokens", () =>
        Effect.gen(function*() {
          const parts = yield* LanguageModel.streamText({ prompt: "Hello" }).pipe(
            Stream.runCollect,
            Effect.provide(OpenRouterLanguageModel.model("openai/gpt-4o-mini")),
            Effect.provide(makeStreamTestLayer([{
              id: "response-1",
              object: "chat.completion.chunk",
              model: "openai/gpt-4o-mini",
              created: 1,
              choices: [],
              usage: {
                prompt_tokens: 100,
                completion_tokens: 10,
                completion_tokens_details: { reasoning_tokens: 20 },
                total_tokens: 110
              }
            }]))
          )

          const finishPart = parts.find((part) => part.type === "finish")
          deepStrictEqual(
            finishPart?.usage.outputTokens,
            { total: 30, text: 10, reasoning: 20 },
            "streamed disjoint reasoning usage"
          )
        }))
    })

    it.effect("preserves streamed citation start and end indexes", () =>
      Effect.gen(function*() {
        const parts = yield* LanguageModel.streamText({ prompt: "cite a source" }).pipe(
          Stream.runCollect,
          Effect.provide(OpenRouterLanguageModel.model("openai/gpt-4o-mini")),
          Effect.provide(makeStreamTestLayer([{
            id: "response-1",
            object: "chat.completion.chunk",
            model: "openai/gpt-4o-mini",
            created: 1,
            choices: [{
              index: 0,
              delta: {
                annotations: [{
                  type: "url_citation",
                  url_citation: {
                    url: "https://example.com/source",
                    title: "source",
                    start_index: 2,
                    end_index: 9
                  }
                }]
              }
            }]
          }]))
        )

        const source = globalThis.Array.from(parts).find((part) => part.type === "source")
        assert.isDefined(source)
        if (source?.type === "source") {
          assert.deepStrictEqual(source.metadata, {
            openrouter: { startIndex: 2, endIndex: 9 }
          })
        }
      }))

    it.effect("uses lowercase openrouter reasoning-end metadata", () =>
      Effect.gen(function*() {
        const reasoningDetails = [{
          type: "reasoning.text",
          text: "thinking",
          signature: "signature-final",
          format: "unknown"
        }] as const
        const parts = yield* LanguageModel.streamText({ prompt: "reason then answer" }).pipe(
          Stream.runCollect,
          Effect.provide(OpenRouterLanguageModel.model("openai/gpt-4o-mini")),
          Effect.provide(makeStreamTestLayer([
            {
              id: "response-1",
              object: "chat.completion.chunk",
              model: "openai/gpt-4o-mini",
              created: 1,
              choices: [{ index: 0, delta: { reasoning_details: reasoningDetails } }]
            },
            {
              id: "response-1",
              object: "chat.completion.chunk",
              model: "openai/gpt-4o-mini",
              created: 1,
              choices: [{ index: 0, finish_reason: "stop", delta: { content: "answer" } }]
            }
          ]))
        )

        const reasoningEnd = parts.find((part) => part.type === "reasoning-end")
        deepStrictEqual(reasoningEnd?.metadata, { openrouter: { reasoningDetails } })
      }))

    it.effect("emits incremental tool parameter fragments", () =>
      Effect.gen(function*() {
        const ProbeTool = Tool.make("ProbeTool", {
          parameters: Schema.Struct({ a: Schema.Number }),
          success: Schema.String
        })
        const toolkit = Toolkit.make(ProbeTool)
        const parts = yield* LanguageModel.streamText({
          prompt: "call the tool",
          toolkit,
          disableToolCallResolution: true
        }).pipe(
          Stream.runCollect,
          Effect.provide(OpenRouterLanguageModel.model("openai/gpt-4o-mini")),
          Effect.provide(toolkit.toLayer({ ProbeTool: () => Effect.succeed("ok") })),
          Effect.provide(makeStreamTestLayer([
            {
              id: "response-1",
              object: "chat.completion.chunk",
              model: "openai/gpt-4o-mini",
              created: 1,
              choices: [{
                index: 0,
                delta: {
                  tool_calls: [{
                    index: 0,
                    id: "call-1",
                    type: "function",
                    function: { name: "ProbeTool", arguments: "{\"a\":" }
                  }]
                }
              }]
            },
            {
              id: "response-1",
              object: "chat.completion.chunk",
              model: "openai/gpt-4o-mini",
              created: 1,
              choices: [{
                index: 0,
                delta: { tool_calls: [{ index: 0 }] }
              }]
            },
            {
              id: "response-1",
              object: "chat.completion.chunk",
              model: "openai/gpt-4o-mini",
              created: 1,
              choices: [{
                index: 0,
                finish_reason: "tool_calls",
                delta: { tool_calls: [{ index: 0, function: { arguments: "1}" } }] }
              }]
            }
          ]))
        )

        deepStrictEqual(
          globalThis.Array.from(parts)
            .filter((part) => part.type === "tool-params-delta")
            .map((part) => part.delta),
          ["{\"a\":", "1}"]
        )
      }))
  })
})

// =============================================================================
// Test Infrastructure
// =============================================================================

class MockOpenRouterResponse extends Context.Service<MockOpenRouterResponse, {
  readonly status: number
  readonly body: typeof Generated.SendChatCompletionRequest200.Type
  readonly headers?: Record<string, string> | undefined
}>()("MockOpenRouterResponse") {}

class MockHttpClient extends Context.Service<MockHttpClient, {
  readonly requests: Effect.Effect<ReadonlyArray<HttpClientRequest.HttpClientRequest>>
}>()("MockHttpClient") {
  static requests = Effect.service(MockHttpClient).pipe(
    Effect.flatMap((client) => client.requests)
  )
}

const encodeResponse = Schema.encodeEffect(Generated.SendChatCompletionRequest200)

const makeHttpClient = Effect.gen(function*() {
  const capturedRequests = yield* Ref.make<ReadonlyArray<HttpClientRequest.HttpClientRequest>>([])
  const response = yield* MockOpenRouterResponse
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

const makeDefaultResponse = (
  overrides: Partial<typeof Generated.SendChatCompletionRequest200.Type> = {}
): typeof Generated.SendChatCompletionRequest200.Type => ({
  id: "gen-test123",
  choices: [{
    finish_reason: "stop",
    index: 0,
    message: {
      role: "assistant",
      content: "Hello!"
    }
  }],
  created: 1234567890,
  model: "google/gemini-2.5-flash",
  object: "chat.completion",
  system_fingerprint: null,
  ...overrides
})

const makeTestLayer = (options: {
  readonly body?: Partial<typeof Generated.SendChatCompletionRequest200.Type>
  readonly status?: number
  readonly headers?: Record<string, string>
} = {}) =>
  OpenRouterClient.layer({ apiKey: Redacted.make("sk-test-key") }).pipe(
    Layer.provideMerge(HttpClientLayer),
    Layer.provide(Layer.succeed(MockOpenRouterResponse, {
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

const makeStreamTestLayer = (events: ReadonlyArray<typeof Generated.ChatStreamChunk.Encoded>) => {
  const body = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("") + "data: [DONE]\n\n"
  const httpClientLayer = Layer.effectContext(Effect.gen(function*() {
    const capturedRequests = yield* Ref.make<ReadonlyArray<HttpClientRequest.HttpClientRequest>>([])
    const httpClient = HttpClient.makeWith(
      Effect.fnUntraced(function*(requestEffect) {
        const request = yield* requestEffect
        yield* Ref.update(capturedRequests, Array.append(request))
        return HttpClientResponse.fromWeb(
          request,
          new Response(body, {
            status: 200,
            headers: { "content-type": "text/event-stream" }
          })
        )
      }),
      Effect.succeed as HttpClient.HttpClient.Preprocess<HttpClientError.HttpClientError, never>
    )
    return Context.make(HttpClient.HttpClient, httpClient).pipe(
      Context.add(MockHttpClient, MockHttpClient.of({ requests: Ref.get(capturedRequests) }))
    )
  }))
  return OpenRouterClient.layer({ apiKey: Redacted.make("sk-test-key") }).pipe(
    Layer.provideMerge(httpClientLayer)
  )
}
