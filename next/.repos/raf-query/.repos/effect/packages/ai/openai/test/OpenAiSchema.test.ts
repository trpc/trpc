import { Generated, OpenAiClient, OpenAiLanguageModel } from "@effect/ai-openai"
import * as OpenAiSchema from "@effect/ai-openai/OpenAiSchema"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Layer, Schema, Stream } from "effect"
import { LanguageModel } from "effect/ai"
import * as Sse from "effect/encoding/Sse"
import { HttpClientRequest, HttpClientResponse } from "effect/http"

const makeResponse = (overrides: Record<string, unknown> = {}) => ({
  id: "resp_123",
  object: "response",
  model: "gpt-4o-mini",
  status: "completed",
  created_at: 1,
  output: [],
  ...overrides
})

describe("OpenAiSchema", () => {
  describe("web search sources", () => {
    it("preserves API sources in response history", () => {
      const item = {
        type: "web_search_call",
        id: "ws_123",
        status: "completed",
        action: { type: "search", sources: [{ type: "api", name: "oai-weather" }] }
      } as const

      assert.deepStrictEqual(Schema.decodeUnknownSync(Generated.InputItem)(item), item)
    })

    it.each([
      { type: "url" },
      { type: "api" },
      { type: "api", name: null },
      { type: "unknown", name: "oai-weather" }
    ])("rejects malformed search sources: %j", (source) => {
      const item = {
        type: "web_search_call",
        id: "ws_123",
        status: "completed",
        action: { type: "search", sources: [source] }
      }

      assert.throws(() => Schema.decodeUnknownSync(Generated.WebSearchToolCall)(item))
      assert.throws(() => Schema.decodeUnknownSync(Generated.InputItem)(item))
    })
  })

  it("accepts max reasoning effort", () => {
    const decoded = Schema.decodeUnknownSync(OpenAiSchema.CreateResponse)({
      reasoning: { effort: "max" }
    })

    assert.strictEqual(decoded.reasoning?.effort, "max")
  })

  it("decodes a representative response payload", () => {
    const decoded = Schema.decodeUnknownSync(OpenAiSchema.Response)({
      ...makeResponse(),
      output: [
        {
          id: "msg_1",
          type: "message",
          role: "assistant",
          status: "completed",
          content: [
            {
              type: "output_text",
              text: "hello",
              annotations: [
                {
                  type: "url_citation",
                  url: "https://example.com",
                  start_index: 0,
                  end_index: 5,
                  title: "example"
                }
              ]
            },
            {
              type: "refusal",
              refusal: "cannot comply"
            }
          ]
        },
        {
          id: "fc_1",
          type: "function_call",
          call_id: "call_1",
          name: "lookup",
          arguments: "{}",
          status: "completed"
        },
        {
          id: "reasoning_1",
          type: "reasoning",
          summary: [
            {
              type: "summary_text",
              text: "thinking"
            }
          ]
        }
      ],
      usage: {
        input_tokens: 10,
        output_tokens: 20,
        total_tokens: 30
      }
    })

    assert.strictEqual(decoded.id, "resp_123")
    assert.strictEqual(decoded.output.length, 3)
    assert.strictEqual(decoded.output[0].type, "message")
    if (decoded.output[0].type === "message") {
      assert.strictEqual(decoded.output[0].content[0].type, "output_text")
    }
  })

  it("decodes image generation lifecycle statuses", () => {
    for (const status of ["generating", "failed"]) {
      const decoded = Schema.decodeUnknownSync(OpenAiSchema.Response)({
        ...makeResponse(),
        output: [{
          id: "image_1",
          type: "image_generation_call",
          status,
          result: null
        }]
      })

      assert.strictEqual(decoded.output[0].type, "image_generation_call")
      if (decoded.output[0].type === "image_generation_call") {
        assert.strictEqual(decoded.output[0].status, status)
      }
    }
  })

  it("decodes required stream events", () => {
    const response = makeResponse({ status: "in_progress" })
    const applyPatchItem = {
      id: "ap_1",
      type: "apply_patch_call",
      call_id: "call_ap",
      operation: {
        type: "update_file",
        path: "README.md",
        diff: "@@"
      }
    }

    const events = [
      { type: "response.created", sequence_number: 1, response },
      {
        type: "response.completed",
        sequence_number: 2,
        response: makeResponse()
      },
      { type: "response.incomplete", sequence_number: 3, response: makeResponse({ status: "incomplete" }) },
      { type: "response.failed", sequence_number: 4, response: makeResponse({ status: "failed" }) },
      { type: "response.output_item.added", sequence_number: 5, output_index: 0, item: applyPatchItem },
      { type: "response.output_item.done", sequence_number: 6, output_index: 0, item: applyPatchItem },
      {
        type: "response.output_text.delta",
        sequence_number: 7,
        item_id: "msg_1",
        output_index: 0,
        content_index: 0,
        delta: "hel"
      },
      {
        type: "response.output_text.annotation.added",
        sequence_number: 8,
        item_id: "msg_1",
        output_index: 0,
        content_index: 0,
        annotation_index: 0,
        annotation: {
          type: "file_path",
          file_id: "file_1",
          index: 0
        }
      },
      {
        type: "response.reasoning_summary_part.added",
        sequence_number: 9,
        item_id: "reasoning_1",
        output_index: 1,
        summary_index: 0,
        part: { type: "summary_text", text: "thinking" }
      },
      {
        type: "response.reasoning_summary_part.done",
        sequence_number: 10,
        item_id: "reasoning_1",
        output_index: 1,
        summary_index: 0,
        part: { type: "summary_text", text: "thinking" }
      },
      {
        type: "response.reasoning_summary_text.delta",
        sequence_number: 11,
        item_id: "reasoning_1",
        output_index: 1,
        summary_index: 0,
        delta: "..."
      },
      {
        type: "response.function_call_arguments.delta",
        sequence_number: 12,
        item_id: "fc_1",
        output_index: 2,
        delta: "{"
      },
      {
        type: "response.function_call_arguments.done",
        sequence_number: 13,
        item_id: "fc_1",
        output_index: 2,
        arguments: "{}"
      },
      {
        type: "response.code_interpreter_call_code.delta",
        sequence_number: 14,
        item_id: "code_1",
        output_index: 3,
        delta: "print"
      },
      {
        type: "response.code_interpreter_call_code.done",
        sequence_number: 15,
        item_id: "code_1",
        output_index: 3,
        code: "print('ok')"
      },
      {
        type: "response.apply_patch_call_operation_diff.delta",
        sequence_number: 16,
        item_id: "ap_1",
        output_index: 4,
        delta: "@@"
      },
      {
        type: "response.apply_patch_call_operation_diff.done",
        sequence_number: 17,
        item_id: "ap_1",
        output_index: 4,
        delta: "@@"
      },
      {
        type: "response.image_generation_call.partial_image",
        sequence_number: 18,
        item_id: "img_1",
        output_index: 5,
        partial_image_b64: "AQID"
      }
    ]

    for (const event of events) {
      const decoded = Schema.decodeUnknownSync(OpenAiSchema.ResponseStreamEvent)(event)
      assert.strictEqual(decoded.type, event.type)
    }
  })

  it.effect("keeps keepalive and unknown events tolerant in SSE decoding", () =>
    Effect.gen(function*() {
      const sseBody = [
        {
          type: "response.created",
          sequence_number: 1,
          response: makeResponse({ status: "in_progress" })
        },
        {
          type: "keepalive",
          sequence_number: 2,
          heartbeat: true
        },
        {
          type: "provider.future_event",
          sequence_number: 3,
          nested: { ok: true }
        },
        {
          type: "response.completed",
          sequence_number: 4,
          response: makeResponse({ status: "completed" })
        }
      ].map((event) => `data: ${JSON.stringify(event)}\n\n`).join("")

      const events = yield* Stream.fromIterable([sseBody]).pipe(
        Stream.pipeThroughChannel(Sse.decodeDataSchema(OpenAiSchema.ResponseStreamEvent)),
        Stream.map((event) => event.data),
        Stream.runCollect
      )

      const decoded = globalThis.Array.from(events)
      assert.strictEqual(decoded.length, 4)
      assert.strictEqual(decoded[1].type, "keepalive")
      assert.strictEqual(decoded[2].type, "provider.future_event")
      if (decoded[1].type === "keepalive") {
        assert.strictEqual(decoded[1].sequence_number, 2)
      }
    }))

  it.effect("does not silently decode malformed known events as unknown", () =>
    Effect.gen(function*() {
      const malformed = yield* Schema.decodeUnknownEffect(OpenAiSchema.ResponseStreamEvent)({
        type: "response.completed",
        sequence_number: 1
      }).pipe(Effect.flip)

      assert.isDefined(malformed)
    }))

  it("decodes the error event whether the payload is flat or nested under `error`", () => {
    const flat = Schema.decodeUnknownSync(OpenAiSchema.ResponseStreamEvent)({
      type: "error",
      code: "ERR",
      message: "boom",
      param: null,
      sequence_number: 1
    })
    assert.deepStrictEqual(flat, {
      type: "error",
      code: "ERR",
      message: "boom",
      param: null,
      sequence_number: 1
    })

    const nested = Schema.decodeUnknownSync(OpenAiSchema.ResponseStreamEvent)({
      type: "error",
      error: {
        type: "insufficient_quota",
        code: "credit_balance_exhausted",
        message: "You have no credits remaining.",
        param: null
      },
      sequence_number: 2
    })
    assert.deepStrictEqual(nested, {
      type: "error",
      code: "credit_balance_exhausted",
      message: "You have no credits remaining.",
      param: null,
      sequence_number: 2
    })

    const nestedWithStatus = Schema.decodeUnknownSync(OpenAiSchema.ResponseStreamEvent)({
      type: "error",
      error: {
        code: "rate_limited",
        message: "Too many requests.",
        param: null
      },
      sequence_number: 3,
      status: 429
    })
    assert.deepStrictEqual(nestedWithStatus, {
      type: "error",
      code: "rate_limited",
      message: "Too many requests.",
      param: null,
      sequence_number: 3,
      status: 429
    })
  })

  it.effect("rejects error events missing spec-required fields", () =>
    Effect.gen(function*() {
      const malformed = [
        { type: "error" },
        { type: "error", error: {}, sequence_number: 3 },
        { type: "error", error: { code: "x" }, sequence_number: 3 }
      ]
      for (const event of malformed) {
        const failure = yield* Schema.decodeUnknownEffect(OpenAiSchema.ResponseStreamEvent)(event).pipe(Effect.flip)
        assert.isDefined(failure)
      }
    }))

  it.effect("surfaces nested error events in SSE decoding instead of aborting the stream", () =>
    Effect.gen(function*() {
      const sseBody = [
        {
          type: "response.created",
          sequence_number: 1,
          response: makeResponse({ status: "in_progress" })
        },
        {
          type: "error",
          error: {
            type: "insufficient_quota",
            code: "credit_balance_exhausted",
            message: "You have no credits remaining.",
            param: null
          },
          sequence_number: 2
        }
      ].map((event) => `data: ${JSON.stringify(event)}\n\n`).join("")

      const events = yield* Stream.fromIterable([sseBody]).pipe(
        Stream.pipeThroughChannel(Sse.decodeDataSchema(OpenAiSchema.ResponseStreamEvent)),
        Stream.map((event) => event.data),
        Stream.runCollect
      )

      const decoded = globalThis.Array.from(events)
      assert.strictEqual(decoded.length, 2)
      assert.deepStrictEqual(decoded[1], {
        type: "error",
        code: "credit_balance_exhausted",
        message: "You have no credits remaining.",
        param: null,
        sequence_number: 2
      })
    }))

  it("decodes embedding response variants (numeric + string/base64)", () => {
    const numeric = Schema.decodeUnknownSync(OpenAiSchema.CreateEmbeddingResponse)({
      object: "list",
      model: "text-embedding-3-small",
      data: [{ object: "embedding", index: 0, embedding: [0.1, 0.2] }],
      usage: { prompt_tokens: 2, total_tokens: 2 }
    })
    const base64 = Schema.decodeUnknownSync(OpenAiSchema.CreateEmbeddingResponse)({
      object: "list",
      model: "text-embedding-3-small",
      data: [{ object: "embedding", index: 0, embedding: "AQID" }],
      usage: { prompt_tokens: 2, total_tokens: 2 }
    })

    assert.strictEqual(numeric.data[0].embedding[0], 0.1)
    assert.strictEqual(base64.data[0].embedding, "AQID")
  })

  it.effect("exposes the response.failed error payload", () => {
    const response = HttpClientResponse.fromWeb(
      HttpClientRequest.get("https://api.openai.com/v1/responses"),
      new Response()
    )
    const failed = Schema.decodeUnknownSync(OpenAiSchema.ResponseStreamEvent)({
      type: "response.failed",
      sequence_number: 1,
      response: {
        id: "resp_1",
        object: "response",
        created_at: 1,
        model: "gpt-4o-mini",
        status: "failed",
        output: [],
        error: { code: "server_error", message: "provider exploded" }
      }
    })
    const client = Layer.succeed(
      OpenAiClient.OpenAiClient,
      OpenAiClient.OpenAiClient.of({
        client: undefined as any,
        createResponse: () => Effect.die("unexpected"),
        createResponseStream: () =>
          Effect.succeed([
            response,
            Stream.make(failed)
          ]),
        createEmbedding: () => Effect.die("unexpected")
      })
    )

    return LanguageModel.streamText({ prompt: "test" }).pipe(
      Stream.runCollect,
      Effect.tap((parts) =>
        Effect.sync(() => {
          const error = Array.from(parts).find((part) => part.type === "error")
          const finish = Array.from(parts).find((part) => part.type === "finish")
          assert.isDefined(error)
          assert.deepStrictEqual(error.error, { code: "server_error", message: "provider exploded" })
          assert.isDefined(finish)
          assert.strictEqual(finish.reason, "error")
        })
      ),
      Effect.provide(OpenAiLanguageModel.model("gpt-4o-mini")),
      Effect.provide(client)
    )
  })
})
