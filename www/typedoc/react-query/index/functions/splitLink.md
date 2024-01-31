# Function: splitLink()

> **splitLink**\<`TRouter`\>(`opts`): [`TRPCLink`](../type-aliases/TRPCLink.md)\< `TRouter` \>

## Type parameters

• **TRouter** extends `AnyRouter` = `AnyRouter`

## Parameters

• **opts**: `Object`

• **opts\.condition**: (`op`) => `boolean`

• **opts\.false**: [`TRPCLink`](../type-aliases/TRPCLink.md)\< `TRouter` \> \| [`TRPCLink`](../type-aliases/TRPCLink.md)\< `TRouter` \>[]

The link to execute next if the test function returns `false`.

• **opts\.true**: [`TRPCLink`](../type-aliases/TRPCLink.md)\< `TRouter` \> \| [`TRPCLink`](../type-aliases/TRPCLink.md)\< `TRouter` \>[]

The link to execute next if the test function returns `true`.

## Returns

[`TRPCLink`](../type-aliases/TRPCLink.md)\< `TRouter` \>

## Source

packages/client/dist/links/splitLink.d.ts:3

***

Generated using [TypeDoc](https://typedoc.org) and [typedoc-plugin-markdown](https://typedoc-plugin-markdown.org).
