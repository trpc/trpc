import type * as McpProtocol from "effect/ai/McpProtocol"
import * as McpSchema from "effect/ai/McpSchema"
import * as McpServer from "effect/ai/McpServer"
import * as Tool from "effect/ai/Tool"
import * as Toolkit from "effect/ai/Toolkit"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Ref from "effect/Ref"
import { CurrentLogLevel } from "effect/References"
import * as Schema from "effect/Schema"
import { makeServerLayer } from "../TestUtils/McpServerLayer.ts"

export interface Observations {
  readonly toolInvocations: number
  readonly promptInvocations: number
  readonly resourceTemplateInvocations: number
}

export const MrtrToolName = "MrtrTool"
export const MrtrStateOnlyToolName = "MrtrStateOnlyTool"
export const MrtrInvalidStateToolName = "MrtrInvalidStateTool"
export const MrtrPromptName = "MrtrPrompt"
export const MrtrSamplingToolsToolName = "MrtrSamplingToolsTool"
export const MrtrSamplingToolChoiceToolName = "MrtrSamplingToolChoiceTool"
export const mrtrRequestState = "opaque:+/=\u0000é"

const TestTool = Tool.make("TestTool", {
  description: "A test tool",
  parameters: Schema.Struct({
    value: Schema.String
  }),
  success: Schema.String
})

const makeStructuredTool = (protocolVersion: string) =>
  Tool.make("StructuredTool", {
    parameters: Tool.EmptyParams,
    success: Schema.Struct({
      value: Schema.String
    })
  }).annotate(
    McpSchema.EnabledWhen,
    (client) => client.protocolVersion === protocolVersion
  )

const LogLevelTool = Tool.make("LogLevelTool", {
  parameters: Tool.EmptyParams,
  success: Schema.String,
  dependencies: [CurrentLogLevel]
})

const RequestMetadataTool = Tool.make("RequestMetadataTool", {
  parameters: Tool.EmptyParams,
  success: Schema.String,
  dependencies: [McpSchema.McpRequestContext]
})

const makeTestToolkitLayer = (observations: Ref.Ref<Observations>, protocolVersion: string) => {
  const TestToolkit = Toolkit.make(TestTool, makeStructuredTool(protocolVersion), LogLevelTool, RequestMetadataTool)
  return McpServer.toolkit(TestToolkit).pipe(
    Layer.provide(TestToolkit.toLayer({
      TestTool: ({ value }) =>
        Ref.update(observations, (current) => ({
          ...current,
          toolInvocations: current.toolInvocations + 1
        })).pipe(Effect.as(value)),
      StructuredTool: () => Effect.succeed({ value: "structured" }),
      LogLevelTool: () => CurrentLogLevel,
      RequestMetadataTool: () =>
        McpSchema.McpRequestContext.useSync((context) => JSON.stringify(context.requestMetadata))
    }))
  )
}

