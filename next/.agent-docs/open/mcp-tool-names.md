---
title: 'How should MCP tools be named: the path joined with `_`, the dotted path, or a name you always write?'
summary: The procedure `post.byId` could be the tool `post_byId`, `post.byId`, or a name its `mcp` meta must set.
area: mcp
recommended: A
questions: [Q25.3]
links:
  - kind: spike
    label: spikes/mcp
    url: ../../spikes/mcp/
  - kind: proposal
    label: Proposal 25, MCP
    url: ../proposals/25-mcp.md
  - kind: note
    label: mcp-tools spike note
    url: ../notes/mcp-tools.md
  - kind: code
    label: The spike's tests (naming and clashes)
    url: ../../spikes/mcp/mcp.test.ts
---

# How should MCP tools be named: the path joined with `_`, the dotted path, or a name you always write?

## Why it matters

The tool name is what the model sees and calls. MCP allows `[A-Za-z0-9._-]{1,128}`, but clients pass tools on to model APIs, which accept only `[A-Za-z0-9_-]`. So a dotted name can break a tool in some clients. This only applies if MCP is built in or shipped as a package.

## Options

### A) Path joined with `_`, with an override

The spike joins path segments with `_`. `mcp.name` renames one tool, and `separator` changes the join. Two procedures with the same tool name throw when the handler is created.

```ts twoslash
// ---cut-start---
import { initTrpc } from '@trpc12/trpc/server';
import {
  experimental_createMcpHandlerA as experimental_createMcpHandler,
  experimental_mcpA as experimental_mcp,
} from '../open/mcp-tool-names.ts';
import { appRouter } from './server.ts';
const t = initTrpc().concat(experimental_mcp());
// ---cut-end---
appRouter.post.byId; // tool "post_byId"
t.procedure.meta({ mcp: { name: 'get_post' } }); // tool "get_post"
experimental_createMcpHandler({ router: appRouter, separator: '.' }); // "post.byId"

// { a_b: …, a: { b: … } } at creation:
// Error: MCP: "a.b" and "a_b" are both tool "a_b"
```

- ✅ Works with every client and model API today, with no configuration.
- ✅ A name clash is caught at startup instead of one tool silently hiding another.
- ❌ `_` is ambiguous when procedure names already contain `_`, which is why clashes are checked.

### B) The dotted path

The tool's name is the procedure's path, as in RPC URLs, logs and spans.

```ts twoslash
// ---cut-start---
import { appRouter } from './server.ts';
// ---cut-end---
appRouter.post.byId; // tool "post.byId"
```

- ✅ The same name everywhere, and no clash is possible.
- ❌ Valid MCP, but rejected by the model APIs that some clients pass tools on to.

### C) Names are required in `mcp` meta

Every published procedure names its tool.

```ts twoslash
// @errors: 2322
// ---cut-start---
import { initTrpc } from '@trpc12/trpc/server';
import { experimental_mcpC as experimental_mcp } from '../open/mcp-tool-names.ts';
const t = initTrpc().concat(experimental_mcp());
// ---cut-end---
t.procedure.meta({ mcp: { name: 'get_post', description: 'Read one post' } });
// Doesn't compile: `name` is required
t.procedure.meta({ mcp: true });
```

- ✅ Every name is chosen for the model, not derived from how the code is organized.
- ❌ More to write, and renaming a router no longer renames its tools.

## Recommendation

**A.** It works with every client today, and `mcp.name` covers the tools that deserve a better name. The clash check turns `_`'s ambiguity into an error at startup.

## Blocked until answered

- The tool names in `tools/list`, if MCP is built. Changing them later breaks agents' saved configurations.
