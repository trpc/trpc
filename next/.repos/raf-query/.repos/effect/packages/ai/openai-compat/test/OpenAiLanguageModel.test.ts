import { OpenAiClient, OpenAiLanguageModel } from "@effect/ai-openai-compat"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Layer, Redacted, Ref, Schema, Stream } from "effect"
import { type AiError, LanguageModel, Prompt, Tool, Toolkit } from "effect/ai"
import { HttpClient, type HttpClientError, type HttpClientRequest, HttpClientResponse } from "effect/http"

describe("OpenAiLanguageModel", () => {
  describe("generateText", () => {
    it.effect("sends model in request and decodes text output", () =>
      Effect.gen(function*() {
        let capturedRequest: HttpClientRequest.HttpClientRequest | undefined

        const layer = OpenAiClient.layer({ apiKey: Redacted.make("sk-test-key") }).pipe(
          Layer.provide(Layer.succeed(
            HttpClient.HttpClient,
            makeHttpClient((request) => {
              capturedRequest = request
              return Effect.succeed(jsonResponse(
                request,
                makeChatCompletion({
                  choices: [{
                    index: 0,
                    finish_reason: "stop",
                    message: {
                      role: "assistant",
                      content: "Hello, compat!"
                    }
                  }]
                })
              ))
            })
          ))
        )

        const result = yield* LanguageModel.generateText({ prompt: "hello" }).pipe(
          Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini")),
          Effect.provide(layer)
        )

        assert.strictEqual(result.text, "Hello, compat!")
        assert.isDefined(capturedRequest)
        if (capturedRequest === undefined) {
          return
        }

        const requestBody = yield* getRequestBody(capturedRequest)
        assert.strictEqual(requestBody.model, "gpt-4o-mini")
        assert.strictEqual(requestBody.messages[0]?.content, "hello")
      }))

    it.effect("routes invalid tool call params through failureMode: return without failing the effect", () =>
      Effect.gen(function*() {
        const layer = OpenAiClient.layer({ apiKey: Redacted.make("sk-test-key") }).pipe(
          Layer.provide(Layer.succeed(
            HttpClient.HttpClient,
            makeHttpClient((request) =>
              Effect.succeed(jsonResponse(
                request,
                makeChatCompletion({
                  choices: [{
                    index: 0,
                    finish_reason: "tool_calls",
                    message: {
                      role: "assistant",
                      content: null,
                      tool_calls: [{
                        id: "call_1",
                        type: "function",
                        function: {
                          name: "ReturnModeTool",
                          arguments: JSON.stringify({ input: 123 })
                        }
                      }]
                    }
                  }]
                })
              ))
            )
          ))
        )

        const ReturnModeTool = Tool.make("ReturnModeTool", {
          description: "A test tool",
          failureMode: "return",
          parameters: Schema.Struct({ input: Schema.String }),
          success: Schema.Struct({ output: Schema.String }),
          failure: Schema.Struct({ error: Schema.String })
        })

        const toolkit = Toolkit.make(ReturnModeTool)
        const toolkitLayer = toolkit.toLayer({
          ReturnModeTool: ({ input }) => Effect.succeed({ output: `processed: ${input}` })
        })

        const result = yield* LanguageModel.generateText({
          prompt: "use the tool",
          toolkit
        }).pipe(
          Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini")),
          Effect.provide(toolkitLayer),
          Effect.provide(layer)
        )

        assert.strictEqual(result.toolResults.length, 1)
        const toolResult = result.toolResults[0]!
        assert.strictEqual(toolResult.isFailure, true)
        const failure = toolResult.result as AiError.AiError
        assert.strictEqual(failure._tag, "AiError")
        assert.strictEqual(failure.reason._tag, "ToolParameterValidationError")
      }))

    it.effect("forwards reasoning config to chat completions request", () =>
      Effect.gen(function*() {
        let capturedRequest: HttpClientRequest.HttpClientRequest | undefined

        const layer = OpenAiClient.layer({ apiKey: Redacted.make("sk-test-key") }).pipe(
          Layer.provide(Layer.succeed(
            HttpClient.HttpClient,
            makeHttpClient((request) => {
              capturedRequest = request
              return Effect.succeed(jsonResponse(
                request,
                makeChatCompletion({
                  choices: [{
                    index: 0,
                    finish_reason: "stop",
                    message: {
                      role: "assistant",
                      content: "Done"
                    }
                  }]
                })
              ))
            })
          ))
        )

        yield* LanguageModel.generateText({ prompt: "hello" }).pipe(
          Effect.provide(OpenAiLanguageModel.model("gpt-5", {
            reasoning: {
              effort: "medium",
              summary: "auto"
            }
          })),
          Effect.provide(layer)
        )

        assert.isDefined(capturedRequest)
        if (capturedRequest === undefined) {
          return
        }

        const requestBody = yield* getRequestBody(capturedRequest)
        assert.deepStrictEqual(requestBody.reasoning, {
          effort: "medium",
          summary: "auto"
        })
      }))

    it.effect("forwards custom model config properties to chat completions request", () =>
      Effect.gen(function*() {
        let capturedRequest: HttpClientRequest.HttpClientRequest | undefined

        const layer = OpenAiClient.layer({ apiKey: Redacted.make("sk-test-key") }).pipe(
          Layer.provide(Layer.succeed(
            HttpClient.HttpClient,
            makeHttpClient((request) => {
              capturedRequest = request
              return Effect.succeed(jsonResponse(
                request,
                makeChatCompletion({
                  choices: [{
                    index: 0,
                    finish_reason: "stop",
                    message: {
                      role: "assistant",
                      content: "Done"
                    }
                  }]
                })
              ))
            })
          ))
        )

        yield* LanguageModel.generateText({ prompt: "hello" }).pipe(
          Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini", {
            vendor_setting: {
              mode: "strict"
            }
          })),
          Effect.provide(layer)
        )

        assert.isDefined(capturedRequest)
        if (capturedRequest === undefined) {
          return
        }

        const requestBody = yield* getRequestBody(capturedRequest)
        assert.deepStrictEqual(requestBody.vendor_setting, {
          mode: "strict"
        })
      }))

    it.effect("preserves URL and base64 images in multimodal content order", () =>
      Effect.gen(function*() {
        const base64 = "iVBORw0KGgo="
        let capturedRequest: HttpClientRequest.HttpClientRequest | undefined

        const layer = OpenAiClient.layer({ apiKey: Redacted.make("sk-test-key") }).pipe(
          Layer.provide(Layer.succeed(
            HttpClient.HttpClient,
            makeHttpClient((request) => {
              capturedRequest = request
              return Effect.succeed(jsonResponse(
                request,
                makeChatCompletion({
                  choices: [{
                    index: 0,
                    finish_reason: "stop",
                    message: {
                      role: "assistant",
                      content: "done"
                    }
                  }]
                })
              ))
            })
          ))
        )

        yield* LanguageModel.generateText({
          prompt: Prompt.make([{
            role: "user",
            content: [
              Prompt.textPart({ text: "first text" }),
              Prompt.filePart({
                mediaType: "image/png",
                data: new URL("https://example.com/image.png")
              }),
              Prompt.filePart({ mediaType: "image/png", data: "https://example.com/string-image.png" }),
              Prompt.filePart({ mediaType: "image/png", data: base64 }),
              Prompt.textPart({ text: "second text" })
            ]
          }])
        }).pipe(
          Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini")),
          Effect.provide(layer)
        )

        assert.isDefined(capturedRequest)
        if (capturedRequest === undefined) {
          return
        }

        const requestBody = yield* getRequestBody(capturedRequest)
        const content = requestBody.messages[0]?.content
        assert.isTrue(Array.isArray(content))
        assert.deepStrictEqual(content, [
          {
            type: "text",
            text: "first text"
          },
          {
            type: "image_url",
            image_url: {
              url: "https://example.com/image.png",
              detail: "auto"
            }
          },
          {
            type: "image_url",
            image_url: {
              url: "https://example.com/string-image.png",
              detail: "auto"
            }
          },
          {
            type: "image_url",
            image_url: {
              url: `data:image/png;base64,${base64}`,
              detail: "auto"
            }
          },
          {
            type: "text",
            text: "second text"
          }
        ])
      }))

    it.effect("normalizes empty assistant message content to an empty string", () =>
      Effect.gen(function*() {
        let capturedRequest: HttpClientRequest.HttpClientRequest | undefined

        const layer = OpenAiClient.layer({ apiKey: Redacted.make("sk-test-key") }).pipe(
          Layer.provide(Layer.succeed(
            HttpClient.HttpClient,
            makeHttpClient((request) => {
              capturedRequest = request
              return Effect.succeed(jsonResponse(
                request,
                makeChatCompletion({
                  choices: [{
                    index: 0,
                    finish_reason: "stop",
                    message: {
                      role: "assistant",
                      content: "done"
                    }
                  }]
                })
              ))
            })
          ))
        )

        yield* LanguageModel.generateText({
          prompt: Prompt.make([
            { role: "user", content: "hello" },
            {
              role: "assistant",
              content: [Prompt.textPart({ text: "" })]
            },
            { role: "user", content: "continue" }
          ])
        }).pipe(
          Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini")),
          Effect.provide(layer)
        )

        assert.isDefined(capturedRequest)
        if (capturedRequest === undefined) {
          return
        }

        const requestBody = yield* getRequestBody(capturedRequest)
        const assistantMessage = requestBody.messages.find((message: any) => message.role === "assistant")
        assert.isDefined(assistantMessage)
        assert.strictEqual(assistantMessage.content, "")
        assert.isUndefined(assistantMessage.tool_calls)
      }))

    it.effect("maps function_call output to tool-call part and sends function tool schema", () =>
      Effect.gen(function*() {
        let capturedRequest: HttpClientRequest.HttpClientRequest | undefined

        const layer = OpenAiClient.layer({ apiKey: Redacted.make("sk-test-key") }).pipe(
          Layer.provide(Layer.succeed(
            HttpClient.HttpClient,
            makeHttpClient((request) => {
              capturedRequest = request
              return Effect.succeed(jsonResponse(
                request,
                makeChatCompletion({
                  choices: [{
                    index: 0,
                    finish_reason: "tool_calls",
                    message: {
                      role: "assistant",
                      content: null,
                      tool_calls: [{
                        id: "call_1",
                        type: "function",
                        function: {
                          name: "TestTool",
                          arguments: JSON.stringify({ input: "hello" })
                        }
                      }]
                    }
                  }]
                })
              ))
            })
          ))
        )

        const result = yield* LanguageModel.generateText({
          prompt: "use the tool",
          toolkit: TestToolkit,
          disableToolCallResolution: true
        }).pipe(
          Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini")),
          Effect.provide(TestToolkitLayer),
          Effect.provide(layer)
        )

        const toolCall = result.content.find((part) => part.type === "tool-call")
        assert.isDefined(toolCall)
        if (toolCall?.type !== "tool-call") {
          return
        }

        assert.strictEqual(toolCall.name, "TestTool")
        assert.deepStrictEqual(toolCall.params, { input: "hello" })

        assert.isDefined(capturedRequest)
        if (capturedRequest === undefined) {
          return
        }

        const requestBody = yield* getRequestBody(capturedRequest)
        const functionTool = requestBody.tools.find((tool: any) => tool.type === "function")
        assert.isDefined(functionTool)
        assert.strictEqual(functionTool.function.name, "TestTool")
        assert.strictEqual(functionTool.function.strict, true)
      }))

    it.effect("decodes tool call params with the OpenAI codec", () =>
      Effect.gen(function*() {
        const layer = OpenAiClient.layer({ apiKey: Redacted.make("sk-test-key") }).pipe(
          Layer.provide(Layer.succeed(
            HttpClient.HttpClient,
            makeHttpClient((request) =>
              Effect.succeed(jsonResponse(
                request,
                makeChatCompletion({
                  choices: [{
                    index: 0,
                    finish_reason: "tool_calls",
                    message: {
                      role: "assistant",
                      content: null,
                      tool_calls: [{
                        id: "call_record_1",
                        type: "function",
                        function: {
                          name: "RecordTool",
                          arguments: JSON.stringify({ env: [{ 0: "PATH", 1: "/usr/bin" }] })
                        }
                      }]
                    }
                  }]
                })
              ))
            )
          ))
        )

        const result = yield* LanguageModel.generateText({
          prompt: "read the environment",
          toolkit: RecordToolkit,
          disableToolCallResolution: true
        }).pipe(
          Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini")),
          Effect.provide(RecordToolkitLayer),
          Effect.provide(layer)
        )

        const toolCall = result.content.find((part) => part.type === "tool-call")
        assert.isDefined(toolCall)
        if (toolCall?.type !== "tool-call") {
          return
        }
        assert.deepStrictEqual(toolCall.params, { env: { PATH: "/usr/bin" } })
      }))

    it.effect("preserves raw JSON Schema dynamic tool call params", () =>
      Effect.gen(function*() {
        const params = { query: "effect" }
        const client = makeHttpClient((request) =>
          Effect.succeed(jsonResponse(
            request,
            makeChatCompletion({
              choices: [{
                index: 0,
                finish_reason: "tool_calls",
                message: {
                  role: "assistant",
                  content: null,
                  tool_calls: [{
                    id: "call_dynamic_1",
                    type: "function",
                    function: { name: "DynamicTool", arguments: JSON.stringify(params) }
                  }]
                }
              }]
            })
          ))
        )
        const DynamicTool = Tool.dynamic("DynamicTool", {
          parameters: {
            type: "object",
            properties: { query: { type: "string" } },
            required: ["query"],
            additionalProperties: false
          } as const
        })
        const result = yield* LanguageModel.generateText({
          prompt: "use the dynamic tool",
          toolkit: Toolkit.make(DynamicTool),
          disableToolCallResolution: true
        }).pipe(
          Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini")),
          Effect.provide(OpenAiClient.layer({ apiKey: Redacted.make("sk-test-key") })),
          Effect.provideService(HttpClient.HttpClient, client)
        )

        assert.deepStrictEqual(result.toolCalls[0]?.params, params)
      }))

    it.effect("decodes Effect Schema dynamic tool call params with the OpenAI codec", () =>
      Effect.gen(function*() {
        const DynamicTool = Tool.dynamic("DynamicTool", {
          parameters: Schema.Struct({
            env: Schema.Record(Schema.String, Schema.String)
          })
        })
        const client = makeHttpClient((request) =>
          Effect.succeed(jsonResponse(
            request,
            makeChatCompletion({
              choices: [{
                index: 0,
                finish_reason: "tool_calls",
                message: {
                  role: "assistant",
                  content: null,
                  tool_calls: [{
                    id: "call_dynamic_1",
                    type: "function",
                    function: {
                      name: "DynamicTool",
                      arguments: JSON.stringify({ env: [{ 0: "PATH", 1: "/usr/bin" }] })
                    }
                  }]
                }
              }]
            })
          ))
        )
        const result = yield* LanguageModel.generateText({
          prompt: "use the dynamic tool",
          toolkit: Toolkit.make(DynamicTool),
          disableToolCallResolution: true
        }).pipe(
          Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini")),
          Effect.provide(OpenAiClient.layer({ apiKey: Redacted.make("sk-test-key") })),
          Effect.provideService(HttpClient.HttpClient, client)
        )

        assert.deepStrictEqual(result.toolCalls[0]?.params, { env: { PATH: "/usr/bin" } })
      }))

    it.effect("groups parallel tool calls into one assistant message", () =>
      Effect.gen(function*() {
        let capturedRequest: HttpClientRequest.HttpClientRequest | undefined

        const layer = OpenAiClient.layer({ apiKey: Redacted.make("sk-test-key") }).pipe(
          Layer.provide(Layer.succeed(
            HttpClient.HttpClient,
            makeHttpClient((request) => {
              capturedRequest = request
              return Effect.succeed(jsonResponse(request, makeChatCompletion()))
            })
          ))
        )

        yield* LanguageModel.generateText({
          prompt: Prompt.make([
            { role: "user", content: "use both tools" },
            {
              role: "assistant",
              content: [
                Prompt.toolCallPart({
                  id: "call_1",
                  name: "TestTool",
                  params: { input: "first" },
                  providerExecuted: false
                }),
                Prompt.toolCallPart({
                  id: "call_2",
                  name: "TestTool",
                  params: { input: "second" },
                  providerExecuted: false
                })
              ]
            },
            {
              role: "tool",
              content: [
                Prompt.toolResultPart({
                  id: "call_1",
                  name: "TestTool",
                  isFailure: false,
                  result: { output: "first" },
                  providerExecuted: false
                }),
                Prompt.toolResultPart({
                  id: "call_2",
                  name: "TestTool",
                  isFailure: false,
                  result: { output: "second" },
                  providerExecuted: false
                })
              ]
            }
          ]),
          toolkit: TestToolkit
        }).pipe(
          Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini")),
          Effect.provide(TestToolkitLayer),
          Effect.provide(layer)
        )

        assert.isDefined(capturedRequest)
        if (capturedRequest === undefined) {
          return
        }

        const requestBody = yield* getRequestBody(capturedRequest)
        assert.deepStrictEqual(requestBody.messages, [
          { role: "user", content: "use both tools" },
          {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: "call_1",
                type: "function",
                function: { name: "TestTool", arguments: JSON.stringify({ input: "first" }) }
              },
              {
                id: "call_2",
                type: "function",
                function: { name: "TestTool", arguments: JSON.stringify({ input: "second" }) }
              }
            ]
          },
          { role: "tool", tool_call_id: "call_1", content: JSON.stringify({ output: "first" }) },
          { role: "tool", tool_call_id: "call_2", content: JSON.stringify({ output: "second" }) }
        ])
      }))

    it.effect("converts dynamic tools to function type", () =>
      Effect.gen(function*() {
        let capturedRequest: HttpClientRequest.HttpClientRequest | undefined

        const layer = OpenAiClient.layer({ apiKey: Redacted.make("sk-test-key") }).pipe(
          Layer.provide(Layer.succeed(
            HttpClient.HttpClient,
            makeHttpClient((request) => {
              capturedRequest = request
              return Effect.succeed(jsonResponse(
                request,
                makeChatCompletion({
                  choices: [{
                    index: 0,
                    finish_reason: "stop",
                    message: {
                      role: "assistant",
                      content: "Done"
                    }
                  }]
                })
              ))
            })
          ))
        )

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
          prompt: "use dynamic tool",
          toolkit: Toolkit.make(DynamicTool),
          disableToolCallResolution: true
        }).pipe(
          Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini")),
          Effect.provide(layer)
        )

        assert.isDefined(capturedRequest)
        if (capturedRequest === undefined) {
          return
        }

        const requestBody = yield* getRequestBody(capturedRequest)
        const functionTool = requestBody.tools?.find((tool: any) =>
          tool.type === "function" && tool.function?.name === "DynamicTool"
        )
        assert.isDefined(functionTool)
        assert.strictEqual(functionTool.function.description, "A dynamic tool")
        assert.deepStrictEqual(functionTool.function.parameters, inputSchema)
      }))

    it.effect("maps provider apply_patch function call back to custom provider-defined tool", () =>
      Effect.gen(function*() {
        let capturedRequest: HttpClientRequest.HttpClientRequest | undefined

        const layer = OpenAiClient.layer({ apiKey: Redacted.make("sk-test-key") }).pipe(
          Layer.provide(Layer.succeed(
            HttpClient.HttpClient,
            makeHttpClient((request) => {
              capturedRequest = request
              return Effect.succeed(jsonResponse(
                request,
                makeChatCompletion({
                  choices: [{
                    index: 0,
                    finish_reason: "tool_calls",
                    message: {
                      role: "assistant",
                      content: null,
                      tool_calls: [{
                        id: "call_1",
                        type: "function",
                        function: {
                          name: "apply_patch",
                          arguments: JSON.stringify({
                            call_id: "call_1",
                            operation: {
                              type: "delete_file",
                              path: "src/obsolete.ts"
                            }
                          })
                        }
                      }]
                    }
                  }]
                })
              ))
            })
          ))
        )

        const toolkit = Toolkit.make(CompatApplyPatchTool({}))
        const toolkitLayer = toolkit.toLayer({
          CompatApplyPatch: () =>
            Effect.succeed({
              status: "completed",
              output: "deleted"
            })
        })

        const result = yield* LanguageModel.generateText({
          prompt: "delete src/obsolete.ts",
          toolkit,
          toolChoice: { tool: "CompatApplyPatch" },
          disableToolCallResolution: true
        }).pipe(
          Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini")),
          Effect.provide(toolkitLayer),
          Effect.provide(layer)
        )

        const toolCall = result.content.find((part) => part.type === "tool-call")
        assert.isDefined(toolCall)
        if (toolCall?.type !== "tool-call") {
          return
        }

        assert.strictEqual(toolCall.name, "CompatApplyPatch")
        assert.deepStrictEqual(toolCall.params, {
          call_id: "call_1",
          operation: {
            type: "delete_file",
            path: "src/obsolete.ts"
          }
        })

        assert.isDefined(capturedRequest)
        if (capturedRequest === undefined) {
          return
        }

        const requestBody = yield* getRequestBody(capturedRequest)

        const functionTool = requestBody.tools.find((tool: any) => tool.type === "function")
        assert.isDefined(functionTool)
        assert.strictEqual(functionTool.function.name, "apply_patch")
        assert.deepStrictEqual(requestBody.tool_choice, {
          type: "function",
          function: {
            name: "apply_patch"
          }
        })
      }))

    it.effect("decodes usage when token detail fields are absent", () =>
      Effect.gen(function*() {
        const layer = OpenAiClient.layer({ apiKey: Redacted.make("sk-test-key") }).pipe(
          Layer.provide(Layer.succeed(
            HttpClient.HttpClient,
            makeHttpClient((request) =>
              Effect.succeed(jsonResponse(
                request,
                makeChatCompletion({
                  choices: [{
                    index: 0,
                    finish_reason: "stop",
                    message: {
                      role: "assistant",
                      content: "Hello"
                    }
                  }],
                  usage: {
                    prompt_tokens: 4,
                    completion_tokens: 5,
                    total_tokens: 9,
                    provider_future_field: true
                  }
                })
              ))
            )
          ))
        )

        const result = yield* LanguageModel.generateText({ prompt: "hello" }).pipe(
          Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini")),
          Effect.provide(layer)
        )

        const finish = result.content.find((part) => part.type === "finish")
        assert.isDefined(finish)
        if (finish?.type !== "finish") {
          return
        }

        assert.deepStrictEqual(finish.usage.inputTokens, {
          uncached: 4,
          total: 4,
          cacheRead: 0,
          cacheWrite: undefined
        })
        assert.deepStrictEqual(finish.usage.outputTokens, {
          total: 5,
          text: 5,
          reasoning: 0
        })
      }))

    it.effect("surfaces reasoning from non-streaming responses", () =>
      Effect.gen(function*() {
        const layer = OpenAiClient.layer({ apiKey: Redacted.make("sk-test-key") }).pipe(
          Layer.provide(Layer.succeed(
            HttpClient.HttpClient,
            makeHttpClient((request) =>
              Effect.succeed(jsonResponse(
                request,
                makeChatCompletion({
                  choices: [{
                    index: 0,
                    finish_reason: "stop",
                    message: {
                      role: "assistant",
                      reasoning: "I should greet the user.",
                      content: "Hello!"
                    }
                  }]
                })
              ))
            )
          ))
        )

        const result = yield* LanguageModel.generateText({ prompt: "hello" }).pipe(
          Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini")),
          Effect.provide(layer)
        )

        const reasoning = result.content.find((part) => part.type === "reasoning")
        assert.isDefined(reasoning)
        if (reasoning?.type !== "reasoning") {
          return
        }
        assert.strictEqual(reasoning.text, "I should greet the user.")
        assert.strictEqual(result.text, "Hello!")
      }))

    it.effect("surfaces reasoning_content from non-streaming responses", () =>
      Effect.gen(function*() {
        const layer = OpenAiClient.layer({ apiKey: Redacted.make("sk-test-key") }).pipe(
          Layer.provide(Layer.succeed(
            HttpClient.HttpClient,
            makeHttpClient((request) =>
              Effect.succeed(jsonResponse(
                request,
                makeChatCompletion({
                  choices: [{
                    index: 0,
                    finish_reason: "stop",
                    message: {
                      role: "assistant",
                      reasoning_content: "I should greet the user.",
                      content: "Hello!"
                    }
                  }]
                })
              ))
            )
          ))
        )

        const result = yield* LanguageModel.generateText({ prompt: "hello" }).pipe(
          Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini")),
          Effect.provide(layer)
        )

        const reasoning = result.content.find((part) => part.type === "reasoning")
        assert.isDefined(reasoning)
        if (reasoning?.type !== "reasoning") {
          return
        }
        assert.strictEqual(reasoning.text, "I should greet the user.")
        assert.strictEqual(result.text, "Hello!")
      }))
  })

  describe("generateObject", () => {
    it.effect("uses json_schema format for structured output", () =>
      Effect.gen(function*() {
        let capturedRequest: HttpClientRequest.HttpClientRequest | undefined

        const layer = OpenAiClient.layer({ apiKey: Redacted.make("sk-test-key") }).pipe(
          Layer.provide(Layer.succeed(
            HttpClient.HttpClient,
            makeHttpClient((request) => {
              capturedRequest = request
              return Effect.succeed(jsonResponse(
                request,
                makeChatCompletion({
                  choices: [{
                    index: 0,
                    finish_reason: "stop",
                    message: {
                      role: "assistant",
                      content: JSON.stringify({ name: "Ada", age: 37 })
                    }
                  }]
                })
              ))
            })
          ))
        )

        const person = yield* LanguageModel.generateObject({
          prompt: "Return a person",
          schema: Schema.Struct({
            name: Schema.String,
            age: Schema.Number
          })
        }).pipe(
          Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini")),
          Effect.provide(layer)
        )

        assert.strictEqual(person.value.name, "Ada")
        assert.strictEqual(person.value.age, 37)

        assert.isDefined(capturedRequest)
        if (capturedRequest === undefined) {
          return
        }

        const requestBody = yield* getRequestBody(capturedRequest)
        assert.strictEqual(requestBody.response_format.type, "json_schema")
        assert.strictEqual(requestBody.response_format.json_schema.strict, true)
      }))

    it.effect("uses OpenAI codec transformer for optional structured fields", () =>
      Effect.gen(function*() {
        let capturedRequest: HttpClientRequest.HttpClientRequest | undefined

        const layer = OpenAiClient.layer({ apiKey: Redacted.make("sk-test-key") }).pipe(
          Layer.provide(Layer.succeed(
            HttpClient.HttpClient,
            makeHttpClient((request) => {
              capturedRequest = request
              return Effect.succeed(jsonResponse(
                request,
                makeChatCompletion({
                  choices: [{
                    index: 0,
                    finish_reason: "stop",
                    message: {
                      role: "assistant",
                      content: JSON.stringify({ name: "Ada", nickname: null })
                    }
                  }]
                })
              ))
            })
          ))
        )

        const person = yield* LanguageModel.generateObject({
          prompt: "Return a person",
          schema: Schema.Struct({
            name: Schema.String,
            nickname: Schema.optionalKey(Schema.String)
          })
        }).pipe(
          Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini")),
          Effect.provide(layer)
        )

        assert.strictEqual(person.value.name, "Ada")
        assert.isUndefined(person.value.nickname)

        assert.isDefined(capturedRequest)
        if (capturedRequest === undefined) {
          return
        }

        const requestBody = yield* getRequestBody(capturedRequest)
        assert.deepStrictEqual(requestBody.response_format.json_schema.schema.required, ["name", "nickname"])
        assert.deepStrictEqual(requestBody.response_format.json_schema.schema.properties.nickname, {
          anyOf: [{ type: "string" }, { type: "null" }]
        })
      }))
  })

  describe("streamText", () => {
    it.effect("handles chat completion stream chunks", () =>
      Effect.gen(function*() {
        const layer = OpenAiClient.layer({ apiKey: Redacted.make("sk-test-key") }).pipe(
          Layer.provide(Layer.succeed(
            HttpClient.HttpClient,
            makeHttpClient((request) =>
              Effect.succeed(sseResponse(request, [
                {
                  id: "chatcmpl_test123",
                  object: "chat.completion.chunk",
                  model: "gpt-4o-mini",
                  created: 1,
                  choices: [{
                    index: 0,
                    delta: {},
                    finish_reason: "stop"
                  }]
                },
                "[DONE]"
              ]))
            )
          ))
        )

        const partsChunk = yield* LanguageModel.streamText({ prompt: "test" }).pipe(
          Stream.runCollect,
          Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini")),
          Effect.provide(layer)
        )

        const parts = Array.from(partsChunk)

        assert.isTrue(parts.some((part) => part.type === "response-metadata"))

        const finish = parts.find((part) => part.type === "finish")
        assert.isDefined(finish)
        if (finish?.type === "finish") {
          assert.strictEqual(finish.reason, "stop")
        }
      }))

    it.effect("emits text when streamed tool_calls is null", () =>
      Effect.gen(function*() {
        const layer = OpenAiClient.layer({ apiKey: Redacted.make("sk-test-key") }).pipe(
          Layer.provide(Layer.succeed(
            HttpClient.HttpClient,
            makeHttpClient((request) =>
              Effect.succeed(sseResponse(request, [
                {
                  id: "chatcmpl_nullable_tool_calls",
                  object: "chat.completion.chunk",
                  model: "inception/mercury-2",
                  created: 1,
                  choices: [{
                    index: 0,
                    delta: {
                      content: "Hello",
                      role: "assistant",
                      tool_calls: null
                    },
                    finish_reason: null
                  }]
                },
                "[DONE]"
              ]))
            )
          ))
        )

        const partsChunk = yield* LanguageModel.streamText({ prompt: "test" }).pipe(
          Stream.runCollect,
          Effect.provide(OpenAiLanguageModel.model("inception/mercury-2")),
          Effect.provide(layer)
        )

        const text = Array.from(partsChunk)
          .filter((part) => part.type === "text-delta")
          .map((part) => part.delta)
          .join("")

        assert.strictEqual(text, "Hello")
      }))

    it.effect("preserves streamed text and tool args with nullable delta fields", () =>
      Effect.gen(function*() {
        const chunk = (delta: Record<string, unknown>) => ({
          id: "chatcmpl_nullable_delta_fields",
          object: "chat.completion.chunk",
          model: "gpt-4o-mini",
          created: 1,
          choices: [{ index: 0, delta, finish_reason: null }]
        })

        const layer = OpenAiClient.layer({ apiKey: Redacted.make("sk-test-key") }).pipe(
          Layer.provide(Layer.succeed(
            HttpClient.HttpClient,
            makeHttpClient((request) =>
              Effect.succeed(sseResponse(request, [
                chunk({ content: "Hello", role: null }),
                chunk({
                  tool_calls: [{
                    index: 0,
                    id: "call_1",
                    type: "function",
                    function: { name: "TestTool", arguments: "" }
                  }]
                }),
                chunk({
                  tool_calls: [{ index: 0, id: null, function: { name: null, arguments: "{\"in" } }]
                }),
                chunk({
                  tool_calls: [{ index: 0, id: null, function: { name: null, arguments: "put\":\"hel" } }]
                }),
                chunk({
                  tool_calls: [{ index: 0, id: null, function: { name: null, arguments: "lo\"}" } }]
                }),
                {
                  id: "chatcmpl_nullable_delta_fields",
                  object: "chat.completion.chunk",
                  model: "gpt-4o-mini",
                  created: 1,
                  choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }]
                },
                "[DONE]"
              ]))
            )
          ))
        )

        const partsChunk = yield* LanguageModel.streamText({
          prompt: "use the tool",
          toolkit: TestToolkit,
          disableToolCallResolution: true
        }).pipe(
          Stream.runCollect,
          Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini")),
          Effect.provide(TestToolkitLayer),
          Effect.provide(layer)
        )

        const parts = globalThis.Array.from(partsChunk)
        const text = parts
          .filter((part) => part.type === "text-delta")
          .map((part) => part.delta)
          .join("")
        const toolCall = parts.find((part) => part.type === "tool-call")

        assert.strictEqual(text, "Hello")
        assert.isDefined(toolCall)
        if (toolCall?.type !== "tool-call") {
          return
        }
        assert.strictEqual(toolCall.id, "call_1")
        assert.deepStrictEqual(toolCall.params, { input: "hello" })
      }))

    it.effect("decodes streamed tool call params with the OpenAI codec", () =>
      Effect.gen(function*() {
        const layer = OpenAiClient.layer({ apiKey: Redacted.make("sk-test-key") }).pipe(
          Layer.provide(Layer.succeed(
            HttpClient.HttpClient,
            makeHttpClient((request) =>
              Effect.succeed(sseResponse(request, [
                {
                  id: "chatcmpl_record_1",
                  object: "chat.completion.chunk",
                  model: "gpt-4o-mini",
                  created: 1,
                  choices: [{
                    index: 0,
                    delta: {
                      tool_calls: [{
                        index: 0,
                        id: "call_record_1",
                        type: "function",
                        function: {
                          name: "RecordTool",
                          arguments: JSON.stringify({ env: [{ 0: "PATH", 1: "/usr/bin" }] })
                        }
                      }]
                    },
                    finish_reason: "tool_calls"
                  }]
                },
                "[DONE]"
              ]))
            )
          ))
        )

        const partsChunk = yield* LanguageModel.streamText({
          prompt: "read the environment",
          toolkit: RecordToolkit,
          disableToolCallResolution: true
        }).pipe(
          Stream.runCollect,
          Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini")),
          Effect.provide(RecordToolkitLayer),
          Effect.provide(layer)
        )

        const toolCall = globalThis.Array.from(partsChunk).find((part) => part.type === "tool-call")
        assert.isDefined(toolCall)
        if (toolCall?.type !== "tool-call") {
          return
        }
        assert.deepStrictEqual(toolCall.params, { env: { PATH: "/usr/bin" } })
      }))

    it.effect("maps local shell stream tool calls to local_shell call outputs", () =>
      Effect.gen(function*() {
        const capturedRequests = yield* Ref.make<ReadonlyArray<HttpClientRequest.HttpClientRequest>>([])
        const requestCount = yield* Ref.make(0)

        const httpClient = HttpClient.makeWith(
          Effect.fnUntraced(function*(requestEffect) {
            const request = yield* requestEffect
            yield* Ref.update(capturedRequests, (requests) => [...requests, request])
            const index = yield* Ref.getAndUpdate(requestCount, (value) => value + 1)

            if (index === 0) {
              return sseResponse(request, [makeLocalShellChunk(), "[DONE]"])
            }

            return jsonResponse(request, makeChatCompletion())
          }),
          Effect.succeed as HttpClient.HttpClient.Preprocess<HttpClientError.HttpClientError, never>
        )

        const layer = OpenAiClient.layer({ apiKey: Redacted.make("sk-test-key") }).pipe(
          Layer.provide(Layer.succeed(HttpClient.HttpClient, httpClient))
        )

        const toolkit = Toolkit.make(CompatLocalShellTool({}))
        const toolkitLayer = toolkit.toLayer({
          CompatLocalShell: () => Effect.succeed("done")
        })

        const partsChunk = yield* LanguageModel.streamText({
          prompt: "Run pwd",
          toolkit,
          disableToolCallResolution: true
        }).pipe(
          Stream.runCollect,
          Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini")),
          Effect.provide(toolkitLayer),
          Effect.provide(layer)
        )

        const toolCall = globalThis.Array.from(partsChunk).find((part) => part.type === "tool-call")
        assert.isDefined(toolCall)
        if (toolCall?.type !== "tool-call") {
          return
        }

        assert.strictEqual(toolCall.name, "CompatLocalShell")
        assert.deepStrictEqual(toolCall.params, { action: localShellAction })

        yield* LanguageModel.generateText({
          prompt: Prompt.make([
            { role: "user", content: "Run pwd" },
            {
              role: "assistant",
              content: [Prompt.toolCallPart({
                id: toolCall.id,
                name: toolCall.name,
                params: { action: localShellAction },
                providerExecuted: false,
                options: {
                  openai: {
                    itemId: "ls_call_1"
                  }
                }
              })]
            },
            {
              role: "tool",
              content: [Prompt.toolResultPart({
                id: toolCall.id,
                name: toolCall.name,
                isFailure: false,
                result: "done",
                providerExecuted: false
              })]
            }
          ]),
          toolkit
        }).pipe(
          Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini")),
          Effect.provide(toolkitLayer),
          Effect.provide(layer)
        )

        const requests = yield* Ref.get(capturedRequests)
        const followUpRequest = requests[1]
        assert.isDefined(followUpRequest)
        if (followUpRequest === undefined) {
          return
        }

        const followUpBody = yield* getRequestBody(followUpRequest)

        const localShellCall = followUpBody.messages.find((item: any) =>
          item.role === "assistant" && item.tool_calls?.[0]?.function?.name === "local_shell"
        )
        assert.isDefined(localShellCall)
        assert.strictEqual(localShellCall.content, null)
        assert.strictEqual(localShellCall.tool_calls[0].id, toolCall.id)

        const localShellOutput = followUpBody.messages.find((item: any) => item.role === "tool")
        assert.isDefined(localShellOutput)
        assert.strictEqual(localShellOutput.tool_call_id, toolCall.id)
        assert.strictEqual(localShellOutput.content, "done")
      }))

    it.effect("maps apply_patch stream tool calls to custom provider-defined tool", () =>
      Effect.gen(function*() {
        const layer = OpenAiClient.layer({ apiKey: Redacted.make("sk-test-key") }).pipe(
          Layer.provide(Layer.succeed(
            HttpClient.HttpClient,
            makeHttpClient((request) =>
              Effect.succeed(sseResponse(request, [
                {
                  id: "chatcmpl_apply_patch_1",
                  object: "chat.completion.chunk",
                  model: "gpt-4o-mini",
                  created: 1,
                  choices: [{
                    index: 0,
                    delta: {
                      tool_calls: [{
                        index: 0,
                        id: "patch_call_1",
                        type: "function",
                        function: {
                          name: "apply_patch",
                          arguments: JSON.stringify({
                            call_id: "patch_call_1",
                            operation: {
                              type: "delete_file",
                              path: "src/legacy.ts"
                            }
                          })
                        }
                      }]
                    },
                    finish_reason: "tool_calls"
                  }]
                },
                "[DONE]"
              ]))
            )
          ))
        )

        const toolkit = Toolkit.make(CompatApplyPatchTool({}))
        const toolkitLayer = toolkit.toLayer({
          CompatApplyPatch: () =>
            Effect.succeed({
              status: "completed",
              output: "deleted"
            })
        })

        const partsChunk = yield* LanguageModel.streamText({
          prompt: "Delete src/legacy.ts",
          toolkit,
          disableToolCallResolution: true
        }).pipe(
          Stream.runCollect,
          Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini")),
          Effect.provide(toolkitLayer),
          Effect.provide(layer)
        )

        const toolCall = globalThis.Array.from(partsChunk).find((part) => part.type === "tool-call")
        assert.isDefined(toolCall)
        if (toolCall?.type !== "tool-call") {
          return
        }

        assert.strictEqual(toolCall.name, "CompatApplyPatch")
        assert.deepStrictEqual(toolCall.params, {
          call_id: "patch_call_1",
          operation: {
            type: "delete_file",
            path: "src/legacy.ts"
          }
        })
      }))

    it.effect("preserves fragmented stream tool call ids and names", () =>
      Effect.gen(function*() {
        const expectedParams = {
          call_id: "patch_call_2",
          operation: {
            type: "delete_file",
            path: "src/fragmented.ts"
          }
        }
        const toolArguments = JSON.stringify(expectedParams)

        const layer = OpenAiClient.layer({ apiKey: Redacted.make("sk-test-key") }).pipe(
          Layer.provide(Layer.succeed(
            HttpClient.HttpClient,
            makeHttpClient((request) =>
              Effect.succeed(sseResponse(request, [
                {
                  id: "chatcmpl_apply_patch_fragmented_1",
                  object: "chat.completion.chunk",
                  model: "gpt-4o-mini",
                  created: 1,
                  choices: [{
                    index: 0,
                    delta: {
                      tool_calls: [{
                        index: 0,
                        id: "patch_call_2",
                        type: "function",
                        function: {
                          name: "apply_patch",
                          arguments: toolArguments.slice(0, 24)
                        }
                      }]
                    },
                    finish_reason: null
                  }]
                },
                {
                  id: "chatcmpl_apply_patch_fragmented_1",
                  object: "chat.completion.chunk",
                  model: "gpt-4o-mini",
                  created: 1,
                  choices: [{
                    index: 0,
                    delta: {
                      tool_calls: [{
                        index: 0,
                        function: {
                          arguments: toolArguments.slice(24, 48)
                        }
                      }]
                    },
                    finish_reason: null
                  }]
                },
                {
                  id: "chatcmpl_apply_patch_fragmented_1",
                  object: "chat.completion.chunk",
                  model: "gpt-4o-mini",
                  created: 1,
                  choices: [{
                    index: 0,
                    delta: {
                      tool_calls: [{
                        index: 0,
                        function: {
                          arguments: toolArguments.slice(48)
                        }
                      }]
                    },
                    finish_reason: "tool_calls"
                  }]
                },
                "[DONE]"
              ]))
            )
          ))
        )

        const toolkit = Toolkit.make(CompatApplyPatchTool({}))
        const toolkitLayer = toolkit.toLayer({
          CompatApplyPatch: () =>
            Effect.succeed({
              status: "completed",
              output: "deleted"
            })
        })

        const partsChunk = yield* LanguageModel.streamText({
          prompt: "Delete src/fragmented.ts",
          toolkit,
          disableToolCallResolution: true
        }).pipe(
          Stream.runCollect,
          Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini")),
          Effect.provide(toolkitLayer),
          Effect.provide(layer)
        )

        const parts = globalThis.Array.from(partsChunk)

        const start = parts.find((part) => part.type === "tool-params-start" && part.id === "patch_call_2")
        assert.isDefined(start)
        if (start?.type !== "tool-params-start") {
          return
        }
        assert.strictEqual(start.name, "CompatApplyPatch")

        assert.deepStrictEqual(decodeToolParamsFromStream(parts, "patch_call_2"), expectedParams)

        const toolCall = parts.find((part) => part.type === "tool-call")
        assert.isDefined(toolCall)
        if (toolCall?.type !== "tool-call") {
          return
        }

        assert.strictEqual(toolCall.id, "patch_call_2")
        assert.strictEqual(toolCall.name, "CompatApplyPatch")
        assert.deepStrictEqual(toolCall.params, expectedParams)
      }))

    it.effect("continues after invalid JSON and schema-mismatched events", () =>
      Effect.gen(function*() {
        let capturedRequest: HttpClientRequest.HttpClientRequest | undefined

        const events = [
          "{invalid-json",
          {
            id: "chatcmpl_stream_1",
            object: "chat.completion.chunk",
            model: "gpt-4o-mini",
            created: 1,
            choices: [{
              index: 0,
              delta: { content: "Hello" },
              finish_reason: null
            }]
          },
          {
            type: "provider.chat.completion.delta",
            provider_payload: { content: "provider-specific" }
          },
          {
            id: "chatcmpl_stream_1",
            object: "chat.completion.chunk",
            model: "gpt-4o-mini",
            created: 1,
            choices: [{
              index: 0,
              delta: {},
              finish_reason: "stop"
            }],
            usage: {
              prompt_tokens: 10,
              completion_tokens: 7,
              total_tokens: 17,
              prompt_tokens_details: {
                cached_tokens: 3
              },
              completion_tokens_details: {
                reasoning_tokens: 2
              }
            },
            provider_future_field: { accepted: true }
          },
          "[DONE]"
        ]

        const layer = OpenAiClient.layer({ apiKey: Redacted.make("sk-test-key") }).pipe(
          Layer.provide(Layer.succeed(
            HttpClient.HttpClient,
            makeHttpClient((request) => {
              capturedRequest = request
              return Effect.succeed(sseResponse(request, events))
            })
          ))
        )

        const partsChunk = yield* LanguageModel.streamText({ prompt: "hello" }).pipe(
          Stream.runCollect,
          Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini")),
          Effect.provide(layer)
        )

        const parts = globalThis.Array.from(partsChunk)
        const metadata = parts.find((part) => part.type === "response-metadata")
        const finish = parts.find((part) => part.type === "finish")
        const deltas = parts.filter((part) => part.type === "text-delta")

        assert.isDefined(metadata)
        assert.isDefined(finish)
        assert.strictEqual(deltas.length, 1)
        assert.strictEqual(deltas[0]?.delta, "Hello")
        if (finish?.type === "finish") {
          assert.strictEqual(finish.reason, "stop")
          assert.deepStrictEqual(finish.usage.inputTokens, {
            uncached: 7,
            total: 10,
            cacheRead: 3,
            cacheWrite: undefined
          })
          assert.deepStrictEqual(finish.usage.outputTokens, {
            total: 7,
            text: 5,
            reasoning: 2
          })
        }

        assert.isDefined(capturedRequest)
        if (capturedRequest === undefined) {
          return
        }

        const requestBody = yield* getRequestBody(capturedRequest)
        assert.strictEqual(requestBody.stream, true)
        assert.isTrue(capturedRequest.url.endsWith("/chat/completions"))
      }))

    it.effect("assembles streamed tool args when continuation fragments have function.name: null", () =>
      Effect.gen(function*() {
        // Some OpenAI-compatible providers (e.g. Fireworks) only send the tool
        // name on the first fragment and `function.name: null` on every
        // continuation. The argument fragments live on those continuations, so
        // they must not be dropped during chunk validation.
        const chunk = (fnDelta: Record<string, unknown>) => ({
          id: "chatcmpl_null_name_1",
          object: "chat.completion.chunk",
          model: "gpt-4o-mini",
          created: 1,
          choices: [{
            index: 0,
            delta: { tool_calls: [{ index: 0, id: "call_1", type: "function", function: fnDelta }] }
          }]
        })

        const layer = OpenAiClient.layer({ apiKey: Redacted.make("sk-test-key") }).pipe(
          Layer.provide(Layer.succeed(
            HttpClient.HttpClient,
            makeHttpClient((request) =>
              Effect.succeed(sseResponse(request, [
                chunk({ name: "TestTool", arguments: "" }),
                chunk({ name: null, arguments: "{\"in" }),
                chunk({ name: null, arguments: "put\":\"hel" }),
                chunk({ name: null, arguments: "lo\"}" }),
                {
                  id: "chatcmpl_null_name_1",
                  object: "chat.completion.chunk",
                  model: "gpt-4o-mini",
                  created: 1,
                  choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }]
                },
                "[DONE]"
              ]))
            )
          ))
        )

        const partsChunk = yield* LanguageModel.streamText({
          prompt: "use the tool",
          toolkit: TestToolkit,
          disableToolCallResolution: true
        }).pipe(
          Stream.runCollect,
          Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini")),
          Effect.provide(TestToolkitLayer),
          Effect.provide(layer)
        )

        const parts = globalThis.Array.from(partsChunk)
        const paramsDeltas = parts.filter((part) => part.type === "tool-params-delta")
        assert.isAbove(paramsDeltas.length, 0)

        const toolCall = parts.find((part) => part.type === "tool-call")
        assert.isDefined(toolCall)
        if (toolCall?.type !== "tool-call") {
          return
        }
        assert.strictEqual(toolCall.name, "TestTool")
        assert.deepStrictEqual(toolCall.params, { input: "hello" })
      }))

    it.effect("emits reasoning lifecycle parts for delta.reasoning", () =>
      Effect.gen(function*() {
        const chunk = (delta: Record<string, unknown>, finishReason: string | null = null) => ({
          id: "chatcmpl_reasoning_1",
          object: "chat.completion.chunk",
          model: "gpt-4o-mini",
          created: 1,
          choices: [{ index: 0, delta, finish_reason: finishReason }]
        })

        const layer = OpenAiClient.layer({ apiKey: Redacted.make("sk-test-key") }).pipe(
          Layer.provide(Layer.succeed(
            HttpClient.HttpClient,
            makeHttpClient((request) =>
              Effect.succeed(sseResponse(request, [
                chunk({ reasoning: "Let me think" }),
                chunk({ reasoning: " about this." }),
                chunk({ content: "Hello" }),
                chunk({ content: " there" }, "stop"),
                "[DONE]"
              ]))
            )
          ))
        )

        const partsChunk = yield* LanguageModel.streamText({ prompt: "test" }).pipe(
          Stream.runCollect,
          Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini")),
          Effect.provide(layer)
        )

        const parts = globalThis.Array.from(partsChunk)
        assert.deepStrictEqual(parts.map((part) => part.type), [
          "response-metadata",
          "reasoning-start",
          "reasoning-delta",
          "reasoning-delta",
          "reasoning-end",
          "text-start",
          "text-delta",
          "text-delta",
          "text-end",
          "finish"
        ])

        const reasoningText = parts
          .flatMap((part) => part.type === "reasoning-delta" ? [part.delta] : [])
          .join("")
        assert.strictEqual(reasoningText, "Let me think about this.")

        const reasoningIds = parts.flatMap((part) =>
          part.type === "reasoning-start" || part.type === "reasoning-delta" || part.type === "reasoning-end"
            ? [part.id]
            : []
        )
        assert.strictEqual(new Set(reasoningIds).size, 1)

        const textIds = parts.flatMap((part) => part.type === "text-start" ? [part.id] : [])
        assert.notStrictEqual(reasoningIds[0], textIds[0])
      }))

    it.effect("emits reasoning lifecycle parts for delta.reasoning_content", () =>
      Effect.gen(function*() {
        const chunk = (delta: Record<string, unknown>, finishReason: string | null = null) => ({
          id: "chatcmpl_reasoning_2",
          object: "chat.completion.chunk",
          model: "gpt-4o-mini",
          created: 1,
          choices: [{ index: 0, delta, finish_reason: finishReason }]
        })

        const layer = OpenAiClient.layer({ apiKey: Redacted.make("sk-test-key") }).pipe(
          Layer.provide(Layer.succeed(
            HttpClient.HttpClient,
            makeHttpClient((request) =>
              Effect.succeed(sseResponse(request, [
                chunk({ reasoning_content: "Thinking..." }),
                chunk({ content: "Answer." }, "stop"),
                "[DONE]"
              ]))
            )
          ))
        )

        const partsChunk = yield* LanguageModel.streamText({ prompt: "test" }).pipe(
          Stream.runCollect,
          Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini")),
          Effect.provide(layer)
        )

        const parts = globalThis.Array.from(partsChunk)
        assert.deepStrictEqual(parts.map((part) => part.type), [
          "response-metadata",
          "reasoning-start",
          "reasoning-delta",
          "reasoning-end",
          "text-start",
          "text-delta",
          "text-end",
          "finish"
        ])

        const reasoningText = parts
          .flatMap((part) => part.type === "reasoning-delta" ? [part.delta] : [])
          .join("")
        assert.strictEqual(reasoningText, "Thinking...")
      }))

    it.effect("closes an open reasoning part at stream end", () =>
      Effect.gen(function*() {
        const layer = OpenAiClient.layer({ apiKey: Redacted.make("sk-test-key") }).pipe(
          Layer.provide(Layer.succeed(
            HttpClient.HttpClient,
            makeHttpClient((request) =>
              Effect.succeed(sseResponse(request, [
                {
                  id: "chatcmpl_reasoning_3",
                  object: "chat.completion.chunk",
                  model: "gpt-4o-mini",
                  created: 1,
                  choices: [{ index: 0, delta: { reasoning: "Only thoughts." }, finish_reason: "stop" }]
                },
                "[DONE]"
              ]))
            )
          ))
        )

        const partsChunk = yield* LanguageModel.streamText({ prompt: "test" }).pipe(
          Stream.runCollect,
          Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini")),
          Effect.provide(layer)
        )

        const parts = globalThis.Array.from(partsChunk)
        assert.deepStrictEqual(parts.map((part) => part.type), [
          "response-metadata",
          "reasoning-start",
          "reasoning-delta",
          "reasoning-end",
          "finish"
        ])
      }))
  })

  describe("config", () => {
    it.effect("does not leak library-only fields into request body", () =>
      Effect.gen(function*() {
        let capturedRequest: HttpClientRequest.HttpClientRequest | undefined

        const layer = OpenAiClient.layer({ apiKey: Redacted.make("sk-test-key") }).pipe(
          Layer.provide(Layer.succeed(
            HttpClient.HttpClient,
            makeHttpClient((request) => {
              capturedRequest = request
              return Effect.succeed(jsonResponse(request, makeChatCompletion()))
            })
          ))
        )

        yield* LanguageModel.generateText({ prompt: "test" }).pipe(
          Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini", {
            fileIdPrefixes: ["file-"],
            strictJsonSchema: false,
            temperature: 0.5
          })),
          Effect.provide(layer)
        )

        assert.isDefined(capturedRequest)
        if (capturedRequest === undefined) return

        const requestBody = yield* getRequestBody(capturedRequest)
        assert.strictEqual(requestBody.fileIdPrefixes, undefined)
        assert.strictEqual(requestBody.strictJsonSchema, undefined)
        assert.strictEqual(requestBody.temperature, 0.5)
      }))
  })
})

