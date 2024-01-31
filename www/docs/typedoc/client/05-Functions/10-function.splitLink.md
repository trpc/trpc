---
sidebar_label: splitLink
pagination_prev: null
pagination_next: null
custom_edit_url: null
---

# Function: splitLink()

> **splitLink**\<`TRouter`\>(`opts`): [`TRPCLink`](../04-Type%20Aliases/04-type-alias.TRPCLink.md)< `TRouter` \>

## Type parameters

| Parameter                       | Default     |
| :------------------------------ | :---------- |
| `TRouter` _extends_ `AnyRouter` | `AnyRouter` |

## Parameters

| Parameter        | Type                                                                                                                                                       | Description                                                    |
| :--------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------- |
| `opts`           | `object`                                                                                                                                                   | -                                                              |
| `opts.condition` | (`op`) => `boolean`                                                                                                                                        | -                                                              |
| `opts.false`     | [`TRPCLink`](../04-Type%20Aliases/04-type-alias.TRPCLink.md)< `TRouter` \> \| [`TRPCLink`](../04-Type%20Aliases/04-type-alias.TRPCLink.md)< `TRouter` \>[] | The link to execute next if the test function returns `false`. |
| `opts.true`      | [`TRPCLink`](../04-Type%20Aliases/04-type-alias.TRPCLink.md)< `TRouter` \> \| [`TRPCLink`](../04-Type%20Aliases/04-type-alias.TRPCLink.md)< `TRouter` \>[] | The link to execute next if the test function returns `true`.  |

## Returns

[`TRPCLink`](../04-Type%20Aliases/04-type-alias.TRPCLink.md)< `TRouter` \>

## Source

[packages/client/src/links/splitLink.ts:9](https://github.com/trpc/trpc/blob/caccce64/packages/client/src/links/splitLink.ts#L9)

---

Generated using [TypeDoc](https://typedoc.org/) and [typedoc-plugin-markdown](https://www.npmjs.com/package/typedoc-plugin-markdown)