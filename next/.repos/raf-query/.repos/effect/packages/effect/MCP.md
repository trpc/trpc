## Introduction

The `McpServer.ts` module provides an implementation of an [MCP (Model Context Protocol)](https://modelcontextprotocol.io/docs/getting-started/intro) server using the
[Effect](https://effect.website) eco system.

## Getting Started

It's important to understand the architecture of the Effect MCP server.
Here is an example of a MCP server implementation:

```typescript
import { NodeRuntime, NodeStdio } from "@effect/platform-node"
import { Effect, Layer, Logger, Schema } from "effect"
import { McpProtocol, McpServer, Tool, Toolkit } from "effect/ai"

// Define a simple tool
const DemoTool = Tool.make("DemoTool", {
  description: "A demo tool that echoes back the input",
  parameters: Schema.Struct({
    message: Schema.String
  }),
  success: Schema.String
})

const MyToolkit = Toolkit.make(DemoTool)

const DemoResource = McpServer.resource({
  uri: "file:///demo.txt",
  name: "Demo Resource",
  content: Effect.succeed("# Demo Content\nThis is a demo resource.")
})

const DemoPrompt = McpServer.prompt({
  name: "Demo Prompt",
  description: "A demo prompt",
  parameters: {
    topic: Schema.String
  },
  completion: {
    topic: () => Effect.succeed(["AI", "programming", "Effect"])
  },
  content: ({ topic }) => Effect.succeed(`Tell me about ${topic}`)
})

const ServerLayer = Layer.mergeAll(
  DemoResource,
  DemoPrompt,
  McpServer.toolkit(MyToolkit).pipe(
    Layer.provideMerge(
      MyToolkit.toLayer({
        DemoTool: ({ message }) => Effect.succeed(`Echo: ${message}`)
      })
    )
  )
).pipe(
  Layer.provide(
    McpServer.layerStdio({
      name: "Demo MCP Server",
      version: "1.0.0",
      protocols: [McpProtocol.v2025_06_18]
    })
  ),
  Layer.provide(NodeStdio.layer),
  Layer.provide(Logger.layer([Logger.consolePretty()])),
  Layer.provideMerge(Layer.succeed(Logger.LogToStderr, true))
)

Layer.launch(ServerLayer).pipe(NodeRuntime.runMain)
```

The server exposes three main parts:

- **`Resource`**, which represents a readable MCP resource such as a file accessible to the client
- **`Prompt`**, which defines a prompt template that can be used by the client and should not be
  confused with `Prompt.ts`
- **`ToolkitLayer`**, which contains the definitions of all tools the server exposes, provided with
  their implementations through `ToolImplLayer`.

The part layers are merged into one layer that has a MCP server implementation as dependency.
`McpServer.layerStdio` is used to create a standard I/O–based MCP server identified by its name and
version. Its ordered, non-empty `protocols` declaration names implemented protocol adapters rather
than arbitrary version strings. This release supports `McpProtocol.v2024_11_05`,
`McpProtocol.v2025_03_26`, and `McpProtocol.v2025_06_18`. The `v2024_11_05` adapter implements that
revision's RPC schemas and stdio framing, including its batch policy. It does not implement the
historical two-endpoint HTTP+SSE transport. `McpServer.layerHttp` instead offers the 2024 RPC schema
through the same single-endpoint HTTP compatibility transport used by the 2025 adapters. Because of
the layer architecture the server implementation can be easily exchanged with this HTTP-based
implementation. Finally, a logging layer is added with
`Logger.layer([Logger.consolePretty({ stderr: true })])`, ensuring logs are written to `stderr`.
This is essential when using stdio, as any output to `stdout` would interfere with the protocol
communication.

## Resources

Resources in the MCP server represent files or data that can be accessed by an MCP client. Each
resource is defined as a template that specifies its location, behavior, and metadata. The
`McpServer.resource` helper allows you to declaratively define such resources with dynamic
parameters, completions, and content generation.

```typescript
import { Effect, Schema } from "effect"
import { McpSchema, McpServer } from "effect/ai"

const SimpleResource = McpServer.resource({
  uri: "file:///demo.txt",
  name: "Demo Resource",
  description: "A simple demo resource",
  mimeType: "text/plain",
  content: Effect.succeed("This is demo content")
})

const idParam = McpSchema.param("id", Schema.NumberFromString)

const TemplateResource = McpServer.resource`file://path/to/file/${idParam}`({
  name: "Demo Resource Template",
  description: "A parameterized resource template",
  completion: {
    id: (_: string) => Effect.succeed([1, 2, 3, 4, 5])
  },
  content: Effect.fn(function*(_uri, id) {
    return `# MCP Server Demo - ID: ${id}`
  }),
  mimeType: "text/x-markdown",
  audience: ["assistant", "user"]
})
```

In this example, the resource is parameterized by an `id` that forms part of the URI. The
`completion` function enables clients to request valid parameter values dynamically. The `content`
function defines how the resource's data is generated at runtime—in this case, returning a Markdown
string containing the provided `id`. The `mimeType` specifies the format of the resource, while the
`audience` property determines who can access it (either `"assistant"` and/or `"user"`).

## Prompts

Prompts define reusable templates that an MCP client can invoke with parameters. They serve as
structured, parameterized instructions or messages that the client can send to the server. Using
`McpServer.prompt`, you can describe the prompt's schema, auto-completion behavior, and content
generation logic in a declarative way.

```typescript
import { Effect, Schema } from "effect"
import { McpServer } from "effect/ai"

