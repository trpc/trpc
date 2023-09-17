---
id: httpBatchStreamLink
title: HTTP Batch Stream Link
sidebar_label: HTTP Batch Stream Link
slug: /client/links/httpBatchStreamLink
---

`unstable_httpBatchStreamLink` is a [**terminating link**](./overview.md#the-terminating-link) that batches an array of individual tRPC operations into a single HTTP request that's sent to a single tRPC procedure (equivalent to [`httpBatchLink`](./httpBatchLink.md)), but doesn't wait for all the responses of the batch to be ready and streams the responses as soon as any data is available.

:::info
We have prefixed this as `unstable_` as it's a new API, but you're safe to use it! [Read more](/docs/faq#unstable).
:::

## Usage

> All usage and options are identical to [`httpBatchLink`](./httpBatchLink.md).

:::note
If you require the ability to change/set response headers (which includes cookies) from within your procedures, make sure to use `httpBatchLink` instead! This is due to the fact that `unstable_httpBatchStreamLink` does not support setting headers once the stream has begun. [Read more](https://trpc.io/docs/client/links/httpBatchLink).
:::

You can import and add the `httpBatchStreamLink` to the `links` array as such:

```ts title="client/index.ts"
import { createTRPCProxyClient, httpBatchStreamLink } from '@trpc/client';
import type { AppRouter } from '../server';

const client = createTRPCProxyClient<AppRouter>({
  links: [
    httpBatchStreamLink({
      url: 'http://localhost:3000',
    }),
  ],
});
```

After that, you can make use of batching by setting all your procedures in a `Promise.all`. The code below will produce exactly **one** HTTP request and on the server exactly **one** database query:

```ts
const somePosts = await Promise.all([
  trpc.post.byId.query(1),
  trpc.post.byId.query(2),
  trpc.post.byId.query(3),
]);
```

## Streaming mode

> ⚠️ This link is unstable and may change in the future.

When batching requests together, the behavior of a regular `httpBatchLink` is to wait for all requests to finish before sending the response. If you want to send responses as soon as they are ready, you can use `httpBatchStreamLink` instead. This is useful for long-running requests.

```ts title="client/index.ts"
import {
  createTRPCProxyClient,
  unstable_httpBatchStreamLink,
} from '@trpc/client';
import type { AppRouter } from '../server';

const client = createTRPCProxyClient<AppRouter>({
  links: [
    unstable_httpBatchStreamLink({
      url: 'http://localhost:3000',
    }),
  ],
});
```

Compared to a regular `httpBatchLink`, a `unstable_httpBatchStreamLink` will:

- Cause the requests to be sent with a `Trpc-Batch-Mode: stream` header
- Cause the response to be sent with a `Transfer-Encoding: chunked` and `Vary: trpc-batch-mode` headers
- Remove the `data` key from the argument object passed to `responseMeta` (because with a streamed response, the headers are sent before the data is available)

## Compatibility (client-side)

### Browsers

Browser support should be identical to [`fetch`](https://caniuse.com/fetch) support.

### Node.js / Deno

For runtimes other than the browser ones, the `fetch` implementation should support streaming, meaning that the response obtained by `await fetch(...)` should have a `body` property of type `ReadableStream<Uint8Array> | NodeJS.ReadableStream`, meaning that:

- either `response.body.getReader` is a function that returns a `ReadableStreamDefaultReader<Uint8Array>` object
- or `response.body` is a `Uint8Array` `Buffer`

This includes support for `undici`, `node-fetch`, native Node.js fetch implementation, and WebAPI fetch implementation (browsers).

### React Native

Receiving the stream relies on the `TextDecoder` API, which is not available in React Native. If you still want to enable streaming, you can use a polyfill and pass it to the `httpBatchStreamLink` options:

```ts
unstable_httpBatchStreamLink({
  url: 'http://localhost:3000',
  textDecoder: new TextDecoder(),
  // ^? textDecoder: { decode: (input: Uint8Array) => string }
});
```

## Compatibility (server-side)

> ⚠️ for **aws lambda**, `unstable_httpBatchStreamLink` is not supported (will simply behave like a regular `httpBatchLink`). It should not break anything if enabled, but will not have any effect.

> ⚠️ for **cloudflare workers**, you need to enable the `ReadableStream` API through a feature flag: [`streams_enable_constructors`](https://developers.cloudflare.com/workers/platform/compatibility-dates#streams-constructors)

## Reference

You can check out the source code for this link on [GitHub.](https://github.com/trpc/trpc/blob/main/packages/client/src/links/httpBatchStreamLink.ts)
