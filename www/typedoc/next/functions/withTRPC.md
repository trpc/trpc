# Function: withTRPC()

> **withTRPC**\<`TRouter`, `TSSRContext`\>(`opts`): (`AppOrPage`) => `NextComponentType`

## Type parameters

• **TRouter** extends `AnyRouter`

• **TSSRContext** extends `NextPageContext` = `NextPageContext`

## Parameters

• **opts**: [`WithTRPCNoSSROptions`](../interfaces/WithTRPCNoSSROptions.md)\< `TRouter` \> \| [`WithTRPCSSROptions`](../interfaces/WithTRPCSSROptions.md)\< `TRouter` \>

## Returns

`Function`

> ### Parameters
>
> • **AppOrPage**: `NextComponentType`\< `any`, `any`, `any` \>
>
> ### Returns
>
> `NextComponentType`
>

## Source

[next/src/withTRPC.tsx:80](https://github.com/trpc/trpc/blob/caccce64/packages/next/src/withTRPC.tsx#L80)

***

Generated using [TypeDoc](https://typedoc.org) and [typedoc-plugin-markdown](https://typedoc-plugin-markdown.org).
