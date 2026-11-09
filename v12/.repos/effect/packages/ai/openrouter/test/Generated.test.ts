import { Generated, OpenRouterClient, OpenRouterLanguageModel } from "@effect/ai-openrouter"
import { assert, describe, it } from "@effect/vitest"
import { deepStrictEqual } from "@effect/vitest/utils"
import { Effect, Schema, Stream } from "effect"
import { type AiError, LanguageModel, type Response, Tool, Toolkit } from "effect/ai"
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http"

describe("Generated", () => {
  it.effect("sends audio transcriptions as JSON with structured provider options", () =>
    Effect.gen(function*() {
      const payload: typeof Generated.CreateAudioTranscriptionsRequestJson.Encoded = {
        model: "openai/whisper-1",
        input_audio: { data: "UklGRg==", format: "wav" },
        provider: { options: { openai: { prompt: "Effect" } } },
        language: "en",
        response_format: "verbose_json",
        timestamp_granularities: ["word"]
      }
      const response = { text: "Hello Effect", language: "en", duration: 1.5 }
      let requests = 0
      const client = Generated.make(
        HttpClient.make((request) => {
          requests++
          assert.strictEqual(request.method, "POST")
          assert.strictEqual(request.url, "https://openrouter.ai/api/v1/audio/transcriptions")
          assert.strictEqual(request.headers["content-type"], "application/json")
          assert.strictEqual(request.body._tag, "Uint8Array")
          if (request.body._tag === "Uint8Array") {
            deepStrictEqual(JSON.parse(new TextDecoder().decode(request.body.body)), payload)
          }
          return Effect.succeed(HttpClientResponse.fromWeb(
            request,
            globalThis.Response.json(response)
          ))
        }).pipe(HttpClient.mapRequest(HttpClientRequest.prependUrl("https://openrouter.ai/api/v1")))
      )
      deepStrictEqual(yield* client.createAudioTranscriptions({ payload }), response)
      assert.strictEqual(requests, 1)
    }))

  it("decodes nullable generation statistics", () => {
    const response: Generated.GetGeneration200 = {
      data: {
        id: "gen-test",
        upstream_id: null,
        total_cost: 0.003294,
        cache_discount: null,
        upstream_inference_cost: null,
        created_at: "2026-07-24T12:00:00Z",
        data_region: "global",
        model: "openrouter/auto",
        app_id: null,
        streamed: null,
        cancelled: null,
        provider_name: null,
        http_referer: null,
        latency: null,
        moderation_latency: null,
        generation_time: null,
        finish_reason: null,
        tokens_prompt: null,
        tokens_completion: null,
        native_tokens_prompt: null,
        native_tokens_completion: null,
        native_tokens_completion_images: null,
        native_tokens_reasoning: null,
        native_tokens_cached: null,
        num_fetches: null,
        num_media_prompt: null,
        num_input_audio_prompt: null,
        num_media_completion: null,
        num_search_results: null,
        origin: "https://openrouter.ai/",
        preset_id: null,
        usage: 0.003294,
        is_byok: false,
        native_finish_reason: null,
        external_user: null,
        api_type: null,
        request_id: null,
        response_cache_source_id: null,
        router: null,
        service_tier: null,
        session_id: null,
        provider_responses: null,
        user_agent: null,
        web_search_engine: null
      }
    }

    deepStrictEqual(Schema.decodeUnknownSync(Generated.GetGeneration200)(response), response)
  })

  it("preserves streamed usage cost fields", () => {
    const usage = {
      completion_tokens: 11,
      prompt_tokens: 7,
      total_tokens: 18,
      cost: 0.000365,
      is_byok: false,
      prompt_tokens_details: {
        cached_tokens: 0,
        cache_write_tokens: 0
      }
    }

    deepStrictEqual(Schema.decodeUnknownSync(Generated.ChatUsage)(usage), usage)
  })

  for (
    const { encrypted, mode, reason, tool } of [
      { mode: "stream", encrypted: true, tool: true, reason: "tool-calls" },
      { mode: "stream", encrypted: false, tool: true, reason: "stop" },
      { mode: "stream", encrypted: true, tool: false, reason: "stop" },
      { mode: "generate", encrypted: true, tool: true, reason: "tool-calls" }
    ] as const
  ) {
    it.effect(`${mode}: encrypted=${encrypted}, tool=${tool} finishes with ${reason}`, () =>
      Effect.gen(function*() {
        const metadata = { id: "response-1", model: "test/reasoning-model", created: 1 }
        const reasoningDetails = encrypted
          ? [{ type: "reasoning.encrypted", data: "opaque-signature", format: "unknown" } as const]
          : []
        const toolCalls = tool
          ? [{
            index: 0,
            id: "call-1",
            type: "function" as const,
            function: { name: "ProbeTool", arguments: "{\"value\":1}" }
          }]
          : []
        const usage = { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
        const chunks = yield* Schema.decodeUnknownEffect(Schema.Array(Generated.ChatStreamChunk))([
          {
            ...metadata,
            object: "chat.completion.chunk",
            choices: [{ index: 0, delta: { reasoning_details: reasoningDetails, tool_calls: toolCalls } }]
          },
          {
            ...metadata,
            object: "chat.completion.chunk",
            choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
            usage
          }
        ])
        const body = yield* Schema.decodeUnknownEffect(Generated.SendChatCompletionRequest200)({
          ...metadata,
          object: "chat.completion",
          system_fingerprint: null,
          choices: [{
            index: 0,
            finish_reason: "stop",
            message: { role: "assistant", reasoning_details: reasoningDetails, tool_calls: toolCalls }
          }],
          usage
        })
        const response = HttpClientResponse.fromWeb(
          HttpClientRequest.post("https://example.com/chat/completions"),
          new globalThis.Response()
        )
        const toolkit = Toolkit.make(Tool.make("ProbeTool", {
          parameters: Schema.Struct({ value: Schema.Number }),
          success: Schema.String
        }))
        const client = OpenRouterClient.OpenRouterClient.of({
          client: Generated.make(HttpClient.make(() => Effect.die("Unexpected HTTP request"))),
          createDecisions: () => Effect.die("Unexpected decisions request"),
          createChatCompletion: () => Effect.succeed([body, response]),
          createChatCompletionStream: () => Effect.succeed([response, Stream.fromIterable(chunks)])
        })
        const options = { prompt: "Use the probe tool", toolkit, disableToolCallResolution: true } as const
        const operation: Effect.Effect<Array<Response.AnyPart>, AiError.AiError, LanguageModel.LanguageModel> =
          mode === "stream"
            ? LanguageModel.streamText(options).pipe(Stream.runCollect)
            : LanguageModel.generateText(options).pipe(Effect.map((result) => result.content))
        const parts = globalThis.Array.from(
          yield* operation.pipe(
            Effect.provide(OpenRouterLanguageModel.model(metadata.model)),
            Effect.provide(toolkit.toLayer({ ProbeTool: () => Effect.succeed("ok") })),
            Effect.provideService(OpenRouterClient.OpenRouterClient, client)
          )
        )

        deepStrictEqual(
          parts.filter((part) => part.type === "tool-call").map((part) => part.name),
          tool ? ["ProbeTool"] : []
        )
        deepStrictEqual(parts.filter((part) => part.type === "finish").map((part) => part.reason), [reason])
      }))
  }
})
