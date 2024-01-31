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

packages/client/dist/links/internals/httpUtils.d.ts:17

***

### fetch?

> **fetch**?: `FetchEsque`

Add ponyfill for fetch

#### Inherited from

`HTTPLinkBaseOptions.fetch`

#### Source

packages/client/dist/links/internals/httpUtils.d.ts:13

***

### headers?

> **headers**?: `HTTPHeaders` \| (`opts`) => HTTPHeaders \| Promise\<HTTPHeaders\>

Headers to be set on outgoing requests or a callback that of said headers

#### Link

http://trpc.io/docs/client/headers

#### Source

packages/client/dist/links/HTTPBatchLinkOptions.d.ts:10

***

### maxURLLength?

> **maxURLLength**?: `number`

#### Source

packages/client/dist/links/HTTPBatchLinkOptions.d.ts:5

***

### url

> **url**: `string` \| `URL`

#### Inherited from

`HTTPLinkBaseOptions.url`

#### Source

packages/client/dist/links/internals/httpUtils.d.ts:9

***

Generated using [TypeDoc](https://typedoc.org) and [typedoc-plugin-markdown](https://typedoc-plugin-markdown.org).
