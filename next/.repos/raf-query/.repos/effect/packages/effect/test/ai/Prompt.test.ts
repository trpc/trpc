import { assert, describe, it } from "@effect/vitest"
import { Schema } from "effect"
import { Prompt, Response } from "effect/ai"

describe("Prompt", () => {
  describe("serialization", () => {
    it("preserves text parts during serialization", () => {
      const prompt = Prompt.make([
        {
          role: "user",
          content: [
            { type: "text", text: "first" },
            { type: "text", text: "second" }
          ]
        },
        {
          role: "assistant",
          content: [{ type: "text", text: "response", options: { test: { cache: "ephemeral" } } }]
        }
      ])

      assert.deepStrictEqual(
        Schema.decodeSync(Prompt.Prompt)(Schema.encodeSync(Prompt.Prompt)(prompt)),
        prompt
      )
    })
  })

  describe("part schemas", () => {
    it("exports schemas for all parts and message-specific parts", () => {
      const parts = {
        text: { type: "text", text: "hello" },
        reasoning: { type: "reasoning", text: "thinking" },
        file: { type: "file", mediaType: "text/plain", data: "hello" },
        toolCall: { type: "tool-call", id: "call-1", name: "tool", params: {} },
        toolResult: { type: "tool-result", id: "call-1", name: "tool", isFailure: false, result: "done" },
        toolApprovalResponse: {
          type: "tool-approval-response",
          approvalId: "approval-1",
          approved: true
        },
        toolApprovalRequest: {
          type: "tool-approval-request",
          approvalId: "approval-1",
          toolCallId: "call-1"
        }
      } as const

      const decodePart = Schema.decodeUnknownExit(Prompt.Part)
      for (const part of Object.values(parts)) {
        assert.strictEqual(decodePart(part)._tag, "Success")
      }

      const decodeUserMessagePart = Schema.decodeUnknownExit(Prompt.UserMessagePart)
      for (const part of [parts.text, parts.file]) {
        assert.strictEqual(decodeUserMessagePart(part)._tag, "Success")
      }

      const decodeAssistantMessagePart = Schema.decodeUnknownExit(Prompt.AssistantMessagePart)
      for (
        const part of [
          parts.text,
          parts.file,
          parts.reasoning,
          parts.toolCall,
          parts.toolResult,
          parts.toolApprovalRequest
        ]
      ) {
        assert.strictEqual(decodeAssistantMessagePart(part)._tag, "Success")
      }

      const decodeToolMessagePart = Schema.decodeUnknownExit(Prompt.ToolMessagePart)
      for (const part of [parts.toolResult, parts.toolApprovalResponse]) {
        assert.strictEqual(decodeToolMessagePart(part)._tag, "Success")
      }
    })
  })

  describe("fromResponseParts", () => {
    it("preserves file-only responses as assistant messages", () => {
      const file = Response.makePart("file", {
        data: new Uint8Array([0, 127, 128, 255]),
        mediaType: "application/octet-stream",
        metadata: { example: { id: "attachment-1", generated: true } }
      })

      assert.deepStrictEqual(
        Prompt.fromResponseParts([file]),
        Prompt.make([{
          role: "assistant",
          content: [{
            type: "file",
            data: "AH+A/w==",
            mediaType: "application/octet-stream",
            options: { example: { id: "attachment-1", generated: true } }
          }]
        }])
      )
    })

    it("folds streamed text and reasoning deltas into an assistant message", () => {
      const parts = [
        Response.makePart("text-start", { id: "1" }),
        Response.makePart("text-delta", { id: "1", delta: "Hello" }),
        Response.makePart("text-delta", { id: "1", delta: ", " }),
        Response.makePart("text-delta", { id: "1", delta: "World!" }),
        Response.makePart("text-end", { id: "1" }),
        Response.makePart("reasoning-start", { id: "2" }),
        Response.makePart("reasoning-delta", { id: "2", delta: "I " }),
        Response.makePart("reasoning-delta", { id: "2", delta: "am " }),
        Response.makePart("reasoning-delta", { id: "2", delta: "thinking" }),
        Response.makePart("reasoning-end", { id: "2" })
      ]
      const prompt = Prompt.fromResponseParts(parts)
      const expected = Prompt.make([
        {
          role: "assistant",
          content: [
            { type: "text", text: "Hello, World!" },
            { type: "reasoning", text: "I am thinking" }
          ]
        }
      ])
      assert.deepStrictEqual(prompt, expected)
    })

    it("preserves metadata on non-streaming response parts", () => {
      const parts = [
        Response.makePart("text", {
          text: "Hello",
          metadata: { test: { value: "text" } }
        }),
        Response.makePart("reasoning", {
          text: "Thinking",
          metadata: { openai: { encryptedContent: "encrypted-reasoning" } }
        }),
        Response.makePart("tool-call", {
          id: "call-1",
          name: "get_weather",
          params: { city: "London" },
          providerExecuted: false,
          metadata: { google: { thoughtSignature: "signed-call" } }
        }),
        Response.makePart("tool-result", {
          id: "call-1",
          name: "get_weather",
          isFailure: false,
          result: { temp: 20 },
          encodedResult: { temp: 20 },
          preliminary: false,
          providerExecuted: false,
          metadata: { test: { value: "tool-result" } }
        })
      ]

      const prompt = Prompt.fromResponseParts(parts)

      assert.deepStrictEqual(
        prompt,
        Prompt.make([
          {
            role: "assistant",
            content: [
              { type: "text", text: "Hello", options: { test: { value: "text" } } },
              {
                type: "reasoning",
                text: "Thinking",
                options: { openai: { encryptedContent: "encrypted-reasoning" } }
              },
              {
                type: "tool-call",
                id: "call-1",
                name: "get_weather",
                params: { city: "London" },
                providerExecuted: false,
                options: { google: { thoughtSignature: "signed-call" } }
              }
            ]
          },
          {
            role: "tool",
            content: [{
              type: "tool-result",
              id: "call-1",
              name: "get_weather",
              isFailure: false,
              result: { temp: 20 },
              providerExecuted: false,
              options: { test: { value: "tool-result" } }
            }]
          }
        ])
      )
    })

    it("accumulates metadata across streamed text and reasoning parts", () => {
      const parts = [
        Response.makePart("text-start", {
          id: "text-1",
          metadata: { testStart: { value: "text-start" } }
        }),
        Response.makePart("text-delta", {
          id: "text-1",
          delta: "Hello",
          metadata: { testDelta: { value: "text-delta" } }
        }),
        Response.makePart("text-end", {
          id: "text-1",
          metadata: { testEnd: { value: "text-end" } }
        }),
        Response.makePart("reasoning-start", {
          id: "reasoning-1",
          metadata: { openai: { itemId: "reasoning-item" } }
        }),
        Response.makePart("reasoning-delta", {
          id: "reasoning-1",
          delta: "Thinking"
        }),
        Response.makePart("reasoning-delta", {
          id: "reasoning-1",
          delta: "",
          metadata: { testDelta: { value: "reasoning-delta" } }
        }),
        Response.makePart("reasoning-end", {
          id: "reasoning-1",
          metadata: {
            openai: { encryptedContent: "encrypted-reasoning" },
            testEnd: { value: "reasoning-end" }
          }
        })
      ]

      const prompt = Prompt.fromResponseParts(parts)

      assert.deepStrictEqual(
        prompt,
        Prompt.make([{
          role: "assistant",
          content: [
            {
              type: "text",
              text: "Hello",
              options: {
                testStart: { value: "text-start" },
                testDelta: { value: "text-delta" },
                testEnd: { value: "text-end" }
              }
            },
            {
              type: "reasoning",
              text: "Thinking",
              options: {
                openai: {
                  itemId: "reasoning-item",
                  encryptedContent: "encrypted-reasoning"
                },
                testDelta: { value: "reasoning-delta" },
                testEnd: { value: "reasoning-end" }
              }
            }
          ]
        }])
      )
    })

    it("places tool calls in assistant messages and tool results in tool messages", () => {
      const parts = [
        Response.makePart("tool-call", {
          id: "call-1",
          name: "get_weather",
          params: { city: "London" },
          providerExecuted: false
        }),
        Response.makePart("tool-result", {
          id: "call-1",
          name: "get_weather",
          isFailure: false,
          result: { temp: 20 },
          encodedResult: { temp: 20 },
          preliminary: false,
          providerExecuted: false
        })
      ]
      const prompt = Prompt.fromResponseParts(parts)

      // Should have assistant message with tool-call, then tool message with tool-result
      assert.strictEqual(prompt.content.length, 2)
      assert.strictEqual(prompt.content[0].role, "assistant")
      assert.strictEqual(prompt.content[1].role, "tool")

      // Assistant message contains the tool-call
      const assistantContent = prompt.content[0].content
      assert.strictEqual(assistantContent.length, 1)
      assert.strictEqual(typeof assistantContent[0] === "object" && assistantContent[0].type, "tool-call")

      // Tool message contains the tool-result
      const toolContent = prompt.content[1].content
      assert.strictEqual(toolContent.length, 1)
      assert.strictEqual(typeof toolContent[0] === "object" && toolContent[0].type, "tool-result")
    })

    it("places provider-executed tool results in the assistant message", () => {
      const parts = [
        Response.makePart("tool-call", {
          id: "ws-1",
          name: "web_search",
          params: {},
          providerExecuted: true
        }),
        Response.makePart("tool-result", {
          id: "ws-1",
          name: "web_search",
          isFailure: false,
          result: { sources: 3 },
          encodedResult: { sources: 3 },
          preliminary: false,
          providerExecuted: true
        }),
        Response.makePart("tool-call", {
          id: "call-1",
          name: "get_weather",
          params: { city: "London" },
          providerExecuted: false
        }),
        Response.makePart("tool-result", {
          id: "call-1",
          name: "get_weather",
          isFailure: false,
          result: { temp: 20 },
          encodedResult: { temp: 20 },
          preliminary: false,
          providerExecuted: false
        })
      ]
      const prompt = Prompt.fromResponseParts(parts)

      // Provider-executed pair stays in the assistant message; only the
      // framework-executed result forms a tool message
      assert.strictEqual(prompt.content.length, 2)
      assert.strictEqual(prompt.content[0].role, "assistant")
      assert.strictEqual(prompt.content[1].role, "tool")

      const assistantContent = prompt.content[0].content
      assert.strictEqual(assistantContent.length, 3)
      assert.strictEqual(typeof assistantContent[1] === "object" && assistantContent[1].type, "tool-result")
      assert.deepStrictEqual((assistantContent[1] as any).id, "ws-1")
      assert.strictEqual((assistantContent[1] as any).providerExecuted, true)

      const toolContent = prompt.content[1].content
      assert.strictEqual(toolContent.length, 1)
      assert.deepStrictEqual((toolContent[0] as any).id, "call-1")
      assert.strictEqual((toolContent[0] as any).providerExecuted, false)
    })

    it("should handle out-of-order tool results (result before call in stream)", () => {
      // This simulates concurrent tool execution where results may arrive
      // in different order than their corresponding calls
      const parts = [
        // Tool call A arrives first
        Response.makePart("tool-call", {
          id: "call-A",
          name: "tool_a",
          params: {},
          providerExecuted: false
        }),
        // Tool call B arrives second
        Response.makePart("tool-call", {
          id: "call-B",
          name: "tool_b",
          params: {},
          providerExecuted: false
        }),
        // But tool B's result arrives before tool A's result
        Response.makePart("tool-result", {
          id: "call-B",
          name: "tool_b",
          isFailure: false,
          result: "result-B",
          encodedResult: "result-B",
          preliminary: false,
          providerExecuted: false
        }),
        Response.makePart("tool-result", {
          id: "call-A",
          name: "tool_a",
          isFailure: false,
          result: "result-A",
          encodedResult: "result-A",
          preliminary: false,
          providerExecuted: false
        })
      ]
      const prompt = Prompt.fromResponseParts(parts)

      // Should still produce valid message structure
      assert.strictEqual(prompt.content.length, 2)
      assert.strictEqual(prompt.content[0].role, "assistant")
      assert.strictEqual(prompt.content[1].role, "tool")

      // Assistant message has tool calls in order they arrived
      const assistantContent = prompt.content[0].content
      assert.strictEqual(assistantContent.length, 2)
      assert.strictEqual(typeof assistantContent[0] === "object" && assistantContent[0].type, "tool-call")
      assert.deepStrictEqual((assistantContent[0] as any).id, "call-A")
      assert.strictEqual(typeof assistantContent[1] === "object" && assistantContent[1].type, "tool-call")
      assert.deepStrictEqual((assistantContent[1] as any).id, "call-B")

      // Tool message has results in order they arrived (B before A)
      const toolContent = prompt.content[1].content
      assert.strictEqual(toolContent.length, 2)
      assert.strictEqual(typeof toolContent[0] === "object" && toolContent[0].type, "tool-result")
      assert.deepStrictEqual((toolContent[0] as any).id, "call-B")
      assert.strictEqual(typeof toolContent[1] === "object" && toolContent[1].type, "tool-result")
      assert.deepStrictEqual((toolContent[1] as any).id, "call-A")
    })

    it("keeps only the final non-preliminary tool result", () => {
      const parts = [
        Response.makePart("tool-call", {
          id: "call-1",
          name: "long_task",
          params: {},
          providerExecuted: false
        }),
        // Preliminary result (progress update)
        Response.makePart("tool-result", {
          id: "call-1",
          name: "long_task",
          isFailure: false,
          result: { progress: 50 },
          encodedResult: { progress: 50 },
          preliminary: true,
          providerExecuted: false
        }),
        // Another preliminary result
        Response.makePart("tool-result", {
          id: "call-1",
          name: "long_task",
          isFailure: false,
          result: { progress: 100 },
          encodedResult: { progress: 100 },
          preliminary: true,
          providerExecuted: false
        }),
        // Final result
        Response.makePart("tool-result", {
          id: "call-1",
          name: "long_task",
          isFailure: false,
          result: { done: true },
          encodedResult: { done: true },
          preliminary: false,
          providerExecuted: false
        })
      ]
      const prompt = Prompt.fromResponseParts(parts)

      // Should have assistant and tool messages
      assert.strictEqual(prompt.content.length, 2)

      // Tool message should only contain the final result, not preliminary ones
      const toolContent = prompt.content[1].content
      assert.strictEqual(toolContent.length, 1)
      assert.deepStrictEqual((toolContent[0] as any).result, { done: true })
    })
  })

  describe("merge", () => {
    it("should sequentially combine the content of two Prompts", () => {
      const leftMessages = [
        Prompt.makeMessage("user", {
          content: [Prompt.makePart("text", { text: "a" })]
        }),
        Prompt.makeMessage("assistant", {
          content: [Prompt.makePart("text", { text: "b" })]
        })
      ]
      const rightMessages = [
        Prompt.makeMessage("user", {
          content: [Prompt.makePart("text", { text: "c" })]
        }),
        Prompt.makeMessage("assistant", {
          content: [Prompt.makePart("text", { text: "d" })]
        })
      ]
      const left = Prompt.fromMessages(leftMessages)
      const right = Prompt.fromMessages(rightMessages)
      const merged = Prompt.concat(left, right)
      assert.deepStrictEqual(
        merged,
        Prompt.fromMessages([
          ...leftMessages,
          ...rightMessages
        ])
      )
    })

    it("returns Prompt.empty when both inputs have no messages", () => {
      const merged = Prompt.concat(Prompt.empty, [])
      assert.deepStrictEqual(merged, Prompt.empty)
    })

    it("accepts raw message input when the left prompt is empty", () => {
      const prompt = Prompt.empty
      const merged = Prompt.concat(prompt, [
        { role: "user", content: "a" },
        { role: "assistant", content: "b" }
      ])
      assert.deepStrictEqual(
        merged,
        Prompt.make([
          Prompt.makeMessage("user", {
            content: [Prompt.makePart("text", { text: "a" })]
          }),
          Prompt.makeMessage("assistant", {
            content: [Prompt.makePart("text", { text: "b" })]
          })
        ])
      )
    })

    it("returns the original prompt when the input has no messages", () => {
      const messages = [
        Prompt.makeMessage("user", {
          content: [Prompt.makePart("text", { text: "a" })]
        }),
        Prompt.makeMessage("assistant", {
          content: [Prompt.makePart("text", { text: "b" })]
        })
      ]
      const prompt = Prompt.fromMessages(messages)
      const merged = Prompt.concat(prompt, [])
      assert.deepStrictEqual(merged, prompt)
    })
  })

  describe("appendSystem", () => {
    it("appends text to the leading system message", () => {
      const prompt = Prompt.make([
        { role: "system", content: "You are an expert in programming." },
        { role: "user", content: "Hello, world!" }
      ])

      const result = Prompt.appendSystem(prompt, " You are a helpful assistant.")

      assert.deepStrictEqual(
        result.content[0],
        Prompt.makeMessage("system", {
          content: "You are an expert in programming. You are a helpful assistant."
        })
      )
    })

    it("creates a leading system message if none exists", () => {
      const prompt = Prompt.make([
        { role: "user", content: "Hello, world!" }
      ])

      const result = Prompt.appendSystem(prompt, "You are a helpful assistant.")

      assert.deepStrictEqual(
        result.content[0],
        Prompt.makeMessage("system", {
          content: "You are a helpful assistant."
        })
      )
    })

    it("creates a system message for an empty prompt", () => {
      const prompt = Prompt.empty

      const result = Prompt.appendSystem(prompt, "You are a helpful assistant.")

      assert.deepStrictEqual(
        result.content[0],
        Prompt.makeMessage("system", { content: "You are a helpful assistant." })
      )
    })
  })

  describe("prependSystem", () => {
    it("prepends text to the leading system message", () => {
      const prompt = Prompt.make([
        {
          role: "system",
          content: "You are an expert in programming."
        },
        {
          role: "user",
          content: "Hello, world!"
        }
      ])

      const result = Prompt.prependSystem(prompt, "You are a helpful assistant. ")

      assert.deepStrictEqual(
        result.content[0],
        Prompt.makeMessage("system", {
          content: "You are a helpful assistant. You are an expert in programming."
        })
      )
    })

    it("creates a leading system message if none exists", () => {
      const prompt = Prompt.make([
        {
          role: "user",
          content: "Hello, world!"
        }
      ])

      const result = Prompt.prependSystem(prompt, "You are a helpful assistant.")

      assert.deepStrictEqual(
        result.content[0],
        Prompt.makeMessage("system", {
          content: "You are a helpful assistant."
        })
      )
    })

    it("creates a system message for an empty prompt", () => {
      const prompt = Prompt.empty

      const result = Prompt.prependSystem(prompt, "You are a helpful assistant.")

      assert.deepStrictEqual(
        result.content[0],
        Prompt.makeMessage("system", { content: "You are a helpful assistant." })
      )
    })
  })
})