const TestTool = Tool.make("TestTool", {
  description: "A test tool",
  parameters: Schema.Struct({ input: Schema.String }),
  success: Schema.Struct({ output: Schema.String })
})

const TestToolkit = Toolkit.make(TestTool)

const TestToolkitLayer = TestToolkit.toLayer({
  TestTool: ({ input }) => Effect.succeed({ output: input })
})

const RecordTool = Tool.make("RecordTool", {
  parameters: Schema.Struct({
    env: Schema.Record(Schema.String, Schema.String)
  }),
  success: Schema.String
})

const RecordToolkit = Toolkit.make(RecordTool)

const RecordToolkitLayer = RecordToolkit.toLayer({
  RecordTool: () => Effect.succeed("done")
})

const CompatApplyPatchTool = Tool.providerDefined({
  id: "compat.apply_patch",
  customName: "CompatApplyPatch",
  providerName: "apply_patch",
  requiresHandler: true,
  parameters: Schema.Struct({
    call_id: Schema.String,
    operation: Schema.Any
  }),
  success: Schema.Struct({
    status: Schema.Literals(["completed", "failed"]),
    output: Schema.optionalKey(Schema.NullOr(Schema.String))
  })
})

const localShellAction = {
  type: "exec",
  command: ["pwd"],
  env: {}
}

