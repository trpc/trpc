---
sidebar_label: httpLinkFactory
pagination_prev: null
pagination_next: null
custom_edit_url: null
---

# Function: httpLinkFactory()

> **httpLinkFactory**(`factoryOpts`): \<TRouter\>(`opts`) => [`TRPCLink`](../04-Type%20Aliases/04-type-alias.TRPCLink.md)< `TRouter` \>

## Parameters

| Parameter               | Type        |
| :---------------------- | :---------- |
| `factoryOpts`           | `object`    |
| `factoryOpts.requester` | `Requester` |

## Returns

> > \<`TRouter`\>(`opts`): [`TRPCLink`](../04-Type%20Aliases/04-type-alias.TRPCLink.md)< `TRouter` \>
>
> ### Type parameters
>
> | Parameter                       |
> | :------------------------------ |
> | `TRouter` _extends_ `AnyRouter` |
>
> ### Parameters
>
> | Parameter | Type                                                                  |
> | :-------- | :-------------------------------------------------------------------- |
> | `opts`    | [`HTTPLinkOptions`](../03-Interfaces/03-interface.HTTPLinkOptions.md) |
>
> ### Returns
>
> [`TRPCLink`](../04-Type%20Aliases/04-type-alias.TRPCLink.md)< `TRouter` \>
>
> ### Source
>
> [packages/client/src/links/httpLink.ts:27](https://github.com/trpc/trpc/blob/caccce64/packages/client/src/links/httpLink.ts#L27)

## Source

[packages/client/src/links/httpLink.ts:26](https://github.com/trpc/trpc/blob/caccce64/packages/client/src/links/httpLink.ts#L26)

---

Generated using [TypeDoc](https://typedoc.org/) and [typedoc-plugin-markdown](https://www.npmjs.com/package/typedoc-plugin-markdown)
