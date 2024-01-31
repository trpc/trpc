---
sidebar_label: withTRPC
pagination_prev: null
pagination_next: null
custom_edit_url: null
---

# Function: withTRPC()

> **withTRPC**\<`TRouter`, `TSSRContext`\>(`opts`): (`AppOrPage`) => `NextComponentType`

## Type parameters

| Parameter                                 | Default           |
| :---------------------------------------- | :---------------- |
| `TRouter` _extends_ `AnyRouter`           | -                 |
| `TSSRContext` _extends_ `NextPageContext` | `NextPageContext` |

## Parameters

| Parameter | Type                                                                                                                                                                                       |
| :-------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `opts`    | [`WithTRPCNoSSROptions`](../01-Interfaces/01-interface.WithTRPCNoSSROptions.md)< `TRouter` \> \| [`WithTRPCSSROptions`](../01-Interfaces/02-interface.WithTRPCSSROptions.md)< `TRouter` \> |

## Returns

> > (`AppOrPage`): `NextComponentType`
>
> ### Parameters
>
> | Parameter   | Type                                        |
> | :---------- | :------------------------------------------ |
> | `AppOrPage` | `NextComponentType`< `any`, `any`, `any` \> |
>
> ### Returns
>
> `NextComponentType`
>
> ### Source
>
> [next/src/withTRPC.tsx:93](https://github.com/trpc/trpc/blob/caccce64/packages/next/src/withTRPC.tsx#L93)

## Source

[next/src/withTRPC.tsx:80](https://github.com/trpc/trpc/blob/caccce64/packages/next/src/withTRPC.tsx#L80)

---

Generated using [TypeDoc](https://typedoc.org/) and [typedoc-plugin-markdown](https://www.npmjs.com/package/typedoc-plugin-markdown)
