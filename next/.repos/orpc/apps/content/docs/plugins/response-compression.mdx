---
title: "Response Compression Plugin"
description: "Compress response bodies on the server and decompress them on the client to reduce bandwidth usage and improve performance."
sidebar:
  label: "Response Compression"
---

## Server

Use `ResponseCompressionHandlerPlugin` to compress response bodies. The plugin selects an encoding based on [Accept-Encoding header](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Accept-Encoding):

```ts handler
import { ResponseCompressionHandlerPlugin } from '@orpc/server/plugins'

const handler = new RPCHandler(router, {
  plugins: [
    new ResponseCompressionHandlerPlugin({
      /**
       * The compression schemes to use for response compression.
       * Schemes are prioritized by their order in this array and
       * only applied if the client supports them.
       * Supported values: 'gzip' | 'deflate' | 'deflate-raw'
       *
       * @default ['gzip', 'deflate']
       */
      encodings: ['gzip', 'deflate'],

      /**
       * The minimum response size in bytes required to trigger compression.
       * Responses smaller than this threshold will not be compressed to avoid overhead.
       * If the response size cannot be determined, compression will still be applied.
       *
       * @default 1024 (1KB)
       */
      threshold: 1024,
    }),
  ],
})
```

:::info
The `handler` can be any supported oRPC handler, such as [RPCHandler](/docs/rpc/handler), [OpenAPIHandler](/docs/openapi/handler), or a custom one.
:::

:::tip
A [batch](/docs/plugins/batch) response might be left uncompressed here, depending on the shape it takes. On Node.js, add the [Batch Response Compression Plugin](/docs/plugins/batch-response-compression) to fully cover them, when you know your batch responses are all compressible.
:::

### Customize Compressible Content Types

For binary transfers (streams, files, and file form-data parts), the plugin only compresses content types that benefit from compression. Override the check with `isCompressibleContentType`:

```ts handler
import { ResponseCompressionHandlerPlugin } from '@orpc/server/plugins'

const handler = new RPCHandler(router, {
  plugins: [
    new ResponseCompressionHandlerPlugin({
      /**
       * Also receives the routing interceptor options for per-request decisions.
       *
       * @default isCompressibleContentType (covers common text-based formats)
       */
      isCompressibleContentType: (contentType, { request }) => {
        return /^application\/x-custom-format(?:[;\s]|$)/i.test(contentType ?? '') && request.headers['x-no-compression'] === undefined
      },
    }),
  ],
})
```

## Client

Use `ResponseCompressionLinkPlugin` to advertise supported encodings via [Accept-Encoding header](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Accept-Encoding) and automatically decompress response bodies based on the [Content-Encoding header](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Encoding):

```ts
import { ResponseCompressionLinkPlugin } from '@orpc/client/plugins'

const link = new RPCLink({
  plugins: [
    new ResponseCompressionLinkPlugin({
      /**
       * Compression schemes to advertise via Accept-Encoding, in preference order.
       * Supported values: 'gzip' | 'deflate' | 'deflate-raw'
       *
       * @default ['gzip', 'deflate']
       */
      encodings: ['gzip', 'deflate'],
    }),
  ],
})
```

:::info
The `link` can be any supported oRPC link, such as [RPCLink](/docs/rpc/link), [OpenAPILink](/docs/openapi/link), or a custom one.
:::

:::warning
When using the fetch adapter, this plugin is usually unnecessary because most fetch implementations automatically set the `Accept-Encoding` header and decompress response bodies.
:::

## Learn More

For implementation details, see the [ResponseCompressionLinkPlugin source code](https://github.com/middleapi/orpc/blob/main/packages/client/src/plugins/response-compression.ts) or the [ResponseCompressionHandlerPlugin source code](https://github.com/middleapi/orpc/blob/main/packages/server/src/plugins/response-compression.ts).
