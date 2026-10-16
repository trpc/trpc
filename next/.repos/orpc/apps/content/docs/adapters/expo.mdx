---
title: "Expo Adapter"
description: "Use oRPC in an Expo app over fetch or WebSocket, including streaming support, binary data, and the SDK versions each feature needs."
sidebar:
  label: "Expo"
---

[Expo](https://expo.dev/) is the supported way to run oRPC in a React Native app. It installs the browser APIs oRPC depends on, which bare React Native does not provide, so JSON calls, [AsyncIteratorObject](/docs/async-iterator-object), and streamed downloads work in a plain Expo project with no polyfill and no Metro configuration. [Some `File` and `Blob` cases](#feature-support) need one extra package.

Two of those matter most:

- **Web Streams.** oRPC needs `ReadableStream` for every procedure call and `TransformStream` for [AsyncIteratorObject](/docs/async-iterator-object); without them every call throws `ReferenceError: ReadableStream is not defined`. Expo installs `ReadableStream`, `WritableStream`, and `TransformStream` as native globals from [SDK 53](https://github.com/expo/expo/pull/36407).
- **A streaming `fetch`.** React Native's built-in `fetch` is an `XMLHttpRequest` polyfill with no `response.body`, which rules out [AsyncIteratorObject](/docs/async-iterator-object) and streamed downloads. [`expo/fetch`](https://docs.expo.dev/versions/latest/sdk/expo/#fetch) is native-backed and streams properly. From **SDK 56** it replaces the global `fetch` on Android and iOS, so there is nothing to wire up.

:::tip
Use **SDK 56 or later** to get everything working out of the box. SDK 53 to 55 work too, but you must pass `expo/fetch` to the link yourself, as shown [below](#expo-sdk-53-to-55).
:::

## Fetch Link

```ts title="utils/orpc.ts"
import { RPCLink } from '@orpc/client/fetch'

export const link = new RPCLink({
  origin: process.env.EXPO_PUBLIC_SERVER_URL,
  url: '/rpc',
  headers: async ({ context }) => ({
    'x-api-key': context?.something ?? '',
  }),
})
```

:::info
The `link` can be any supported oRPC link, such as [RPCLink](/docs/rpc/link), [OpenAPILink](/docs/openapi/link), or a custom one. For examples of creating a typesafe client, see [RPC Link](/docs/rpc/link#typesafe-clients).
:::

### Expo SDK 53 to 55

On these versions the global `fetch` is still React Native's non-streaming polyfill, so pass `expo/fetch` to the link explicitly. Everything else stays the same.

```ts
import { fetch as expoFetch } from 'expo/fetch'
import { RPCLink } from '@orpc/client/fetch'

const link = new RPCLink({
  origin: process.env.EXPO_PUBLIC_SERVER_URL,
  url: '/rpc',
  fetch: (url, init) => expoFetch(url, init),
})
```

:::warning
On SDK 56 and later you can opt back out of `expo/fetch` by setting `EXPO_PUBLIC_USE_RN_FETCH=1`. Doing so restores React Native's `XMLHttpRequest` polyfill and silently disables streaming, so `AsyncIteratorObject` and streamed responses stop working.
:::

## WebSocket Link

Expo inherits React Native's `WebSocket`, which is backed by OkHttp on Android and SocketRocket on iOS and handles binary frames in both directions.

```ts
import { RPCLink } from '@orpc/client/websocket'

const link = new RPCLink({
  connect: () => {
    const ws = new WebSocket('ws://localhost:3000')
    ws.binaryType = 'arraybuffer'
    return ws
  },
})
```

:::warning
Set `binaryType` to `'arraybuffer'` and never `'blob'`. React Native's `Blob` has no `arrayBuffer()`, `text()`, or `stream()` method, so oRPC cannot read the bytes back out of a blob message. Every binary frame is also base64-encoded to cross the native bridge, so prefer many small messages over one large payload.

Sending or receiving a `File` or `Blob` over this link additionally needs the [Blob polyfill](#blob-polyfill).
:::

## Feature Support

oRPC treats binary data two different ways, and the difference decides what works on Expo:

- **Root level**, where a `File` or `Blob` is the entire input or output. oRPC sends it as the raw body, with no multipart involved.
- **Nested**, where a `File` or `Blob` sits inside an object or array. oRPC packs it into a `FormData`, which travels as `multipart/form-data`.

Expo never parses multipart, and the WebSocket link cannot even produce it, which is why every nested row below fails somewhere.

| Feature                                                                             | Fetch                                      | WebSocket                                  |
| ----------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------ |
| [AsyncIteratorObject](/docs/async-iterator-object) download                         | ✅                                          | ✅                                          |
| `AsyncIteratorObject` upload                                                        | 🟡 buffered                                 | ✅                                          |
| [`ReadableStream<Uint8Array>`](/docs/binary-data#readablestreamuint8array) download | ✅                                          | ✅                                          |
| `ReadableStream` upload                                                             | 🟡 buffered                                 | ✅                                          |
| Root-level [`File` or `Blob`](/docs/binary-data#file-and-blob) download             | 🟡 with the [Blob polyfill](#blob-polyfill) | 🟡 with the [Blob polyfill](#blob-polyfill) |
| Root-level `File` or `Blob` upload                                                  | ✅                                          | 🟡 with the [Blob polyfill](#blob-polyfill) |
| Nested `File` or `Blob` download                                                    | ❌                                          | ❌                                          |
| Nested `File` or `Blob` upload                                                      | 🟡 with the [Blob polyfill](#blob-polyfill) | ❌                                          |

Two things are worth knowing beyond the table:

- **`expo/fetch` buffers streamed uploads.** It accepts a streamed request body, whether that is an `AsyncIteratorObject` or a `ReadableStream`, but drains it into one buffer before the request starts. Nothing reaches the server until the stream finishes, and the whole payload sits in memory meanwhile. Downloads stream properly. The WebSocket link has no such limit: each chunk is its own frame, sent immediately, so uploads genuinely stream. It is the one place the WebSocket link beats fetch.
- **The WebSocket link handles nested binary worse.** It runs `FormData` through the global `Response` in both directions, and Expo leaves that as React Native's implementation, which can neither read a `FormData` body as a blob nor parse a multipart one. The fetch link only has the decode half of that problem, which is why nested uploads still work there.

### Blob Polyfill

React Native's `Blob` has no `arrayBuffer()`, `text()`, `bytes()`, or `stream()`, and `new Blob([arrayBuffer])` throws, so oRPC cannot read bytes back out of a downloaded blob. [`expo-blob`](https://www.npmjs.com/package/expo-blob) is Expo's spec-compliant implementation. It fixes every root-level case in the table above, plus nested uploads on the fetch link.

```package-install
npx expo install expo-blob
```

It exports only `Blob`, so declare `File` yourself and install both as globals from your entry file:

```ts title="polyfill.ts"
import { Blob, type BlobPart } from 'expo-blob'

class File extends Blob {
  name: string
  lastModified: number
  webkitRelativePath = ''

  constructor(fileBits: BlobPart[] | Iterable<BlobPart>, fileName: string, options?: FilePropertyBag) {
    super(fileBits, options)

    this.name = String(fileName)
    this.lastModified = options?.lastModified ?? Date.now()
  }

  override toString(): string {
    return '[object File]'
  }
}

Object.assign(globalThis, { Blob, File })
```

:::warning
`File` must extend the same class you install as `globalThis.Blob`, because oRPC classifies binary values with `instanceof Blob`. Keep `name` an own writable property, as above, so Expo's `FormData` can set a filename on it.

Replacing the global `Blob` also affects code outside oRPC. `xhr.responseType = 'blob'` and `WebSocket` with `binaryType = 'blob'` still produce React Native blobs, which are no longer `instanceof Blob`. `URL.createObjectURL` and `FileReader` go the other way: they read React Native's internal blob data, so they throw when handed a polyfilled one.
:::

### Why nested binary fails

A nested `File` or `Blob` is packed into a `FormData` and sent as `multipart/form-data`. Reading it back needs `Response.formData()`, and no `Response` on Expo can do that. Both `expo/fetch` and React Native handle only the simpler `application/x-www-form-urlencoded` format.

Writing multipart works, but only on the fetch link, where `expo/fetch` does the encoding. The WebSocket link uses `Response` to write it too, so that link fails in both directions.

| Link      | Nested upload                              | Nested download |
| --------- | ------------------------------------------ | --------------- |
| Fetch     | 🟡 with the [Blob polyfill](#blob-polyfill) | ❌               |
| WebSocket | ❌                                          | ❌               |

**The easy fix is to avoid multipart.** Keep files at the root of a procedure's input or output instead of inside an object. Or extend the [RPC JSON Serializer](/docs/rpc/serializer) to carry binary as `base64`.

**The full fix is a `Response` that handles multipart.** For the WebSocket link, replace `globalThis.Response` with one that can both write and read it. For the fetch link only reading is missing, so extend the response that `expo/fetch` returns.

## Bare React Native

oRPC does not support bare React Native out of the box. Without Expo you get neither the Web Streams globals oRPC needs nor a streaming `fetch`. You can get close by adding [web-streams-polyfill](https://github.com/MattiasBuelens/web-streams-polyfill) and loading it from your entry file, but `AsyncIteratorObject` and streamed downloads will still not work over the built-in `fetch`. React Native 0.78 is also a hard floor: oRPC uses a class static initialization block, Metro does not transpile it, and older Hermes cannot parse it. See [Requirements](/docs/requirements#react-native) for the full list of APIs oRPC needs.
