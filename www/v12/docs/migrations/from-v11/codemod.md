---
title: The codemod
description: '`@trpc12/upgrade` rewrites v11 imports, names, links and transformers to v12, keeps your formatting, and lists what is left as `file:line:column` steps.'
section: Migrations
parent: migrations/from-v11
order: 2
---

`@trpc12/upgrade` rewrites a v11 codebase to v12 where there's one v12 form, and prints the rest as steps. It's a dry run unless you pass `--write`:

```sh
npx @trpc12/upgrade src          # dry run: what would change, what's left
npx @trpc12/upgrade src --write
```

It takes files and directories, reads `.js`, `.jsx`, `.ts` and `.tsx` files (and their `.m` and `.c` forms), and skips `node_modules`, `dist`, `.git`, `.next` and `.output`. The bin is `trpc12-upgrade`, for a global install or a `package.json` script.

## What it rewrites

It keeps your formatting, and rewrites:

- Imports from `@trpc/server`, `@trpc/server/adapters/fetch`, `@trpc/client` and `@trpc/tanstack-react-query` to their `@trpc12/*` entry points, with the names that changed: `initTRPC` to `initTrpc`, `TRPCError` and `TRPCClientError` to `TrpcError`, `fetchRequestHandler` to `createFetchHandler`, `createTRPCClient` to `createTrpcClient`, `TRPCClient` to `TrpcClient`, `createTRPCContext` to `createTrpcContext`, `createTRPCOptionsProxy` to `createTrpcQueryUtils`. `TRPCLink` stays imported from `@trpc/client`, for [`fromV11Link`](./links.md).
- `initTRPC.context<Ctx>().meta<Meta>().create()` to `initTrpc<{ ctx: Ctx; meta: Meta }>()`, `t.mergeRouters(a, b)` to `mergeRouters(a, b)`, and `router.createCaller(ctx)` to `createRouterClient(router, { ctx })`.
- `httpBatchLink`, `httpBatchStreamLink` and `httpSubscriptionLink` to `httpLink`, with their `transformer` wrapped in `createSyncTransformer()`.
- `createTRPCContext`'s result, destructured as a tuple, with `TRPCProvider`, `useTRPC` and `useTRPCClient` renamed wherever the project uses them.
- Imports of `experimental_*` and `unstable_*` exports that moved on a stage, to their new names, and imports from `@trpc12/experimental-*` packages that were promoted, to the package's new name ([Stability](../../packages.md#stability)).

## What it leaves to you

The rest it leaves as is and prints as `file:line:column` steps, with the v12 way:

```
would upgrade src/server/trpc.ts
src/server/trpc.ts:4:3 transformer: drop it here; pass the same createSyncTransformer(transformer) to the handler and every link
src/server/index.ts:1:1 observable(): subscriptions return an async generator or an Effect Stream; a v11 link keeps it under fromV11Link
1 file(s) to upgrade, 2 step(s) by hand
```

The steps cover what needs a decision: an `errorFormatter` (declared errors, or [`createV11Handler`](./serve-v11-clients.md) for old clients), `observable()` subscriptions, the standalone, Express and `ws` adapters ([Adapters](../../adapters/overview.md)) and the `createFetchHandler` it rewrote (each says to serve old clients with `createV11Handler` on that endpoint), `@trpc/react-query` and `@trpc/next`, which have no v12 version, `createWSClient`, `createCallerFactory`, a subscription's `input.lastEventId` (the resolver's `lastEventId` in v12), your own `TRPCLink`s ([v11 links](./links.md)), `inferRouterOutputs` (plain JSON's form for a router type; pass the client's type when you use a transformer, [Inferring types](../../client/overview.md#inferring-types)), TanStack helpers such as `queryOptions(input)` whose input moved into their options (`queryOptions({ input })`), `infiniteQueryFilter(input)`, which is `infiniteFilter({ input })`, and root options such as `isDev` and `sse` that moved to the handler. A file it can't parse is reported and left alone.

## From code

`upgradeSource(source, filename)` rewrites one file's text and returns `{ code, changed, notes }`; `upgradeFiles(paths, { write })` is the CLI's Effect, over files and directories:

```ts
import { writeFileSync } from 'node:fs';
import { upgradeSource } from '@trpc12/upgrade';

const result = upgradeSource(source, 'src/server/trpc.ts');
if (result.changed) writeFileSync('src/server/trpc.ts', result.code);
for (const note of result.notes)
  console.log(`${note.line}:${note.column} ${note.message}`);
```
