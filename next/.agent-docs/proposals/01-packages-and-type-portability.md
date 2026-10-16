# 01 — Packages, entry points and type portability

| Status     | Area      | Depends on | oRPC parity rows                            |
| ---------- | --------- | ---------- | ------------------------------------------- |
| `proposed` | repo, all | —          | — (enables contract types and integrations) |

## Summary

`ideas.md` already sets the package layout:

> Rather than have a `@trpc/server` and a `@trpc/client` package, everything that doesn't have an external dependency (except Effect), eg. React etc, should be in a package just called `trpcdev` and exports can be in `/server` and `/client` folders etc.

This proposal works out the details:

- The subpath layout of `trpcdev`.
- How integration packages are named.
- How `effect` is depended on.
- The portability rules, plus a CI fixture, that make sure our types never trigger TS2742 ("The inferred type of X cannot be named without a reference to Y. This is likely not portable.").

## Today (v11)

- Packages: `@trpc/server`, `@trpc/client`, `@trpc/tanstack-react-query`, `@trpc/react-query`, `@trpc/next`, `@trpc/openapi`, `@trpc/upgrade`.
- `@trpc/server` is the de facto core. The client and React packages import internals from `@trpc/server/unstable-core-do-not-import`. Per its header comment, that subpath exists _so inferred types can be named_ and as glue for official packages.
- `adapters/next.ts` re-exports Next's types purely to avoid TS2742.
- Mismatched `@trpc/server` / `@trpc/client` versions are a recurring support issue.
- [#5225](https://github.com/trpc/trpc/pull/5225) (`@trpc/core`) was attempted and superseded.

### Why TS2742 happens

1. A public signature references a type that **no public entry point exports**. TS can then only reach it via `…/dist/…`, which the `exports` map blocks.
2. The consuming package **does not directly depend** on the package that exports the type. This is common with pnpm's strict layout, for example a UI package that depends on the TanStack integration but not on the server package.
3. **Declaration bundling** puts shared types into hashed chunks (`dist/chunk-abc.d.ts`) that nothing re-exports.
4. The `AppRouter` type embeds **user types from other packages**, such as context types that reference Prisma. This is user-land, but our types make it worse by carrying `ctx` and middleware types into everything the client sees ([#5242](https://github.com/trpc/trpc/pull/5242)).

## Goals

- A user can export a client, query utilities or a router type from any workspace package with `declaration: true` and never see TS2742.
- Server and client versions cannot drift apart.
- A clear separation between stable public API and internals (21).
- Integrations with third-party peers (React, TanStack, Next) stay optional.

## Proposed layout

`trpcdev` is unscoped and not yet taken on npm (checked 2026-10-09). Its only runtime dependency is `effect`.

```text
trpcdev
  ./server          initTRPC, TRPCError, procedure/router/middleware APIs, createRouterClient, call, callable, action
  ./server/fetch    createHandler → { fetch, handle }   (could fold into ./server, see Q1.2)
  ./server/node     toNodeListener, createServer      (node:* built-ins only)
  ./server/ws       WebSocket + MessagePort handlers
  ./server/plugins  cors, csrf, bodyLimit, batch, …
  ./client          createTRPCClient, links, safe
  ./contract        contract builder (09)
  ./openapi         OpenAPI handler, generator, openAPILink (18)
  ./serializer      the rich serializer (11)
  ./effect          Effect-flavoured client and helpers (02)
  ./testing         in-memory server/client pairs and other test helpers
  ./internal        no-semver glue for first-party integration packages (21)

@trpcdev/tanstack-query   peer: @tanstack/query-core, trpcdev    (19)
@trpcdev/react            peer: react, trpcdev                   (20, only if pursued)
@trpcdev/next             peer: next, trpcdev                    (15, only if needed)
```

- ✅ One install and one version, so server/client skew is impossible. Every type lives in one package, which removes most TS2742 cases.
- ✅ Precedent: Effect v4 folded `@effect/platform`, `@effect/rpc`, `@effect/schema` and `@effect/sql` into `effect`.
- ✅ Contract, client and server types share one source of truth.
- ❌ Client-only consumers download server code (bytes on disk only; it is tree-shaken from bundles).

Imports under each Q1.2 granularity:

```ts
// Q1.2 as proposed
import { initTRPC, TRPCError } from 'trpcdev/server';
import { createHandler } from 'trpcdev/server/fetch';
import { toNodeListener } from 'trpcdev/server/node';
import { cors, bodyLimit } from 'trpcdev/server/plugins';
import { createTRPCClient, httpLink } from 'trpcdev/client';

// Q1.2 flatter: the fetch handler is part of ./server; platforms are top-level
import { initTRPC, TRPCError, createHandler } from 'trpcdev/server';
import { toNodeListener } from 'trpcdev/node';
import { createTRPCClient, httpLink } from 'trpcdev/client';
```

Integration packages under each Q1.3 naming:

```ts
import { createTRPCQueryUtils } from '@trpcdev/tanstack-query'; // scoped (recommended)
import { createTRPCQueryUtils } from 'trpcdev-tanstack-query'; // unscoped
```

`./testing` (Q1.4), with the helpers named in `approach.md`:

```ts
import { createTestServer, createTestClient } from 'trpcdev/testing';

await using server = createTestServer({ router: appRouter, createContext }); // option shapes TBD
const client = createTestClient<AppRouter>({ server });
expect(await client.post.byId.query({ id: '1' })).toEqual(post);
```

## Portability rules

1. **Every type that is reachable from a public signature is exported from a public entry point.** No exceptions for "internal" helper types. They go in `./internal` with a stability tag (21), but they are exported.
2. Integration packages declare `trpcdev` as a **peer dependency** and re-export nothing from it.
3. Client-facing generics accept **contract types**, not full routers. A router type can be reduced to its client-visible shape with `inferContract<typeof appRouter>`, which strips `ctx`, middleware and services (09). This also shrinks emitted `.d.ts` files and speeds up type checking.
4. We author our own source with **`isolatedDeclarations: true`**. Exported functions must have explicit return types, which forces us to name and export every type. It also makes `.d.ts` emit fast and parallelisable (tsdown/oxc).
5. Either do not bundle declarations across entry points, or verify that each shared chunk's types are re-exported from a public entry.
6. **CI fixture:** a `test/portability` workspace with pnpm-isolated consumer packages that `export const client = createTRPCClient(...)`, `export const utils = createTRPCQueryUtils(...)`, `export type AppRouter = …` and so on, compiled with `declaration: true`. The build fails on TS2742.

Rules 1 and 4 in library source:

```ts
// ✅ explicit return type; TRPCClient is exported from trpcdev/client
export function createTRPCClient<TRouter>(
  opts: CreateTRPCClientOptions<TRouter>,
): TRPCClient<TRouter> {
  return createTRPCClientProxy<TRouter>(new TRPCUntypedClient(opts));
}

// ❌ inferred return type: rejected by isolatedDeclarations, and TS2742 for
// consumers if the inferred type is not exported from a public entry point
export function createTRPCClient<TRouter>(
  opts: CreateTRPCClientOptions<TRouter>,
) {
  return createTRPCClientProxy<TRouter>(new TRPCUntypedClient(opts));
}
```

Rule 2 in an integration package:

```ts
// @trpcdev/tanstack-query/src/index.ts
import type { TRPCClient } from 'trpcdev/client'; // ✅ use the peer's types
export { createTRPCQueryUtils } from './createTRPCQueryUtils';
// ❌ export type { TRPCClient } from 'trpcdev/client';
```

```jsonc
// @trpcdev/tanstack-query/package.json
{
  "peerDependencies": {
    "@tanstack/query-core": "^5",
    "trpcdev": "workspace:^",
  },
}
```

Rules 3 and 6: the portability fixture exports a client typed by a contract, from a package that does not depend on the server's dependencies:

```ts
// test/portability/server/src/index.ts
export const appRouter = { post: { byId, create } };
export type AppContract = inferContract<typeof appRouter>; // no ctx, middleware or services

// test/portability/ui/src/index.ts (declaration: true; TS2742 fails the build)
import { createTRPCClient, httpLink } from 'trpcdev/client';
import { createTRPCQueryUtils } from '@trpcdev/tanstack-query';
import type { AppContract } from 'portability-server'; // fixture package name TBD

export const client = createTRPCClient<AppContract>({
  links: [httpLink({ url: '/trpc' })],
});
export const utils = createTRPCQueryUtils({ client });
```

## `effect` as a dependency

- `effect` must be a single instance in a user's app if they also use Effect. `Effect.isEffect`, `Context` identity and fiber refs break with duplicate copies.
- **Recommendation:** `effect` is a **peer dependency** (`^4`). npm, pnpm and Bun auto-install peers, so non-Effect users still get it for free. This mirrors how Effect's own `@effect/platform-*` packages depend on `effect`.

```jsonc
// trpcdev/package.json, Q1.1 peer dependency (recommended)
{ "peerDependencies": { "effect": "^4" } }
```

```jsonc
// trpcdev/package.json, Q1.1 regular dependency
{ "dependencies": { "effect": "^4" } }
```

## Recommendation

- The layout above.
- Integrations as `@trpcdev/<name>`.
- `effect` as a peer dependency.
- The portability rules, including the CI fixture and `isolatedDeclarations`.
- Adapters stay subpaths of `trpcdev`, because they only use platform built-ins (12).
- `./testing` ships first-class test helpers. `ideas.md` says packages can export things that exist only for testing.

## Questions

- **Q1.1** `effect` as a peer dependency (recommended) or a regular dependency?
- **Q1.2** Subpath granularity: as above (`./server/fetch`, `./server/node`, …), or flatter (`./server` includes the fetch handler; `./node`, `./ws` at the top level)?
- **Q1.3** Integration package naming: `@trpcdev/tanstack-query` (recommended), or unscoped `trpcdev-tanstack-query`?
- **Q1.4** Ship `./testing` helpers publicly?
- **Q1.5** Adopt `isolatedDeclarations` in our own source?

## Decision

> Package name and the single-package layout are given by `ideas.md`.

- **Q1.1:** [ ] peer dependency · [x] dependency (`^4.0.0`) → [effect-dependency](../decisions/effect-dependency.md)
- **Q1.2:** [ ] as proposed · [ ] flatter · other: `____`
- **Q1.3:** [x] `@trpcdev/*` · [ ] unscoped → [integration-packages](../decisions/integration-packages.md)
- **Q1.4:** [ ] yes · [ ] no
- **Q1.5:** [ ] yes · [ ] no
- **Notes:**
