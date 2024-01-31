---
sidebar_label: TRPCFetch
pagination_prev: null
pagination_next: null
custom_edit_url: null
---

# Type alias: TRPCFetch

> **TRPCFetch**: (`url`, `options`?) => `Promise`< `ResponseEsque` \>

The default `fetch` implementation has an overloaded signature. By convention this library
only uses the overload taking a string and options object.

## Parameters

| Parameter  | Type          |
| :--------- | :------------ |
| `url`      | `string`      |
| `options`? | `RequestInit` |

## Returns

`Promise`< `ResponseEsque` \>

## Source

[packages/client/src/links/types.ts:56](https://github.com/trpc/trpc/blob/caccce64/packages/client/src/links/types.ts#L56)

---

Generated using [TypeDoc](https://typedoc.org/) and [typedoc-plugin-markdown](https://www.npmjs.com/package/typedoc-plugin-markdown)
