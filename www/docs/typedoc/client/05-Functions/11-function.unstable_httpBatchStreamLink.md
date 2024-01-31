---
sidebar_label: unstable_httpBatchStreamLink
pagination_prev: null
pagination_next: null
custom_edit_url: null
---

# Function: unstable_httpBatchStreamLink()

> **unstable_httpBatchStreamLink**\<`TRouter`\>(`opts`): [`TRPCLink`](../04-Type%20Aliases/04-type-alias.TRPCLink.md)< `TRouter` \>

## Type parameters

| Parameter                       |
| :------------------------------ |
| `TRouter` _extends_ `AnyRouter` |

## Parameters

| Parameter | Type                                                                                        |
| :-------- | :------------------------------------------------------------------------------------------ |
| `opts`    | [`HTTPBatchStreamLinkOptions`](../03-Interfaces/02-interface.HTTPBatchStreamLinkOptions.md) |

## Returns

[`TRPCLink`](../04-Type%20Aliases/04-type-alias.TRPCLink.md)< `TRouter` \>

## Source

[packages/client/src/links/internals/createHTTPBatchLink.ts:42](https://github.com/trpc/trpc/blob/caccce64/packages/client/src/links/internals/createHTTPBatchLink.ts#L42)

---

Generated using [TypeDoc](https://typedoc.org/) and [typedoc-plugin-markdown](https://www.npmjs.com/package/typedoc-plugin-markdown)
