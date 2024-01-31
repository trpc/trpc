---
sidebar_label: HTTPLinkOptions
pagination_prev: null
pagination_next: null
custom_edit_url: null
---

# Interface: HTTPLinkOptions

## Extends

- `HTTPLinkBaseOptions`

## Properties

### AbortController

> `optional` **AbortController**: `null` \| `AbortControllerEsque`

Add ponyfill for AbortController

#### Source

[packages/client/src/links/internals/httpUtils.ts:34](https://github.com/trpc/trpc/blob/caccce64/packages/client/src/links/internals/httpUtils.ts#L34)

#### Inherited from

HTTPLinkBaseOptions.AbortController

---

### fetch

> `optional` **fetch**: `FetchEsque`

Add ponyfill for fetch

#### Source

[packages/client/src/links/internals/httpUtils.ts:30](https://github.com/trpc/trpc/blob/caccce64/packages/client/src/links/internals/httpUtils.ts#L30)

#### Inherited from

HTTPLinkBaseOptions.fetch

---

### headers

> `optional` **headers**: `HTTPHeaders` \| (`opts`) => `HTTPHeaders` \| `Promise`< `HTTPHeaders` \>

Headers to be set on outgoing requests or a callback that of said headers

#### Link

http://trpc.io/docs/client/headers

#### Source

[packages/client/src/links/httpLink.ts:21](https://github.com/trpc/trpc/blob/caccce64/packages/client/src/links/httpLink.ts#L21)

---

### url

> **url**: `string` \| `URL`

#### Source

[packages/client/src/links/internals/httpUtils.ts:26](https://github.com/trpc/trpc/blob/caccce64/packages/client/src/links/internals/httpUtils.ts#L26)

#### Inherited from

HTTPLinkBaseOptions.url

---

Generated using [TypeDoc](https://typedoc.org/) and [typedoc-plugin-markdown](https://www.npmjs.com/package/typedoc-plugin-markdown)
