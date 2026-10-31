import { Context, Effect, Schema, SchemaGetter } from "effect"
import type { AiError } from "effect/ai/AiError"
import * as McpClient from "effect/ai/McpClient"
import type { McpClientError } from "effect/ai/McpClientError"
import type * as McpProtocol from "effect/ai/McpProtocol"
import * as McpSchema from "effect/ai/McpSchema"
import type * as Tool from "effect/ai/Tool"
import { describe, expect, it } from "tstyche"

const client = {} as McpClient.McpClient

const tool = McpSchema.Tool.make({ name: "read", inputSchema: { type: "object" } })

class Policy extends Context.Service<Policy, string>()("test/McpClientPolicy") {}

const Length = Schema.String.pipe(Schema.decodeTo(Schema.Number, {
  decode: SchemaGetter.transformEffect(() => Policy.pipe(Effect.map((value) => value.length))),
  encode: SchemaGetter.transform(String)
}))

type BoundTool<A> = Effect.Success<A> extends { readonly tools: Record<string, infer T> } ? T : never

describe("McpClient", () => {
  it("should return the raw result when no schema is supplied", () => {
    type Result = Effect.Effect<McpSchema.CallToolResult, McpClientError>
    expect(client.callTool({ tool })).type.toBe<Result>()
    expect(client.callTool({ tool }, { timeout: "1 second" })).type.toBe<Result>()
  })

  it("should infer the decoded type and decoder services when a schema is supplied", () => {
    type Result = Effect.Effect<number, McpClientError, Policy>
    expect(client.callTool({ tool, schema: Length })).type.toBe<Result>()
  })

  it("should return both result shapes when the schema may be absent", () => {
    const schema = {} as typeof Schema.String | undefined
    expect(client.callTool({ tool, schema })).type.toBe<
      Effect.Effect<string | McpSchema.CallToolResult, McpClientError>
    >()
  })

  it("should reuse MCP schema types for prompts and resources", () => {
    const prompt = McpSchema.Prompt.make({ name: "review" })
    expect(client.listPrompts()).type.toBe<Effect.Effect<ReadonlyArray<McpSchema.Prompt>, McpClientError>>()
    expect(client.getPrompt({ prompt, arguments: { code: "example" } })).type.toBe<
      Effect.Effect<McpSchema.GetPromptResult, McpClientError>
    >()
    expect(client.listResources()).type.toBe<
      Effect.Effect<ReadonlyArray<McpSchema.Resource>, McpClientError>
    >()
    expect(client.readResource({ uri: "test://document" })).type.toBe<
      Effect.Effect<McpSchema.ReadResourceResult, McpClientError>
    >()
  })

  it("should take the client identity as flat options", () => {
    type Options = Parameters<typeof McpClient.make>[0]
    expect<{ name: string; version: string }>().type.toBeAssignableTo<Options>()
    expect<{
      name: string
      version: string
      title: string
      description: string
      websiteUrl: string
      icons: ReadonlyArray<McpSchema.Icon>
      timeout: "1 second"
    }>().type.toBeAssignableTo<Options>()
    expect<{ clientInfo: McpSchema.Implementation }>().type.not.toBeAssignableTo<Options>()
  })

  it("should accept only client-supported protocol adapters", () => {
    type Protocol = Parameters<typeof McpClient.http>[0]["protocol"]
    expect<typeof McpProtocol.v2025_11_25>().type.toBeAssignableTo<Protocol>()
    expect<typeof McpProtocol.v2026_07_28>().type.toBeAssignableTo<Protocol>()
    expect<typeof McpProtocol.v2025_06_18>().type.not.toBeAssignableTo<Protocol>()
  })

  it("should infer result and error types when toolkit modes are selected or omitted", () => {
    const plain = McpClient.toolkit(client)
    const prefixed = McpClient.toolkit(client, "remote__")
    const complete = McpClient.toolkit(client, { resultMode: "complete" })
    const returned = McpClient.toolkit(client, { resultMode: "complete", failureMode: "return" })
    const text = McpClient.toolkit(client, { failureMode: "return" })

    expect<Tool.Success<BoundTool<typeof plain>>>().type.toBe<string>()
    expect<Tool.Success<BoundTool<typeof prefixed>>>().type.toBe<string>()
    expect<Tool.Success<BoundTool<typeof complete>>>().type.toBe<McpSchema.CallToolResult>()
    expect<Tool.Success<BoundTool<typeof returned>>>().type.toBe<McpSchema.CallToolResult>()
    expect<Tool.Success<BoundTool<typeof text>>>().type.toBe<string>()
    expect<Tool.HandlerError<BoundTool<typeof plain>>>().type.toBe<McpClientError | AiError>()
    expect<Tool.HandlerError<BoundTool<typeof complete>>>().type.toBe<McpClientError | AiError>()
    expect<Tool.HandlerError<BoundTool<typeof returned>>>().type.toBe<never>()
    expect<Tool.HandlerError<BoundTool<typeof text>>>().type.toBe<never>()
  })

  it("should require mode selectors when typed options choose nondefault modes", () => {
    expect(McpClient.toolkit<"complete">).type.not.toBeCallableWith(client, { tools: [tool] })
    expect(McpClient.toolkit<"text", "return">).type.not.toBeCallableWith(client, { tools: [tool] })
  })

  it("should require mode selectors when type arguments choose nondefault modes", () => {
    expect(McpClient.toolkit<"complete">).type.not.toBeCallableWith(client)
    expect(McpClient.toolkit<"complete">).type.not.toBeCallableWith(client, "remote__")
    expect(McpClient.toolkit<"text", "error" | "return">).type.not.toBeCallableWith(client, {})
  })

  it("should keep MCP handler errors when a supplied failure mode may be error", () => {
    const failureMode = "error" as Tool.FailureMode
    const bound = McpClient.toolkit(client, { failureMode })
    expect<McpClientError | AiError>().type.toBeAssignableTo<Tool.HandlerError<BoundTool<typeof bound>> | AiError>()
  })

  it("should retain customization dependencies when the bound handler is invoked", () => {
    const customized = McpClient.toolkit(client, {
      resultMode: "complete",
      failureMode: "return",
      transformTool: (remote, descriptor) => {
        expect(descriptor).type.toBe<McpSchema.Tool>()
        expect<Tool.Success<typeof remote>>().type.toBe<McpSchema.CallToolResult>()
        return remote.addDependency(Policy).setNeedsApproval(true)
      }
    })

    expect<Effect.Services<typeof customized>>().type.toBe<never>()
    const handled = Effect.gen(function*() {
      const toolkit = yield* customized
      return yield* toolkit.handle("remote", {})
    })
    expect<Effect.Services<typeof handled>>().type.toBe<Policy>()
  })

  it("should reject customization when its result or failure schema changes", () => {
    expect(McpClient.toolkit).type.not.toBeCallableWith(client, {
      resultMode: "complete" as const,
      transformTool: (remote: McpClient.RemoteTool<"complete">) => remote.setSuccess(Schema.Number)
    })
    expect(McpClient.toolkit).type.not.toBeCallableWith(client, {
      transformTool: (remote: McpClient.RemoteTool) => remote.setFailure(Schema.String)
    })
  })
})
