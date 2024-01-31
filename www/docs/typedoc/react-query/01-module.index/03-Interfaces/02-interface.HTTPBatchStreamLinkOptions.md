---
sidebar_label: HTTPBatchStreamLinkOptions
pagination_prev: null
pagination_next: null
custom_edit_url: null
---

# Interface: HTTPBatchStreamLinkOptions

## Extends

- [`HTTPBatchLinkOptions`](01-interface.HTTPBatchLinkOptions.md)

## Properties

### AbortController

> `optional` **AbortController**: `null` \| `AbortControllerEsque`

Add ponyfill for AbortController

#### Source

packages/client/dist/links/internals/httpUtils.d.ts:17

#### Inherited from

[`HTTPBatchLinkOptions`](01-interface.HTTPBatchLinkOptions.md).[`AbortController`](01-interface.HTTPBatchLinkOptions.md#abortcontroller)

---

### fetch

> `optional` **fetch**: `FetchEsque`

Add ponyfill for fetch

#### Source

packages/client/dist/links/internals/httpUtils.d.ts:13

#### Inherited from

[`HTTPBatchLinkOptions`](01-interface.HTTPBatchLinkOptions.md).[`fetch`](01-interface.HTTPBatchLinkOptions.md#fetch)

---

### headers

> `optional` **headers**: `HTTPHeaders` \| (`opts`) => `HTTPHeaders` \| `Promise`< `HTTPHeaders` \>

Headers to be set on outgoing requests or a callback that of said headers

#### Link

http://trpc.io/docs/client/headers

#### Source

packages/client/dist/links/HTTPBatchLinkOptions.d.ts:10

#### Inherited from

[`HTTPBatchLinkOptions`](01-interface.HTTPBatchLinkOptions.md).[`headers`](01-interface.HTTPBatchLinkOptions.md#headers)

---

### maxURLLength

> `optional` **maxURLLength**: `number`

#### Source

packages/client/dist/links/HTTPBatchLinkOptions.d.ts:5

#### Inherited from

[`HTTPBatchLinkOptions`](01-interface.HTTPBatchLinkOptions.md).[`maxURLLength`](01-interface.HTTPBatchLinkOptions.md#maxurllength)

---

### textDecoder

> `optional` **textDecoder**: `TextDecoderEsque`

Will default to the webAPI `TextDecoder`,
but you can use this option if your client
runtime doesn't provide it.

#### Source

packages/client/dist/links/httpBatchStreamLink.d.ts:9

---

### url

> **url**: `string` \| `URL`

#### Source

packages/client/dist/links/internals/httpUtils.d.ts:9

#### Inherited from

[`HTTPBatchLinkOptions`](01-interface.HTTPBatchLinkOptions.md).[`url`](01-interface.HTTPBatchLinkOptions.md#url)

---

Generated using [TypeDoc](https://typedoc.org/) and [typedoc-plugin-markdown](https://www.npmjs.com/package/typedoc-plugin-markdown)
