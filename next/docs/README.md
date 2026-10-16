# trpcdev docs

User docs for vNext, kept in step with the code. Design notes and decisions live in [`../.agent-docs/`](../.agent-docs/).

- [Getting started](./getting-started.md): a router, a handler, a client.
- [Procedures](./procedures.md): input and output, errors, middleware, Effect.
- [Routers](./routers.md): plain objects, `mergeRouters`, OpenAPI groups, `lazy()`, contract-first.
- [Client](./client.md): links, call options, `safe()`, the Effect client, HTTP details.
- [Serializers](./serializers.md): danSON, superjson-style sync serializers, plain JSON, client types.
- [Subscriptions](./subscriptions.md): `tracked()`, resuming, `Publisher`.
- [Server Actions and RSC](./actions-and-rsc.md): `trpcdev/actions`, `@trpcdev/tanstack-react-query/rsc`.
- [TanStack Query](./tanstack-query.md): query helpers and hydration.
- [OpenAPI](./openapi.md): the REST handler, the document.
- [Platforms](./platforms.md): Node, Bun, Deno, Express, Fastify, fetch runtimes.
- [Migrating from v11](./migrating-from-v11.md): serving old clients with `createV11Handler`, API changes.

Entry points of `trpcdev`:

| Entry                | For                                                      |
| -------------------- | -------------------------------------------------------- |
| `trpcdev/server`     | `initTrpc`, routers, handlers, callers, `Publisher`      |
| `trpcdev/client`     | `createTrpcClient`, links, `safe`                        |
| `trpcdev/middleware` | `onStart`, `onSuccess`, `onError`, `onFinish`            |
| `trpcdev/actions`    | `createAction`, `createCallable`                         |
| `trpcdev/effect`     | `createEffectClient`                                     |
| `trpcdev/http`       | `serve`, `toHttpEffect` on Effect's `HttpServer`         |
| `trpcdev/cloudflare` | hibernating WebSockets and publisher on Durable Objects  |
| `trpcdev/aws-lambda` | `toLambdaHandler` for API Gateway, ALB and Lambda@Edge   |
| `trpcdev/socket`     | `serveSocket` on Effect's `SocketServer` (TCP, TLS)      |
| `trpcdev/openapi`    | `createOpenApiHandler`, `generateOpenApi`, `openApiLink` |
| `trpcdev/interop`    | `createV11Handler` for `@trpc/client` 11 apps            |
| `trpcdev/contract`   | contract-first routers, `toContract`                     |
| `trpcdev/serializer` | danSON, `createSyncSerializer`, `jsonSerializer`         |
| `trpcdev/extend`     | building blocks for integrations                         |

`trpcdev/internal` holds types that declaration emit refers to. Don't import it; it has no semver. `trpcdev/internal/testing` is a semi-public `TestServer` Effect layer for real-server tests (with `@effect/vitest`'s `it.layer`); it has no compatibility promise either. Test in process with `createRouterClient` or `localLink`.
