---
title: 'Which MCP transport should v1 support: stateless JSON over POST only, or also streamed responses, sessions, or stdio?'
summary: The MCP handler could answer one JSON response per POST, stream progress as SSE, keep sessions with a GET stream, or also run over stdio.
area: mcp
recommended: A
questions: [Q25.4]
links:
  - kind: spike
    label: spikes/mcp
    url: ../../spikes/mcp/
  - kind: proposal
    label: Proposal 25, MCP
    url: ../proposals/25-mcp.md
  - kind: code
    label: The spike's server
    url: ../../spikes/mcp/serve.ts
  - kind: decision
    label: fetch-sse
    url: ../decisions/fetch-sse.md
  - kind: decision
    label: cloudflare-hibernation
    url: ../decisions/cloudflare-hibernation.md
---

# Which MCP transport should v1 support: stateless JSON over POST only, or also streamed responses, sessions, or stdio?

## Why it matters

The transport decides whether a tool can report progress while it runs, and whether the server can ask the client things (sampling, elicitation). Sessions need storage, which serverless platforms make harder. This only applies if MCP is built in (`@trpc12/trpc/mcp`). With a package on the official SDK, every transport comes with it and this picks which ones to turn on. With a recipe, the app's SDK setup decides.

## Options

### A) Stateless JSON over POST

One JSON-RPC message per POST, answered with `application/json`, and no sessions.

```ts twoslash
// ---cut-start---
import { experimental_createMcpHandlerA as experimental_createMcpHandler } from '../open/mcp-transport.ts';
import { appRouter } from './server.ts';
// ---cut-end---
const mcp = experimental_createMcpHandler({ router: appRouter });
// POST tools/call     → 200 application/json
// POST notification   → 202
// GET /mcp            → 405 (no server-to-client stream)
// foreign Origin      → 403 (DNS rebinding)
```

- ✅ Scales like any HTTP endpoint, on Lambda and Workers too, with nothing to store.
- ❌ No `notifications/progress` while a tool runs, and no server-to-client requests.

### B) A, plus server-sent events on POST

A `tools/call` can answer with `text/event-stream` and send progress before the result. Still stateless.

```ts twoslash
// ---cut-start---
import { experimental_createMcpHandlerB as experimental_createMcpHandler } from '../open/mcp-transport.ts';
import { appRouter } from './server.ts';
// ---cut-end---
experimental_createMcpHandler({ router: appRouter }); // same code
// POST tools/call → content-type: text/event-stream
// event: message  data: {"method":"notifications/progress","params":{…}}
// event: message  data: {"jsonrpc":"2.0","id":3,"result":{…}}
```

- ✅ Gives long or streamed tools progress, on the event-stream format subscriptions already use.
- ❌ More to build and test before anyone has asked for progress.

### C) B, plus sessions and the GET stream

`Mcp-Session-Id` sessions and a GET stream, for list-changed notifications and server-to-client requests.

```ts twoslash
// ---cut-start---
import {
  experimental_createMcpHandlerC as experimental_createMcpHandler,
  type McpSessionStoreC,
} from '../open/mcp-transport.ts';
import { appRouter } from './server.ts';
declare const store: McpSessionStoreC;
// ---cut-end---
experimental_createMcpHandler({ router: appRouter, sessions: store }); // sketch
// initialize → Mcp-Session-Id: 4f…
// GET /mcp    → text/event-stream of server-to-client messages
```

- ✅ The full Streamable HTTP spec, which sampling and elicitation would need later.
- ❌ Sessions need storage on each platform. Cloudflare's hibernating WebSockets solve it there; nothing does yet elsewhere.

### D) Also a stdio entry

The same handler, run as a local process that a desktop client starts.

```ts twoslash
// ---cut-start---
import {
  experimental_createMcpHandlerD as experimental_createMcpHandler,
  experimental_serveStdioD as experimental_serveStdio,
} from '../open/mcp-transport.ts';
import { appRouter } from './server.ts';
// ---cut-end---
experimental_serveStdio(experimental_createMcpHandler({ router: appRouter })); // sketch
```

- ✅ Covers local MCP servers (Claude Desktop, Cursor) with the same router.
- ❌ A Node-only entry point, and most local clients speak HTTP now.

## Recommendation

**A** for v1. It's what the spike tested against the official client and the Inspector, and it has nothing to store. B comes with streamed tools if the human picks that for subscriptions. C and D wait for someone to ask.

## Blocked until answered

- Nothing is blocked if MCP isn't built in. If it is, the handler's response modes and how it's documented depend on this.
