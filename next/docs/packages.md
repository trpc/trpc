---
title: Packages and stability
description: The entry points of @trpc12/trpc, the framework packages, and what experimental_ and @stability promise.
section: Getting started
order: 2
---

Everything server- and client-side is one package, `@trpc12/trpc`, split into entry points:

| Entry                     | For                                                                             |
| ------------------------- | ------------------------------------------------------------------------------- |
| `@trpc12/trpc/server`     | `initTrpc`, routers, handlers, callers, `Publisher`                             |
| `@trpc12/trpc/client`     | `createTrpcClient`, links, `safe`                                               |
| `@trpc12/trpc/middleware` | `onStart`, `onSuccess`, `onError`, `onFinish`, `rateLimit`, `experimental_lock` |
| `@trpc12/trpc/actions`    | `experimental_createAction`, `experimental_createCallable`                      |
| `@trpc12/trpc/effect`     | `createEffectClient`                                                            |
| `@trpc12/trpc/http`       | `serve`, `toHttpEffect` on Effect's `HttpServer`                                |
| `@trpc12/trpc/cloudflare` | hibernating WebSockets, publisher and locks on Durable Objects; Workers Traces  |
| `@trpc12/trpc/aws-lambda` | `toLambdaHandler` for API Gateway, ALB and Lambda@Edge                          |
| `@trpc12/trpc/socket`     | `serveSocket` on Effect's `SocketServer` (TCP, TLS)                             |
| `@trpc12/trpc/openapi`    | `createOpenApiHandler`, `generateOpenApi`, `openApiLink`                        |
| `@trpc12/trpc/interop`    | `createV11Handler`, `fromV11Link` for v11 code                                  |
| `@trpc12/trpc/contract`   | contract-first routers, `toContract`                                            |
| `@trpc12/trpc/serializer` | `jsonSerializer`, danSON, `createSyncSerializer`                                |
| `@trpc12/trpc/extend`     | building blocks for integrations                                                |

Framework packages sit on top: `@trpc12/tanstack-query` and its React, Preact, Vue, Solid, Svelte, Angular and Lit adapters ([TanStack Query](./integrations/tanstack-query.md)), `@trpc12/nest` ([NestJS](./integrations/nestjs.md)), the experimental React packages ([React without TanStack Query](./integrations/experimental-react.md)) and the `@trpc12/upgrade` codemod ([Migrating from v11](./migrations/from-v11.md)).

## Stability

An export whose name starts with `experimental_` (such as `experimental_durableLink`) may still change in a minor release, and so may every export of a package whose name starts with `experimental-` (such as `@trpc12/experimental-react`), whose exports have no prefix. When one becomes stable, it gets its name without the prefix, and the `experimental_` name stays as a deprecated alias until the next major. `npx @trpc12/upgrade` rewrites those imports.

Every export's JSDoc carries `@stability` (`stable` or `experimental`) and `@since`. Until 12.0.0, prereleases promise nothing; `@stability` says how the export is planned to ship.

## Internal entry points

`@trpc12/trpc/internal` holds types that declaration emit refers to. Don't import it; it has no semver. `@trpc12/trpc/internal/testing` is a semi-public `TestServer` Effect layer for real-server tests (with `@effect/vitest`'s `it.layer`); it has no compatibility promise either. Test in process with `createRouterClient` or `localLink` ([Server-side calls](./server/server-side-calls.md)).
