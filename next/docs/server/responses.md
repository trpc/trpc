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

In a batch, headers merge (`set-cookie` appends) and each call keeps its own status.

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

Only an unbatched HTTP call can carry one: in a batch, over WebSockets or in-process, the call fails with `BAD_REQUEST`. With `httpLink({ batch: true })`, the client's types require `{ batch: false }` on calls to procedures that may return a response, and the link sends them alone: `client.report.query(undefined, { batch: false })`.

## Reading the response on the client

`httpLink` hands each call's response to an `onResponse` call option (`{ status, headers }`). A batched call gets its own line's status and the batch's headers ([Custom links](../client/custom-links.md#reading-the-response)).
