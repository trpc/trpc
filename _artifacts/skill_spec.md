# tRPC — Skill Spec

tRPC is a TypeScript framework for building end-to-end typesafe APIs without
schemas or code generation. It lets you define server procedures (query,
mutation, subscription) and call them from clients with full static type safety,
autocompletion, and zero runtime overhead.

## Domains

| Domain                 | Description                                                                     | Skills                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Defining the API       | Server-side setup: routers, procedures, context, middleware, validators, errors | server-setup, middlewares, validators, error-handling, server-side-calls, caching, non-json-content-types |
| Consuming the API      | Client-side setup: clients, links, headers, transformers, React Query           | client-setup, links, react-query-setup, react-query-classic-migration, superjson                          |
| Hosting the API        | Adapters for server and serverless runtimes                                     | adapter-standalone, adapter-express, adapter-fastify, adapter-aws-lambda, adapter-fetch                   |
| Real-time              | SSE and WebSocket subscriptions                                                 | subscriptions                                                                                             |
| Framework integration  | Next.js and React with SSR/RSC                                                  | nextjs-app-router, nextjs-pages-router                                                                    |
| Interop and publishing | OpenAPI, SOA, auth                                                              | auth, openapi, service-oriented-architecture                                                              |

## Skill Inventory

| Skill                         | Type        | Domain                | What it covers                                                        | Failure modes |
| ----------------------------- | ----------- | --------------------- | --------------------------------------------------------------------- | ------------- |
| server-setup                  | core        | defining-api          | initTRPC, routers, procedures, context, AppRouter export              | 9             |
| middlewares                   | core        | defining-api          | .use(), .concat(), base procedures, OTEL tracing                      | 3             |
| validators                    | core        | defining-api          | .input()/.output() with Zod, input chaining, Standard Schema          | 3             |
| error-handling                | core        | defining-api          | TRPCError, errorFormatter, onError, status codes                      | 3             |
| server-side-calls             | core        | defining-api          | createCallerFactory, testing patterns                                 | 2             |
| caching                       | core        | defining-api          | responseMeta, Cache-Control, CDN caching                              | 2             |
| non-json-content-types        | core        | defining-api          | FormData, file uploads, binary data, octetInputParser                 | 3             |
| client-setup                  | core        | consuming-api         | createTRPCClient, headers, transformers, type inference               | 6             |
| links                         | core        | consuming-api         | httpLink, httpBatchLink, httpBatchStreamLink, splitLink, wsLink, etc. | 5             |
| react-query-setup             | framework   | consuming-api         | createTRPCContext, TRPCProvider, queryOptions, mutationOptions        | 3             |
| react-query-classic-migration | lifecycle   | consuming-api         | @trpc/upgrade CLI, hook→options migration                             | 2             |
| superjson                     | composition | consuming-api         | SuperJSON transformer on server + client links                        | 3             |
| adapter-standalone            | core        | hosting-api           | createHTTPServer, CORS, basePath, HTTP/2                              | 1             |
| adapter-express               | core        | hosting-api           | createExpressMiddleware, context with req/res                         | 1             |
| adapter-fastify               | core        | hosting-api           | fastifyTRPCPlugin, WebSocket, maxParamLength                          | 3             |
| adapter-aws-lambda            | core        | hosting-api           | awsLambdaRequestHandler, streaming, API Gateway                       | 2             |
| adapter-fetch                 | core        | hosting-api           | fetchRequestHandler, Cloudflare/Deno/Vercel Edge                      | 1             |
| subscriptions                 | core        | realtime              | async generators, tracked(), SSE, WebSocket, reconnection             | 7             |
| nextjs-app-router             | framework   | framework-integration | fetch adapter, RSC prefetch, HydrateClient, Server Actions            | 4             |
| nextjs-pages-router           | framework   | framework-integration | withTRPC HOC, SSR, SSG, createNextApiHandler                          | 2             |
| auth                          | composition | defining-api          | JWT/cookie auth, middleware, context narrowing, SSE auth              | 5             |
| openapi                       | composition | interop               | OpenAPI spec generation, HeyAPI client, transformers                  | 2             |
| service-oriented-architecture | composition | interop               | Custom routing links, gateway pattern, shared routers                 | 1             |

