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

[packages/client/src/links/internals/httpUtils.ts:34](https://github.com/trpc/trpc/blob/caccce64/packages/client/src/links/internals/httpUtils.ts#L34)

#### Inherited from

[`HTTPBatchLinkOptions`](01-interface.HTTPBatchLinkOptions.md).[`AbortController`](01-interface.HTTPBatchLinkOptions.md#abortcontroller)

---

### fetch

> `optional` **fetch**: `FetchEsque`

Add ponyfill for fetch

<!-- markdownlint-disable MD024 -->

#### Source

[packages/client/src/links/internals/httpUtils.ts:30](https://github.com/trpc/trpc/blob/caccce64/packages/client/src/links/internals/httpUtils.ts#L30)

#### Inherited from

[`HTTPBatchLinkOptions`](01-interface.HTTPBatchLinkOptions.md).[`fetch`](01-interface.HTTPBatchLinkOptions.md#fetch)

---

### headers

> `optional` **headers**: `HTTPHeaders` \| (`opts`) => `HTTPHeaders` \| `Promise`< `HTTPHeaders` \>

Headers to be set on outgoing requests or a callback that of said headers

#### Link

[http://trpc.io/docs/client/headers](http://trpc.io/docs/client/headers)

#### Source

[packages/client/src/links/HTTPBatchLinkOptions.ts:11](https://github.com/trpc/trpc/blob/caccce64/packages/client/src/links/HTTPBatchLinkOptions.ts#L11)

#### Inherited from

[`HTTPBatchLinkOptions`](01-interface.HTTPBatchLinkOptions.md).[`headers`](01-interface.HTTPBatchLinkOptions.md#headers)

---

### maxURLLength

> `optional` **maxURLLength**: `number`

#### Source

[packages/client/src/links/HTTPBatchLinkOptions.ts:6](https://github.com/trpc/trpc/blob/caccce64/packages/client/src/links/HTTPBatchLinkOptions.ts#L6)

#### Inherited from

[`HTTPBatchLinkOptions`](01-interface.HTTPBatchLinkOptions.md).[`maxURLLength`](01-interface.HTTPBatchLinkOptions.md#maxurllength)

---

### textDecoder

> `optional` **textDecoder**: `TextDecoderEsque`

Will default to the webAPI `TextDecoder`,
but you can use this option if your client
runtime doesn't provide it.

#### Source

[packages/client/src/links/httpBatchStreamLink.ts:16](https://github.com/trpc/trpc/blob/caccce64/packages/client/src/links/httpBatchStreamLink.ts#L16)

---

### url

> **url**: `string` \| `URL`

#### Source

[packages/client/src/links/internals/httpUtils.ts:26](https://github.com/trpc/trpc/blob/caccce64/packages/client/src/links/internals/httpUtils.ts#L26)

#### Inherited from

[`HTTPBatchLinkOptions`](01-interface.HTTPBatchLinkOptions.md).[`url`](01-interface.HTTPBatchLinkOptions.md#url)

---

Generated using [TypeDoc](https://typedoc.org/) and [typedoc-plugin-markdown](https://www.npmjs.com/package/typedoc-plugin-markdown)
