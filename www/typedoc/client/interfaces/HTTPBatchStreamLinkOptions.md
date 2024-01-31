# Interface: HTTPBatchStreamLinkOptions

## Extends

- [`HTTPBatchLinkOptions`](HTTPBatchLinkOptions.md)

## Properties

### AbortController?

> **AbortController**?: `null` \| `AbortControllerEsque`

Add ponyfill for AbortController

#### Inherited from

[`HTTPBatchLinkOptions.AbortController`](HTTPBatchLinkOptions.md#abortcontroller)

#### Source

[packages/client/src/links/internals/httpUtils.ts:34](https://github.com/trpc/trpc/blob/caccce64/packages/client/src/links/internals/httpUtils.ts#L34)

***

### fetch?

> **fetch**?: `FetchEsque`

Add ponyfill for fetch

#### Inherited from

[`HTTPBatchLinkOptions.fetch`](HTTPBatchLinkOptions.md#fetch)

#### Source

[packages/client/src/links/internals/httpUtils.ts:30](https://github.com/trpc/trpc/blob/caccce64/packages/client/src/links/internals/httpUtils.ts#L30)

***

### headers?

> **headers**?: `HTTPHeaders` \| (`opts`) => HTTPHeaders \| Promise\<HTTPHeaders\>

Headers to be set on outgoing requests or a callback that of said headers

#### Link

http://trpc.io/docs/client/headers

#### Inherited from

[`HTTPBatchLinkOptions.headers`](HTTPBatchLinkOptions.md#headers)

#### Source

[packages/client/src/links/HTTPBatchLinkOptions.ts:11](https://github.com/trpc/trpc/blob/caccce64/packages/client/src/links/HTTPBatchLinkOptions.ts#L11)

***

### maxURLLength?

> **maxURLLength**?: `number`

#### Inherited from

[`HTTPBatchLinkOptions.maxURLLength`](HTTPBatchLinkOptions.md#maxurllength)

#### Source

[packages/client/src/links/HTTPBatchLinkOptions.ts:6](https://github.com/trpc/trpc/blob/caccce64/packages/client/src/links/HTTPBatchLinkOptions.ts#L6)

***

### textDecoder?

> **textDecoder**?: `TextDecoderEsque`

Will default to the webAPI `TextDecoder`,
but you can use this option if your client
runtime doesn't provide it.

#### Source

[packages/client/src/links/httpBatchStreamLink.ts:16](https://github.com/trpc/trpc/blob/caccce64/packages/client/src/links/httpBatchStreamLink.ts#L16)

***

### url

> **url**: `string` \| `URL`

#### Inherited from

[`HTTPBatchLinkOptions.url`](HTTPBatchLinkOptions.md#url)

#### Source

[packages/client/src/links/internals/httpUtils.ts:26](https://github.com/trpc/trpc/blob/caccce64/packages/client/src/links/internals/httpUtils.ts#L26)

***

Generated using [TypeDoc](https://typedoc.org) and [typedoc-plugin-markdown](https://typedoc-plugin-markdown.org).
