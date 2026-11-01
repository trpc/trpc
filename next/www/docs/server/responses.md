---
title: Responses
description: Set headers and status from a resolver, or return a response of your own.
section: Server
order: 8
---

`response` sets the call's headers and status; Effect code uses the `Response` service over the same handle:

```ts twoslash
// ---cut-start---
import { db, t } from './server.ts';
// ---cut-end---
import { Response } from '@trpc12/trpc/server';
import { Effect } from 'effect';

const login = t.procedure.mutation((opts) => {
  opts.response.headers.append('set-cookie', 'session=…; HttpOnly');
  opts.response.status = 201;
});

const list = t.procedure.query(() =>
  Effect.gen(function* () {
    yield* Response.setHeader('cache-control', 'max-age=60');
    return db.post.list();
  }),
);
```

In a batch, headers merge (`set-cookie` appends) and each call keeps its own status. `cache-control` is the strictest policy every call allows: `no-store` or `no-cache` from any call wins, `private` beats `public`, and lifetimes take the shortest, so `max-age=60` and `public, max-age=10` send `max-age=10`. A batch with a call that sets none, an error included, isn't cached. Streamed responses (JSONL, SSE) send `no-cache` unless the call sets its own.

## Returning a response

A procedure can also return its own response, an `HttpServerResponse` from `effect/http` or a web `Response`, for redirects, proxied upstreams or downloads. It's sent as is, with the handle's headers added, and the client's output is the web `Response`:

```ts twoslash
// ---cut-start---
import { createTrpcClient, httpLink, routerType } from '@trpc12/trpc/client';
import { HttpServerResponse } from 'effect/http';
import { t } from './server.ts';
declare const rows: string[][];
declare function toCsv(rows: string[][]): string;
const client = createTrpcClient({
  router: routerType<{ report: typeof report }>(),
  links: [httpLink({ url: 'http://localhost:3000/trpc' })],
});
// ---cut-end---
const report = t.procedure.query(() =>
  HttpServerResponse.text(toCsv(rows), { contentType: 'text/csv' }),
);
const res = await client.report.query(); // Response
```

An unbatched HTTP call or an in-process call can carry one; in a batch or over WebSockets, the call fails with `BAD_REQUEST`. In-process callers (`createRouterClient`, `localLink` and `t.call()`) get the web `Response` an HTTP client would: its status, its headers over the handle's, and its body as a stream, never serialized. `t.call()`'s type says `Response` too, for an `HttpServerResponse`. With `httpLink({ batch: true })`, the client's types require `{ batch: false }` on calls to procedures that may return a response, and the link sends them alone: `client.report.query(undefined, { batch: false })`. A `batch` that may be on, such as a `boolean` variable, counts as on.

## Reading the response on the client

`httpLink` hands each call's response to an `onResponse` call option (`{ status, headers }`). A batched call gets its own line's status and the batch's headers ([Custom links](../client/custom-links.md#reading-the-response)).
