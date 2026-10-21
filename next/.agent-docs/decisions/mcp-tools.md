# MCP tools, proposed (agent)

- Human, 2026-10-18, quoting a user: "I've really wanted to publish routes via an MCP endpoint", then "Spike and do proposals".
- (agent, tentative) The recommended picks in [proposal 25](../proposals/25-mcp.md), until the human answers:
  - Q25.1: `@trpc12/trpc/mcp` speaks MCP itself, with no SDK dependency, on the handler core.
  - Q25.2: procedures opt in with `mcp` meta from an `mcp()` root extension; `include: 'all'` or a predicate on the handler; `mcp: false` always hides.
  - Q25.3: tool names join path segments with `_`, `mcp.name` overrides, and a clash throws at creation.
  - Q25.4: stateless Streamable HTTP, JSON over POST, no sessions; SSE responses later, with Q25.5 B.
  - Q25.5: subscriptions aren't tools yet.
  - Q25.6: a procedure's failures are `isError` results with `{ code, message, data? }`; protocol failures are JSON-RPC errors; unexpected errors are masked.
  - Q25.7: `createContext` throwing `UNAUTHORIZED` answers 401 with `WWW-Authenticate`; `filter({ tool, ctx })` hides tools per caller.
  - Q25.8: dates and other non-JSON values are described and decoded in their JSON form by the shared generator, fixing OpenAPI too.
  - Q25.9: tools only; resources, prompts and an MCP client link later.
- Why: one router serves RPC, REST and agents with no schema restated. The spike ([mcp-tools](https://github.com/trpc/trpc/blob/2f791c3d4140f07a6ff55fd21e318a8391887726/next/.agent-docs/notes/mcp-tools.md)) found:
  - `experimental_toContract()`'s schemas and `route` descriptions are enough for tools;
  - the official SDK client and the MCP Inspector call the tools with middleware, validation and declared errors applied.
- Lost: following MCP's spec through the SDK for free; progress and server-to-client requests; zero-configuration publishing.
- (agent, experimental) The tentative picks are built in `@trpc12/trpc/mcp` as `experimental_mcp()`, `experimental_createMcpHandler()` and `experimental_describeTools()`, with a docs page in the `mcp` docs experiment. Q25.8's decoding isn't built. The questions stay open; other answers change or replace the build.
- Open: awaiting the human's answers to proposal 25.
- Lives in: `proposals/25-mcp.md`, `packages/trpc/src/mcp/`, `www/docs/integrations/mcp.md`, `examples/experimental/mcp/`.
