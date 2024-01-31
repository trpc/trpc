---
sidebar_label: createTRPCNext
pagination_prev: null
pagination_next: null
custom_edit_url: null
---

# Function: createTRPCNext()

> **createTRPCNext**\<`TRouter`, `TSSRContext`, `TFlags`\>(`opts`): `CreateTRPCNext`< `TRouter`, `TSSRContext`, `TFlags` \>

## Type parameters

| Parameter                                 | Default           |
| :---------------------------------------- | :---------------- |
| `TRouter` _extends_ `AnyRouter`           | -                 |
| `TSSRContext` _extends_ `NextPageContext` | `NextPageContext` |
| `TFlags`                                  | `null`            |

## Parameters

| Parameter | Type                                                                                                                                                                                       |
| :-------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `opts`    | [`WithTRPCNoSSROptions`](../01-Interfaces/01-interface.WithTRPCNoSSROptions.md)< `TRouter` \> \| [`WithTRPCSSROptions`](../01-Interfaces/02-interface.WithTRPCSSROptions.md)< `TRouter` \> |

## Returns

`CreateTRPCNext`< `TRouter`, `TSSRContext`, `TFlags` \>

## Source

[next/src/createTRPCNext.tsx:62](https://github.com/trpc/trpc/blob/caccce64/packages/next/src/createTRPCNext.tsx#L62)

---

Generated using [TypeDoc](https://typedoc.org/) and [typedoc-plugin-markdown](https://www.npmjs.com/package/typedoc-plugin-markdown)
