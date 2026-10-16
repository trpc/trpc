import { assert, describe, it } from "@effect/vitest"
import type * as McpProtocol from "effect/ai/McpProtocol"
import * as McpSchema from "effect/ai/McpSchema"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import { makeMcpStdioHarness } from "../TestUtils/McpStdioHarness.ts"
import { McpConformance, type McpConformanceLayer } from "./McpConformance.ts"

const decodePrompts = Schema.decodeUnknownEffect(McpSchema.ListPromptsResult)
const decodeGetPrompt = Schema.decodeUnknownEffect(McpSchema.GetPromptResult)

const getPrompt = (name: string) =>
  Effect.gen(function*() {
    const message = yield* getPromptWire(name)
    return yield* decodeGetPrompt(message.result)
  })

const getPromptWire = (name: string) =>
  Effect.gen(function*() {
    const test = yield* McpConformance
    const initialized = yield* test.initialize({ server: "features" })
    yield* test.notifyInitialized(initialized)
    const response = yield* test.send(initialized, {
      jsonrpc: "2.0",
      id: 2,
      method: "prompts/get",
      params: { name }
    })
    return yield* test.decodeResult(response)
  })

export const suite = (
  protocol: McpProtocol.ProtocolAdapter,
  layer: McpConformanceLayer,
  options?: { readonly additionalPromptNames?: ReadonlyArray<string> }
) =>
  it.layer(layer)(`Mcp Conformance (${protocol.protocolVersion})`, (it) => {
    describe("Prompts", () => {
      // Shared capability contract; each dated entrypoint owns its normative specification revision.
      describe("Capabilities", () => {
        it.effect("MUST advertise prompts when prompts are registered", () =>
          Effect.gen(function*() {
            const test = yield* McpConformance
            const initialized = yield* test.initialize({ server: "features" })

            assert.property(initialized.message.result.capabilities, "prompts")
          }))

        it.effect("MUST NOT advertise prompts when prompts are not supported", () =>
          Effect.gen(function*() {
            const test = yield* McpConformance
            const initialized = yield* test.initialize()

            assert.notProperty(initialized.message.result.capabilities, "prompts")
          }))
      })

      describe("Listing Prompts", () => {
        it.effect(
          "MUST list every prompt visible to the initialized client",
          () =>
            Effect.gen(function*() {
              const test = yield* McpConformance
              const initialized = yield* test.initialize({ server: "features" })
              yield* test.notifyInitialized(initialized)
              const response = yield* test.send(initialized, {
                jsonrpc: "2.0",
                id: 2,
                method: "prompts/list",
                params: {}
              })
              const result = yield* test.decodeResult(response).pipe(
                Effect.flatMap((message) => decodePrompts(message.result))
              )

              const expected = [
                "AudioPrompt",
                "ContextCompletionPrompt",
                "EmbeddedResourcePrompt",
                "ImagePrompt",
                "NoArgumentPrompt",
                "TestPrompt",
                ...(options?.additionalPromptNames ?? [])
              ].sort()
              assert.deepStrictEqual(result.prompts.map((prompt) => prompt.name).sort(), expected)
            })
        )

        it.effect(
          "SCHEMA preserves prompt names, titles, descriptions, and arguments",
          () =>
            Effect.gen(function*() {
              const test = yield* McpConformance
              const initialized = yield* test.initialize({ server: "features" })
              yield* test.notifyInitialized(initialized)
              const response = yield* test.send(initialized, {
                jsonrpc: "2.0",
                id: 2,
                method: "prompts/list",
                params: {}
              })
              const result = yield* test.decodeResult(response).pipe(
                Effect.flatMap((message) => decodePrompts(message.result))
              )

              const prompt = result.prompts.find((prompt) => prompt.name === "TestPrompt")
              assert.isDefined(prompt)
              assert.strictEqual(
                prompt.title,
                ["2024-11-05", "2025-03-26"].includes(protocol.protocolVersion) ? undefined : "Test prompt"
              )
              assert.strictEqual(prompt.description, "A test prompt")
              assert.deepStrictEqual(prompt.arguments?.map((argument) => argument.name), [
                "required",
                "optional"
              ])
            })
        )

        it.effect(
          "MUST mark required and optional prompt arguments correctly",
          () =>
            Effect.gen(function*() {
              const test = yield* McpConformance
              const initialized = yield* test.initialize({ server: "features" })
              yield* test.notifyInitialized(initialized)
              const response = yield* test.send(initialized, {
                jsonrpc: "2.0",
                id: 2,
                method: "prompts/list",
                params: {}
              })
              const result = yield* test.decodeResult(response).pipe(
                Effect.flatMap((message) => decodePrompts(message.result))
              )

              const prompt = result.prompts.find((prompt) => prompt.name === "TestPrompt")
              assert.isDefined(prompt)
              assert.deepStrictEqual(prompt.arguments, [
                { name: "required", required: true },
                { name: "optional", required: false }
              ])
            })
        )
      })

      describe("Getting Prompts", () => {
        it.effect("MUST get a registered prompt without arguments", () =>
          Effect.gen(function*() {
            const test = yield* McpConformance
            const initialized = yield* test.initialize({ server: "features" })
            yield* test.notifyInitialized(initialized)
            const response = yield* test.send(initialized, {
              jsonrpc: "2.0",
              id: 2,
              method: "prompts/get",
              params: { name: "NoArgumentPrompt" }
            })
            const result = yield* test.decodeResult(response).pipe(
              Effect.flatMap((message) => decodeGetPrompt(message.result))
            )

            assert.deepStrictEqual(result.messages, [{
              role: "user",
              content: { type: "text", text: "no arguments" }
            }])
          }))
        it.effect("MUST get a registered prompt with valid arguments", () =>
          Effect.gen(function*() {
            const test = yield* McpConformance
            const initialized = yield* test.initialize({ server: "features" })
            yield* test.notifyInitialized(initialized)
            const response = yield* test.send(initialized, {
              jsonrpc: "2.0",
              id: 2,
              method: "prompts/get",
              params: {
                name: "TestPrompt",
                arguments: {
                  required: "required",
                  optional: "optional"
                }
              }
            })
            const result = yield* test.decodeResult(response).pipe(
              Effect.flatMap((message) => decodeGetPrompt(message.result))
            )

            assert.deepStrictEqual(result.messages, [{
              role: "user",
              content: { type: "text", text: "required:optional" }
            }])
          }))

        it.effect("SHOULD reject an unknown prompt name with Invalid Params", () =>
          Effect.gen(function*() {
            const test = yield* McpConformance
            const initialized = yield* test.initialize({ server: "features" })
            yield* test.notifyInitialized(initialized)
            const response = yield* test.send(initialized, {
              jsonrpc: "2.0",
              id: 2,
              method: "prompts/get",
              params: {
                name: "UnknownPrompt",
                arguments: {}
              }
            })
            const error = yield* test.decodeError(response)

            assert.strictEqual(error.error.code, McpSchema.INVALID_PARAMS_ERROR_CODE)
          }))

        it.effect("SHOULD reject missing required prompt arguments with Invalid Params", () =>
          Effect.gen(function*() {
            const test = yield* McpConformance
            const initialized = yield* test.initialize({ server: "features" })
            yield* test.notifyInitialized(initialized)
            const response = yield* test.send(initialized, {
              jsonrpc: "2.0",
              id: 2,
              method: "prompts/get",
              params: {
                name: "TestPrompt",
                arguments: {}
              }
            })
            const error = yield* test.decodeError(response)

            assert.strictEqual(error.error.code, McpSchema.INVALID_PARAMS_ERROR_CODE)
          }))

        it.effect("SHOULD reject prompt arguments with invalid values", () =>
          Effect.gen(function*() {
            const test = yield* McpConformance
            const initialized = yield* test.initialize({ server: "features" })
            yield* test.notifyInitialized(initialized)
            const response = yield* test.send(initialized, {
              jsonrpc: "2.0",
              id: 2,
              method: "prompts/get",
              params: {
                name: "TestPrompt",
                arguments: {
                  required: 123
                }
              }
            })
            const error = yield* test.decodeError(response)

            assert.strictEqual(error.error.code, McpSchema.INVALID_PARAMS_ERROR_CODE)
          }))
        it.effect("MUST not invoke the prompt handler when argument validation fails", () =>
          Effect.gen(function*() {
            const test = yield* McpConformance
            yield* test.resetObservations
            const initialized = yield* test.initialize({ server: "features" })
            yield* test.notifyInitialized(initialized)
            const response = yield* test.send(initialized, {
              jsonrpc: "2.0",
              id: 2,
              method: "prompts/get",
              params: {
                name: "TestPrompt",
                arguments: { required: 123 }
              }
            })
            const error = yield* test.decodeError(response)

            assert.strictEqual(error.error.code, McpSchema.INVALID_PARAMS_ERROR_CODE)
            assert.strictEqual((yield* test.observations).promptInvocations, 0)
          }))
        it.effect("SCHEMA preserves the prompt description and message order", () =>
          Effect.gen(function*() {
            const test = yield* McpConformance
            const initialized = yield* test.initialize({ server: "features" })
            yield* test.notifyInitialized(initialized)
            const response = yield* test.send(initialized, {
              jsonrpc: "2.0",
              id: 2,
              method: "prompts/get",
              params: {
                name: "TestPrompt",
                arguments: { required: "test" }
              }
            })
            const result = yield* test.decodeResult(response).pipe(
              Effect.flatMap((message) => decodeGetPrompt(message.result))
            )

            assert.strictEqual(result.description, "A test prompt")
            assert.deepStrictEqual(result.messages.map((message) => message.role), ["user"])
          }))

        it.effect("MUST return text message content", () =>
          Effect.gen(function*() {
            const test = yield* McpConformance
            const initialized = yield* test.initialize({ server: "features" })
            yield* test.notifyInitialized(initialized)
            const response = yield* test.send(initialized, {
              jsonrpc: "2.0",
              id: 2,
              method: "prompts/get",
              params: {
                name: "TestPrompt",
                arguments: { required: "text" }
              }
            })
            const result = yield* test.decodeResult(response).pipe(
              Effect.flatMap((message) => decodeGetPrompt(message.result))
            )

            assert.deepStrictEqual(result.messages[0]?.content, {
              type: "text",
              text: "text:omitted"
            })
          }))
        it.effect("MUST return image message content", () =>
          Effect.gen(function*() {
            const result = yield* getPromptWire("ImagePrompt")
            assert.deepStrictEqual(result.result.messages, [{
              role: "user",
              content: {
                type: "image",
                data: "AQID",
                mimeType: "image/png"
              }
            }])
          }))
        it.effect("MUST return embedded resource message content", () =>
          Effect.gen(function*() {
            const result = yield* getPrompt("EmbeddedResourcePrompt")
            assert.deepStrictEqual(result.messages, [{
              role: "user",
              content: {
                type: "resource",
                resource: {
                  uri: "file:///embedded",
                  mimeType: "text/plain",
                  text: "embedded"
                }
              }
            }])
          }))

        it.effect.skipIf(protocol.protocolVersion === "2024-11-05")(
          "should return base64 audio content when an audio prompt is requested",
          () =>
            Effect.gen(function*() {
              const result = yield* getPromptWire("AudioPrompt")
              assert.deepStrictEqual(result.result.messages, [{
                role: "user",
                content: {
                  type: "audio",
                  data: "BAUG",
                  mimeType: "audio/wav"
                }
              }])
            })
        )
      })
    })
  })

