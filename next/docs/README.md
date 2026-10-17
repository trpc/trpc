# tRPC v12 docs

User docs for v12, kept in step with the code. The website in [`../www`](../www) renders these pages; each one is plain Markdown with frontmatter, so they read fine on GitHub too. Design notes and decisions live in [`../.agent-docs/`](../.agent-docs/).

## Getting started

- [Getting started](./getting-started.md): A router, a handler that serves it, and a client that calls it with the router's types.
- [Packages and stability](./packages.md): The entry points of @trpc12/trpc, the framework packages, and what experimental_ and @stability promise.

## Server

- [Procedures](./server/procedures.md): Queries, mutations and subscriptions, with validated input and output.
- [Routers](./server/routers.md): Plain objects of procedures, merged with mergeRouters and split with lazy().
- [Middleware](./server/middleware.md): Base procedures that add to the context, replace the input or short-circuit a call.
- [Errors](./server/errors.md): One error class, typed on the client from what resolvers return, with or without declarations.
- [Context](./server/context.md): What every call gets as ctx, where it comes from, and how middleware adds to it.
- [Streaming](./server/streaming.md): Return async generators, Effect streams and nested promises; validate each item with stream().
- [Files](./server/files.md): File and Blob values in inputs and outputs, sent as multipart, raw bodies or streamed chunks.
- [Responses](./server/responses.md): Set headers and status from a resolver, or return a response of your own.
- [Effect](./server/effect.md): Resolvers that return Effects, services from the handler's layer, typed failures and tracing.
- [Extensions](./server/extensions.md): Packages that add middleware, ctx, meta keys, errors and services to every procedure with t.concat().
- [Serializers](./server/serializers.md): Plain JSON by default; danSON or superjson-style serializers keep Dates, Maps and files, and client types follow.
- [Contract-first](./server/contract-first.md): Describe procedures in a contract, implement them later, and type clients from the contract alone.
- [Server-side calls](./server/server-side-calls.md): Call procedures in process with createRouterClient, call() and localLink.

## Middleware

- [Lifecycle hooks](./middleware/lifecycle.md): onStart, onSuccess, onError and onFinish, for logging and metrics.
- [Rate limiting](./middleware/rate-limit.md): rateLimit() counts calls with Effect's RateLimiter, in memory or in Redis, and sets the RateLimit headers.
- [Locks](./middleware/lock.md): experimental_lock() runs calls with the same key one at a time, across instances.
- [Durable calls](./middleware/durable.md): experimental_durable() keeps a call's result, so a client that lost the response gets it instead of running the mutation twice.

## Client

- [The client](./client/overview.md): createTrpcClient types every call from the router's type, and the call options from its links.
- [Links](./client/links.md): httpLink, wsLink, splitLink, switchLink and the other built-in links, and how calls travel over HTTP.
- [Custom links](./client/custom-links.md): Write a link with link(), and declare the call options it reads, the errors it fails with and what it needs.
- [Errors without try/catch](./client/errors.md): safe() and createSafeClient() return result tuples with typed, narrowable errors.
- [Validating on the client](./client/validation.md): validationLink checks inputs before sending and results when they arrive, against a contract.
- [The Effect client](./client/effect.md): createEffectClient returns an Effect per call and a Stream per subscription, with typed errors in the error channel.
- [Tracing](./client/tracing.md): Client spans that propagate traceparent and b3, so client and server share one trace.

## Subscriptions

- [Subscriptions](./subscriptions/overview.md): Streams of events over SSE or WebSockets, with tracked() ids so reconnects resume.
- [Publisher](./subscriptions/publisher.md): Typed publish/subscribe as an Effect service, with a channel per audience and resumable events.
- [Publisher backends](./subscriptions/backends.md): Recipes for a Publisher on Redis streams, Postgres LISTEN/NOTIFY and Durable Objects.

## OpenAPI

- [REST routes](./openapi/routes.md): Serve the same router over REST: route meta, the handler, inputs, outputs and groups.
- [The document](./openapi/document.md): Generate an OpenAPI 3.1 document from the router's schemas, or from its types.
- [Calling REST from the client](./openapi/client.md): openApiLink sends each call to its REST route, typed from a contract.
- [A contract from OpenAPI](./openapi/from-document.md): Generate a typed contract module from any OpenAPI 3.0 or 3.1 document.

## Adapters

- [Adapters](./adapters/overview.md): One handler serves HTTP, SSE and WebSockets on every runtime; pick the adapter for yours.
- [Node](./adapters/node.md): Serve on Node with Effect's HttpServer, or mount the handler in Express, Fastify and node:http.
- [Bun](./adapters/bun.md): Bun.serve takes handler.fetch; WebSockets run on Effect's Bun server.
- [Deno](./adapters/deno.md): Deno.serve with handler.fetch, and handler.websocket for upgrades.
- [Fetch runtimes](./adapters/fetch.md): Cloudflare Workers, Next.js route handlers and other fetch runtimes take handler.fetch as it is.
- [AWS Lambda](./adapters/aws-lambda.md): toLambdaHandler for API Gateway, ALB, function URLs and Lambda@Edge, with response streaming.
- [Durable Objects](./adapters/durable-objects.md): Hibernating WebSockets, publishers, durable calls, locks, Workers Traces and connection tokens on Cloudflare Durable Objects.
- [Message ports](./adapters/message-ports.md): Serve calls over a MessagePort, a web Worker or a worker_threads port.
- [Firebase](./adapters/firebase.md): Call procedures from Firebase callable functions and map their errors to HttpsError.
- [Raw sockets](./adapters/sockets.md): serveSocket serves the router over TCP, TLS or Unix sockets, with experimental_socketLink on the client.

## Integrations

- [TanStack Query](./integrations/tanstack-query.md): Query and mutation options for every TanStack Query framework, with streamed mutations, subscriptions and hydration.
- [Server Actions](./integrations/server-actions.md): Turn procedures into React Server Actions that take typed input or FormData, with useActionState and optimistic updates.
- [React Server Components](./integrations/rsc.md): Prefetch in server components, stream pending queries to the browser, and tag Next's data cache by query key.
- [React without TanStack Query](./integrations/experimental-react.md): Render-as-you-fetch with use() and Suspense in @trpc12/experimental-react, where cache features are links.
- [React atoms](./integrations/experimental-react-atom.md): Query, mutation and subscription atoms on Effect Atom, typed with each procedure's errors.
- [AI SDK](./integrations/ai-sdk.md): Stream useChat responses from a procedure, and give procedures to the model as tools.
- [Better Auth](./integrations/better-auth.md): Read the Better Auth session in a middleware and type ctx.user with its user.
- [NestJS](./integrations/nestjs.md): Serve a contract from Nest controllers with @trpc12/nest.

## Migrations

- [Migrating from v11](./migrations/from-v11.md): Serve v11 clients from the new router with createV11Handler, run the codemod, then move the clients.
