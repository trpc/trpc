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

const Registrations = Layer.mergeAll(
  DemoResource,
  DemoPrompt,
  McpServer.toolkit(MyToolkit).pipe(
    Layer.provide(
      MyToolkit.toLayer({
        DemoTool: ({ message }) => Effect.succeed(`Echo: ${message}`)
      })
    )
  )
)

const ServerLayer = McpServer.layerStdio({
  name: "Demo MCP Server",
  version: "1.0.0",
  protocols: [McpProtocol.v2025_06_18],
  registrations: Registrations
}).pipe(
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

The registration layers are merged and passed to the server as `registrations`, so they are
registered before the server reads its first request. Each registration layer requires the
`McpServer` service, which the transport provides. `McpServer.layerStdio` is used to create a standard I/O–based MCP server identified by its name and
version. Its ordered, non-empty `protocols` declaration names implemented protocol adapters rather
than arbitrary version strings. This release supports `McpProtocol.v2024_11_05`,
`McpProtocol.v2025_03_26`, `McpProtocol.v2025_06_18`, `McpProtocol.v2025_11_25`, and
`McpProtocol.v2026_07_28`. Both `layerStdio` and `layerHttp` support all five adapters;
`layerHttpRequestScoped` supports only the stateless `v2026_07_28` adapter.
The `v2024_11_05` adapter implements that revision's RPC schemas and stdio framing, including its
batch policy. It does not implement the historical two-endpoint HTTP+SSE transport.
`McpServer.layerHttp` instead offers the 2024 RPC schema through the same single-endpoint HTTP
compatibility transport used by the newer adapters. Because of
the layer architecture the server implementation can be easily exchanged with this HTTP-based
implementation. Finally, a logging layer is added with
`Layer.succeed(Logger.LogToStderr, true)`, ensuring logs are written to `stderr`.
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

## Skills

Skills publish [Agent Skills](https://agentskills.io/) under the MCP Skills extension
([SEP-2640](https://modelcontextprotocol.io/seps/2640-skills-extension)). `McpServer.skill` takes
the URI of the skill's `SKILL.md` and the skill's files, `SKILL.md` included:

```typescript
import { McpServer } from "effect/ai"

const RefundsSkill = McpServer.skill({
  uri: "skill://billing/refunds/SKILL.md",
  files: {
    "SKILL.md": `---
name: refunds
description: Process refunds using the billing tools
---

Read references/policy.md before issuing a refund.
`,
    "references/policy.md": "Refunds above CHF 500 require manager approval.\n"
  }
})
```

- Each file is served verbatim as a resource under the skill's URI, and the skill's frontmatter is
  parsed from `SKILL.md`. Clients may parse it with YAML 1.1, which reads values such as `yes` or
  `1.0` as booleans and numbers, so quote strings like these. Values JSON cannot carry, such as
  `.inf` and `.nan`, are listed as `null`.
- Clients list skills with `skills/list`, look one up with `skills/get`, and browse directories with
  `resources/directory/read`. Each entry lists every file with the SHA-256 digest and size of the
  bytes served. The bytes are copied at registration.
- The server declares the `io.modelcontextprotocol/skills` extension once a skill is registered, on
  every protocol revision. Under `v2026_07_28` the `skills` cache hint applies to these results.
- Building the layer fails with `IllegalArgumentError` when the skill breaks the extension's rules:
  a name other than the last URI segment, a `SKILL.md` without frontmatter, frontmatter that is not
  valid `McpSchema.SkillFrontmatter` (the Agent Skills specification's fields, such as string-only
  `metadata` values), a file outside the skill, or more than 512 files or 16 MiB.
- Skills cannot nest: registering a skill whose directory contains or lies inside another skill's
  fails. So does registering a skill with a file whose URI is already a resource, and registering a
  resource at the URI of a skill's file afterwards is a defect.

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
other registrations and passed to the server.

A tool result is sent to the client in its JSON encoding, the same encoding its advertised
`outputSchema` describes. For example, a `Schema.Date` field is sent as an ISO string and a
`Schema.Void` field as `null`.

## Request-level dependencies

Some services only exist per request, such as the user a request is made for. A tool declares them
with `dependencies`, and the handlers of resources and prompts declare them by reading them. These
services are request-level: the registration carries them as `McpServer.McpRequest<"Requires", S>`
markers, and only MCP middleware or the transport can satisfy them. Providing the service with
`Layer.provide` does not, so a request-level service is never satisfied by a construction-time value
by mistake. An unsatisfied marker is a compile error.

```typescript
import { NodeRuntime, NodeStdio } from "@effect/platform-node"
import { Context, Effect, Layer, Schema } from "effect"
import { McpProtocol, McpSchema, McpServer, Tool, Toolkit } from "effect/ai"

class CurrentUser extends Context.Service<CurrentUser, { readonly id: string }>()("CurrentUser") {}

class Unauthorized extends Schema.Error<Unauthorized>("Unauthorized")({
  ...McpSchema.McpErrorBase.fields,
  _tag: Schema.tag("Unauthorized"),
  code: Schema.tag(-32001)
}) {}

const WhoAmI = Tool.make("WhoAmI", { success: Schema.String, dependencies: [CurrentUser] })
const Tools = Toolkit.make(WhoAmI)

// Runs around every tools/call, resources/read, prompts/get and completion/complete request.
const Auth = McpServer.middleware<{ provides: CurrentUser }>()((effect, { headers }) => {
  const token = headers["authorization"]
  return token === undefined
    ? Effect.fail(new Unauthorized({ message: "Missing credentials" }))
    : Effect.provideService(effect, CurrentUser, { id: token })
})

const Registrations = McpServer.toolkit(Tools).pipe(
  Layer.provide(Auth.layer),
  Layer.provide(Tools.toLayer({
    WhoAmI: () => Effect.map(CurrentUser, (user) => user.id)
  }))
)

McpServer.layerStdio({
  name: "Demo MCP Server",
  version: "1.0.0",
  protocols: [McpProtocol.v2025_06_18],
  registrations: Registrations
}).pipe(
  Layer.provide(NodeStdio.layer),
  Layer.launch,
  NodeRuntime.runMain
)
```

A few rules to know:

- `middleware.layer` applies the middleware to the registrations it is provided to.
  `middleware.layerGlobal`, or `McpServer.middleware(fn, { global: true })`, applies it to every
  request on the server. Global middleware runs outside local middleware.
- A middleware that needs a service per request gets it from a middleware that provides it and
  runs outside it: `a.combine(b)` runs `b` outside `a`, and so does providing `b.layer` or
  `b.layerGlobal` outside `a.layer`. Until then `a.layer` requires `McpRequest<"Requires", S>`,
  like a registration with request-level dependencies, so the transport rules below apply.
- The transport discharges what it supplies. Every transport supplies `Scope`, HTTP transports
  supply `HttpServerRequest`, and `McpServerClient` is supplied only when every protocol in a
  literal `protocols` tuple is sessionful. Mixing in a sessionless protocol such as `v2026_07_28`,
  or widening the tuple to `ProtocolAdapter[]`, leaves `McpServerClient` to be provided by
  middleware: narrow `protocols` rather than providing a placeholder client. `layerHttp` and `layerHttpRequestScoped` turn any other marker into
  an `HttpRouter` requirement, so an existing `HttpRouter.middleware` that provides `CurrentUser`
  keeps working, and so does its 401 response.
- Middleware failures must be `McpErrorBase` values and are sent as JSON-RPC errors with their
  `code`, `message` and `data`, never as tool results. Use codes from the implementation-defined
  range (-32000 to -32019). Defects are logged, reported and sent as `InternalError`.
- Resource and prompt handlers have no `dependencies` option: everything their handler reads is
  request-level. Read construction-time services in `Layer.unwrap` and close over them:

```typescript
import { Context, Effect, Layer } from "effect"
import { McpServer } from "effect/ai"

class Db extends Context.Service<Db, { readonly read: (key: string) => Effect.Effect<string> }>()("Db") {}

const Notes = Layer.unwrap(Effect.gen(function*() {
  const db = yield* Db // construction-time
  return McpServer.resource({ uri: "file:///notes", name: "notes", content: db.read("notes") })
}))
```

- Request services take precedence over services captured when a registration was built, on every
  transport. A service a registration was given with `Layer.provide` is a default that the server's
  own context overrides. Handler finalizers run when the request ends.
- To call registrations in process, for example in tests, build them with `McpServer.McpServer.layer`
  and provide each request-level dependency with a test middleware, then call `callTool`,
  `findResource`, `getPromptResult` or `completion` on the service.

### Per-request visibility

`McpServer.visibility` hides registrations per request, for example tools only admins may see. It
is middleware whose check returns a boolean. A hidden registration is left out of list results, and
calling, reading, getting or completing it fails as if it was not registered. The check reads
request-level services from middleware combined outside it:

```typescript
import { Context, Effect, Layer, Schema } from "effect"
import { McpServer, Tool, Toolkit } from "effect/ai"

class CurrentUser extends Context.Service<CurrentUser, { readonly isAdmin: boolean }>()("CurrentUser") {}

const Auth = McpServer.middleware<{ provides: CurrentUser }>()((effect, { headers }) =>
  Effect.provideService(effect, CurrentUser, { isAdmin: headers["x-role"] === "admin" })
)
const AdminOnly = McpServer.visibility(() => Effect.map(CurrentUser, (user) => user.isAdmin))

const PublicTools = Toolkit.make(Tool.make("Search", { success: Schema.String }))
const AdminTools = Toolkit.make(Tool.make("DeleteUser", { success: Schema.String }))

const Registrations = Layer.mergeAll(
  McpServer.toolkit(PublicTools).pipe(
    Layer.provide(PublicTools.toLayer({ Search: () => Effect.succeed("found") }))
  ),
  McpServer.toolkit(AdminTools).pipe(
    Layer.provide(AdminOnly.combine(Auth).layer),
    Layer.provide(AdminTools.toLayer({ DeleteUser: () => Effect.succeed("deleted") }))
  )
)
```

- Scope a visibility by providing its layer to some registrations only, as above, or branch on the
  `target` it receives. `McpServer.visibility(check, { global: true })` applies it to every
  registration.
- On list requests only the middleware outside the innermost visibility runs, once for each
  registration, with that registration as `target` and an `undefined` `payload`.
  `audit.combine(adminOnly)` keeps `audit` off list requests and `adminOnly.combine(audit)` runs it
  there. Middleware wrapping no visibility never runs on list requests. Cache expensive lookups,
  such as resolving the user from a token, in the middleware itself.
- A failure of that middleware or of a check fails the whole list request rather than hiding
  anything. A global visibility makes global middleware such as authentication run on every list
  request, so make it succeed for anonymous clients if they should still see public registrations.
- A hidden skill is left out of `skills/list` and directory reads, and `skills/get` fails as if it
  was not registered. Its checks receive the skill's `SKILL.md` URI as `target`, and its files are
  checked as resources under their own URIs. `resources/directory/read` counts as a list request,
  run once for each skill that has the directory.
- Middleware sees requests for hidden registrations. `EnabledWhen` remains the way to hide
  registrations by client capabilities without running middleware.
- `list_changed` notifications are not sent when visibility changes; clients see the change on
  their next list request.

### Cache hints

Under `v2026_07_28`, discovery, list and resource-read results tell clients how long they may
treat the result as fresh. By default every result has `{ ttlMs: 0, cacheScope: "private" }`, so
clients refetch each time. Pass `cacheHints` to a server layer to let clients keep a list for
longer:

```typescript
import { McpProtocol, McpServer } from "effect/ai"

const ServerLayer = McpServer.layerHttp({
  name: "Demo Server",
  version: "1.0.0",
  path: "/mcp",
  protocols: [McpProtocol.v2026_07_28],
  cacheHints: {
    tools: { ttl: "1 minute", cacheScope: "private" }
  }
})
```

- The entries are `discover`, `tools`, `resources`, `resourceTemplates`, `prompts` and `skills`.
  Omitted entries and `resources/read` keep the default. Earlier protocol revisions ignore the
  option.
- `ttl` accepts any `Duration.Input` and is sent as whole milliseconds, rounded down. It must be
  finite and nonnegative, and only `"private"` scope is supported. Otherwise building the layer
  fails with `IllegalArgumentError`.
- The hints only tell clients what they may cache. The server still lists registrations, applies
  visibility and checks each call on every request.
- With a positive `ttl`, a client can keep showing a list after registrations or visibility
  change, until the hint expires. Private scope does not separate users, so a client shared between
  users can show one user's list to another.

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
const Registrations = Layer.mergeAll(
  ReadmeResource,
  UserResource,
  AnalysisPrompt,
  McpServer.toolkit(MyToolkit).pipe(
    Layer.provide(
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
)

const ServerLayer = McpServer.layerStdio({
  name: "Demo MCP Server",
  version: "1.0.0",
  protocols: [McpProtocol.v2025_06_18],
  registrations: Registrations
}).pipe(
  Layer.provide(NodeStdio.layer),
  Layer.provideMerge(Layer.succeed(Logger.LogToStderr, true))
)

// Run the server
Layer.launch(ServerLayer).pipe(NodeRuntime.runMain)
```

## Connecting to an MCP server

`McpClient` connects to an MCP server, discovers its tools, prompts and resources, and calls them.
The client and its `McpClientError` module are experimental, so their API may change in minor
releases. It supports the `2025-11-25` and `2026-07-28` protocol revisions over stdio and Streamable HTTP.
The transport selects the revision explicitly; the client does not negotiate one.

The client covers discovery, tool calls, prompt retrieval, resource reads and Toolkit adaptation.
Resource templates, completion, logging, subscriptions, roots, sampling, elicitation, OAuth and
automatic retries are not implemented. Server requests other than `ping` receive a method-not-found
response, and modern `input_required` results fail with reason `UnsupportedError`.

### Connecting over HTTP

`McpClient.layerHttp` provides a connected client from an `HttpClient`. The layer scope owns the
connection: legacy sessions are closed with a `DELETE` when the scope ends.

```typescript
import { Effect, Layer } from "effect"
import { McpClient, McpProtocol } from "effect/ai"
import { FetchHttpClient } from "effect/http"

const ClientLayer = McpClient.layerHttp({
  name: "report-workflow",
  version: "1.0.0",
  protocol: McpProtocol.v2026_07_28,
  url: "http://localhost:3000/mcp"
}).pipe(Layer.provide(FetchHttpClient.layer))

const program = Effect.gen(function*() {
  const client = yield* McpClient.McpClient
  const tools = yield* client.listTools()
  yield* Effect.log(tools.map((tool) => tool.name))
})

await Effect.runPromise(program.pipe(Effect.provide(ClientLayer)))
```

Transport `headers` can carry static credentials. For rotating tokens, wrap the `HttpClient` with
`HttpClient.mapRequestEffect` and read the current token there.

### Connecting to a subprocess

`McpClient.layerStdio` spawns the server with the `ChildProcessSpawner` service and exchanges
newline-delimited JSON-RPC over its stdin and stdout. Server logs belong on stderr.

```typescript
import { NodeServices } from "@effect/platform-node"
import { Effect, Layer } from "effect"
import { McpClient, McpProtocol } from "effect/ai"
import { ChildProcess } from "effect/process"

const ClientLayer = McpClient.layerStdio({
  name: "report-workflow",
  version: "1.0.0",
  protocol: McpProtocol.v2025_11_25,
  command: ChildProcess.make("node", ["./mcp-server.mjs"])
}).pipe(Layer.provide(NodeServices.layer))

const program = Effect.gen(function*() {
  const client = yield* McpClient.McpClient
  const tools = yield* client.listTools()
  yield* Effect.log(tools.map((tool) => tool.name))
})

await Effect.runPromise(program.pipe(Effect.provide(ClientLayer)))
```

When the scope closes, the client closes stdin and waits five seconds for the process to exit, then
sends `SIGTERM`, and `SIGKILL` five seconds later.

To build a client without a layer, provide a `McpClient.Transport` from `McpClient.http` or
`McpClient.stdio` to `McpClient.make` inside an `Effect.scoped` region, and keep every use of the
client inside that scope.

### Calling tools

`callTool` takes the descriptor returned by `listTools`, not just a name: on modern HTTP the
descriptor's `x-mcp-header` annotations decide which arguments are mirrored into request headers.
Without a `schema` the full `McpSchema.CallToolResult` is returned, including `isError`, so the
caller decides how to treat tool-reported failures. With a `schema`, `structuredContent` is decoded
and a tool-reported failure fails with reason `ToolError` carrying the original result.

```typescript
import { Effect, Schema } from "effect"
import { McpClient, McpClientError } from "effect/ai"

const Report = Schema.Struct({ count: Schema.Number })

export const readReport = Effect.fn("readReport")(function*(reportId: string) {
  const client = yield* McpClient.McpClient
  const tools = yield* client.listTools()
  const tool = tools.find((tool) => tool.name === "read_report")
  if (tool === undefined) {
    return yield* new McpClientError.McpClientError({
      reason: new McpClientError.UnsupportedError({ description: "Server does not expose read_report" })
    })
  }
  return yield* client.callTool({ tool, arguments: { reportId }, schema: Report }, { timeout: "2 seconds" })
})
```

Remote input schemas are returned as JSON Schema metadata only. The client does not validate
arguments against them; define the argument contract in your application or in a `Toolkit`.

### Handling failures

Every failure is an `McpClientError.McpClientError` whose `reason` is one of the reason classes
exported by `McpClientError`: `TransportError`, `ProtocolError` (with the JSON-RPC `code` and
`data`), `HttpError` (with `status` and the `www-authenticate` and `retry-after` headers),
`ClosedError` (with `sessionExpired`), `TimeoutError` (with `operation`), `LimitError`,
`UnsupportedError`, `ValidationError`, `ConfigurationError` and `ToolError` (with the tool
`result`). Each reason derives its `message` from these fields and an optional `description`.
`McpClientError.isMcpClientError` and `McpClientError.isMcpClientErrorReason` identify them.

```typescript
import { Effect, Schema } from "effect"
import type { McpClient, McpSchema } from "effect/ai"

const Report = Schema.Struct({ count: Schema.Number })

export const readWithDeadline = (client: McpClient.McpClient, tool: McpSchema.Tool, reportId: string) =>
  client.callTool({ tool, arguments: { reportId }, schema: Report }, { timeout: "2 seconds" }).pipe(
    Effect.map((report) => ({ status: "ready" as const, report })),
    Effect.catchReason("McpClientError", "TimeoutError", () => Effect.succeed({ status: "deferred" as const }))
  )
```

`Effect.catchReason` and `Effect.catchReasons` recover from selected reasons;
`Effect.catchTag("McpClientError", ...)` handles them all. The client never retries, so a timeout
says nothing about whether the server completed the call.

### Limits and deadlines

Initialization and each complete discovery run under a single deadline, 60 seconds by default and
configurable per client with `timeout` or per call with the `timeout` option. Tool calls, prompts and
resource reads have no deadline unless you pass their `timeout` option or compose `Effect.timeout`.
Discovery follows pagination until the server stops returning a cursor and fails with `LimitError`
after 100 pages, 10,000 items or a repeated cursor. A missing server capability makes the list
operations return an empty array and the retrieval operations fail with `UnsupportedError`.

Discovery omits tools that require task-augmented execution. Modern HTTP discovery also omits tools
whose `x-mcp-header` annotations are invalid. Messages larger than `maxMessageBytes` (16 MiB by
default) are rejected in both directions.

The client creates no spans; wrap calls with `Effect.withSpan` or `Effect.fn` as needed.

### Exposing discovered tools to a language model

`McpClient.toolkit` discovers every tool and returns a `Toolkit.WithHandler` that `LanguageModel`
accepts. An optional prefix qualifies the model-facing names. Results become text by joining text
blocks, embedded text resources and resource links; when there is no content, `structuredContent`
is serialized as JSON. Binary content and tool-reported errors fail the handler.

```typescript
import { Effect } from "effect"
import { LanguageModel, McpClient } from "effect/ai"

export const readRemoteReport = (client: McpClient.McpClient) =>
  Effect.gen(function*() {
    const toolkit = yield* McpClient.toolkit(client, "reports__")
    return yield* LanguageModel.generateText({ prompt: "Read the quarterly report", toolkit })
  })
```

The toolkit is a snapshot: build a new one to pick up changes on the server. For custom naming,
validation, approval or result conversion, define tools with `Tool.make` or `Tool.dynamic` and
call `client.callTool` from their handlers.

### Prompts and resources

`listPrompts` and `listResources` return complete snapshots. `getPrompt` takes a discovered
`McpSchema.Prompt` with optional string arguments; `readResource` takes any URI. Results reuse the
`McpSchema.GetPromptResult` and `McpSchema.ReadResourceResult` types shared with the server.

```ts
import { Effect } from "effect"
import type { McpClient } from "effect/ai"

export const loadContext = (client: McpClient.McpClient) =>
  Effect.gen(function*() {
    const prompts = yield* client.listPrompts()
    const prompt = prompts.find((prompt) => prompt.name === "review")
    if (prompt !== undefined) {
      const result = yield* client.getPrompt({ prompt, arguments: { code: "const answer = 42" } })
      yield* Effect.log(result.messages)
    }

    const resources = yield* client.listResources()
    for (const resource of resources) {
      const result = yield* client.readResource({ uri: resource.uri })
      yield* Effect.log(result.contents)
    }
  })
```

### Skills

Pass `extensions: { skills: true }` to declare the MCP Skills extension
([SEP-2640](https://modelcontextprotocol.io/seps/2640-skills-extension)) and enable the skill
methods. Without it they fail with a `ConfigurationError`, and the client does not declare the
extension.

- `listSkills` returns every skill as an `McpSchema.Skill`, or none when the server does not declare
  the extension. An invalid entry fails the whole listing unless you pass `onInvalidSkill`, which
  leaves invalid entries out and receives each one. `getSkill` looks a skill up by the URI of its
  `SKILL.md`, listed or not.
- `readResourceDirectory` lists the direct children of a directory in a skill namespace, when the
  server declares `directoryRead`.
- `readSkillResource` reads a file listed in a skill's manifest and fails with a `ValidationError`
  unless its bytes match the listed SHA-256 digest and size, and, for `SKILL.md`, unless its YAML
  frontmatter equals the listed `frontmatter`. Use it rather than `readResource` for skill files. A
  skill whose `resources` is `"dynamic"` publishes no digests, so any file inside its directory can
  be read, and its `SKILL.md` frontmatter is still checked. Other files are never requested.
- Skill entries that break the extension's rules fail with a `ValidationError`. Of the frontmatter,
  only `name` and `description` are checked, so fields from later Agent Skills revisions still
  load. Decode `skill.frontmatter` with `McpSchema.SkillFrontmatter` to read the specification's
  fields.
- Acting on a skill is left to your application. The extension requires hosts to ignore
  `allowed-tools`, and any other frontmatter that widens permissions, unless the user approved the
  grant for that skill.

```ts
import { Effect } from "effect"
import type { McpClient } from "effect/ai"

export const loadSkill = (client: McpClient.McpClient, name: string) =>
  Effect.gen(function*() {
    const skills = yield* client.listSkills()
    const skill = skills.find((skill) => skill.frontmatter.name === name)
    if (skill === undefined) return undefined
    return yield* client.readSkillResource({ skill, uri: skill.uri })
  })
```