const CompatLocalShellTool = Tool.providerDefined({
  id: "compat.local_shell",
  customName: "CompatLocalShell",
  providerName: "local_shell",
  requiresHandler: true,
  parameters: Schema.Struct({
    action: Schema.Any
  }),
  success: Schema.String
})

const makeHttpClient = (
  handler: (
    request: HttpClientRequest.HttpClientRequest
  ) => Effect.Effect<HttpClientResponse.HttpClientResponse, HttpClientError.HttpClientError>
) =>
  HttpClient.makeWith(
    Effect.fnUntraced(function*(requestEffect) {
      const request = yield* requestEffect
      return yield* handler(request)
    }),
    Effect.succeed as HttpClient.HttpClient.Preprocess<HttpClientError.HttpClientError, never>
  )

const makeChatCompletion = (overrides: Record<string, unknown> = {}) => ({
  id: "chatcmpl_test_1",
  object: "chat.completion",
  model: "gpt-4o-mini",
  created: 1,
  choices: [{
    index: 0,
    finish_reason: "stop",
    message: {
      role: "assistant",
      content: ""
    }
  }],
  ...overrides
})

const makeLocalShellChunk = () => ({
  id: "chatcmpl_local_shell_1",
  object: "chat.completion.chunk",
  model: "gpt-4o-mini",
  created: 1,
  choices: [{
    index: 0,
    delta: {
      tool_calls: [{
        index: 0,
        id: "local_shell_call_1",
        type: "function",
        function: {
          name: "local_shell",
          arguments: JSON.stringify({ action: localShellAction })
        }
      }]
    },
    finish_reason: "tool_calls"
  }]
})

const jsonResponse = (
  request: HttpClientRequest.HttpClientRequest,
  body: unknown
): HttpClientResponse.HttpClientResponse =>
  HttpClientResponse.fromWeb(
    request,
    new Response(JSON.stringify(body), {
      status: 200,
      headers: {
        "content-type": "application/json"
      }
    })
  )

const sseResponse = (
  request: HttpClientRequest.HttpClientRequest,
  events: ReadonlyArray<unknown>
): HttpClientResponse.HttpClientResponse =>
  HttpClientResponse.fromWeb(
    request,
    new Response(toSseBody(events), {
      status: 200,
      headers: {
        "content-type": "text/event-stream"
      }
    })
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

const toSseBody = (events: ReadonlyArray<unknown>): string =>
  events.map((event) => {
    if (typeof event === "string") {
      return `data: ${event}\n\n`
    }
    return `data: ${JSON.stringify(event)}\n\n`
  }).join("")
