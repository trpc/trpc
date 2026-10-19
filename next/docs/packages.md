---
title: Packages and stability
label: Packages
description: Every package and entry point, what each is for and where its docs are, and what experimental_, unstable_ and @stability promise.
section: Getting started
order: 2
---

Everything server- and client-side is one package, `@trpc12/trpc`. The other packages fit it into a framework or a tool:

| Package                                                                  | For                                                                |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `@trpc12/trpc` ([entry points](#trpc12trpc-entry-points))                | Routers, handlers, clients, links, middleware and adapters         |
| [`@trpc12/tanstack-query`](./integrations/tanstack-query.md)             | TanStack Query options, keys and filters, for any framework        |
| [`@trpc12/tanstack-react-query`](./integrations/tanstack-query/react.md) | React: context, `useSubscription`, and server components in `/rsc` |
| [`@trpc12/upgrade`](./migrations/from-v11/codemod.md)                    | The v11 to v12 codemod                                             |

The TanStack packages re-export `@trpc12/tanstack-query`, so an app installs one of them with TanStack's adapter for its framework.

`effect` is a peer dependency of `@trpc12/trpc`, so every install adds both, and the app's own Effect code shares the same copy. No schema library is a dependency: `.input()` takes zod, Valibot, ArkType or any other Standard Schema, or an Effect Schema ([Input and output](./server/procedures.md#input-and-output)).

## `@trpc12/trpc` entry points

| Entry                     | For                                                                                                                |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `@trpc12/trpc/server`     | `initTrpc`, routers, handlers, callers ([The server](./server/overview.md))                                        |
| `@trpc12/trpc/client`     | `createTrpcClient`, links, `safe` ([The client](./client/overview.md), [Links](./client/links.md))                 |
| `@trpc12/trpc/middleware` | `onStart`, `onSuccess`, `onError`, `onFinish` ([Built-in middleware](./middleware/overview.md))                    |
| `@trpc12/trpc/effect`     | `createEffectClient` ([The Effect client](./client/effect.md))                                                     |
| `@trpc12/trpc/serializer` | `jsonSerializer`, danSON, `createSyncSerializer` ([Serializers](./server/serializers.md))                          |
| `@trpc12/trpc/http`       | `serve`, `toHttpEffect` on Effect's `HttpServer` ([Adapters](./adapters/overview.md))                              |
| `@trpc12/trpc/aws-lambda` | `toLambdaHandler` for API Gateway, ALB and Lambda@Edge ([AWS Lambda](./adapters/aws-lambda.md))                    |
| `@trpc12/trpc/actions`    | `experimental_createAction`, `experimental_createCallable` ([Server Actions](./integrations/server-actions.md))    |
| `@trpc12/trpc/interop`    | `createV11Handler`, `fromV11Link` for v11 code ([Serving v11 clients](./migrations/from-v11/serve-v11-clients.md)) |
| `@trpc12/trpc/extend`     | building blocks for integrations ([Extensions](./server/extensions.md#building-integrations))                      |

## Stability

An export is stable, unstable or experimental, and its name says which: unstable exports start with `unstable_` and experimental ones with `experimental_`. Stable exports follow semver.

### `unstable_` {#unstable}

An `unstable_` feature is one we want, but how it works can still change:

- Its name, options and behavior might change in a minor release.
- It's already used in production, and we encourage you to use it.
- Any change to it is in the release notes, and you'll see type errors.
- Report suggestions on its API and issues at [github.com/trpc/trpc/issues](https://github.com/trpc/trpc/issues).

### `experimental_` {#experimental}

An `experimental_` feature might change or go away in any release:

- What it covers and how it's used might change.
- It might not be well tested.
- It might be dropped entirely.

A package whose name starts with `experimental-` is experimental as a whole, so its exports have no prefix. A feature whose docs pages are in an experiment (off until you turn it on in the header's Experiments menu) is experimental, so it's named one of these two ways. There are no `unstable-` packages: an unstable feature stays, so its package has its final name, with its unstable exports named `unstable_*`.

### Promotion

A feature moves from experimental to unstable to stable, or skips unstable. Each step renames it (`experimental_x` to `unstable_x` to `x`), and the old name stays as a deprecated alias until the next major. A promoted `experimental-` package gets its final name, and its exports that aren't stable yet get `unstable_`. `npx @trpc12/upgrade` rewrites those imports.

Every export's JSDoc carries `@stability` (`stable`, `unstable` or `experimental`) and `@since`. Until 12.0.0, prereleases promise nothing; `@stability` says how the export is planned to ship.

## Versions

Each package has its own version. When a package releases, every package that depends on it releases too, built against the new version, so the newest version of each `@trpc12/*` package works with the newest of the others. Update them together: during `0.x`, each integration's peer dependency on `@trpc12/trpc` is the exact version it was released with, so updating `@trpc12/trpc` alone gives a peer conflict.

## Internal entry points

`@trpc12/trpc/internal` holds types that declaration emit refers to. Don't import it; it has no semver. `@trpc12/trpc/internal/testing` is a semi-public `TestServer` Effect layer for real-server tests (with `@effect/vitest`'s `it.layer`); it has no compatibility promise either. Test in process with `createRouterClient` or `localLink` ([Server-side calls](./server/server-side-calls.md)).