const makeContentToolsLayer = Layer.effectDiscard(
  Effect.gen(function*() {
    const server = yield* McpServer.McpServer
    const add = (
      name: string,
      result: McpSchema.CallToolResult
    ) =>
      server.addTool({
        tool: new McpSchema.Tool({
          name,
          inputSchema: { type: "object", properties: {} }
        }),
        annotations: Context.empty(),
        handle: () => Effect.succeed(result)
      })

    yield* add(
      "ImageTool",
      new McpSchema.CallToolResult({
        content: [{
          type: "image",
          data: new Uint8Array([1, 2, 3]),
          mimeType: "image/png"
        }]
      })
    )
    yield* add(
      "EmbeddedResourceTool",
      new McpSchema.CallToolResult({
        content: [{
          type: "resource",
          resource: {
            uri: "file:///embedded",
            mimeType: "text/plain",
            text: "embedded"
          }
        }]
      })
    )
    yield* add(
      "MultipleContentTool",
      new McpSchema.CallToolResult({
        content: [
          { type: "text", text: "first" },
          { type: "text", text: "second" }
        ]
      })
    )
    yield* add(
      "ErrorTool",
      new McpSchema.CallToolResult({
        content: [{ type: "text", text: "expected failure" }],
        isError: true
      })
    )
    yield* server.addTool({
      tool: new McpSchema.Tool({
        name: "DefectTool",
        inputSchema: { type: "object", properties: {} }
      }),
      annotations: Context.empty(),
      handle: () => Effect.die("private defect details")
    })

    yield* server.addTool({
      tool: new McpSchema.Tool({
        name: "JsonSchema2020Tool",
        inputSchema: {
          $schema: "https://json-schema.org/draft/2020-12/schema",
          type: "object",
          $defs: { identifier: { type: "string" } },
          properties: { value: { $ref: "#/$defs/identifier" } },
          allOf: [{ required: ["value"] }],
          unevaluatedProperties: false
        }
      }),
      annotations: Context.make(
        McpSchema.EnabledWhen,
        (client) => client.protocolVersion === "2026-07-28"
      ),
      handle: () => Effect.succeed(new McpSchema.CallToolResult({ content: [] }))
    })

    yield* add(
      "AudioTool",
      new McpSchema.CallToolResult({
        content: [{
          type: "audio",
          data: new Uint8Array([4, 5, 6]),
          mimeType: "audio/wav"
        }]
      })
    )
    yield* add(
      "ResourceLinkTool",
      new McpSchema.CallToolResult({
        content: [{
          type: "resource_link",
          uri: "file:///test",
          name: "TestResource",
          mimeType: "text/plain"
        }]
      })
    )
  })
)

const makeHeaderToolLayer = (observations: Ref.Ref<Observations>) =>
  Layer.effectDiscard(
    Effect.gen(function*() {
      const server = yield* McpServer.McpServer
      yield* server.addTool({
        tool: new McpSchema.Tool({
          name: "HeaderTool",
          inputSchema: {
            type: "object",
            properties: {
              region: {
                type: "string",
                "x-mcp-header": "Region"
              },
              shard: {
                type: "integer",
                "x-mcp-header": "Shard"
              },
              routing: {
                type: "object",
                properties: { region: { type: "string", "x-mcp-header": "Nested-Region" } }
              },
              dryRun: {
                type: "boolean",
                "x-mcp-header": "Dry-Run"
              }
            },
            required: ["region"]
          }
        }),
        annotations: Context.make(
          McpSchema.EnabledWhen,
          (client) => client.protocolVersion === "2026-07-28"
        ),
        handle: () =>
          Ref.update(observations, (current) => ({
            ...current,
            toolInvocations: current.toolInvocations + 1
          })).pipe(Effect.as(new McpSchema.CallToolResult({ content: [] })))
      })
    })
  )

