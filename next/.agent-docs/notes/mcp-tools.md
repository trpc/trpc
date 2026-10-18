# MCP tools: a router published over the Model Context Protocol

2026-10-18. Question ([proposal 25](../proposals/25-mcp.md)): can a router's procedures be served as [MCP](https://modelcontextprotocol.io/specification/2025-11-25) tools, so an agent (Claude, Cursor, ChatGPT, the MCP Inspector) calls them, with the schemas, middleware, validation and errors we already have, and nothing but Effect as a dependency?

Code: `next/spikes/mcp/`; run with `pnpm test` from `next/`, or serve it with `node mcp/serve.ts [--port 3333] [--user name]` from `next/spikes/` and point a client at `http://localhost:3333/mcp`. MCP protocol `2025-11-25`; tested with `@modelcontextprotocol/sdk` 1.32.1's client and the MCP Inspector CLI.

```ts
const t = initTrpc<{ ctx: Ctx }>().concat(experimental_openapi()).concat(mcp());

const byId = t.procedure
  .meta({ mcp: { description: 'Read one blog post by its id.' } })
  .input(z.object({ id: z.string().describe('The post id, e.g. "1"') }))
  .output(Post)
  .errors({ NOT_FOUND: { data: z.object({ id: z.string() }) } })
  .query(…);

const mcpHandler = createMcpHandler({
  router: appRouter,
  serverInfo: { name: 'blog', version: '1.0.0' },
  createContext: ({ request }) => ({ user: userFrom(request) }),
  filter: (opts) => opts.tool.name !== 'post_delete' || opts.ctx.user?.admin === true,
});
// POST /mcp → initialize, tools/list, tools/call
```

## What works

- **A root extension, like `experimental_openapi()`.** `mcp()` adds the `mcp` meta key: `true`, `false`, or `{ name?, title?, description?, annotations? }`, merged key by key across `.meta()` calls. `.meta({ mcp })` without the extension is a type error (`UndeclaredMeta`), as for `route` (`mcp.test-d.ts`).
- **Schemas come from `toContract()`.** Tool `inputSchema` and `outputSchema` are the JSON Schemas the OpenAPI generator already makes through Standard JSON Schema, so zod's `.describe()` reaches the model as the property's `description`. Nothing in the spike converts schemas.
- **MCP's shape constraints are met by wrapping.** MCP needs `type: 'object'` at the top of both schemas:
  - an object input or output is used as it is (`allOf` from chained inputs gets `type: 'object'` added);
  - a non-object input travels as `{ input }`, a non-object output as `structuredContent: { result }`;
  - a procedure without input gets `{ type: 'object', properties: {} }` and ignores arguments.
- **Descriptions are reused.** `title` and `description` fall back to OpenAPI's `route.summary` and `route.description`, so a router documented for OpenAPI is documented for agents too.
- **Annotations default from the procedure type.** Queries are `readOnlyHint: true, idempotentHint: true`; mutations are `readOnlyHint: false`. `mcp.annotations` overrides them (`destructiveHint` on a delete).
- **Calls are real calls.** `tools/call` runs the procedure with `call()`, so middleware (an `authed` procedure), input validation, output validation and declared errors all apply. The SDK client checks `structuredContent` against `outputSchema` and accepted every result.
- **Errors go to the model.** A procedure's failure is a tool result with `isError: true` and `{ code, message, data? }` as its text, which is what MCP asks for so a model can correct itself:
  - an invalid argument returns the validation issues (`path: ['title']`, `too_small`, `minimum: 3`);
  - a declared `NOT_FOUND` returns its `data`;
  - an unexpected throw is masked to `Internal server error`.
    The same body is in `_meta['io.trpc/error']` for programs. An unknown tool is a JSON-RPC error (`-32602`), as MCP specifies for protocol failures.
- **Auth hooks into MCP's.** `createContext` runs per JSON-RPC request; throwing `UNAUTHORIZED` from it answers HTTP 401 with `WWW-Authenticate: Bearer resource_metadata="…"`, which is what starts an MCP client's OAuth flow (RFC 9728). A tool-level `UNAUTHORIZED` from middleware stays a tool result.
- **Per-caller tools.** `filter({ tool, ctx })` hides tools in `tools/list` and refuses them in `tools/call`, so admins see `post_delete` and members don't.
- **The transport is small.** Stateless Streamable HTTP: one JSON-RPC message per POST, answered with `application/json`; notifications get 202; GET is 405 (no server-to-client stream); an unsupported `MCP-Protocol-Version` header is 400; a foreign `Origin` is 403 (MCP's DNS-rebinding rule); `initialize` answers an unknown version with the newest supported. `mcp.ts` is about 560 lines, formatted, a third of it types and doc comments.
- **Interop holds.** The official SDK client (`Client` + `StreamableHTTPClientTransport`) connects, lists and calls in-process (`mcp.test.ts`, 12 tests), and the MCP Inspector CLI does the same over a real socket (`node mcp/serve.ts`).
- `_meta` carries `io.trpc/path`, `io.trpc/type` and `io.trpc/errors` (declared codes), for clients that want to map a tool back to the procedure.

## Findings

- **Dates are described as `{}`.** `z.date()` outputs are unrepresentable in JSON Schema, so `toJsonSchema` gives `{}` (`unrepresentable: 'any'`), and the model gets no hint that `at` is an ISO string. The Inspector's `--strict` check flags it. OpenAPI has the same gap; the fix belongs in the shared generator (describe the JSON form, `{ type: 'string', format: 'date-time' }`), not in MCP.
- **Inputs need the same.** A `z.date()` input arrives as a string from an agent and fails validation; OpenAPI coerces query strings by schema (`experimental_coerceBySchema`), but JSON bodies, and so MCP arguments, aren't coerced.
- **Clients coerce arguments themselves.** The Inspector CLI sent `id=1` as the number `1`; the validation issue (`expected string, received number`) came back as a tool error and the retry with `"1"` worked. That's the loop MCP wants, and it needs nothing from us.
- **Names need a separator.** MCP allows `.` in tool names (`[A-Za-z0-9._-]{1,128}`), but model APIs that clients forward tools to allow only `[A-Za-z0-9_-]`, so the default joins segments with `_` (`post_byId`). Two paths that join to one name (`a_b` and `a.b`) throw at creation.
- **`call()` is the wrong core for the real thing.** It builds the `layer` per call and provides no `HttpServerRequest`, spans or `onError`. A shipped handler should run on `createHandlerCore` like the OpenAPI handler does (shared runtime, masking, `onError`, tracing, Effect HTTP `middleware`, platform args).
- **Subscriptions are left out.** A tool call returns one result. Streamed outputs and subscriptions could stream progress over an SSE response (`notifications/progress`), or become MCP resources or tasks; none is built.
- **Lazy routers must be loaded.** `describeTools` needs every tool's schema before `tools/list`, so it throws on an unloaded `t.lazy()` subtree; a `contract` option, as the OpenAPI handler has, would avoid loading at startup.

## Lean

- Ship `@trpc12/trpc/mcp` with `mcp()`, `describeTools()` and `createMcpHandler()`, speaking MCP itself (no SDK dependency), on the handler core.
- Opt in per procedure with `mcp` meta; `include: 'all'` and a predicate for routers that want everything.
- Tools only in v1: stateless HTTP, no subscriptions, no resources or prompts. Fix the Date schemas in the shared generator.