## Failure Mode Inventory

### server-setup (9 failure modes)

| #   | Mistake                                                      | Priority | Source          | Cross-skill?                       |
| --- | ------------------------------------------------------------ | -------- | --------------- | ---------------------------------- |
| 1   | Calling initTRPC.create() more than once                     | CRITICAL | docs            | —                                  |
| 2   | Using reserved words as procedure names                      | HIGH     | source          | —                                  |
| 3   | Importing AppRouter as a value import                        | CRITICAL | interview       | —                                  |
| 4   | Creating context without inner/outer split                   | MEDIUM   | examples        | —                                  |
| 5   | Merging routers with different transformers                  | HIGH     | source          | —                                  |
| 6   | Hallucinating v10 API patterns                               | CRITICAL | migration guide | client-setup, links, subscriptions |
| 7   | Using type assertions to work around AppRouter import errors | CRITICAL | interview       | client-setup                       |
| 8   | Treating tRPC as a REST API                                  | CRITICAL | interview       | client-setup                       |
| 9   | Importing appRouter value (not type) into client             | CRITICAL | interview       | —                                  |

### middlewares (3 failure modes)

| #   | Mistake                                              | Priority | Source | Cross-skill? |
| --- | ---------------------------------------------------- | -------- | ------ | ------------ |
| 1   | Forgetting to call and return opts.next()            | CRITICAL | source | —            |
| 2   | Extending context with wrong type                    | HIGH     | docs   | —            |
| 3   | Using experimental_standaloneMiddleware (deprecated) | MEDIUM   | source | —            |

### validators (3 failure modes)

| #   | Mistake                                                    | Priority | Source       | Cross-skill? |
| --- | ---------------------------------------------------------- | -------- | ------------ | ------------ |
| 1   | Chaining non-object inputs                                 | MEDIUM   | docs         | —            |
| 2   | Output validation failure returns 500                      | MEDIUM   | docs         | —            |
| 3   | cursor: z.optional() without nullable for infinite queries | HIGH     | GitHub #6862 | —            |

### error-handling (3 failure modes)

| #   | Mistake                                   | Priority | Source | Cross-skill? |
| --- | ----------------------------------------- | -------- | ------ | ------------ |
| 1   | Throwing plain Error instead of TRPCError | HIGH     | docs   | —            |
| 2   | Expecting stack traces in production      | MEDIUM   | docs   | —            |
| 3   | Not handling Zod errors in errorFormatter | HIGH     | docs   | —            |

### server-side-calls (2 failure modes)

| #   | Mistake                                     | Priority | Source | Cross-skill? |
| --- | ------------------------------------------- | -------- | ------ | ------------ |
| 1   | Using createCaller inside another procedure | HIGH     | docs   | —            |
| 2   | Not providing context to createCaller       | MEDIUM   | docs   | —            |

### caching (2 failure modes)

| #   | Mistake                                   | Priority | Source       | Cross-skill? |
| --- | ----------------------------------------- | -------- | ------------ | ------------ |
| 1   | Caching authenticated responses           | CRITICAL | docs         | —            |
| 2   | Caching with Next.js App Router overrides | HIGH     | GitHub #5625 | —            |

### non-json-content-types (3 failure modes)

| #   | Mistake                                   | Priority | Source | Cross-skill? |
| --- | ----------------------------------------- | -------- | ------ | ------------ |
| 1   | Using httpBatchLink for FormData requests | HIGH     | docs   | —            |
| 2   | Global body parser intercepting FormData  | HIGH     | docs   | —            |
| 3   | FormData only works with mutations        | HIGH     | source | —            |

