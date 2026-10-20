---
title: '`httpLink`'
description: Queries as GET, mutations as POST and subscriptions as SSE, with batching, streamed outputs and files.
section: Client
parent: client/links
order: 1
v11: client/links/httpLink
---

`httpLink` sends queries as `GET`, mutations as `POST` and subscriptions as server-sent events, to a handler's URL:

```ts twoslash
// ---cut-start---
import type { AppRouter } from './server.ts';
// ---cut-end---
import { createTrpcClient, httpLink, routerType } from '@trpc12/trpc/client';

const client = createTrpcClient({
  router: routerType<AppRouter>(),
  links: [httpLink({ url: 'http://localhost:3000/trpc', batch: true })],
});
```

- `url`: the handler's endpoint.
- `batch`: send the queries made in the same tick as one request, and the mutations as another (below).
- `headers`: headers for every request, or a function of the calls a request carries. A call's `headers` option is merged in.
- `init`: `fetch` options (below).
- `fetch`: a `fetch` of your own.
- `serializer`: must match the handler's, and client types follow it ([Serializers](../../server/serializers.md)).
- `maxUrlLength` and `longQuery`: when a query goes with a body (below).
- `binary`: streamed outputs as binary frames (below).
- `subscriptions: false`: no SSE, so procedures lose `.subscribe()`, for a link that only carries queries and mutations.
- `reconnect`: how a dropped subscription reconnects, `{ attempts: 5, delay }` by default. `delay(attempt)` returns the wait before each attempt.

## Batching

With `batch: true`, the queries made in the same tick go as one request, and so do the mutations, up to `maxItems` calls a request (`batch: { maxItems }`, 10 by default). The handler has to accept batches too, with `createFetchHandler({ batch: true })`. A call opts out with `{ batch: false }`, and calls with different `init`s are batched apart.

The response has a line per call, with its own status, so each call settles when its line arrives and one call's error doesn't fail the others.

## Request options

`init` sets `fetch` options. The link's `init` is a default, or a function called once per HTTP request with the calls it carries; a call's `init` is merged onto it (shallowly, but `headers` and `next` key by key). `next` passes Next's data-cache options through:

```ts twoslash
// ---cut-start---
import { httpLink } from '@trpc12/trpc/client';
import { client } from './client.ts';
declare const url: string;
declare const input: undefined;
declare function forwardCookies(): HeadersInit;
// ---cut-end---
httpLink({
  url,
  init: () => ({ cache: 'no-store', headers: forwardCookies() }),
});
await client.post.list.query(input, {
  init: { next: { revalidate: 60, tags: ['posts'] } },
});
```

Each call's response reaches an `onResponse` call option (`{ status, headers }`) before its value goes up the chain. A batched call gets its own line's status and the batch's headers ([Custom links](../custom-links.md#reading-the-response)).

## Query URLs

Query inputs go in the URL as `?input=<JSON>`: `?input={"post":{"id":"1"}}`, URL-encoded. Object keys are sorted (array order is kept), so equal inputs make the same URL and hit the same HTTP cache entry. A [serializer](../../server/serializers.md) that makes refs adds `&refs=`.

A query whose URL would be longer than `maxUrlLength` (2048) is sent with a body. That is `POST` by default; `longQuery: 'query'` uses the HTTP `QUERY` method, a safe method with a body that caches can key on. Every proxy on the way has to allow `QUERY`.

## Streamed outputs and files

Outputs with nested promises, async iterables or files stream as JSONL ([Streaming](../../server/streaming.md)). With `binary: true` they stream as [binary frames](../../server/files.md#binary-frames) instead, which carry file bytes unencoded; a server that doesn't know frames answers with JSONL. An unbatched call whose output is a `File` or `Blob` gets it as the raw response body.

Inputs holding a `File` or `Blob` go alone as `multipart/form-data` ([Files](../../server/files.md)).

## Subscriptions

A subscription is an SSE request. When the connection drops, the link reconnects up to `reconnect.attempts` times and sends the last [`tracked()`](../../subscriptions/overview.md#resuming) event id, so the stream resumes where it stopped. A call made with `{ reconnect: false }` ends with `NETWORK_ERROR` instead.

## Errors

`httpLink` declares the three [link codes](../errors.md#errors-from-the-links), so a call through it can fail with them, and its `matchError()` needs their handlers (`STREAM_INTERRUPTED` only for a call that streams):

- `NETWORK_ERROR`: `fetch` rejected, or a subscription lost its connection and ran out of reconnects.
- `BAD_RESPONSE`: the response isn't a tRPC one and its status names no code (an HTML page or an empty body sent with `200`), or it doesn't decode. A proxy's `401` or `502` page is an `UNAUTHORIZED` or `BAD_GATEWAY`.
- `STREAM_INTERRUPTED`: a [streamed output](#streamed-outputs-and-files) or a subscription stopped before its end, after the call resolved. A response cut before its result is a `NETWORK_ERROR`, so a call whose output doesn't stream never gets it, and its `matchError()` has no key for it.

A client over `localLink` has none of them ([Errors from the links](../errors.md#errors-from-the-links) shows both).
