---
title: "Beyond tools, what else should v1's MCP support: nothing yet, resources, an MCP client link, or prompts?"
summary: v1's MCP could publish tools only, or also serve input-less queries as resources, call MCP servers from a tRPC client, or ship prompt templates.
area: mcp
recommended: A
questions: [Q25.9]
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
  - kind: decision
    label: openapi-to-contract
    url: ../decisions/openapi-to-contract.md
  - kind: code
    label: experimental_openApiLink
    url: ../../packages/trpc/src/openapi/link.ts
---

# Beyond tools, what else should v1's MCP support: nothing yet, resources, an MCP client link, or prompts?

## Why it matters

The spike publishes tools only: `initialize` answers `capabilities: { tools: { listChanged: false } }`. Proposal 25 lists an MCP client as a non-goal for now. Resources, prompts and a client each have a clear shape, but no one has asked for them. Several letters can be picked together (for example `B, D`). This only applies if MCP is built in or shipped as a package.

## Options

### A) Tools only in v1

```ts twoslash
// ---cut-start---
import { initTrpc } from '@trpc12/trpc/server';
import { experimental_mcpA as experimental_mcp } from '../open/mcp-beyond-tools.ts';
import type { Context as Ctx, Post } from './server.ts';
declare function listPosts(): Post[];
// ---cut-end---
const t = initTrpc<{ ctx: Ctx }>().concat(experimental_mcp());

t.procedure.meta({ mcp: true }).query(listPosts); // a tool, nothing else
// initialize → capabilities: { tools: { listChanged: false } }
```

- ✅ The smallest surface to keep in step with the spec, and the rest can follow when someone asks.
- ❌ Read-only data an agent could browse goes through tools instead.

### B) Also resources

Input-less queries are served by `resources/read`, with a `resource: { uri }` meta.

```ts twoslash
// ---cut-start---
import { initTrpc } from '@trpc12/trpc/server';
import { experimental_mcpB as experimental_mcp } from '../open/mcp-beyond-tools.ts';
import type { Post } from './server.ts';
const t = initTrpc().concat(experimental_mcp());
declare function listPosts(): Post[];
// ---cut-end---
t.procedure
  .meta({
    mcp: { resource: { uri: 'blog://posts', mimeType: 'application/json' } },
  })
  .query(() => listPosts());
// resources/list → [{ uri: 'blog://posts', name: 'post_list' }]
// resources/read { uri: 'blog://posts' } → { contents: [{ uri, text: '[…]' }] }
```

- ✅ MCP's own concept for context an agent reads rather than acts on.
- ❌ Another descriptor and method to build, and few clients show resources well.

### C) Also a client

`experimental_mcpLink({ url })` and `experimental_generateContractFromMcp()` mirror `experimental_openApiLink` and `experimental_generateContractFromOpenApi`, so a tRPC client calls any MCP server's tools with types.

```ts twoslash
// ---cut-start---
// @filename: tools.ts
import { experimental_contract } from '@trpc12/trpc/contract';
import { z } from 'zod';
const c = experimental_contract.create();
export const tools = {
  search_docs: c
    .input(z.object({ query: z.string() }))
    .output(z.array(z.object({ title: z.string(), url: z.string() })))
    .mutation(),
};
// @filename: app.ts
import { writeFile } from 'node:fs/promises';
import { createTrpcClient } from '@trpc12/trpc/client';
import {
  experimental_generateContractFromMcpC as experimental_generateContractFromMcp,
  experimental_mcpLinkC as experimental_mcpLink,
} from '../open/mcp-beyond-tools.ts';
// ---cut-end---
import { tools } from './tools.ts';

// at build time, as with experimental_generateContractFromOpenApi
const source = await experimental_generateContractFromMcp({
  url: 'https://tools.example.com/mcp',
});
await writeFile('src/tools.ts', source);

const client = createTrpcClient({
  router: tools,
  links: [experimental_mcpLink({ url: 'https://tools.example.com/mcp' })],
});
const docs = await client.search_docs.mutate({ query: 'effect' }); // a typed tools/call
//    ^?
```

- ✅ A tRPC client calls any MCP server's tools with types.
- ❌ A second protocol direction to maintain, and no one has asked for it.

### D) Also prompts

Prompt templates ship next to the tools they use.

```ts twoslash
// ---cut-start---
import { initTrpc } from '@trpc12/trpc/server';
import { experimental_mcpD as experimental_mcp } from '../open/mcp-beyond-tools.ts';
const t = initTrpc().concat(experimental_mcp());
// ---cut-end---
t.procedure.meta({
  mcp: {
    prompt: {
      name: 'summarize_post',
      template: 'Summarize post {id} in two lines.',
    },
  },
});
// prompts/get { name: 'summarize_post', arguments: { id: '1' } }
```

- ✅ Reusable instructions ship next to the tools they use.
- ❌ A templating concept tRPC has nowhere else.

## Recommendation

**A.** Each extra has a clear shape and can be added without changing tools. Waiting for someone to ask keeps v1 to the part of the spec the spike tested.

## Blocked until answered

- Nothing. A matches the spike.
