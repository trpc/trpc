# Type alias: TRPCFetch

> **TRPCFetch**: (`url`, `options`?) => `Promise`\< `ResponseEsque` \>

The default `fetch` implementation has an overloaded signature. By convention this library
only uses the overload taking a string and options object.

## Parameters

• **url**: `string`

• **options?**: `RequestInit`

## Returns

`Promise`\< `ResponseEsque` \>

## Source

[packages/client/src/links/types.ts:56](https://github.com/trpc/trpc/blob/caccce64/packages/client/src/links/types.ts#L56)

***

Generated using [TypeDoc](https://typedoc.org) and [typedoc-plugin-markdown](https://typedoc-plugin-markdown.org).
