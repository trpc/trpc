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

packages/client/dist/links/internals/httpUtils.d.ts:17

#### Inherited from

HTTPLinkBaseOptions.AbortController

---

### fetch

> `optional` **fetch**: `FetchEsque`

Add ponyfill for fetch

#### Source

packages/client/dist/links/internals/httpUtils.d.ts:13

#### Inherited from

HTTPLinkBaseOptions.fetch

---

### headers

> `optional` **headers**: `HTTPHeaders` \| (`opts`) => `HTTPHeaders` \| `Promise`< `HTTPHeaders` \>

Headers to be set on outgoing requests or a callback that of said headers

#### Link

http://trpc.io/docs/client/headers

#### Source

packages/client/dist/links/httpLink.d.ts:9

---

### url

> **url**: `string` \| `URL`

#### Source

packages/client/dist/links/internals/httpUtils.d.ts:9

#### Inherited from

HTTPLinkBaseOptions.url

---

Generated using [TypeDoc](https://typedoc.org/) and [typedoc-plugin-markdown](https://www.npmjs.com/package/typedoc-plugin-markdown)
