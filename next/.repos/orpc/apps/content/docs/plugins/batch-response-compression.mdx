---
title: "Batch Response Compression Plugin"
description: "Compress batch responses when you know their contents compress, flushing each one as it is ready so a streaming batch stays streaming."
sidebar:
  label: "Batch Response Compression"
---

## Installation

```package-install
npm install @orpc/node@beta
```

## Setup

A [batch](/docs/plugins/batch) frames several subresponses together, each with its own content type, so the envelope has no single content type to judge. A batch of JSON compresses about tenfold; one carrying images or other already-compressed files does not compress at all, and nothing in the envelope says which you have. The [Response Compression Plugin](/docs/plugins/response-compression) therefore leaves framed batches alone rather than guess.

Use `BatchResponseCompressionHandlerPlugin` to compress them anyway. Registering it is how you state that your batches are compressible, which is usually the case when they carry JSON. It covers every successful batch response, whatever shape it takes.

```ts
import { BatchResponseCompressionHandlerPlugin } from '@orpc/node'
import { RPCHandler } from '@orpc/server/node'
import { BatchHandlerPlugin } from '@orpc/server/plugins'

const handler = new RPCHandler(router, {
  plugins: [
    new BatchHandlerPlugin(),
    new BatchResponseCompressionHandlerPlugin({
      /**
       * The compression schemes to use for batch responses.
       * Schemes are prioritized by their order in this array and
       * only applied if the client supports them.
       * Supported values: 'gzip' | 'deflate' | 'deflate-raw'
       *
       * @default ['gzip', 'deflate']
       */
      encodings: ['gzip', 'deflate'],

      /**
       * The minimum response size in bytes required to trigger compression.
       * Responses smaller than this threshold will not be compressed to
       * avoid overhead. A streaming batch response has no size until it
       * ends, so it is always compressed.
       *
       * @default 1024 (1KB)
       */
      threshold: 1024,
    }),
  ],
})
```

:::warning
The whole envelope is compressed, binary subresponses included. Leave this plugin off when your batches mostly carry images, video, or other already-compressed content: compressing it spends CPU for nothing and can make the response marginally larger.
:::

## Why a Node.js Plugin

A streaming batch sends each response as soon as its procedure resolves. A compressor that cannot flush would hold every early response in its buffer until the slowest one finished, trading streaming for compression. The web [CompressionStream](https://developer.mozilla.org/en-US/docs/Web/API/CompressionStream) has no flush, so this plugin uses [zlib](https://nodejs.org/api/zlib.html) and ends each write with a sync flush instead. The few bytes each flush costs are what keep the batch streaming, [keep-alive frames](/docs/plugins/batch#keep-alive-timer) included.

## Client

No client setup is needed. Fetch implementations advertise the encodings they accept and decompress the response as it arrives, so the batch client decodes each message the moment it lands. For a link whose transport does not decompress on its own, add the [Response Compression Link Plugin](/docs/plugins/response-compression#client).

:::tip
Register the [Response Compression Plugin](/docs/plugins/response-compression) alongside this one to cover everything else your handler serves. The two never compress the same response twice, whichever order they are registered in.
:::

## Learn More

For implementation details, see the [source code](https://github.com/middleapi/orpc/blob/main/packages/node/src/batch-response-compression-handler-plugin.ts).
