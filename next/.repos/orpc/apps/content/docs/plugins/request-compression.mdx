---
title: "Request Compression Plugin"
description: "Compress request bodies on the client and decompress them on the server to reduce bandwidth usage for large payloads."
sidebar:
  label: "Request Compression"
---

## Client

Use `RequestCompressionLinkPlugin` to compress request bodies. Configure the compression scheme and size threshold:

```ts
import { RequestCompressionLinkPlugin } from '@orpc/client/plugins'

const link = new RPCLink({
  plugins: [
    new RequestCompressionLinkPlugin({
      /**
       * The compression scheme to use for request compression.
       * Supported values: 'gzip' | 'deflate' | 'deflate-raw'
       *
       * @default 'gzip'
       */
      encoding: 'gzip',

      /**
       * The minimum request size in bytes required to trigger compression.
       * Requests smaller than this threshold will not be compressed to avoid overhead.
       * If the request size cannot be determined, compression will still be applied.
       *
       * @default 1024 (1KB)
       */
      threshold: 1024,
    }),
  ],
})
```

:::info
The `link` can be any supported oRPC link, such as [RPCLink](/docs/rpc/link), [OpenAPILink](/docs/openapi/link), or a custom one.
:::

### Customize Compressible Content Types

For binary transfers (streams, files, and file form-data parts), the plugin only compresses content types that benefit from compression. Override the check with `isCompressibleContentType`:

```ts
import { RequestCompressionLinkPlugin } from '@orpc/client/plugins'

const link = new RPCLink({
  plugins: [
    new RequestCompressionLinkPlugin({
      /**
       * Also receives the transport interceptor options for per-request decisions.
       *
       * @default isCompressibleContentType (covers common text-based formats)
       */
      isCompressibleContentType: (contentType, { path }) => {
        return /^application\/x-custom-format(?:[;\s]|$)/i.test(contentType ?? '') && path[0] !== 'uploads'
      },
    }),
  ],
})
```

## Server

Use `RequestCompressionHandlerPlugin` to decompress request bodies. The plugin automatically detects the client's compression scheme based on the [Content-Encoding header](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Encoding):

```ts handler
import { RequestCompressionHandlerPlugin } from '@orpc/server/plugins'

const handler = new RPCHandler(router, {
  plugins: [
    new RequestCompressionHandlerPlugin(),
  ],
})
```

:::info
The `handler` can be any supported oRPC handler, such as [RPCHandler](/docs/rpc/handler), [OpenAPIHandler](/docs/openapi/handler), or a custom one.
:::

:::tip
Combine with the [Request Limit Plugin](/docs/plugins/request-limit) to limit the decompressed payload size.
:::

## Learn More

For implementation details, see the [RequestCompressionLinkPlugin source code](https://github.com/middleapi/orpc/blob/main/packages/client/src/plugins/request-compression.ts) or the [RequestCompressionHandlerPlugin source code](https://github.com/middleapi/orpc/blob/main/packages/server/src/plugins/request-compression.ts).
