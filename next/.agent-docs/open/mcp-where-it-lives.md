---
title: Should the MCP server be built into `@trpc12/trpc`, be a package on the official MCP SDK, or be a docs recipe?
summary: Publishing procedures as MCP tools could come from a `@trpc12/trpc/mcp` subpath, a package on the MCP SDK, or a page that wires the SDK by hand.
area: mcp
recommended: A
questions: [Q25.1]
links:
  - kind: spike
    label: spikes/mcp
    url: ../../spikes/mcp/
  - kind: proposal
    label: Proposal 25, MCP
    url: ../proposals/25-mcp.md
  - kind: decision
    label: mcp-tools
    url: ../decisions/mcp-tools.md
  - kind: note
    label: mcp-tools spike note
    url: ../notes/mcp-tools.md
  - kind: decision
    label: integration-packages
    url: ../decisions/integration-packages.md
  - kind: code
    label: The OpenAPI handler, a second protocol on the handler core
    url: ../../packages/trpc/src/openapi/handler.ts
---

# Should the MCP server be built into `@trpc12/trpc`, be a package on the official MCP SDK, or be a docs recipe?

## Why it matters

The human passed on a user's ask, "I've really wanted to publish routes via an MCP endpoint", then said "Spike and do proposals". A router already has what an MCP server needs: JSON Schemas from `experimental_toContract()`, descriptions, middleware and typed errors. Only the protocol is missing. Nothing is in `packages/` yet. The spike speaks MCP itself, and both the official SDK client and the MCP Inspector list and call its tools. This answer decides who tracks MCP's spec (four protocol versions in a year) and whether `effect` stays the only peer dependency. The transport and auth questions only apply if MCP is built in (A or B).

## Options

### A) `@trpc12/trpc/mcp`, speaking MCP itself

A subpath of `@trpc12/trpc` handles MCP's JSON-RPC over Streamable HTTP (`initialize`, `ping`, `tools/list`, `tools/call`). It's the spike rebuilt on `createHandlerCore`, the request core the OpenAPI handler uses. Exports are `experimental_` until approved.

```ts
import {
  experimental_createMcpHandler,
  experimental_mcp,
} from '@trpc12/trpc/mcp';
import { initTrpc } from '@trpc12/trpc/server';

const t = initTrpc<{ ctx: Ctx }>().concat(experimental_mcp());

export const appRouter = {
  post: {
    byId: t.procedure
      .meta({ mcp: { description: 'Read one blog post by its id.' } })
      .input(z.object({ id: z.string().describe('The post id, e.g. "1"') }))
      .query(({ input }) => getPost(input.id)),
  },
};

export const mcp = experimental_createMcpHandler({
  router: appRouter,
  serverInfo: { name: 'blog', version: '1.0.0' },
  createContext: ({ request }) => ({ user: userFrom(request) }),
});
// serve `mcp.fetch` at /mcp, next to the RPC handler
```

- ✅ No new dependency. It runs wherever the fetch handler runs (Node, Bun, Deno, Workers, Lambda).
- ✅ It shares masking, `onError`, spans and Effect HTTP `middleware` with RPC and OpenAPI.
- ✅ Tools need only a small part of the protocol. The spike's `mcp.ts` is about 560 lines, a third of them types and docs.
- ❌ We follow MCP's spec changes ourselves. Sessions, server-sent events and stdio are ours to build if wanted.

### B) `@trpc12/experimental-mcp`, a package on `@modelcontextprotocol/sdk`

A separate package registers one SDK tool per procedure. The app picks the SDK's transport. This is a sketch; it isn't built.

```ts
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createMcpServer } from '@trpc12/experimental-mcp';

const server = createMcpServer({ router: appRouter, createContext }); // an SDK `McpServer`
const transport = new WebStandardStreamableHTTPServerTransport({
  sessionIdGenerator: undefined,
});
await server.connect(transport);
export default {
  fetch: (request: Request) => transport.handleRequest(request),
};
```

- ✅ The SDK follows the spec, and comes with sessions, server-sent events and stdio.
- ❌ The SDK (1.32.1) has 17 dependencies, including `express`, `hono`, `ajv` and its own `zod`. That makes it a separate package under [`integration-packages.md`](../decisions/integration-packages.md).
- ❌ A Promise-based SDK sits in the request path instead of the handler core, so masking, `onError` and spans are mapped by hand.

### C) A recipe: `describeTools()` and a docs page

`@trpc12/trpc/mcp` exports only `experimental_describeTools(router)`, which turns procedures into MCP tool descriptors. A docs page wires it into the SDK's low-level `Server`.

```ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { experimental_describeTools } from '@trpc12/trpc/mcp';

const server = new Server(
  { name: 'blog', version: '1.0.0' },
  { capabilities: { tools: {} } },
);
server.setRequestHandler(ListToolsRequestSchema, () => ({
  tools: experimental_describeTools(appRouter),
}));
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  // each app: find the procedure, unwrap `{ input }`, call it, map errors to `isError`, mask
});
```

- ✅ The smallest surface for us to maintain.
- ❌ Every app rewrites the call and error mapping. The spike found the subtle parts there: wrapping non-object inputs, masking, and `isError`.

## Recommendation

**A.** It keeps `effect` the only dependency and runs on every platform. It also reuses the handler core, which is the Effect-native path ([`effect-native-by-default.md`](../decisions/effect-native-by-default.md)). A tool server needs only a small, stable part of the protocol, and the spike shows the official client accepts it. If the spec outgrows that, B can still wrap the same `describeTools()`.

## Blocked until answered

- Building anything in `packages/` for MCP, and its docs page.
- The transport and auth questions, which assume A or B.

## Details

- The spike's exports are unprefixed (`mcp()`, `createMcpHandler()`, `describeTools()`). Shipped, they'd be `experimental_*` under [`stability-jsdoc-tags.md`](../decisions/stability-jsdoc-tags.md), like everything in `@trpc12/trpc/openapi`.
- The spike calls tools through `call()`, which builds the `layer` per call and has no spans or `onError`. A shipped handler would run on `createHandlerCore`, as [the note](../notes/mcp-tools.md) says.
- Under C, `experimental_describeTools()` is the same function A uses, so starting with C and growing into A breaks nothing.