const mrtrToolLayer = Layer.effectDiscard(
  Effect.gen(function*() {
    const server = yield* McpServer.McpServer
    yield* server.addTool({
      tool: new McpSchema.Tool({
        name: MrtrToolName,
        description: "Requests confirmation before completing",
        inputSchema: { type: "object" }
      }),
      annotations: Context.make(
        McpSchema.EnabledWhen,
        (client) => client.protocolVersion === "2026-07-28"
      ),
      handle: () =>
        McpSchema.McpRequestContext.useSync((context) => {
          const approval = context.inputResponses?.approval
          const sample = context.inputResponses?.sample
          const roots = context.inputResponses?.roots
          if (
            context.requestState === mrtrRequestState && approval?.action === "accept" &&
            sample !== undefined && roots !== undefined
          ) {
            return new McpSchema.CallToolResult({
              content: [{
                type: "text",
                text: JSON.stringify({ approval: approval.content, sample, roots })
              }]
            })
          }
          return new McpSchema.InputRequired({
            inputRequests: {
              approval: {
                method: "elicitation/create",
                params: {
                  message: "Approve the operation",
                  requestedSchema: {
                    type: "object",
                    properties: {
                      approved: { type: "boolean" },
                      color: { type: "string", enum: ["red", "blue"] },
                      titled: {
                        type: "string",
                        oneOf: [{ const: "red", title: "Red" }, { const: "blue", title: "Blue" }]
                      },
                      legacy: { type: "string", enum: ["red", "blue"], enumNames: ["Red", "Blue"] }
                    },
                    required: ["approved"]
                  }
                }
              },
              sample: {
                method: "sampling/createMessage",
                params: {
                  messages: [{ role: "user", content: { type: "text", text: "Suggest a title" } }],
                  maxTokens: 20
                }
              },
              roots: {
                method: "roots/list"
              }
            },
            requestState: mrtrRequestState
          })
        })
    })
    yield* server.addTool({
      tool: new McpSchema.Tool({
        name: MrtrStateOnlyToolName,
        description: "Requests a retry without client input",
        inputSchema: { type: "object" }
      }),
      annotations: Context.make(
        McpSchema.EnabledWhen,
        (client) => client.protocolVersion === "2026-07-28"
      ),
      handle: () => Effect.succeed(new McpSchema.InputRequired({ requestState: mrtrRequestState }))
    })
    yield* server.addTool({
      tool: new McpSchema.Tool({
        name: MrtrInvalidStateToolName,
        description: "Rejects an invalid continuation state",
        inputSchema: { type: "object" }
      }),
      annotations: Context.make(
        McpSchema.EnabledWhen,
        (client) => client.protocolVersion === "2026-07-28"
      ),
      handle: () => Effect.fail(new McpSchema.InvalidParams({ message: "requestState integrity check failed" }))
    })
    const samplingToolRequests = [
      [
        MrtrSamplingToolsToolName,
        {
          messages: [{ role: "user", content: { type: "text", text: "Check the weather" } }],
          maxTokens: 20,
          tools: [{ name: "weather", inputSchema: { type: "object" } }]
        }
      ],
      [
        MrtrSamplingToolChoiceToolName,
        {
          messages: [{ role: "user", content: { type: "text", text: "Check the weather" } }],
          maxTokens: 20,
          toolChoice: { mode: "required" }
        }
      ]
    ] as const
    for (const [name, params] of samplingToolRequests) {
      yield* server.addTool({
        tool: new McpSchema.Tool({
          name,
          description: "Requests tool-enabled sampling before completing",
          inputSchema: { type: "object" }
        }),
        annotations: Context.make(
          McpSchema.EnabledWhen,
          (client) => client.protocolVersion === "2026-07-28"
        ),
        handle: () =>
          Effect.succeed(
            new McpSchema.InputRequired({
              inputRequests: {
                sample: { method: "sampling/createMessage", params }
              }
            })
          )
      })
    }
    yield* server.addPrompt({
      prompt: new McpSchema.Prompt({
        name: MrtrPromptName,
        description: "Requests client input before returning a prompt"
      }),
      annotations: Context.make(
        McpSchema.EnabledWhen,
        (client) => client.protocolVersion === "2026-07-28"
      ),
      completions: {},
      handle: () =>
        McpSchema.McpRequestContext.useSync((context) =>
          context.inputResponses?.userContext === undefined
            ? new McpSchema.InputRequired({
              inputRequests: {
                userContext: {
                  method: "elicitation/create",
                  params: {
                    message: "What context should the prompt use?",
                    requestedSchema: {
                      type: "object",
                      properties: { context: { type: "string" } },
                      required: ["context"]
                    }
                  }
                }
              }
            })
            : new McpSchema.GetPromptResult({
              messages: [{ role: "user", content: { type: "text", text: "Prompt completed" } }]
            })
        )
    })
  })
)

const templatePath = McpSchema.param("path", Schema.String)
const TestResourceTemplate = McpServer.resource`file:///template/${templatePath}`({
  name: "TestResourceTemplate",
  description: "A test resource template",
  mimeType: "text/plain",
  completion: {
    path: (value) => Effect.succeed(value === "" ? ["beta", "alpha"] : ["alpha", "beta"])
  },
  content: (uri, path) => Effect.succeed(`${uri}:${path}`)
})

const numericId = McpSchema.param("id", Schema.FiniteFromString)
const makeNumericResourceTemplate = (observations: Ref.Ref<Observations>) =>
  McpServer.resource`file:///numeric/${numericId}`({
    name: "NumericResourceTemplate",
    content: (uri) =>
      Ref.update(observations, (current) => ({
        ...current,
        resourceTemplateInvocations: current.resourceTemplateInvocations + 1
      })).pipe(Effect.as(uri))
  })

