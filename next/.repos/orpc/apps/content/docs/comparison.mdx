---
title: Comparison
description: "See how oRPC compares to tRPC and Hono across type safety, OpenAPI support, framework integrations, and runtime performance."
sidebar:
  icon: scale
---

oRPC, [tRPC](https://trpc.io/), and [Hono](https://hono.dev/) all deliver end-to-end typesafe APIs in TypeScript, but they take different approaches. tRPC focuses on RPC for full-stack TypeScript apps, Hono is a general-purpose web framework with an RPC feature, and oRPC combines typesafe RPC with first-class OpenAPI support.

## Features

- ✅ First-class, built-in support
- 🟡 Lacks features or requires third-party integrations
- 🛑 Not supported or not documented

### Type Safety

| Feature | oRPC | tRPC | Hono |
| --- | --- | --- | --- |
| End-to-end typesafe input/output | ✅ | ✅ | ✅ |
| [End-to-end typesafe errors](/docs/client/error-handling) | ✅ | 🟡 | ✅ |
| [End-to-end typesafe File/Blob](/docs/binary-data) | ✅ | 🟡 | 🟡 |
| [End-to-end typesafe Server-Sent Events](/docs/async-iterator-object) | ✅ | ✅ | 🛑 |
| [End-to-end typesafe `ReadableStream<Uint8Array>`](/docs/binary-data#readablestreamuint8array) | ✅ | 🛑 | 🛑 |
| [Typesafe at scale](#type-checking-performance) | ✅ | ✅ | 🛑 |

oRPC types errors per procedure or globally: throw a plain `ORPCError`, [declare errors](/docs/error-handling) on a single procedure or a shared builder, or define them once and reuse them everywhere via an [error factory](/docs/error-handling#error-factory). tRPC exposes one global error shape, and Hono only types errors returned with an explicit status code. oRPC is also the only one that types binary data in both directions: tRPC and Hono cover uploads but not typed binary responses.

### API Design & OpenAPI

| Feature | oRPC | tRPC | Hono |
| --- | --- | --- | --- |
| Implementation-first approach | ✅ | ✅ | ✅ |
| [Contract-first approach](/docs/contract-first) | ✅ | 🛑 | ✅ |
| [OpenAPI spec generation](/docs/openapi/specification) | ✅ | 🟡 | ✅ |
| [Standard Schema (Zod, Valibot, ArkType, ...)](/docs/integrations/standard-schema) | ✅ | ✅ | 🟡 |
| [Native types (Date, URL, Set, Map, ...)](/docs/rpc/serializer#supported-data-types) | ✅ | 🟡 | 🛑 |
| [Custom serializers](/docs/rpc/serializer#custom-serializers) | ✅ | ✅ | 🛑 |
| [Bracket notation](/docs/openapi/bracket-notation) | ✅ | 🛑 | 🛑 |
| [Lazy router (code splitting, faster cold starts)](/docs/router#lazy-router) | ✅ | ✅ | 🛑 |

oRPC serves the same procedures over its [RPC protocol](/docs/rpc/protocol) and RESTful [OpenAPI endpoints](/docs/openapi/handler) and generates the OpenAPI spec natively, while tRPC and Hono depend on extra packages for OpenAPI. Native types like `Date` or `Map` work out of the box in oRPC; tRPC needs a transformer, and Hono has no serialization layer: what you pass to `c.json()` is what you get.

### Integrations & Ecosystem

| Feature | oRPC | tRPC | Hono |
| --- | --- | --- | --- |
| [WebSockets](/docs/adapters/websocket) | ✅ | ✅ | 🟡 |
| [Hibernation APIs (Cloudflare WebSocket Hibernation, ...)](/docs/integrations/hibernation) | ✅ | 🛑 | 🛑 |
| [Message Port (Electron, browser extensions, workers, ...)](/docs/adapters/message-port) | ✅ | 🟡 | 🛑 |
| [Batch requests](/docs/plugins/batch) | ✅ | ✅ | 🛑 |
| [Pub/Sub publisher (Redis, Upstash, Durable Objects, ...)](/docs/helpers/publisher) | ✅ | 🟡 | 🛑 |
| [Rate limiting (Redis, Upstash, Cloudflare, ...)](/docs/helpers/ratelimit) | ✅ | 🛑 | 🟡 |
| [Locking (Redis, Upstash, Durable Objects, ...)](/docs/helpers/lock) | ✅ | 🛑 | 🛑 |
| [Client plugins and interceptors](/docs/rpc/link) | ✅ | ✅ | 🛑 |
| [TanStack Query integration (React)](/docs/integrations/tanstack-query) | ✅ | ✅ | 🟡 |
| [TanStack Query integration (Vue, Solid, Svelte, Angular)](/docs/integrations/tanstack-query) | ✅ | 🟡 | 🛑 |
| [SWR and Pinia Colada integrations](/docs/integrations/swr) | ✅ | 🟡 | 🟡 |
| [AI SDK integration](/docs/integrations/ai-sdk) | ✅ | 🛑 | 🛑 |
| [Next.js Server Actions support](/docs/integrations/next) | ✅ | ✅ | 🛑 |
| [Built-in plugins (CORS, CSRF, Retry, ...)](/docs/plugins/cors) | ✅ | 🛑 | ✅ |
| [Built-in helpers (cookie, encryption, signing, ...)](/docs/helpers/cookie) | ✅ | 🛑 | ✅ |
| [NestJS integration](/docs/integrations/nest) | ✅ | 🟡 | 🛑 |
| [OpenTelemetry integration](/docs/integrations/opentelemetry) | ✅ | 🛑 | 🟡 |
| [Cloudflare Workers Traces integration](/docs/integrations/cloudflare-traces) | ✅ | 🛑 | 🛑 |

Every oRPC integration above is first-party, while tRPC leaves several to community packages and Hono's typed client is a bare fetch wrapper you wire into query libraries yourself.

:::info
Coming from tRPC? Follow the [migration guide](/docs/migrations/from-trpc), or [use both together](/docs/integrations/trpc) during a gradual migration.
:::

## Performance

:::warning
Treat these numbers as reference measurements, not a reason to switch frameworks. All three are fast enough for production. The per-request difference is tiny next to your business logic, database, and network, and results vary across environments and workloads.
:::

All numbers come from [middleapi/orpc-benchmarks](https://github.com/middleapi/orpc-benchmarks) and were measured on the same machine with oRPC 2.0.0-beta.37, tRPC 11.19.0, and Hono 4.13.8. Handlers are no-ops with pass-through validation, so the results measure framework overhead only.

### Throughput

| Scenario | oRPC | tRPC | Hono |
| --- | --- | --- | --- |
| RPC over HTTP (req/s avg) | 20,279 | 4,821 | n/a |
| RPC over WebSocket (req/s avg) | 22,979 | 5,228 | n/a |
| OpenAPI (RESTful) over HTTP (req/s avg) | 19,799 | n/a | 18,694 |

oRPC handles about 4.2x as many requests as tRPC over HTTP and 4.4x over WebSocket. oRPC and Hono are close on RESTful throughput, with oRPC about 6% ahead.

### Clinic Doctor Profiles

Every run also profiles the server with [Clinic.js Doctor](https://clinicjs.org/doctor/):

| Run | CPU (avg) | Memory (RSS) | Detected issues | Full report |
| --- | --- | --- | --- | --- |
| RPC over HTTP · oRPC | ~104% | 71-87 MB | none | [view](https://htmlpreview.github.io/?https://github.com/middleapi/orpc-benchmarks/blob/main/benchmarks/rpc-orpc/.clinic/report.clinic-doctor.html) |
| RPC over HTTP · tRPC | ~113% | 75-248 MB | none | [view](https://htmlpreview.github.io/?https://github.com/middleapi/orpc-benchmarks/blob/main/benchmarks/rpc-trpc/.clinic/report.clinic-doctor.html) |
| RPC over WebSocket · oRPC | ~104% | 72-107 MB | none | [view](https://htmlpreview.github.io/?https://github.com/middleapi/orpc-benchmarks/blob/main/benchmarks/ws-orpc/.clinic/report.clinic-doctor.html) |
| RPC over WebSocket · tRPC | ~40% | 68-77 MB | cpu: performance | [view](https://htmlpreview.github.io/?https://github.com/middleapi/orpc-benchmarks/blob/main/benchmarks/ws-trpc/.clinic/report.clinic-doctor.html) |
| OpenAPI over HTTP · oRPC | ~104% | 72-90 MB | none | [view](https://htmlpreview.github.io/?https://github.com/middleapi/orpc-benchmarks/blob/main/benchmarks/openapi-orpc/.clinic/report.clinic-doctor.html) |
| OpenAPI over HTTP · Hono | ~103% | 77-95 MB | none | [view](https://htmlpreview.github.io/?https://github.com/middleapi/orpc-benchmarks/blob/main/benchmarks/openapi-hono/.clinic/report.clinic-doctor.html) |

The profiles show where the throughput gap comes from. Over HTTP, oRPC serves over 4x tRPC's requests at similar CPU usage (~104% vs ~113%), so its per-request CPU cost is several times lower, and its event loop stays responsive: 0.04 ms average delay versus tRPC's 0.77 ms. Memory stays flat between 71 and 107 MB in every oRPC run, while tRPC's HTTP run climbs to 248 MB, more than double oRPC's highest reading, a sign of per-request allocation pressure. oRPC and Hono profile nearly identically, in line with their close throughput.

tRPC's low WebSocket CPU is not an advantage: the `cpu: performance` issue means the server cannot keep the CPU busy, so throughput is capped elsewhere in the stack.

### Type-Checking Performance

On a large, fully typed project with 3,000 procedures across 1,501 routers, oRPC type-checks about 30% faster than tRPC, uses about 31% less memory, and needs about 19% fewer type instantiations:

| Metric | oRPC | tRPC |
| --- | --- | --- |
| Total time | 1.62s | 2.32s |
| Memory used | 469 MB | 677 MB |
| Instantiations | 2,198,304 | 2,719,560 |

Hono has no column because it does not scale to this size. Its RPC types hit [known limits](https://hono.dev/docs/guides/rpc#known-issues) well before this point and the project becomes effectively unusable, an issue oRPC avoids by design.

### Bundle Size

Bundle sizes for a minimal client and server pair, measured with the same versions. tRPC includes `superjson` to match oRPC's built-in native types, and Hono includes `@hono/node-server` to match the Node.js servers in the other bundles.

| Metric | oRPC | tRPC | Hono |
| --- | --- | --- | --- |
| Minified | 46.3 kB | 73.7 kB | 44.9 kB |
| Minified + gzip | 14.5 kB | 23.7 kB | 17.0 kB |

Measure yourself: [oRPC](https://bundlejs.com/?q=%40orpc%2Fclient%402.0.0-beta.37%2C%40orpc%2Fclient%402.0.0-beta.37%2Ffetch%2C%40orpc%2Fserver%402.0.0-beta.37%2C%40orpc%2Fserver%402.0.0-beta.37%2Fnode&treeshake=%5B%7B+createORPCClient+%7D%5D%2C%5B%7B+RPCLink+%7D%5D%2C%5B%7B+os+%7D%5D%2C%5B%7B+RPCHandler+%7D%5D) · [tRPC](https://bundlejs.com/?q=%40trpc%2Fclient%4011.19.0%2C%40trpc%2Fserver%4011.19.0%2C%40trpc%2Fserver%4011.19.0%2Fadapters%2Fstandalone%2Csuperjson%402.2.6&treeshake=%5B%7B+createTRPCClient%2ChttpLink%2ChttpSubscriptionLink%2CsplitLink+%7D%5D%2C%5B%7B+initTRPC+%7D%5D%2C%5B%7B+createHTTPServer+%7D%5D%2C%5B%7B+default+as+SuperJSON+%7D%5D) · [Hono](https://bundlejs.com/?q=hono%404.13.8%2Chono%404.13.8%2Fclient%2C%40hono%2Fnode-server%402.1.1&treeshake=%5B%7B+Hono+%7D%5D%2C%5B%7B+hc+%7D%5D%2C%5B%7B+serve+%7D%5D)
