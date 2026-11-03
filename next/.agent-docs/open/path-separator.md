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

### C) B, with tuple paths on the client

As B on the server, but `Operation.path` is a tuple of router keys (`['post', 'byId']`) from the client proxy through the links, as TanStack Query's keys already are. `httpLink` joins it with the separator; the other links join it with `.` where they need a string.

```ts twoslash
// ---cut-start---
import type { OperationC } from '../open/path-separator.ts';
declare const op: OperationC<'post.byId' | 'post.create'>;
// ---cut-end---
// a splitLink condition, where it was op.path === 'post.byId'
const byId = op.path[0] === 'post' && op.path[1] === 'byId';
// dedupe keys, span names, logs, socket frames and batch bodies need a string
const name = op.path.join('.');
const path = op.path;
//    ^?
```

- ✅ The URL is built from keys, never from a string that was split
- ✅ The experimental React packages and `experimental_validationLink` walk keys without `split('.')`
- ❌ `op.path === 'post.byId'` and `op.path.startsWith('admin.')` in links (the docs' `splitLink` and `switchLink` examples, v11 links) stop working: arrays compare by reference, so conditions compare segments or join first
- ❌ Most links need a string anyway (`dedupeLink`'s key, tracing's span name and `rpc.method`, `loggerLink`, `wsLink`'s and batches' wire `path`, `experimental_openApiLink`'s contract lookup, `localLink`, the v11 link), so the joins move into each link instead of going away
- ❌ Nothing a URL can carry changes: keys still can't hold the separator, which only the server can check

## Recommendation

**B.** Router keys already can't contain `.` (`checkRouterKeys`), so a dotted path and a tuple are the same value, and `httpLink` builds the same URL from either. On the client, the string is what links compare, key maps on and send, and what `RouterPaths` types as a union of literals, so a typo in a `splitLink` condition fails to compile; tuples (C) would move a `join('.')` into each of those links and break every custom link's condition for no change in the URL. TanStack Query keeps its tuple keys either way. The only place a firewall sees the separator is the HTTP URL, and B changes exactly that, behind an `experimental_` name. Q10.2's default stays `.`; this amends it with an opt-in rather than reversing it.

## Blocked until answered

- The draft PR: on B it lands as is, under `experimental_`, with a bullet in `routers.md` under Q10.2; on A it's closed; on C it also changes `Operation.path` and every link that reads it.

## Details

Every place in `next/packages` that joins or splits a path on `.`, and why B leaves it alone:

- Router keys and lookup (`server/procedures/router.ts`: `checkRouterKeys`, `getProcedure`, `resolveProcedure`): a key with a `.` is refused, so `split('.')` inverts `join('.')`. The handler maps the URL to a dotted path before lookup.
- Flattening (`internal/describe.ts` `flattenRoutes`, `scopedRoute`): dotted paths for OpenAPI, contracts and MCP; REST routes turn `.` into `/` on their own. Never in an RPC URL.
- Server-side calls (`server/caller.ts`, `t.call`, `effect/index.ts`): proxies join keys with `.`; no URL.
- Client proxy (`client/client.ts`): holds keys as a tuple and joins them once into `op.path`; only `httpLink` builds a URL from it (`client/links/http/transport.ts`, the one URL site, SSE included).
- Links that read `op.path` as a string: `dedupeLink` (default key), tracing (`trpc.<path>` spans, `rpc.method`), `loggerLink`, `wsLink` and batches (wire `path`), `localLink` (lookup), `experimental_openApiLink` (contract key), the v11 link, `splitLink` and `switchLink` conditions typed by `RouterPaths`.
- Split round trips on the client: `experimental_validationLink` (`definitionAt`), `@trpc12/experimental-react` (`at(client, path.split('.'))`) and `@trpc12/experimental-react-atom` (`at`) split `op.path` or their own joined path to walk keys again. They could keep tuples internally under A or B too.
- Batches (`server/handler/batch.ts`): the URL is the endpoint; paths are in the JSON body, which URL filters don't read.
- Sockets, message ports, hibernation (`server/sockets/socket.ts`, `cloudflare/hibernation.ts`): paths in JSON frames, no URL.
- Adapters (`http/index.ts` `serve()`, `aws-lambda`, Workers, Deno): all go through the handler's app, where the URL is mapped once (`server/handler/app.ts`).
- Middleware `path`, `onError`, `createContext`'s `info.calls`, error messages: the dotted path.
- Durable calls and rate limits (`middleware/durable.ts`, `middleware/ratelimit.ts`): key on `path`, so they're the same whatever the separator.
- Contracts (`server/procedures/implement.ts`, `client/links/validation.ts`): dotted paths and template-literal types; no URL.
- OpenAPI (`openapi/generate.ts`): operation ids and schema names stay dotted. The `'rpc'` document's paths are RPC URLs, so it takes the separator (the one place besides the handler and link). `openapi/to-contract.ts` reads operation ids, not paths.
- MCP (`mcp/tools.ts`): tool names have their own `separator` ([`mcp-tool-names.md`](./mcp-tool-names.md)).
- TanStack Query (`tanstack-query/src/utils.ts`, `keys.ts`): paths are tuples end to end. Keys are `[['post', 'byId'], { input, type }]`, mutation keys `[['post', 'byId']]`, and calls walk the client by key (`target[key]`), so no split; the only joins are Next cache tags (`trpc:post.byId`) and error messages. Unchanged under every option, so keys stay stable.
- NestJS (`experimental-nest`): dotted contract paths to pick implementations; no URL.
- v11 interop (`interop/handler/handler.ts`): v11 clients' own URL format, unchanged.
- Open in B: the option names. Option keys carrying `experimental_` has no precedent here ([`experimental-prefix-on-types-and-methods.md`](./experimental-prefix-on-types-and-methods.md)); and whether a handler with a separator should also refuse the dotted URL, which it serves now to ease moving clients.
