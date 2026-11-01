---
title: "How should MCP's OAuth sign-in be wired: a 401 from `createContext` with a per-caller tool filter, also a built-in metadata endpoint, or left to the app?"
summary: An MCP client starts OAuth on a 401 with `WWW-Authenticate`; tRPC could send that from `createContext`, also serve the metadata, or leave both to the app.
area: mcp
recommended: A
questions: [Q25.7]
links:
  - kind: spike
    label: spikes/mcp (deleted, at 2f791c3d4)
    url: https://github.com/trpc/trpc/tree/2f791c3d4140f07a6ff55fd21e318a8391887726/next/spikes/mcp
  - kind: docs
    label: MCP (experimental docs page)
    url: https://v12.trpc.io/v12/docs/integrations/mcp
  - kind: code
    label: '@trpc12/trpc/mcp (experimental)'
    url: ../../packages/trpc/src/mcp/
  - kind: proposal
    label: Proposal 25, MCP
    url: ../proposals/25-mcp.md
  - kind: code
    label: The package's tests (401 and filter)
    url: ../../packages/trpc/src/mcp/handler.test.ts
  - kind: code
    label: The OpenAPI handler's `middleware` option
    url: ../../packages/trpc/src/openapi/handler.ts
---

# How should MCP's OAuth sign-in be wired: a 401 from `createContext` with a per-caller tool filter, also a built-in metadata endpoint, or left to the app?

## Why it matters

MCP clients sign in with OAuth 2.1. They start when the server answers HTTP 401 with `WWW-Authenticate: Bearer resource_metadata="…"`, a URL that points at a protected-resource metadata document (RFC 9728). An app that gets this wrong has tools no client can sign in to. This only applies if MCP is built in or shipped as a package. With a recipe, the app owns the transport and its 401s.

## Options

### A) A 401 from `createContext`, plus `filter`

`createContext` runs for each JSON-RPC request. Throwing `UNAUTHORIZED` from it answers 401 with `WWW-Authenticate` built from `resourceMetadataUrl`. `filter({ tool, ctx })` hides tools from `tools/list` and refuses them in `tools/call`, per caller. The app serves the metadata document itself.

```ts twoslash
// ---cut-start---
import { initTrpc, TrpcError } from '@trpc12/trpc/server';
import { experimental_createMcpHandlerA as experimental_createMcpHandler } from '../open/mcp-oauth.ts';
interface User {
  name: string;
  admin: boolean;
}
interface Ctx {
  user: User | null;
}
const t = initTrpc<{ ctx: Ctx }>();
const appRouter = t.router({
  post: { delete: t.procedure.mutation(() => {}) },
});
declare function verify(token: string): User;
// ---cut-end---
experimental_createMcpHandler({
  router: appRouter,
  resourceMetadataUrl:
    'https://api.example.com/.well-known/oauth-protected-resource',
  createContext: ({ request }): Ctx => {
    const token = request.headers.get('authorization');
    if (!token)
      throw new TrpcError({ code: 'UNAUTHORIZED', message: 'Missing token' });
    return { user: verify(token) };
  },
  filter: ({ tool, ctx }) =>
    //              ^?
    tool.name !== 'post_delete' || ctx.user?.admin === true,
});
// no token → 401, WWW-Authenticate: Bearer resource_metadata="https://api.example.com/.well-known/oauth-protected-resource"
// admins see post_delete in tools/list; members don't
```

- ✅ Uses what tRPC already has (`createContext`, `TrpcError`) plus one option.
- ❌ The app serves `/.well-known/oauth-protected-resource` itself.

### B) A, plus a metadata middleware

`experimental_protectedResourceMetadata()` is Effect HTTP middleware that serves the RFC 9728 document. It plugs into the handler's `middleware`, like `experimental_openApiReference`. This is a sketch.

```ts twoslash
// ---cut-start---
import { initTrpc } from '@trpc12/trpc/server';
import {
  experimental_createMcpHandlerB as experimental_createMcpHandler,
  experimental_protectedResourceMetadataB as experimental_protectedResourceMetadata,
} from '../open/mcp-oauth.ts';
interface Ctx {
  user: { name: string; admin: boolean } | null;
}
const t = initTrpc<{ ctx: Ctx }>();
const appRouter = t.router({
  post: { delete: t.procedure.mutation(() => {}) },
});
declare function createContext(opts: { request: Request }): Ctx;
// ---cut-end---
experimental_createMcpHandler({
  router: appRouter,
  middleware: [
    experimental_protectedResourceMetadata({
      resource: 'https://api.example.com/mcp',
      authorizationServers: ['https://auth.example.com'],
    }),
  ],
  createContext, // the token check only
});
```

- ✅ Small and Effect-native. A server needs only an authorization server and a token check.
- ❌ More API before a real OAuth setup has asked for it.

### C) Leave auth to the app

No 401 mapping and no `filter`. A `createContext` that throws is a JSON-RPC error.

```ts twoslash
// ---cut-start---
import { initTrpc } from '@trpc12/trpc/server';
import { experimental_createMcpHandlerC as experimental_createMcpHandler } from '../open/mcp-oauth.ts';
interface Ctx {
  user: { name: string; admin: boolean } | null;
}
const t = initTrpc<{ ctx: Ctx }>();
const appRouter = t.router({
  post: { delete: t.procedure.mutation(() => {}) },
});
declare function createContext(opts: { request: Request }): Ctx;
// ---cut-end---
experimental_createMcpHandler({ router: appRouter, createContext });
// the app wraps `fetch` to answer 401 with WWW-Authenticate itself
```

- ✅ No auth surface in tRPC.
- ❌ Every app has to find out which `WWW-Authenticate` header MCP clients need before they start OAuth.

## Recommendation

**A.** It's what the spike tested, and it wires MCP's sign-in with the hooks tRPC already has. B adds to A without changing it, so it can come with the docs page once a real OAuth setup needs it.

## Blocked until answered

- Nothing beyond building MCP itself. A matches the spike and the experimental `@trpc12/trpc/mcp`.

## Details

- An `UNAUTHORIZED` from a procedure's middleware, not from `createContext`, stays a tool result the model reads, so a signed-in caller missing a permission isn't sent back through OAuth.
