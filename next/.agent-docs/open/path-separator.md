---
title: Should URLs be able to join procedure paths with something other than `.`?
summary: 'Q10.2 kept `.` in URLs; an opt-in `experimental_pathSeparator` on the handler and `httpLink` would serve `/trpc/post/byId` where firewalls block dots.'
area: server
recommended: B
links:
  - kind: issue
    label: '#5752: dots blocked by firewalls'
    url: https://github.com/trpc/trpc/issues/5752
  - kind: decision
    label: routers (Q10.2)
    url: ../decisions/routers.md
  - kind: code
    label: path-separator.ts
    url: ../../packages/trpc/src/server/handler/path-separator.ts
  - kind: docs
    label: URLs without dots
    url: https://v12.trpc.io/v12/docs/server/routers#urls-without-dots
---

# Should URLs be able to join procedure paths with something other than `.`?

## Why it matters

Q10.2 decided `.` separates path segments, in `path` and in URLs (`/trpc/post.byId`), so the URL matches the resolver's `path` and RPC URLs stay apart from OpenAPI's slash routes ([`routers.md`](../decisions/routers.md)). Some users sit behind firewalls and WAFs that block `.` in URL paths, and can't call a tRPC API at all ([#5752](https://github.com/trpc/trpc/issues/5752)). A draft PR explores an opt-in separator to weigh against that decision; nothing changes for apps that don't set it.

## Options

### A) Keep `.` only

Q10.2 as it is. Apps behind such a firewall rewrite URLs in a proxy, or use a WebSocket link.

```ts twoslash
// ---cut-start---
import { createFetchHandler } from '@trpc12/trpc/server';
import { appRouter } from './server.ts';
const createContext = () => ({ user: null });
// ---cut-end---
// GET /trpc/post.byId?input=…
const handler = createFetchHandler({ router: appRouter, createContext });
```

- ✅ One URL per procedure, the same string as its `path`
- ❌ Some networks can't reach the API over HTTP

### B) An experimental separator in URLs only

`experimental_pathSeparator` on `createFetchHandler`, `httpLink` and the RPC OpenAPI document. Paths stay dotted everywhere else.

```ts twoslash
// ---cut-start---
import { createTrpcClient, httpLink, routerType } from '@trpc12/trpc/client';
import { createFetchHandler } from '@trpc12/trpc/server';
import { appRouter, type AppRouter } from './server.ts';
const createContext = () => ({ user: null });
// ---cut-end---
// GET /trpc/post/byId?input=…; /trpc/post.byId still works
const handler = createFetchHandler({
  router: appRouter,
  createContext,
  experimental_pathSeparator: '/',
});
const client = createTrpcClient({
  router: routerType<AppRouter>(),
  links: [httpLink({ url: '/trpc', experimental_pathSeparator: '/' })],
});
```

- ✅ Opt-in and small: the default and every other surface are unchanged (middleware `path`, `onError`, query keys, batch bodies, socket frames, contracts, operation ids)
- ✅ Changing the separator doesn't move keys stored under `path` (durable calls, rate limits)
- ❌ Two settings to keep equal; a mismatch is a `NOT_FOUND`
- ❌ No router key may contain the separator, checked when the handler is made and when a lazy subtree loads, so `_` or `-` rule out keys like `get_user`

### C) Tuple paths inside, the separator only at the edges

Every internal path becomes `readonly string[]`, and the separator applies only where a URL is built or parsed. The public `path`s become tuples too.

```ts twoslash
// ---cut-start---
import type { MiddlewareOptsC } from '../open/path-separator.ts';
declare const opts: MiddlewareOptsC;
// ---cut-end---
// in a middleware: a tuple, where it was 'post.byId'
const key = opts.path.join('/');
const path = opts.path;
//    ^?
```

- ✅ No string ever needs splitting, so no character is special inside
- ❌ Breaks every public `path` (middleware, `onError`, `createContext`'s `info.calls`, `Operation.path`, batch bodies, socket messages, MCP, OpenAPI filters) and every site in the audit under Details, for no change in what the URL can carry
- ❌ Keys still can't hold the URL's separator, so the ambiguity check of B stays

## Recommendation

**B.** Router keys already can't contain `.` (`checkRouterKeys`), so a dotted path and a tuple are the same value: tuples (C) would cost every public `path` and leave the URL problem as it is. The only place a firewall sees the separator is the HTTP URL, and B changes exactly that, behind an `experimental_` name. Q10.2's default stays `.`; this amends it with an opt-in rather than reversing it.

## Blocked until answered

- The draft PR: on B it lands as is, under `experimental_`, with a bullet in `routers.md` under Q10.2; on A it's closed; on C it's redone.

## Details

Every place in `next/packages` that joins or splits a path on `.`, and why B leaves it alone:

- Router keys and lookup (`server/procedures/router.ts`: `checkRouterKeys`, `getProcedure`, `resolveProcedure`): a key with a `.` is refused, so `split('.')` inverts `join('.')`. The handler maps the URL to a dotted path before lookup.
- Flattening (`internal/describe.ts` `flattenRoutes`, `scopedRoute`): dotted paths for OpenAPI, contracts and MCP; REST routes turn `.` into `/` on their own. Never in an RPC URL.
- Server-side calls (`server/caller.ts`, `t.call`, `effect/index.ts`): proxies join keys with `.`; no URL.
- Client proxy (`client/client.ts`): makes `op.path`; only `httpLink` builds a URL from it (`client/links/http/transport.ts`, the one URL site, SSE included).
- Batches (`server/handler/batch.ts`): the URL is the endpoint; paths are in the JSON body, which URL filters don't read.
- Sockets, message ports, hibernation (`server/sockets/socket.ts`, `cloudflare/hibernation.ts`): paths in JSON frames, no URL.
- Adapters (`http/index.ts` `serve()`, `aws-lambda`, Workers, Deno): all go through the handler's app, where the URL is mapped once (`server/handler/app.ts`).
- Middleware `path`, `onError`, `createContext`'s `info.calls`, error messages: the dotted path.
- Durable calls and rate limits (`middleware/durable.ts`, `middleware/ratelimit.ts`): key on `path`, so they're the same whatever the separator.
- Contracts (`server/procedures/implement.ts`, `client/links/validation.ts`): dotted paths and template-literal types; no URL.
- OpenAPI (`openapi/generate.ts`): operation ids and schema names stay dotted. The `'rpc'` document's paths are RPC URLs, so it takes the separator (the one place besides the handler and link). `openapi/to-contract.ts` reads operation ids, not paths.
- MCP (`mcp/tools.ts`): tool names have their own `separator` ([`mcp-tool-names.md`](./mcp-tool-names.md)).
- TanStack Query (`tanstack-query/src/keys.ts`) and the React packages: paths are tuples already, or dotted strings on the client; no URL.
- NestJS (`experimental-nest`): dotted contract paths to pick implementations; no URL.
- v11 interop (`interop/handler/handler.ts`): v11 clients' own URL format, unchanged.
- Open in B: the option names. Option keys carrying `experimental_` has no precedent here ([`experimental-prefix-on-types-and-methods.md`](./experimental-prefix-on-types-and-methods.md)); and whether a handler with a separator should also refuse the dotted URL, which it serves now to ease moving clients.