const DemoPrompt = McpServer.prompt({
  name: "Demo Prompt",
  description: "A demo prompt to demonstrate MCP server capabilities",
  parameters: {
    name: Schema.String
  },
  completion: {
    name: () => Effect.succeed(["Tom", "Tim", "Jerry"])
  },
  content: ({ name }) => Effect.succeed(`Use the greetings tool to write a greeting for ${name}.`)
})
```

In this example, the prompt defines a single parameter, `name`. The `completion` property provides
an auto-completion mechanism, allowing the client to suggest or autofill common names. The `content`
function then generates the actual prompt text dynamically based on the provided parameter.

## Tools and Toolkit

Tools define executable capabilities that the MCP server exposes to clients. Each tool describes a
contract while the actual logic is provided separately through an implementation layer. Tools are
grouped into toolkits, which can be combined and converted into layers.

```typescript
import { Effect, Layer, Schema } from "effect"
import { McpServer, Tool, Toolkit } from "effect/ai"

const DemoTool = Tool.make("DemoTool", {
  description: "This is a demo tool for the documentation",
  parameters: Schema.Struct({
    demoId: Schema.Number,
    demoName: Schema.String
  }),
  success: Schema.String
})

const OtherDemoTool = Tool.make("OtherDemoTool", {
  description: "Another demo tool",
  parameters: Schema.Struct({
    value: Schema.Number
  }),
  success: Schema.String
})

const MyToolkit = Toolkit.make(DemoTool, OtherDemoTool)

const ToolkitLayer = McpServer.toolkit(MyToolkit).pipe(
  Layer.provideMerge(
    MyToolkit.toLayer({
      DemoTool: ({ demoId, demoName }) => Effect.succeed(`Processed ${demoName} with ID ${demoId}`),
      OtherDemoTool: ({ value }) => Effect.succeed(`Other tool result: ${value * 2}`)
    })
  )
)
```

In this example, `Tool.make` defines new tools with typed parameters and result schemas for success
outcomes. Multiple tools can be grouped into a single `Toolkit` using `Toolkit.make`.

The toolkit is then transformed into a layer defining the interface of the tools using
`McpServer.toolkit()`. The corresponding implementations are attached using `.toLayer`, which binds
each tool definition to its concrete logic. Finally, the completed toolkit layer can be merged with
other layers to create the MCP server.

## Elicitation requests

Elicitation requests are used to request additional input directly from the user. An elicitation
defines both the message shown to the user and the expected response schema, ensuring structured and
validated user input.

```typescript
import { Effect, Schema } from "effect"
import { McpServer } from "effect/ai"

