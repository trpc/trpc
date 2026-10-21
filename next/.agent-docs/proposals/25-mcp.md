# 25 — MCP: procedures as tools for agents

| Status     | Area                | Depends on | oRPC parity rows |
| ---------- | ------------------- | ---------- | ---------------- |
| `proposed` | server, openapi, AI | 03, 12, 18 | —                |

## Summary

A user asked for routes "published via an MCP endpoint" so agents can call them. A router already has what an MCP server needs: JSON Schemas for inputs and outputs (from the OpenAPI work, [18](./18-openapi.md)), descriptions (`route.summary`/`description`), middleware for auth, and typed errors. What's missing is the protocol: MCP's JSON-RPC over Streamable HTTP, and a mapping from procedures to tools.

**Recommendation:** ship `@trpc12/trpc/mcp`: an `mcp()` root extension for per-procedure meta, `describeTools(router)`, and `createMcpHandler({ router, createContext, filter })`, speaking MCP itself so Effect stays the only dependency. Tools only in v1; procedures opt in with `mcp` meta.

The [mcp-tools](https://github.com/trpc/trpc/blob/2f791c3d4140f07a6ff55fd21e318a8391887726/next/.agent-docs/notes/mcp-tools.md) spike backs this: the official MCP SDK client and the MCP Inspector both list and call the spike's tools.

## Today

- **v11 has nothing built in.** Its OpenAPI page names "AI agent integrations such as MCP servers" as a reason to generate a spec (`www/v11/docs/openapi.md`), and its awesome list links a community `trpc-to-mcp` (`www/v11/docs/community/awesome-trpc.md`). Users bridge through an OpenAPI document, or hand-write an SDK server whose tools call `createCaller`, restating every schema and description.
- **v12 has the parts, not the endpoint.**
  - `toContract()` gives every procedure's input and output JSON Schema and declared error codes through Standard JSON Schema (`packages/trpc/src/internal/describe.ts`, `contract/index.ts`).
  - Root extensions add typed meta keys, as `openapi()` adds `route` ([root-extensions](../decisions/root-extensions.md)).
  - The OpenAPI handler shows a second protocol on the same router, on `createHandlerCore` (`packages/trpc/src/openapi/handler.ts`).
  - AI SDK tools are a recipe: a tool reuses the procedure's Standard Schema and calls it with `call()` ([ai-sdk-and-better-auth-recipes](../decisions/ai-sdk-and-better-auth-recipes.md)). That serves an agent you write, in your process; MCP serves agents you don't write, over the network.

## Goals

- One router serves RPC, REST and MCP, with no schema or description restated.
- Agents get what they need to pick and call a tool well: names, descriptions, argument descriptions, read-only and destructive hints, output schemas, and errors they can act on.
- Calls go through the same middleware, validation and error masking as RPC.
- MCP's auth (OAuth 2.1, protected resource metadata) can be wired with what tRPC already has.
- Effect stays the only dependency of `@trpc12/trpc`.

## Non-goals

- An MCP **client** (calling MCP servers through a tRPC client). It's Q25.9 C, later.
- Agent frameworks' own tool formats (AI SDK, LangChain). The AI SDK recipe stays; `describeTools()` output is plain JSON Schema any of them can read.
- MCP sampling, elicitation and roots (server-to-client requests). They need a server-to-client stream, which Q25.4 A leaves out.

## Options

### Q25.1: where it lives

- **A: `@trpc12/trpc/mcp`, speaking MCP itself** (the spike).
  - MCP over Streamable HTTP is JSON-RPC on POST: `initialize`, `ping`, `tools/list`, `tools/call`, plus header and `Origin` checks. The spike's handler is about 250 lines of logic.
  - ✅ No dependency, works on every platform the fetch handler does, runs on the handler core.
  - ❌ We track the MCP spec ourselves (four protocol versions in a year).
- **B: `@trpc12/mcp`, on `@modelcontextprotocol/sdk`.** Register one `McpServer` tool per procedure.
  - ✅ The SDK follows the spec, sessions and SSE included.
  - ❌ A dependency with its own zod, transport and Node-leaning server types; a separate package ([integration-packages](../decisions/integration-packages.md)).
- **C: a recipe.** `describeTools()` in `@trpc12/trpc/mcp` and a docs page wiring it to the SDK's server.
  - ✅ The smallest surface.
  - ❌ Every app writes the call and error mapping; the details (wrapping, masking, `isError`) are where it goes wrong.

### Q25.2: which procedures become tools

```ts
t.procedure.meta({ mcp: true }); // A: published
t.procedure.meta({
  mcp: { description: 'Read one post', annotations: { readOnlyHint: true } },
});
t.procedure.meta({ mcp: false }); // hidden, even with include: 'all'

createMcpHandler({ router, include: 'all' }); // or (info) => boolean
```

- **A: opt in with `mcp` meta**, plus `include: 'all' | (info) => boolean` on the handler (the spike).
  - ✅ Exposing an API to agents is deliberate; internal procedures don't leak by adding a router.
  - ❌ A router meant for agents marks every procedure (or sets `include: 'all'`).
- **B: everything by default**, `mcp: false` to hide.
  - ✅ Zero configuration, like the OpenAPI handler's REST mapping (Q18.2).
  - ❌ An agent can call any mutation it finds, including ones nobody described.
- **C: an explicit map in the handler**: `tools: { post_byId: appRouter.post.byId }`.
  - ✅ Explicit and typed; no meta.
  - ❌ Names and descriptions live away from the procedure.

### Q25.3: tool names

- **A: path segments joined with `_`** (`post_byId`), a `separator` option, `mcp.name` to override; two procedures with one name throw at creation (the spike).
- **B: the dotted path** (`post.byId`). MCP allows it, but clients forward tools to model APIs that accept only `[A-Za-z0-9_-]`.
- **C: names are required in `mcp` meta.**

### Q25.4: transport

- **A: stateless Streamable HTTP**: one JSON-RPC message per POST, JSON responses, notifications 202, GET 405, no sessions (the spike).
  - ✅ Scales like any HTTP endpoint (Lambda, Workers), nothing to store.
  - ❌ No progress notifications, no server-to-client requests.
- **B: A, plus SSE responses on POST** for `notifications/progress` while a tool runs (needed by Q25.5 B), still stateless.
- **C: B, plus sessions** (`Mcp-Session-Id`) and the GET stream, for list-changed notifications and server-to-client requests. Hibernating WebSockets already solve the storage side ([cloudflare-hibernation](../decisions/cloudflare-hibernation.md)).
- **D: also a stdio entry** (`serveStdio(handler)`) for local tools run by a desktop client.

### Q25.5: subscriptions and streamed outputs

- **A: not tools** (the spike skips subscriptions).
- **B: a streamed output or subscription runs to completion** (or a `maxItems`), each item sent as `notifications/progress` over an SSE response (Q25.4 B), the items as the result.
- **C: MCP resources** with `resources/subscribe`, for live data an agent watches.
- **D: MCP tasks** (experimental in `2025-11-25`) for long calls an agent polls, on `durable()`'s persistence ([durable-calls](../decisions/durable-calls.md)).

### Q25.6: errors

- **A: a procedure's failures are results with `isError: true`**, text `{ code, message, data? }`, the same in `_meta['io.trpc/error']`; unexpected errors masked as on RPC; protocol failures (unknown tool, bad JSON) are JSON-RPC errors (the spike).
  - ✅ What MCP specifies: the model reads validation issues and declared errors and retries. The spike's Inspector run did exactly that.
- **B: every failure a JSON-RPC error.**
  - ❌ Clients show it to the user, not the model, so it can't self-correct.

### Q25.7: auth

- **A: `createContext` per JSON-RPC request; throwing `UNAUTHORIZED` answers 401 with `WWW-Authenticate: Bearer resource_metadata="…"`** (from `resourceMetadataUrl`), and `filter({ tool, ctx })` hides tools per caller (the spike).
- **B: A, plus a `protectedResourceMetadata({ resource, authorizationServers })` Effect HTTP middleware** serving `/.well-known/oauth-protected-resource` (RFC 9728), so a server only needs an authorization server and a token check in `createContext`.
- **C: leave it to the app.**

### Q25.8: schemas of values JSON can't carry

`z.date()` is described as `{}` (unrepresentable), and a date input fails validation when an agent sends a string. OpenAPI has the same gap.

- **A: describe the JSON form in the shared generator** (`{ type: 'string', format: 'date-time' }`) and decode MCP arguments with the input schema's JSON codec, as `validationLink({ output: 'json' })` does on the client ([client-validation-link](../decisions/client-validation-link.md)). Fixes OpenAPI too.
- **B: `mcp.inputSchema` / `mcp.outputSchema` overrides**, like `route.spec` ([route-spec-override](../decisions/route-spec-override.md)).
- **C: leave it**; users avoid dates in agent-facing procedures.

### Q25.9: beyond tools

- **A: tools only in v1.**
- **B: also resources**: input-less queries as `resources/read`, with a `resource: { uri }` meta.
- **C: also a client**: `mcpLink({ url })` and `generateContractFromMcp()`, mirroring `openApiLink` and `generateContractFromOpenApi`, so a tRPC client calls an MCP server's tools with types.
- **D: also prompts**: `.meta({ mcp: { prompt } })` templates.

## Recommendation

- **Q25.1 A.** The protocol surface we need is small and stable at the JSON-RPC level, it keeps Effect the only dependency, and it runs on every platform. Build it on `createHandlerCore`, not `call()` (the spike's shortcut), for the shared runtime, masking, `onError`, spans and `middleware`.
- **Q25.2 A.** Agents act on their own; exposing a mutation to them should be a line someone wrote. `include: 'all'` covers routers built for agents.
- **Q25.3 A.** It works with every client today; `mcp.name` covers the rest.
- **Q25.4 A** for v1, **B** with Q25.5 B when someone needs progress. Sessions (C) and stdio (D) on request.
- **Q25.5 A**, **Q25.6 A**, **Q25.7 A** (B is small; add it with the docs page if a real OAuth setup wants it).
- **Q25.8 A**, as a fix to the shared generator, tracked separately from MCP.
- **Q25.9 A.** Resources, prompts and a client each have a clear shape and no asker yet.

What we give up: following MCP's spec through the SDK for free (Q25.1 A), progress and server-to-client requests (Q25.4 A), and zero-configuration publishing (Q25.2 A).

> ⚠️ **Parity:** none of the options blocks a row in [`orpc-parity.md`](../reference/orpc-parity.md). oRPC has no MCP row; this goes beyond it.

## Questions

- **Q25.1** Where MCP lives: A `@trpc12/trpc/mcp` speaking MCP itself, B `@trpc12/mcp` on the official SDK, or C a recipe?
- **Q25.2** Which procedures become tools: A opt in with `mcp` meta (plus `include`), B everything unless `mcp: false`, or C an explicit map in the handler?
- **Q25.3** Tool names: A path joined with `_` and an override, B the dotted path, or C required names?
- **Q25.4** Transport: A stateless JSON over POST, B A plus SSE responses for progress, C B plus sessions and the GET stream, D also stdio?
- **Q25.5** Subscriptions and streamed outputs: A not tools, B run to completion with progress, C resources, or D MCP tasks?
- **Q25.6** Errors: A failures as `isError` results the model reads, or B JSON-RPC errors?
- **Q25.7** Auth: A 401 from `createContext` plus `filter`, B A plus a protected-resource-metadata middleware, or C the app's job?
- **Q25.8** Dates and other non-JSON values: A describe and decode the JSON form in the shared generator, B per-tool schema overrides, or C leave it?
- **Q25.9** Beyond tools in v1: A tools only, B resources, C an MCP client link, D prompts?

## Decision

> Human: tick an answer per question (or write your own), add notes, and set **Status** to `accepted`.
> The agent then records it in `../decisions/` and links back here.

- **Q25.1:** [ ] A · [ ] B · [ ] C
- **Q25.2:** [ ] A · [ ] B · [ ] C
- **Q25.3:** [ ] A · [ ] B · [ ] C
- **Q25.4:** [ ] A · [ ] B · [ ] C · [ ] D
- **Q25.5:** [ ] A · [ ] B · [ ] C · [ ] D
- **Q25.6:** [ ] A · [ ] B
- **Q25.7:** [ ] A · [ ] B · [ ] C
- **Q25.8:** [ ] A · [ ] B · [ ] C
- **Q25.9:** [ ] A · [ ] B · [ ] C · [ ] D
- **Notes:**
