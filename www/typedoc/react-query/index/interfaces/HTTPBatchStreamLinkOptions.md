# Interface: HTTPBatchStreamLinkOptions

## Extends

- [`HTTPBatchLinkOptions`](HTTPBatchLinkOptions.md)

## Properties

### AbortController?

> **AbortController**?: `null` \| `AbortControllerEsque`

Add ponyfill for AbortController

#### Inherited from

[`index.HTTPBatchLinkOptions.AbortController`](HTTPBatchLinkOptions.md#abortcontroller)

#### Source

packages/client/dist/links/internals/httpUtils.d.ts:17

***

### fetch?

> **fetch**?: `FetchEsque`

Add ponyfill for fetch

#### Inherited from

[`index.HTTPBatchLinkOptions.fetch`](HTTPBatchLinkOptions.md#fetch)

#### Source

packages/client/dist/links/internals/httpUtils.d.ts:13

***

### headers?

> **headers**?: `HTTPHeaders` \| (`opts`) => HTTPHeaders \| Promise\<HTTPHeaders\>

Headers to be set on outgoing requests or a callback that of said headers

#### Link

http://trpc.io/docs/client/headers

#### Inherited from

[`index.HTTPBatchLinkOptions.headers`](HTTPBatchLinkOptions.md#headers)

#### Source

packages/client/dist/links/HTTPBatchLinkOptions.d.ts:10

***

### maxURLLength?

> **maxURLLength**?: `number`

#### Inherited from

[`index.HTTPBatchLinkOptions.maxURLLength`](HTTPBatchLinkOptions.md#maxurllength)

#### Source

packages/client/dist/links/HTTPBatchLinkOptions.d.ts:5

***

### textDecoder?

> **textDecoder**?: `TextDecoderEsque`

Will default to the webAPI `TextDecoder`,
but you can use this option if your client
runtime doesn't provide it.

#### Source

packages/client/dist/links/httpBatchStreamLink.d.ts:9

***

### url

> **url**: `string` \| `URL`

#### Inherited from

[`index.HTTPBatchLinkOptions.url`](HTTPBatchLinkOptions.md#url)

#### Source

packages/client/dist/links/internals/httpUtils.d.ts:9

***

Generated using [TypeDoc](https://typedoc.org) and [typedoc-plugin-markdown](https://typedoc-plugin-markdown.org).
