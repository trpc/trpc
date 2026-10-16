---
title: "Static File Plugin"
description: "Serve static files alongside your procedures, with ETag caching, range requests, single page application fallback, and directory traversal protection."
sidebar:
  label: "Static File"
---

## Installation

```package-install
npm install @orpc/node@beta
```

## Setup

Use `StaticFileHandlerPlugin` to serve a directory alongside your procedures. Files are only served when no procedure matches a `GET` or `HEAD` request, so procedures always take precedence.

```ts
import { StaticFileHandlerPlugin } from '@orpc/node'
import { RPCHandler } from '@orpc/server/node'

const handler = new RPCHandler(router, {
  plugins: [
    new StaticFileHandlerPlugin({
      /**
       * The directory files are served from. Resolved against the working
       * directory when relative.
       */
      rootDir: './public',

      /**
       * The URL path files are served under, appended to the handler prefix
       * when one is set.
       *
       * @default '/'
       */
      path: '/',

      /**
       * The file served when the request path resolves to a directory.
       * Set to `false` to disable directory index files.
       *
       * @default 'index.html'
       */
      indexFile: 'index.html',

      /**
       * A file served with status 200 when no file matches the request path,
       * relative to `rootDir`. Useful for single page application routing.
       *
       * @default undefined
       */
      fallbackFile: 'index.html',

      /**
       * The `Cache-Control` response header value. Set to `false` to omit the header.
       *
       * @default 'public, max-age=0'
       */
      cacheControl: 'public, max-age=0',

      /**
       * Whether files and directories whose name starts with a dot can be served.
       * When disabled, names shaped like 8.3 short names, such as `ENV~1`, are
       * refused too, since NTFS and FAT resolve them to dotfiles.
       *
       * @default false
       */
      dotfiles: false,

      /**
       * Whether precompressed `.br`, `.zst`, and `.gz` sidecar files can be served
       * when the client accepts their encoding.
       *
       * @default false
       */
      precompressed: false,

      /**
       * Whether symbolic links whose target lies outside `rootDir` can be served.
       * Enabling this exposes every file those links reach.
       *
       * @default false
       */
      allowSymlinks: false,

      /**
       * Extra content types keyed by lowercase file extension without the dot,
       * merged over the built-in detection. Unrecognised extensions are served
       * as `application/octet-stream`.
       */
      mimeTypes: {},
    }),
  ],
})
```

Responses carry [ETag](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/ETag) and [Last-Modified](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Last-Modified) headers, so unchanged files revalidate as `304 Not Modified`, and [range requests](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Range_requests) are answered with `206 Partial Content` for media seeking and resumable downloads.

:::info
The `handler` can be any supported oRPC handler, such as [RPCHandler](/docs/rpc/handler), [OpenAPIHandler](/docs/openapi/handler), or a custom one.
:::

:::warning
`rootDir` should contain only files you intend to make public. Requests cannot escape it through `..` segments or symbolic links, but every file inside it is reachable.
:::

## Compression

Add the [Response Compression Plugin](/docs/plugins/response-compression) to compress files on the fly. It skips anything already encoded, so `precompressed` sidecars are served as they are, and it leaves `206 Partial Content` responses alone so range requests keep working.

```ts
import { ResponseCompressionHandlerPlugin } from '@orpc/server/plugins'

const handler = new RPCHandler(router, {
  plugins: [
    new StaticFileHandlerPlugin({ rootDir: './public', precompressed: true }),
    new ResponseCompressionHandlerPlugin(),
  ],
})
```

:::tip
Precompressing assets at build time costs nothing per request and compresses better than the on the fly pass, so reach for `precompressed` first and let the compression plugin cover whatever has no sidecar.
:::

## Learn More

For implementation details, see the [source code](https://github.com/middleapi/orpc/blob/main/packages/node/src/static-file-handler-plugin.ts).
