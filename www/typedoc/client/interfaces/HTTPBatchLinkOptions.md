# Interface: HTTPBatchLinkOptions

## Extends

- `HTTPLinkBaseOptions`

## Properties

### AbortController?

> **AbortController**?: `null` \| `AbortControllerEsque`

Add ponyfill for AbortController

#### Inherited from

`HTTPLinkBaseOptions.AbortController`

#### Source

[packages/client/src/links/internals/httpUtils.ts:34](https://github.com/trpc/trpc/blob/caccce64/packages/client/src/links/internals/httpUtils.ts#L34)

***

### fetch?

> **fetch**?: `FetchEsque`

Add ponyfill for fetch

#### Inherited from

`HTTPLinkBaseOptions.fetch`

#### Source

[packages/client/src/links/internals/httpUtils.ts:30](https://github.com/trpc/trpc/blob/caccce64/packages/client/src/links/internals/httpUtils.ts#L30)

***

### headers?

> **headers**?: `HTTPHeaders` \| (`opts`) => HTTPHeaders \| Promise\<HTTPHeaders\>

Headers to be set on outgoing requests or a callback that of said headers

#### Link

http://trpc.io/docs/client/headers

#### Source

[packages/client/src/links/HTTPBatchLinkOptions.ts:11](https://github.com/trpc/trpc/blob/caccce64/packages/client/src/links/HTTPBatchLinkOptions.ts#L11)

***

### maxURLLength?

> **maxURLLength**?: `number`

#### Source

[packages/client/src/links/HTTPBatchLinkOptions.ts:6](https://github.com/trpc/trpc/blob/caccce64/packages/client/src/links/HTTPBatchLinkOptions.ts#L6)

***

### url

> **url**: `string` \| `URL`

#### Inherited from

`HTTPLinkBaseOptions.url`

#### Source

[packages/client/src/links/internals/httpUtils.ts:26](https://github.com/trpc/trpc/blob/caccce64/packages/client/src/links/internals/httpUtils.ts#L26)

***

Generated using [TypeDoc](https://typedoc.org) and [typedoc-plugin-markdown](https://typedoc-plugin-markdown.org).
