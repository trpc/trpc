# tRPC v12 docs

User docs for vNext, kept in step with the code. Design notes and decisions live in [`../.agent-docs/`](../.agent-docs/).

- [Getting started](./getting-started.md): a router, a handler, a client.
- [Procedures](./procedures.md): input and output, errors, middleware, Effect.
- [Routers](./routers.md): plain objects, `mergeRouters`, OpenAPI groups, `lazy()`, contract-first.
- [Client](./client.md): links, call options, `safe()`, the Effect client, HTTP details.
- [Serializers](./serializers.md): plain JSON by default, danSON, superjson-style sync serializers, client types.
- [Subscriptions](./subscriptions.md): `tracked()`, resuming, `Publisher`.
- [Server Actions and RSC](./actions-and-rsc.md): `@trpc12/trpc/actions`, `@trpc12/tanstack-react-query/rsc`.
- [TanStack Query](./tanstack-query.md): query helpers and hydration.
- [OpenAPI](./openapi.md): the REST handler, the document.
- [Platforms](./platforms.md): Node, Bun, Deno, Express, Fastify, fetch runtimes.
- [Integrations](./integrations.md): AI SDK chats and tools, Better Auth sessions.
- [Migrating from v11](./migrating-from-v11.md): serving old clients with `createV11Handler`, API changes.

Entry points of `@trpc12/trpc`:

| Entry                     | For                                                        |
| ------------------------- | ---------------------------------------------------------- |
| `@trpc12/trpc/server`     | `initTrpc`, routers, handlers, callers, `Publisher`        |
| `@trpc12/trpc/client`     | `createTrpcClient`, links, `safe`                          |
| `@trpc12/trpc/middleware` | `onStart`, `onSuccess`, `onError`, `onFinish`              |
| `@trpc12/trpc/actions`    | `experimental_createAction`, `experimental_createCallable` |
| `@trpc12/trpc/effect`     | `createEffectClient`                                       |
| `@trpc12/trpc/http`       | `serve`, `toHttpEffect` on Effect's `HttpServer`           |
| `@trpc12/trpc/cloudflare` | hibernating WebSockets and publisher on Durable Objects    |
| `@trpc12/trpc/aws-lambda` | `toLambdaHandler` for API Gateway, ALB and Lambda@Edge     |
| `@trpc12/trpc/socket`     | `serveSocket` on Effect's `SocketServer` (TCP, TLS)        |
| `@trpc12/trpc/openapi`    | `createOpenApiHandler`, `generateOpenApi`, `openApiLink`   |
| `@trpc12/trpc/interop`    | `createV11Handler`, `fromV11Link` for v11 code             |
| `@trpc12/trpc/contract`   | contract-first routers, `toContract`                       |
| `@trpc12/trpc/serializer` | `jsonSerializer`, danSON, `createSyncSerializer`           |
| `@trpc12/trpc/extend`     | building blocks for integrations                           |

An export whose name starts with `experimental_` (such as `experimental_durableLink`) may still change in a minor release. When one becomes stable, it gets its name without the prefix, and the `experimental_` name stays as a deprecated alias until the next major. `npx @trpc12/upgrade` rewrites those imports. Every export's JSDoc carries `@stability` (`stable` or `experimental`) and `@since`. Until 12.0.0, prereleases promise nothing; `@stability` says how the export is planned to ship.

`@trpc12/trpc/internal` holds types that declaration emit refers to. Don't import it; it has no semver. `@trpc12/trpc/internal/testing` is a semi-public `TestServer` Effect layer for real-server tests (with `@effect/vitest`'s `it.layer`); it has no compatibility promise either. Test in process with `createRouterClient` or `localLink`.