const DemoElicitation = McpServer.elicit({
  message: `Please answer the question ("yes" | "no") (default "no"):`,
  schema: Schema.Struct({
    answer: Schema.Union([Schema.Literal("yes"), Schema.Literal("no")])
  })
}).pipe(
  Effect.catchTag("ElicitationDeclined", (_error) => {
    return Effect.succeed({ answer: "no" })
  })
)
```

In this example, the server poses a simple yes/no question to the user. The input is validated
against the defined schema, ensuring that only `"yes"` or `"no"` responses are accepted. If the user
declines to answer or the elicitation fails, a fallback value is provided—here, the default answer
is `"no"`.

## Complete Working Example

Here's a complete, copy/pastable MCP server example that combines all the concepts:

```typescript
import { NodeRuntime, NodeStdio } from "@effect/platform-node"
import { Effect, Layer, Logger, Schema } from "effect"
import { McpProtocol, McpSchema, McpServer, Tool, Toolkit } from "effect/ai"

// Define tools
const GreetTool = Tool.make("GreetTool", {
  description: "Generate a greeting message",
  parameters: Schema.Struct({
    name: Schema.String,
    style: Schema.Union([Schema.Literal("formal"), Schema.Literal("casual")])
  }),
  success: Schema.String
})

const CalculatorTool = Tool.make("CalculatorTool", {
  description: "Perform basic arithmetic operations",
  parameters: Schema.Struct({
    operation: Schema.Union([
      Schema.Literal("add"),
      Schema.Literal("subtract"),
      Schema.Literal("multiply"),
      Schema.Literal("divide")
    ]),
    a: Schema.Number,
    b: Schema.Number
  }),
  success: Schema.Number
})

// Create toolkit
const MyToolkit = Toolkit.make(GreetTool, CalculatorTool)

// Define a resource
const ReadmeResource = McpServer.resource({
  uri: "file:///README.md",
  name: "README",
  description: "Project README file",
  mimeType: "text/markdown",
  content: Effect.succeed("# MCP Server Demo\n\nThis is a demo MCP server built with Effect.")
})

// Define a parameterized resource
const idParam = McpSchema.param("id", Schema.NumberFromString)

const UserResource = McpServer.resource`file://users/${idParam}.json`({
  name: "User Data",
  description: "User information by ID",
  completion: {
    id: (_: string) => Effect.succeed([1, 2, 3, 4, 5])
  },
  content: Effect.fn(function*(_uri, id) {
    return JSON.stringify(
      {
        id,
        name: `User ${id}`,
        email: `user${id}@example.com`
      },
      null,
      2
    )
  }),
  mimeType: "application/json"
})

// Define a prompt
const AnalysisPrompt = McpServer.prompt({
  name: "Analyze Data",
  description: "Analyze data and provide insights",
  parameters: {
    dataType: Schema.String,
    focus: Schema.Union([Schema.Literal("summary"), Schema.Literal("details")])
  },
  completion: {
    dataType: () => Effect.succeed(["sales", "users", "metrics"]),
    focus: () => Effect.succeed(["summary" as const, "details" as const])
  },
  content: ({ dataType, focus }) =>
    Effect.succeed(
      `Please analyze the ${dataType} data and provide a ${focus} analysis. Use available tools to gather information.`
    )
})

// Create the server layer
const ServerLayer = Layer.mergeAll(
  ReadmeResource,
  UserResource,
  AnalysisPrompt,
  McpServer.toolkit(MyToolkit).pipe(
    Layer.provideMerge(
      MyToolkit.toLayer({
        GreetTool: ({ name, style }) => {
          const greeting = style === "formal"
            ? `Good day, ${name}. It is a pleasure to meet you.`
            : `Hey ${name}! What's up?`
          return Effect.succeed(greeting)
        },
        CalculatorTool: ({ operation, a, b }) => {
          let result: number
          switch (operation) {
            case "add":
              result = a + b
              break
            case "subtract":
              result = a - b
              break
            case "multiply":
              result = a * b
              break
            case "divide":
              result = a / b
              break
          }
          return Effect.succeed(result)
        }
      })
    )
  )
).pipe(
  Layer.provide(
    McpServer.layerStdio({
      name: "Demo MCP Server",
      version: "1.0.0",
      protocols: [McpProtocol.v2025_06_18]
    })
  ),
  Layer.provide(NodeStdio.layer),
  Layer.provideMerge(Layer.succeed(Logger.LogToStderr, true))
)

// Run the server
Layer.launch(ServerLayer).pipe(NodeRuntime.runMain)
```