const ImagePrompt = McpServer.prompt({
  name: "ImagePrompt",
  content: () =>
    Effect.succeed([{
      role: "user",
      content: McpSchema.ImageContent.make({
        data: new Uint8Array([1, 2, 3]),
        mimeType: "image/png"
      })
    }])
})

const AudioPrompt = McpServer.prompt({
  name: "AudioPrompt",
  content: () =>
    Effect.succeed([{
      role: "user",
      content: McpSchema.AudioContent.make({
        data: new Uint8Array([4, 5, 6]),
        mimeType: "audio/wav"
      })
    }])
})

const EmbeddedResourcePrompt = McpServer.prompt({
  name: "EmbeddedResourcePrompt",
  content: () =>
    Effect.succeed([{
      role: "user",
      content: McpSchema.EmbeddedResource.make({
        resource: {
          uri: "file:///embedded",
          mimeType: "text/plain",
          text: "embedded"
        }
      })
    }])
})

const ContextCompletionPrompt = McpServer.prompt({
  name: "ContextCompletionPrompt",
  parameters: {
    value: Schema.String
  },
  completion: {
    value: (_input, context) =>
      Effect.succeed(context?.arguments?.locale === "en" ? ["context received"] : ["context missing"])
  },
  content: ({ value }) => Effect.succeed(value)
})

export const makeFeaturesServerLayer = (
  protocol: McpProtocol.ProtocolAdapter,
  observations: Ref.Ref<Observations>
) =>
  Layer.mergeAll(
    makeTestToolkitLayer(observations, protocol.protocolVersion),
    makeContentToolsLayer,
    makeHeaderToolLayer(observations),
    mrtrToolLayer,
    McpServer.resource({
      uri: "file:///test",
      name: "TestResource",
      description: "A test resource",
      mimeType: "text/plain",
      content: Effect.succeed(McpSchema.ReadResourceResult.make({
        contents: [{
          uri: "file:///test",
          mimeType: "text/plain",
          text: "test"
        }]
      }))
    }),
    McpServer.resource({
      uri: "file:///binary",
      name: "BinaryResource",
      mimeType: "application/octet-stream",
      content: Effect.succeed(McpSchema.ReadResourceResult.make({
        contents: [{
          uri: "file:///binary",
          mimeType: "application/octet-stream",
          blob: new Uint8Array([1, 2, 3])
        }]
      }))
    }),
    McpServer.resource({
      uri: "file:///multiple",
      name: "MultipleResource",
      content: Effect.succeed(McpSchema.ReadResourceResult.make({
        contents: [
          {
            uri: "file:///multiple#first",
            mimeType: "text/plain",
            text: "first"
          },
          {
            uri: "file:///multiple#second",
            mimeType: "text/plain",
            text: "second"
          }
        ]
      }))
    }),
    TestResourceTemplate,
    makeNumericResourceTemplate(observations),
    McpServer.prompt({
      name: "TestPrompt",
      title: "Test prompt",
      description: "A test prompt",
      parameters: {
        required: Schema.String,
        optional: Schema.optional(Schema.String)
      },
      completion: {
        required: (value) =>
          Effect.succeed(
            value === "limit"
              ? Array.from({ length: 101 }, (_, index) => `value-${index}`)
              : ["first", "second"]
          )
      },
      content: ({ optional, required }) =>
        Ref.update(observations, (current) => ({
          ...current,
          promptInvocations: current.promptInvocations + 1
        })).pipe(Effect.as(`${required}:${optional ?? "omitted"}`))
    }),
    McpServer.prompt({
      name: "NoArgumentPrompt",
      content: () => Effect.succeed("no arguments")
    }),
    ImagePrompt,
    EmbeddedResourcePrompt,
    AudioPrompt,
    ContextCompletionPrompt
  ).pipe(
    Layer.provide(makeServerLayer({
      name: "McpConformance",
      instructions: "Follow the test server instructions.",
      protocols: [protocol],
      extensions: { "example/lifecycle": { enabled: true } }
    }))
  )
