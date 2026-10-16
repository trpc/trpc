import { assert, describe, it } from "@effect/vitest"
import type * as McpProtocol from "effect/ai/McpProtocol"
import * as McpSchema from "effect/ai/McpSchema"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import { McpConformance, type McpConformanceLayer } from "./McpConformance.ts"

const decodeCompletion = Schema.decodeUnknownEffect(McpSchema.CompleteResult)

const complete = (
  ref: { readonly type: "ref/prompt"; readonly name: string } | {
    readonly type: "ref/resource"
    readonly uri: string
  },
  argument: { readonly name: string; readonly value: string },
  context?: { readonly arguments?: Readonly<Record<string, string>> | undefined }
) =>
  Effect.gen(function*() {
    const response = yield* completeRaw(ref, argument, context)
    const test = yield* McpConformance
    return yield* test.decodeResult(response).pipe(
      Effect.flatMap((message) => decodeCompletion(message.result))
    )
  })

const completeRaw = (
  ref: { readonly type: "ref/prompt"; readonly name: string } | {
    readonly type: "ref/resource"
    readonly uri: string
  },
  argument: { readonly name: string; readonly value: string },
  context?: { readonly arguments?: Readonly<Record<string, string>> | undefined }
) =>
  Effect.gen(function*() {
    const test = yield* McpConformance
    const initialized = yield* test.initialize({ server: "features" })
    yield* test.notifyInitialized(initialized)
    const response = yield* test.send(initialized, {
      jsonrpc: "2.0",
      id: 2,
      method: "completion/complete",
      params: { ref, argument, ...(context === undefined ? {} : { context }) }
    })
    return response
  })

export const suite = (protocol: McpProtocol.ProtocolAdapter, layer: McpConformanceLayer) =>
  it.layer(layer)(`Mcp Conformance (${protocol.protocolVersion})`, (it) => {
    describe("Completion", () => {
      // https://modelcontextprotocol.io/specification/2025-03-26/server/utilities/completion
      describe("Capabilities", () => {
        it.effect("MUST advertise completions when argument completion is supported", () =>
          Effect.gen(function*() {
            const test = yield* McpConformance
            const initialized = yield* test.initialize({ server: "features" })

            assert.property(initialized.message.result.capabilities, "completions")
          }))
      })

      describe("Requesting Completions", () => {
        it.effect("MUST complete a prompt argument", () =>
          Effect.gen(function*() {
            const result = yield* complete(
              { type: "ref/prompt", name: "TestPrompt" },
              { name: "required", value: "f" }
            )

            assert.deepStrictEqual(result.completion.values, ["first", "second"])
          }))

        it.effect("MUST complete a resource template argument", () =>
          Effect.gen(function*() {
            const result = yield* complete(
              { type: "ref/resource", uri: "file:///template/{path}" },
              { name: "path", value: "a" }
            )

            assert.deepStrictEqual(result.completion.values, ["alpha", "beta"])
          }))
        it.effect("SHOULD reject an unknown prompt reference with Invalid Params", () =>
          Effect.gen(function*() {
            const test = yield* McpConformance
            const initialized = yield* test.initialize({ server: "features" })
            yield* test.notifyInitialized(initialized)
            const response = yield* test.send(initialized, {
              jsonrpc: "2.0",
              id: 2,
              method: "completion/complete",
              params: {
                ref: { type: "ref/prompt", name: "UnknownPrompt" },
                argument: { name: "value", value: "" }
              }
            })
            const error = yield* test.decodeError(response)

            assert.strictEqual(error.error.code, McpSchema.INVALID_PARAMS_ERROR_CODE)
          }))

        it.effect("MUST reject an unknown argument name", () =>
          Effect.gen(function*() {
            const test = yield* McpConformance
            const initialized = yield* test.initialize({ server: "features" })
            yield* test.notifyInitialized(initialized)
            const response = yield* test.send(initialized, {
              jsonrpc: "2.0",
              id: 2,
              method: "completion/complete",
              params: {
                ref: { type: "ref/prompt", name: "TestPrompt" },
                argument: { name: "unknown", value: "" }
              }
            })
            const error = yield* test.decodeError(response)

            assert.strictEqual(error.error.code, McpSchema.INVALID_PARAMS_ERROR_CODE)
          }))

        it.effect("MUST return completion values in order", () =>
          Effect.gen(function*() {
            const result = yield* complete(
              { type: "ref/resource", uri: "file:///template/{path}" },
              { name: "path", value: "" }
            )

            assert.deepStrictEqual(result.completion.values, ["beta", "alpha"])
          }))

        it.effect("SCHEMA returns the total and additional-results indicator", () =>
          Effect.gen(function*() {
            const result = yield* complete(
              { type: "ref/resource", uri: "file:///template/{path}" },
              { name: "path", value: "" }
            )

            assert.strictEqual(result.completion.total, 2)
            assert.strictEqual(result.completion.hasMore, false)
          }))

        it.effect("MUST return at most one hundred completion values", () =>
          Effect.gen(function*() {
            const result = yield* complete(
              { type: "ref/prompt", name: "TestPrompt" },
              { name: "required", value: "limit" }
            )

            assert.strictEqual(result.completion.values.length, 100)
            assert.strictEqual(result.completion.total, 101)
            assert.strictEqual(result.completion.hasMore, true)
          }))

        // https://modelcontextprotocol.io/specification/2025-06-18/server/utilities/completion#completioncontext
        it.effect.skipIf(["2024-11-05", "2025-03-26"].includes(protocol.protocolVersion))(
          "should pass previously resolved arguments when completion context is supplied",
          () =>
            Effect.gen(function*() {
              const result = yield* complete(
                { type: "ref/prompt", name: "ContextCompletionPrompt" },
                { name: "value", value: "c" },
                { arguments: { locale: "en" } }
              )

              assert.deepStrictEqual(result.completion.values, ["context received"])
            })
        )
      })
    })
  })
