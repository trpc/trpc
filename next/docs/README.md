# tRPC v12 docs

User docs for v12, kept in step with the code. The website in [`../www`](../www) renders these pages; each one is plain Markdown with frontmatter, so they read fine on GitHub too. Design notes and decisions live in [`../.agent-docs/`](../.agent-docs/).

Pages marked (experimental) belong to an experiment, unlisted on the site until they're reviewed: out of its sidebar and search until the experiment is on (from the header's Experiments menu, `?flags=<experiment>`, or by opening one of its pages), and always out of the sitemap and `llms.txt`, and `noindex`.

## Getting started

- [Getting started](./getting-started.md): A router, a handler that serves it, and a client that calls it with the router's types.
- [Packages and stability](./packages.md): Every package and entry point, what each is for and where its docs are, and what experimental_ and @stability promise.

## Server

- [The server](./server/overview.md): How procedures, routers, context and the handler fit together, and where each page of this section comes in.
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
- [Server-side calls](./server/server-side-calls.md): Call procedures in process with createRouterClient, call() and localLink.
- [Large routers](./server/large-routers.md): Keep type-checking fast with thousands of procedures, by building the server's declarations and typing apps from them.

## Middleware

- [Built-in middleware](./middleware/overview.md): The middleware in @trpc12/trpc/middleware, for logs and metrics, and how to apply it.
- [Lifecycle hooks](./middleware/lifecycle.md): onStart, onSuccess, onError and onFinish, for logging and metrics.
- [Rate limiting](./middleware/rate-limit.md) (experimental): rateLimit() counts calls with Effect's RateLimiter, in memory or in Redis, and sets the RateLimit headers.
- [Locks](./middleware/lock.md) (experimental): experimental_lock() runs calls with the same key one at a time, across instances.
- [Durable calls](./middleware/durable.md) (experimental): experimental_durable() keeps a call's result, so a client that lost the response gets it instead of running the mutation twice.

## Client

- [The client](./client/overview.md): createTrpcClient types every call from the router's type, and the call options from its links.
- [Links](./client/links.md): A client's chain of links, the built-in ones, and the order they go in.
  - [httpLink](./client/links/http.md): Queries as GET, mutations as POST and subscriptions as SSE, with batching, streamed outputs and files.
  - [wsLink](./client/links/ws.md): Every call over one WebSocket, with connection params, keep-alive pings and reconnects that resume subscriptions.
  - [splitLink](./client/links/split.md): Send each call down one of two chains, picked from its path, type or input.
  - [switchLink](./client/links/switch.md): Pick one of several named chains per call, and let a call force one with a typed call option.
  - [retryLink](./client/links/retry.md): Retry failed calls, by default queries that failed outside their typed errors, with backoff.
  - [dedupeLink](./client/links/dedupe.md): Share one request between identical queries in flight.
  - [loggerLink](./client/links/logger.md): Log every operation, its results and its errors, to the console or a function of your own.
  - [localLink](./client/links/local.md): Call a router in the same process, through the client and its other links.
  - [Custom links](./client/custom-links.md): Write a link with link(), and declare the call options it reads, the errors it fails with and what it needs.
- [Errors without try/catch](./client/errors.md): safe() and createSafeClient() return result tuples with typed, narrowable errors.
- [The Effect client](./client/effect.md): createEffectClient returns an Effect per call and a Stream per subscription, with typed errors in the error channel.
- [Tracing](./client/tracing.md): Client spans that propagate traceparent and b3, so client and server share one trace.

## Subscriptions

- [Subscriptions](./subscriptions/overview.md): Streams of events over SSE or WebSockets, with tracked() ids so reconnects resume.
- [Publisher](./subscriptions/publisher.md) (experimental): Typed publish/subscribe as an Effect service, with a channel per audience and resumable events.
  - [Publisher backends](./subscriptions/backends.md) (experimental): Recipes for a Publisher on Redis streams and Postgres LISTEN/NOTIFY.

## Contracts and OpenAPI (experimental)

- [Contract-first](./server/contract-first.md): Describe procedures in a contract, implement them later, and type clients from the contract alone.
- [OpenAPI](./openapi/overview.md): Serve the router over REST, document it as OpenAPI 3.1, call REST routes from the client, and generate contracts from OpenAPI documents.
- [REST routes](./openapi/routes.md): Serve the same router over REST: route meta, the handler, inputs, outputs and groups.
- [The document](./openapi/document.md): Generate an OpenAPI 3.1 document from the router's schemas, or from its types.
- [Calling REST from the client](./openapi/client.md): experimental_openApiLink sends each call to its REST route, typed from a contract.
- [A contract from OpenAPI](./openapi/from-document.md): Generate a typed contract module from any OpenAPI 3.0 or 3.1 document.
- [Validating on the client](./client/validation.md): experimental_validationLink checks inputs before sending and results when they arrive, against a contract.

## Adapters

