---
id: httpBatchStreamLink
title: HTTP Batch Stream Link
sidebar_label: HTTP Batch Stream Link
slug: /links/httpBatchStreamLink
---

`unstable_httpBatchStreamLink` (unstable) is a [**terminating link**](./index.md#the-terminating-link) that batches an array of individual tRPC operations into a single HTTP request that's sent to a single tRPC procedure (equivalent to [`httpBatchLink`](./httpBatchLink.md)), but doesn't wait for all the responses of the batch to be ready and streams the responses as soon as any data is available.

## Usage

All usage and options are identical to [`httpBatchLink`](./httpBatchLink.md).

## Streaming mode (unstable)

> ⚠️ This link is unstable and may change in the future.

When batching requests together, the behavior of a regular `httpBatchLink` is to wait for all requests to finish before sending the response. If you want to send responses as soon as they are ready, you can use this link. This is useful for long-running requests.

```ts title="client/index.ts"
import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';
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

If you are overriding the `fetch` implementation in the `unstable_httpBatchStreamLink` parameters, you should make sure that it supports streaming: the `response.body` returned by the `fetch` implementation should be of type `ReadableStream<Uint8Array> | NodeJS.ReadableStream`, meaning that:

- either `response.body.getReader()` is a function that returns a `ReadableStreamDefaultReader<Uint8Array>` object
- or `response.body` is a `Uint8Array` `Buffer`

> ⚠️ for **aws lambda**, `unstable_httpBatchStreamLink` is not supported (will simply behave like a regular `httpBatchLink`). It should not break anything if enabled, but will not have any effect.

> ⚠️ for **cloudflare workers**, you need to enable the `ReadableStream` API through a feature flag: [`streams_enable_constructors`](https://developers.cloudflare.com/workers/platform/compatibility-dates#streams-constructors)

## Reference

You can check out the source code for this link on [GitHub.](https://github.com/trpc/trpc/blob/main/packages/client/src/links/httpBatchStreamLink.ts)