### client-setup (6 failure modes)

| #   | Mistake                                                  | Priority | Source       | Cross-skill? |
| --- | -------------------------------------------------------- | -------- | ------------ | ------------ |
| 1   | Missing AppRouter type parameter                         | CRITICAL | docs         | —            |
| 2   | Transformer on server but not on client links            | CRITICAL | GitHub #7083 | —            |
| 3   | Passing transformer to createTRPCClient instead of links | CRITICAL | source       | —            |
| 4   | HTML error page instead of JSON response                 | HIGH     | interview    | —            |
| 5   | Confusion about which client factory to use              | HIGH     | interview    | —            |
| 6   | Worrying about @trpc/server as client dependency         | MEDIUM   | interview    | —            |

### links (5 failure modes)

| #   | Mistake                                            | Priority | Source       | Cross-skill? |
| --- | -------------------------------------------------- | -------- | ------------ | ------------ |
| 1   | No terminating link in the chain                   | CRITICAL | source       | —            |
| 2   | Sending subscriptions through httpLink             | CRITICAL | source       | —            |
| 3   | Batch headers callback using wrong parameter       | HIGH     | source       | —            |
| 4   | httpBatchStreamLink data loss on stream completion | HIGH     | GitHub #7209 | —            |
| 5   | Default batch limits are Infinity                  | MEDIUM   | source       | —            |

### react-query-setup (3 failure modes)

| #   | Mistake                                     | Priority | Source | Cross-skill? |
| --- | ------------------------------------------- | -------- | ------ | ------------ |
| 1   | Using useQuery without queryOptions factory | HIGH     | docs   | —            |
| 2   | Missing TRPCProvider wrapper                | HIGH     | source | —            |
| 3   | Invalidating queries with wrong API         | HIGH     | docs   | —            |

### react-query-classic-migration (2 failure modes)

| #   | Mistake                                        | Priority | Source | Cross-skill? |
| --- | ---------------------------------------------- | -------- | ------ | ------------ |
| 1   | Assuming the codemod handles everything        | MEDIUM   | docs   | —            |
| 2   | Mixing classic and new hooks in same component | MEDIUM   | docs   | —            |

### superjson (3 failure modes)

| #   | Mistake                                      | Priority | Source       | Cross-skill? |
| --- | -------------------------------------------- | -------- | ------------ | ------------ |
| 1   | Transformer on server but not on client link | CRITICAL | GitHub #7083 | —            |
| 2   | Error responses bypass transformer           | HIGH     | GitHub #7083 | —            |
| 3   | Forgetting transformer on subscription links | HIGH     | docs         | —            |

### adapter-standalone (1 failure mode)

| #   | Mistake               | Priority | Source | Cross-skill? |
| --- | --------------------- | -------- | ------ | ------------ |
| 1   | No CORS configuration | HIGH     | docs   | —            |

### adapter-express (1 failure mode)

| #   | Mistake                                           | Priority | Source | Cross-skill? |
| --- | ------------------------------------------------- | -------- | ------ | ------------ |
| 1   | Global express.json() consuming tRPC request body | HIGH     | docs   | —            |

### adapter-fastify (3 failure modes)

| #   | Mistake                                   | Priority | Source | Cross-skill? |
| --- | ----------------------------------------- | -------- | ------ | ------------ |
| 1   | Registering WebSocket after tRPC plugin   | HIGH     | docs   | —            |
| 2   | Missing maxParamLength for batch requests | HIGH     | docs   | —            |
| 3   | Using Fastify v4 with tRPC v11            | CRITICAL | docs   | —            |

### adapter-aws-lambda (2 failure modes)

| #   | Mistake                                                | Priority | Source | Cross-skill? |
| --- | ------------------------------------------------------ | -------- | ------ | ------------ |
| 1   | httpBatchLink with per-procedure API Gateway resources | HIGH     | docs   | —            |
| 2   | Forgetting streamifyResponse wrapper                   | HIGH     | docs   | —            |

