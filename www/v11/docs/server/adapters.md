---
id: adapters
title: Overview
sidebar_label: "Adapters"
slug: /server/adapters
section: "Backend Usage"
order: 12
---

tRPC is not a server on its own, and must therefore be served using other hosts, such as a simple [Node.js HTTP Server](./adapters/standalone.md), [Express](./adapters/express.md), or even [Next.js](./adapters/nextjs.md). Most tRPC features are the same no matter which backend you choose. **Adapters** act as the glue between the host system and your tRPC API.

Adapters typically follow some common conventions, allowing you to set up context creation via `createContext`, and globally handle errors via `onError`, but importantly allow you to choose an appropriate host for your application.

We support many modes of hosting an API, which you will find documented here.

- For serverful APIs, you might want our [Standalone](./adapters/standalone.md) adapter, or use the [Express](./adapters/express.md) or [Fastify](./adapters/fastify.md) adapters to hook into your existing APIs
- You might want a serverless solution and choose [AWS Lambda](./adapters/aws-lambda.md), or [Fetch](./adapters/fetch.md) for edge runtimes
- You might have a full-stack framework and want a full integration like [Next.js](./adapters/nextjs.md), or you could use the [Fetch](./adapters/fetch.md) adapter with Next.js, Astro, Remix, or SolidStart

:::tip
For local development or serverful infrastructure, the simplest Adapter to use is the [Standalone Adapter](./adapters/standalone.md), which can be used to run a standard Node.js HTTP Server. We recommend this when you need to get started quickly and have no existing HTTP Server to integrate with. Swapping out later is trivial if your needs change.
:::

## Common options

Every HTTP adapter accepts these options, next to its own (like `endpoint` for Fetch, or `basePath` for Standalone):

| Option                | Description                                                                                                                                         |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `router`              | Your app router. Required.                                                                                                                          |
| `createContext`       | Creates the [context](./context.md) for each request. It receives the adapter's own objects (e.g. `req` and `res`) plus `info`.                     |
| `onError`             | Called with `{ error, type, path, input, ctx, req }` for every error, e.g. to report it. See [Error handling](./error-handling.md#handling-errors). |
| `responseMeta`        | Returns `{ status, headers }` for the response, e.g. for [caching](./caching.md).                                                                   |
| `allowBatching`       | Set to `false` to reject batch requests. Defaults to `true`.                                                                                        |
| `maxBatchSize`        | Rejects batch requests with more calls than this with a `400 Bad Request`. Set `maxItems` on your batch link to the same or a lower value.          |
| `allowMethodOverride` | Accepts queries sent as `POST`, for clients that set `methodOverride: 'POST'` on their link. Defaults to `false`.                                   |

The Node.js adapters (Standalone, Express and Next.js) also accept:

- `maxBodySize`: the largest request body in bytes; larger ones are rejected with `413 PAYLOAD_TOO_LARGE`. There's no limit by default; see [Request body size](#request-body-size).
- `middleware`: a connect-style `(req, res, next)` function that runs before tRPC, e.g. [`cors()`](./adapters/standalone.md#handling-cors--options).

```ts twoslash title="server.ts"
// @filename: router.ts
import { initTRPC } from '@trpc/server';
const t = initTRPC.create();
export const appRouter = t.router({});

// @filename: server.ts
// ---cut---
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import { appRouter } from './router';

createHTTPServer({
  router: appRouter,
  createContext: () => ({}),
  onError({ error, path }) {
    console.error(`tRPC error on '${path}':`, error);
  },
  maxBatchSize: 10,
  maxBodySize: 1024 * 1024, // 1 MiB
}).listen(3000);
```

### Request body size

The Node.js adapters read the request body into memory, and `maxBodySize` is unset by default, so they accept bodies of any size. On a server that's reachable from the internet, set `maxBodySize` so a single large request can't exhaust the process's memory. A body over the limit is rejected with `413 PAYLOAD_TOO_LARGE` as soon as it passes the limit, before it's parsed.

We recommend `1024 * 1024` (1 MiB) for typical JSON inputs, as in the example above. If you accept files or other large inputs, set it a little above the largest one you expect, and keep it under about `10 * 1024 * 1024` (10 MiB).

`maxBodySize` only applies to bodies tRPC reads itself. If a body parser such as `express.json()` or the Next.js API routes body parser has already set `req.body`, limit the size in that parser instead. A limit in your reverse proxy (like nginx's `client_max_body_size`) adds another layer.
