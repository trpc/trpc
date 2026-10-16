---
title: "Runtime Requirements"
description: "oRPC is built on ES2022 and a small set of standard Web APIs. This page lists exactly what it needs and the minimum versions that provide it on Node.js, Deno, Bun, Cloudflare Workers, browsers, Android, and iOS."
sidebar:
  label: "Requirements"
  icon: cpu
---

oRPC's core abstractions are written against the JavaScript language and standard Web APIs. Runtime-specific integrations live in adapters and runtime packages. If a runtime provides the features required by the packages and features you use, oRPC runs on it.

## Overview

| Runtime | Minimum | Recommended |
| --- | --- | --- |
| Node.js | 18 | 22+ |
| Deno | 1.14 | 2.0+ |
| Bun | 1.0 | 1.3.3+ |
| Cloudflare Workers | — | — |
| Chrome | 94 | — |
| Firefox | 93 | — |
| Safari | 16.4 | — |
| Android WebView | 94 | — |
| iOS WebView (WKWebView) | 16.4 | — |

Browsers update themselves, so there is nothing to recommend beyond the minimum. Edge and Chrome on Android match Chrome, Samsung Internet needs 17.0, and Safari on iOS matches iOS WebView. Cloudflare Workers tracks current V8 and ships every Web API oRPC uses; use the [Cloudflare Workers Adapter](/docs/adapters/cloudflare-workers) there. [React Native](#react-native) is not a web view and needs a polyfill.

Some optional features need more: compression needs Deno 1.19, Bun 1.3.3, and Firefox 113; [AsyncIteratorObject](/docs/async-iterator-object) needs Firefox 105 and Bun 1.1.23; `Blob` or `File` payloads need Node.js 20; and the [Encryption](/docs/helpers/encryption), [Signing](/docs/helpers/signing), and [Pino](/docs/integrations/pino) integrations need Node.js 19 for a bare `crypto` global.

## Language Level

oRPC is written and type-checked against **ES2022**, and the published bundles are not compiled down any further.

Available from Node 16.11 · Deno 1.14 · Bun 1.0 · Chrome 94 · Firefox 93 · Safari 16.4 · Android WebView 94 · iOS WebView 16.4.

:::info
These numbers cover the ES2022 features oRPC actually uses. Full ES2022 support is not required, and asking for it would raise the bar a lot: Safari only finished [top-level await](https://webkit.org/b/242740) in version 27, and oRPC never uses it.
:::

:::warning
If you build for anything older than ES2022, your bundler has to compile `@orpc/*` along with your own code. Most bundlers skip `node_modules` by default.
:::

## Web APIs

Beyond ES2022, oRPC uses the APIs below. Every one is [Baseline Widely available](https://web.dev/baseline), meaning it landed in every major browser at least 30 months ago. The dates are when that happened.

| API | Needed when | Across browsers since | Available from |
| --- | --- | --- | --- |
| [`ReadableStream`](https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream) | Always | Jan 2019 | Node 18 · Deno 1.0 · Bun 1.0 · Chrome 43 · Firefox 65 · Safari 10.1 · Android WebView 43 · iOS WebView 10.3 |
| [`Blob`](https://developer.mozilla.org/en-US/docs/Web/API/Blob) | Always | Jul 2015 | Node 18 · Deno 1.0 · Bun 1.0 · Chrome 5 · Firefox 4 · Safari 6 · Android WebView 4.4 · iOS WebView 6 |
| [`FormData`](https://developer.mozilla.org/en-US/docs/Web/API/FormData) | Always | Jul 2015 | Node 18 · Deno 1.0 · Bun 1.0 · Chrome 5 · Firefox 4 · Safari 5 · Android WebView 3 · iOS WebView 5 |
| [`URL`](https://developer.mozilla.org/en-US/docs/Web/API/URL) | Always | Jul 2015 | Node 10 · Deno 1.0 · Bun 1.0 · Chrome 32 · Firefox 19 · Safari 7 · Android WebView 4.4 · iOS WebView 7 |
| [`URLSearchParams`](https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams) | Always | Apr 2018 | Node 10 · Deno 1.0 · Bun 1.0 · Chrome 49 · Firefox 29 · Safari 10.1 · Android WebView 49 · iOS WebView 10.3 |
| [`fetch`](https://developer.mozilla.org/en-US/docs/Web/API/Window/fetch) | [Fetch adapter](/docs/adapters/fetch-api) | Mar 2017 | Node 18 · Deno 1.0 · Bun 1.0 · Chrome 42 · Firefox 39 · Safari 10.1 · Android WebView 42 · iOS WebView 10.3 |
| [`Headers`](https://developer.mozilla.org/en-US/docs/Web/API/Headers) | [Fetch adapter](/docs/adapters/fetch-api) | Mar 2017 | Node 18 · Deno 1.0 · Bun 1.0 · Chrome 42 · Firefox 39 · Safari 10.1 · Android WebView 42 · iOS WebView 10.3 |
| [`Request`](https://developer.mozilla.org/en-US/docs/Web/API/Request) | [Fetch adapter](/docs/adapters/fetch-api) | Mar 2017 | Node 18 · Deno 1.0 · Bun 1.0 · Chrome 42 · Firefox 39 · Safari 10.1 · Android WebView 42 · iOS WebView 10.3 |
| [`Response`](https://developer.mozilla.org/en-US/docs/Web/API/Response) | [Fetch adapter](/docs/adapters/fetch-api), plus any adapter that encodes or decodes `FormData` | Mar 2017 | Node 18 · Deno 1.0 · Bun 1.0 · Chrome 42 · Firefox 39 · Safari 10.1 · Android WebView 42 · iOS WebView 10.3 |
| [`TextEncoder`](https://developer.mozilla.org/en-US/docs/Web/API/TextEncoder) | [AWS Lambda](/docs/adapters/aws-lambda), [WebSocket](/docs/adapters/websocket), and [Message Port](/docs/adapters/message-port) adapters, the [Batch plugin](/docs/plugins/batch), and the [Encryption](/docs/helpers/encryption) and [Signing](/docs/helpers/signing) helpers | Jan 2020 | Node 11 · Deno 1.0 · Bun 1.0 · Chrome 38 · Firefox 18 · Safari 10.1 · Android WebView 38 · iOS WebView 10.3 |
| [`TextDecoder`](https://developer.mozilla.org/en-US/docs/Web/API/TextDecoder) | [Node.js](/docs/adapters/node-http), [Fastify](/docs/adapters/fastify), [AWS Lambda](/docs/adapters/aws-lambda), [WebSocket](/docs/adapters/websocket), and [Message Port](/docs/adapters/message-port) adapters, and the [Encryption](/docs/helpers/encryption) helper | Jan 2020 | Node 11 · Deno 1.0 · Bun 1.0 · Chrome 38 · Firefox 19 · Safari 10.1 · Android WebView 38 · iOS WebView 10.3 |
| [`TransformStream`](https://developer.mozilla.org/en-US/docs/Web/API/TransformStream) | [AsyncIteratorObject](/docs/async-iterator-object) over HTTP, and the [Request Limit](/docs/plugins/request-limit) and [Tmp File Upload](/docs/plugins/tmp-file-upload) plugins | Jun 2022 | Node 18 · Deno 1.0 · Bun 1.0 · Chrome 67 · Firefox 102 · Safari 14.1 · Android WebView 67 · iOS WebView 14.5 |
| [`TextEncoderStream`](https://developer.mozilla.org/en-US/docs/Web/API/TextEncoderStream) / [`TextDecoderStream`](https://developer.mozilla.org/en-US/docs/Web/API/TextDecoderStream) | [AsyncIteratorObject](/docs/async-iterator-object) over HTTP | Sep 2022 | Node 18 · Deno 1.11 · Bun 1.1.23 · Chrome 71 · Firefox 105 · Safari 14.1 · Android WebView 71 · iOS WebView 14.5 |
| [`AbortController`](https://developer.mozilla.org/en-US/docs/Web/API/AbortController) | [Node.js](/docs/adapters/node-http), [Fastify](/docs/adapters/fastify), [AWS Lambda](/docs/adapters/aws-lambda), [WebSocket](/docs/adapters/websocket), and [Message Port](/docs/adapters/message-port) adapters, and the [Batch](/docs/plugins/batch), [Timeout](/docs/plugins/timeout), and [Dedupe](/docs/plugins/dedupe) plugins | Mar 2019 | Node 14.17 · Deno 1.0 · Bun 1.0 · Chrome 66 · Firefox 57 · Safari 12.1 · Android WebView 66 · iOS WebView 12.2 |
| [`WebSocket`](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket) | [WebSocket adapter](/docs/adapters/websocket), unless you supply your own implementation such as [`ws`](https://github.com/websockets/ws) | Jul 2015 | Node 22 · Deno 1.4 · Bun 1.0 · Chrome 5 · Firefox 11 · Safari 5 · Android WebView 4.4 · iOS WebView 4.2 |
| [`MessagePort`](https://developer.mozilla.org/en-US/docs/Web/API/MessagePort) | [Message Port adapter](/docs/adapters/message-port) | Sep 2015 | Node 15 · Deno 1.12 · Bun 1.0 · Chrome 2 · Firefox 41 · Safari 5 · Android WebView 4.4 · iOS WebView 4.2 |
| [`File`](https://developer.mozilla.org/en-US/docs/Web/API/File) | Sending or receiving a [`Blob` or `File`](/docs/binary-data#file-and-blob) | Jul 2015 | Node 20 · Deno 1.0 · Bun 1.0 · Chrome 13 · Firefox 7 · Safari 4 · Android WebView 4.4 · iOS WebView 3.2 |
| [`CompressionStream`](https://developer.mozilla.org/en-US/docs/Web/API/CompressionStream) | The sending side of the [Request](/docs/plugins/request-compression) and [Response](/docs/plugins/response-compression) Compression plugins | May 2023 | Node 18 · Deno 1.19 · Bun 1.3.3 · Chrome 80 · Firefox 113 · Safari 16.4 · Android WebView 80 · iOS WebView 16.4 |
| [`DecompressionStream`](https://developer.mozilla.org/en-US/docs/Web/API/DecompressionStream) | The receiving side of the [Request](/docs/plugins/request-compression) and [Response](/docs/plugins/response-compression) Compression plugins | May 2023 | Node 18 · Deno 1.19 · Bun 1.3.3 · Chrome 80 · Firefox 113 · Safari 16.4 · Android WebView 80 · iOS WebView 16.4 |
| [`crypto.subtle`](https://developer.mozilla.org/en-US/docs/Web/API/Crypto/subtle) (PBKDF2 `deriveKey`, AES-GCM `encrypt`) | [Encryption](/docs/helpers/encryption) and [Signing](/docs/helpers/signing) helpers | Sep 2017 | Node 19 · Deno 1.18 · Bun 1.0 · Chrome 41 · Firefox 34 · Safari 11 · Android WebView 41 · iOS WebView 11 |
| [`crypto.getRandomValues()`](https://developer.mozilla.org/en-US/docs/Web/API/Crypto/getRandomValues) | [Encryption](/docs/helpers/encryption) and [Signing](/docs/helpers/signing) helpers | Jul 2015 | Node 19 · Deno 1.0 · Bun 1.0 · Chrome 11 · Firefox 21 · Safari 5 · Android WebView 4.4 · iOS WebView 5 |
| [`crypto.randomUUID()`](https://developer.mozilla.org/en-US/docs/Web/API/Crypto/randomUUID) | Default request ID in the [Pino integration](/docs/integrations/pino), unless you supply `generateRequestId` | Mar 2022 | Node 19 · Deno 1.11 · Bun 1.0 · Chrome 92 · Firefox 95 · Safari 15.4 · Android WebView 92 · iOS WebView 15.4 |
| [`atob()`](https://developer.mozilla.org/en-US/docs/Web/API/Window/atob) | [Base64url](/docs/helpers/base64url) helper | Jul 2015 | Node 16 · Deno 1.0 · Bun 1.0 · Chrome 4 · Firefox 1 · Safari 3 · Android WebView 4.4 · iOS WebView 1 |
| [`btoa()`](https://developer.mozilla.org/en-US/docs/Web/API/Window/btoa) | [Base64url](/docs/helpers/base64url) helper | Jul 2015 | Node 16 · Deno 1.0 · Bun 1.0 · Chrome 4 · Firefox 1 · Safari 3 · Android WebView 4.4 · iOS WebView 1 |

Version numbers come from [MDN's browser compatibility data](https://github.com/mdn/browser-compat-data). A few rows need more explanation:

- **Plain JSON calls still need `ReadableStream`.** The [RPC Serializer](/docs/rpc/serializer) and the [OpenAPI Serializer](/docs/openapi/serializer) classify every value with `instanceof ReadableStream`, so the global is required even when nothing streams.
- **`Response` is not only for the Fetch adapter.** It is the standard way to read and write multipart bodies, so oRPC uses `new Response(form)` to encode `FormData` and `.formData()` to decode it. That makes `Response` a requirement for the Node.js, Fastify, AWS Lambda, WebSocket, and Message Port adapters too, even though none of them speak the Fetch API. `Request` is not part of that path. The AWS Lambda adapter also needs Node's `Buffer`.
- **A plain `Blob` is enough to require `File`.** oRPC reads `File.name` to build the `Content-Disposition` header, and builds a `File` when parsing an upload. [`ReadableStream`](/docs/binary-data#readablestreamuint8array) payloads do not need it.
- **`Blob`, `File`, `URL`, and `FormData`** are handled the same way by the [RPC Serializer](/docs/rpc/serializer) and the [OpenAPI Serializer](/docs/openapi/serializer).

## React Native

React Native does not run in a web view. It runs JavaScript in [Hermes](https://github.com/facebook/hermes), which does not provide the browser APIs above, so the WebView numbers do not apply to it.

Three things need attention:

- **Web Streams are missing.** oRPC needs `ReadableStream` for every procedure call and `TransformStream` for [AsyncIteratorObject](/docs/async-iterator-object); Hermes provides neither. [Expo](https://docs.expo.dev/versions/latest/sdk/expo/) has installed `ReadableStream`, `WritableStream`, and `TransformStream` as native globals since [SDK 53](https://expo.dev/changelog/sdk-53), which fixes it. On bare React Native, add a Web Streams polyfill and load it from your entry file.
- **React Native 0.78 is the floor, and it is a syntax limit.** oRPC uses a class static initialization block. Metro has no transform for it, and Hermes could not parse one until React Native 0.78, so anything older fails to load and no polyfill can help. Every Expo SDK from 53 up is past that line. The ES2022 builtins are not the problem: Hermes has had `Object.hasOwn`, the `Error` `cause` option, and `.at()` since React Native 0.71, even though it still [documents itself as ES6 plus selected later additions](https://github.com/facebook/hermes/blob/main/doc/Features.md).
- **Some globals are missing entirely.** There is no `crypto` global on native at any Expo SDK, and React Native's `Blob` lacks `arrayBuffer()`, `text()`, and `stream()`, which is why binary payloads have to travel as `ArrayBuffer` rather than blobs.

Beyond the globals, React Native's built-in `fetch` does not support streaming, which limits [binary data](/docs/binary-data) and [AsyncIteratorObject](/docs/async-iterator-object) rather than oRPC itself. [Expo](https://expo.dev/) fixes the streams and the fetch: it provides the Web Streams globals and, from SDK 56, installs the streaming `expo/fetch` as the global `fetch`. The missing `crypto` global and the incomplete `Blob` remain. See the [Expo Adapter](/docs/adapters/expo) for setup.