### adapter-fetch (1 failure mode)

| #   | Mistake                                         | Priority | Source | Cross-skill? |
| --- | ----------------------------------------------- | -------- | ------ | ------------ |
| 1   | Mismatched endpoint path in fetchRequestHandler | HIGH     | docs   | —            |

### subscriptions (7 failure modes)

| #   | Mistake                                           | Priority | Source         | Cross-skill? |
| --- | ------------------------------------------------- | -------- | -------------- | ------------ |
| 1   | Using Observable instead of async generator       | HIGH     | source         | —            |
| 2   | Empty string as tracked event ID                  | MEDIUM   | source         | —            |
| 3   | Fetching history before setting up event listener | HIGH     | docs           | —            |
| 4   | WebSocket subscription stale inputs on reconnect  | MEDIUM   | GitHub #4122   | —            |
| 5   | SSE ping interval >= client reconnect interval    | MEDIUM   | source         | —            |
| 6   | Sending custom headers with SSE without polyfill  | HIGH     | interview/docs | —            |
| 7   | Choosing WebSocket when SSE would suffice         | MEDIUM   | interview      | —            |

### nextjs-app-router (4 failure modes)

| #   | Mistake                                            | Priority | Source | Cross-skill? |
| --- | -------------------------------------------------- | -------- | ------ | ------------ |
| 1   | Not exporting both GET and POST from route handler | CRITICAL | docs   | —            |
| 2   | Suspense query failure crashes entire page         | HIGH     | docs   | —            |
| 3   | Creating singleton QueryClient for SSR             | CRITICAL | docs   | —            |
| 4   | Missing dehydrate/serialize config on QueryClient  | HIGH     | source | —            |

### nextjs-pages-router (2 failure modes)

| #   | Mistake                                            | Priority | Source | Cross-skill? |
| --- | -------------------------------------------------- | -------- | ------ | ------------ |
| 1   | SSR prepass renders multiple times                 | MEDIUM   | source | —            |
| 2   | Using ssr: true without understanding implications | MEDIUM   | docs   | —            |

### auth (5 failure modes)

| #   | Mistake                                      | Priority | Source       | Cross-skill? |
| --- | -------------------------------------------- | -------- | ------------ | ------------ |
| 1   | Not narrowing user type in auth middleware   | HIGH     | docs         | —            |
| 2   | SSE auth via URL query params exposes tokens | HIGH     | docs         | —            |
| 3   | Async headers causing stuck isFetching       | MEDIUM   | GitHub #7001 | —            |
| 4   | Skipping auth or opening CORS too wide       | HIGH     | interview    | —            |

### openapi (2 failure modes)

| #   | Mistake                                     | Priority | Source | Cross-skill? |
| --- | ------------------------------------------- | -------- | ------ | ------------ |
| 1   | Missing transformer config in HeyAPI client | HIGH     | docs   | —            |
| 2   | Expecting subscriptions in OpenAPI spec     | MEDIUM   | docs   | —            |

### service-oriented-architecture (1 failure mode)

| #   | Mistake                                 | Priority | Source   | Cross-skill? |
| --- | --------------------------------------- | -------- | -------- | ------------ |
| 1   | Path routing assumes server name prefix | MEDIUM   | examples | —            |

## Tensions

| Tension                                         | Skills                                   | Agent implication                                                                                                  |
| ----------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Type safety vs runtime flexibility              | server-setup ↔ middlewares              | Agent may compose routers from different initTRPC instances without compile-time errors, but they crash at runtime |
| Batching convenience vs caching safety          | links ↔ caching                         | Agent adding cache headers may not realize batched responses mix public and private data                           |
| SSR simplicity vs server component architecture | nextjs-app-router ↔ nextjs-pages-router | Agent may apply Pages Router SSR patterns in App Router or vice versa                                              |
| Streaming performance vs reliability            | links ↔ subscriptions                   | Agent may default to httpBatchStreamLink without considering platform streaming support                            |