- [Adapters](./adapters/overview.md): One handler serves HTTP, SSE and WebSockets on every runtime; pick the adapter for yours.
- [Node](./adapters/node.md): Serve on Node with Effect's HttpServer, or mount the handler in Express, Fastify and node:http.
- [Bun](./adapters/bun.md): Bun.serve takes handler.fetch; WebSockets run on Effect's Bun server.
- [Deno](./adapters/deno.md): Deno.serve with handler.fetch, which upgrades WebSockets with Deno.upgradeWebSocket.
- [Fetch runtimes](./adapters/fetch.md): Cloudflare Workers, Next.js route handlers and other fetch runtimes take handler.fetch as it is.
- [AWS Lambda](./adapters/aws-lambda.md): toLambdaHandler for API Gateway, ALB, function URLs and Lambda@Edge, with response streaming.
- [Cloudflare](./adapters/cloudflare.md) (experimental): Everything in @trpc12/trpc/cloudflare. Durable Objects with hibernating WebSockets, publishers, durable calls, locks and connection tokens, plus Workers Traces.
- [Message ports](./adapters/message-ports.md) (experimental): Serve calls over a MessagePort, a web Worker or a worker_threads port.
- [Firebase](./adapters/firebase.md) (experimental): Call procedures from Firebase callable functions and map their errors to HttpsError.
- [Raw sockets](./adapters/sockets.md) (experimental): serveSocket serves the router over TCP, TLS or Unix sockets, with experimental_socketLink on the client.

## Integrations

- [Integrations](./integrations/overview.md): Data fetching with TanStack Query, and React and Next.js on the server.
- [TanStack Query](./integrations/tanstack-query.md): Query, mutation and subscription options for TanStack Query, from one package and its React adapter.
  - [React](./integrations/tanstack-query/react.md): @trpc12/tanstack-react-query: the helpers as a module singleton or through context, Suspense, useSubscription, and server components.
  - [Preact](./integrations/tanstack-query/preact.md) (experimental): @trpc12/tanstack-preact-query: a context provider for the client, useTrpc() in components, and useSubscription.
  - [Vue](./integrations/tanstack-query/vue.md) (experimental): @trpc12/tanstack-vue-query: a Vue plugin or provideTrpc() for the client, useTrpc() in setup, and useSubscription with refs.
  - [Solid](./integrations/tanstack-query/solid.md) (experimental): @trpc12/tanstack-solid-query: a context provider for the client, useTrpc() in components, and useSubscription with reactive getters.
  - [Svelte](./integrations/tanstack-query/svelte.md) (experimental): @trpc12/tanstack-svelte-query: context helpers for the client, useTrpc() in components, and createSubscription with runes.
  - [Angular](./integrations/tanstack-query/angular.md) (experimental): @trpc12/tanstack-angular-query: provideTrpc() next to provideTanStackQuery, injectTrpc() in components, and injectSubscription with signals.
  - [Lit](./integrations/tanstack-query/lit.md) (experimental): @trpc12/tanstack-lit-query: a provider element for the client, useTrpc(this) in elements, and createSubscriptionController.
  - [Query keys and filters](./integrations/tanstack-query/keys.md): How tRPC's query keys are shaped, the filters that invalidate and read them, and keyPrefix for two APIs in one QueryClient.
  - [Subscriptions in TanStack Query](./integrations/tanstack-query/subscriptions.md): subscriptionOptions() for each framework's subscription primitive, shared between components, and liveOptions() and streamedOptions() in the query cache.
  - [Streamed mutations](./integrations/tanstack-query/streamed-mutations.md): A mutation that returns an async iterable fills in as it streams, with chunksOptions(), and stops on unmount or on demand; long jobs pair a mutation with a subscription.
  - [Hydration and offline mutations](./integrations/tanstack-query/hydration.md): hydrationOptions() sends the cache to the browser with the client's serializer, and persisted mutations resume with setMutationDefaults.
  - [TanStack DB](./integrations/tanstack-query/tanstack-db.md) (experimental): A TanStack DB query collection over a procedure's queryOptions(), with optimistic inserts that call mutations.
- [React and Next.js](./integrations/react.md): Fetching in React, and the pages for server components, Server Actions and route handlers.
  - [React Server Components](./integrations/rsc.md): Prefetch in server components, stream pending queries to the browser, and tag Next's data cache by query key.
  - [Server Actions](./integrations/server-actions.md): Turn procedures into React Server Actions that take typed input or FormData, with useActionState and optimistic updates.
  - [React without TanStack Query](./integrations/experimental-react.md) (experimental): Render-as-you-fetch with use() and Suspense in @trpc12/experimental-react, where cache features are links.
  - [React atoms](./integrations/experimental-react-atom.md) (experimental): Query, mutation and subscription atoms on Effect Atom, typed with each procedure's errors.
- [AI SDK](./integrations/ai-sdk.md) (experimental): Stream useChat responses from a procedure, and give procedures to the model as tools.
- [Better Auth](./integrations/better-auth.md) (experimental): Read the Better Auth session in a middleware and type ctx.user with its user.
- [NestJS](./integrations/nestjs.md) (experimental): Serve a contract from Nest controllers with @trpc12/nest.

## Migrations

- [Migrating from v11](./migrations/from-v11.md): Serve v11 clients from the new router with createV11Handler, run the codemod, then move the clients.
  - [Serving v11 clients](./migrations/from-v11/serve-v11-clients.md): createV11Handler serves the new router to @trpc/client 11 apps on the endpoint they already call, in v11's wire format and error shape.
  - [The codemod](./migrations/from-v11/codemod.md): @trpc12/upgrade rewrites v11 imports, names, links and transformers to v12, keeps your formatting, and lists what is left as file:line:column steps.
  - [Your v11 links](./migrations/from-v11/links.md): fromV11Link runs a v11 TRPCLink in a v12 chain, so you can move links one at a time, and what a rewritten link looks like.
  - [API changes](./migrations/from-v11/api-changes.md): Each v11 API next to its v12 form: init, errors, transformers, handlers, adapters, clients, links, callers and subscriptions.