export const statefulLegacySuite = (
  protocol: McpProtocol.ProtocolAdapter<McpProtocol.StatefulProtocolVersion>,
  layer: McpConformanceLayer
) =>
  it.layer(layer)(`Mcp Conformance (${protocol.protocolVersion})`, (it) => {
    // https://modelcontextprotocol.io/specification/2025-11-25/server/prompts
    describe("Prompts > Legacy notifications", () => {
      it.effect("should advertise prompt list-change notifications when supported", () =>
        Effect.gen(function*() {
          const test = yield* McpConformance
          const initialized = yield* test.initialize({ server: "features" })

          assert.strictEqual(initialized.message.result.capabilities.prompts?.listChanged, true)
        }))

      it.effect("should send a prompt list-change notification when the advertised list changes", () =>
        Effect.gen(function*() {
          const fixture = yield* makeMcpStdioHarness(protocol)
          const makePrompt = (name: string) => ({
            prompt: new McpSchema.Prompt({ name }),
            annotations: Context.empty(),
            completions: {},
            handle: () =>
              Effect.succeed(
                new McpSchema.GetPromptResult({
                  messages: [{ role: "user", content: { type: "text", text: name } }]
                })
              )
          })
          yield* fixture.server.addPrompt(makePrompt("baseline-list-changed-prompt"))
          yield* fixture.initialize()
          yield* fixture.server.addPrompt(makePrompt("dynamic-list-changed-prompt"))
          yield* fixture.flushListChanged

          const notification = yield* fixture.awaitOutboundMethod("notifications/prompts/list_changed")
          assert.strictEqual(notification.jsonrpc, "2.0")
          assert.strictEqual(notification.method, "notifications/prompts/list_changed")
          assert.notProperty(notification, "id")

          const response = yield* fixture.sendRequest("prompts/list", {})
          const result = yield* decodePrompts(response.result)
          assert.isTrue(result.prompts.some((prompt) => prompt.name === "dynamic-list-changed-prompt"))
        }))
    })
  })