## Cross-References

| From                          | To                  | Reason                                                                          |
| ----------------------------- | ------------------- | ------------------------------------------------------------------------------- |
| server-setup                  | client-setup        | Transformer/errorFormatter config must match; AppRouter type consumed by client |
| server-setup                  | middlewares         | Base procedures compose middleware during setup                                 |
| client-setup                  | links               | Client creation requires configuring a link chain                               |
| client-setup                  | superjson           | Transformer must be on every terminating link                                   |
| links                         | subscriptions       | Subscriptions require specific link type via splitLink                          |
| auth                          | middlewares         | Auth implemented as middleware narrowing context                                |
| auth                          | subscriptions       | SSE/WS auth uses different mechanisms than HTTP                                 |
| validators                    | error-handling      | Validation failures produce BAD_REQUEST; errorFormatter exposes Zod details     |
| react-query-setup             | nextjs-app-router   | App Router uses @trpc/tanstack-react-query with RSC prefetching                 |
| react-query-classic-migration | react-query-setup   | Migration target is the new package                                             |
| openapi                       | superjson           | OpenAPI clients need matching transformer config                                |
| non-json-content-types        | links               | Non-JSON inputs require splitLink routing to httpLink                           |
| caching                       | auth                | Cached responses must not include authenticated data                            |
| nextjs-app-router             | nextjs-pages-router | Both routers may coexist during migration                                       |

## Subsystems & Reference Candidates

| Skill | Subsystems                                                                 | Reference candidates                                       |
| ----- | -------------------------------------------------------------------------- | ---------------------------------------------------------- |
| links | httpLink, httpBatchLink, httpBatchStreamLink, wsLink, httpSubscriptionLink | Link options reference (>10 link types with unique config) |

## Remaining Gaps

| Skill                         | Question                                                               | Status |
| ----------------------------- | ---------------------------------------------------------------------- | ------ |
| subscriptions                 | Recommended patterns for scaling WebSocket connections in production?  | open   |
| nextjs-app-router             | Recommended caching strategy given App Router overrides Cache-Control? | open   |
| openapi                       | Transformer configs for OpenAPI beyond superjson (EJSON, Ion)?         | open   |
| service-oriented-architecture | Patterns for service discovery, health checks, circuit breaking?       | open   |

## Recommended Skill File Structure

- **Core skills:** server-setup, middlewares, validators, error-handling, server-side-calls, caching, non-json-content-types, client-setup, links, subscriptions
- **Framework skills:** react-query-setup, nextjs-app-router, nextjs-pages-router
- **Lifecycle skills:** react-query-classic-migration
- **Composition skills:** auth, superjson, openapi, service-oriented-architecture
- **Adapter skills:** adapter-standalone, adapter-express, adapter-fastify, adapter-aws-lambda, adapter-fetch
- **Reference files:** links (needs references/ for each link type's config surface)

## Composition Opportunities

| Library               | Integration points      | Composition skill needed?                                  |
| --------------------- | ----------------------- | ---------------------------------------------------------- |
| Zod                   | Input/output validation | No — covered in validators skill                           |
| SuperJSON             | Data transformer        | Yes — superjson                                            |
| @tanstack/react-query | React data fetching     | Yes — react-query-setup                                    |
| Next.js               | Full-stack framework    | Yes — nextjs-app-router, nextjs-pages-router               |
| Express               | HTTP server             | Yes — adapter-express                                      |
| Fastify               | HTTP server             | Yes — adapter-fastify                                      |
| @hey-api/openapi-ts   | Client generation       | Yes — openapi                                              |
| OAuth2.0 / JWT        | Authentication          | Yes — auth                                                 |
| Prisma / Drizzle      | Database ORM            | No — standard usage, no tRPC-specific integration patterns |
