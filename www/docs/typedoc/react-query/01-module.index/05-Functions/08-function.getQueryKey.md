---
sidebar_label: getQueryKey
pagination_prev: null
pagination_next: null
custom_edit_url: null
---

# Function: getQueryKey()

> **getQueryKey**\<`TConfig`, `TProcedureOrRouter`, `TFlags`\>(...`_params`): `TRPCQueryKey`

Method to extract the query key for a procedure

## Link

https://trpc.io/docs/v11/getQueryKey

## Type parameters

| Parameter                                                                                   |
| :------------------------------------------------------------------------------------------ |
| `TConfig` _extends_ `AnyRootConfig`                                                         |
| `TProcedureOrRouter` _extends_ `AnyMutationProcedure` \| `AnyQueryProcedure` \| `AnyRouter` |
| `TFlags`                                                                                    |

## Parameters

| Parameter    | Type                                                      |
| :----------- | :-------------------------------------------------------- |
| ...`_params` | `GetParams`< `TConfig`, `TProcedureOrRouter`, `TFlags` \> |

## Returns

`TRPCQueryKey`

## Source

[packages/react-query/src/internals/getQueryKey.ts:127](https://github.com/trpc/trpc/blob/caccce64/packages/react-query/src/internals/getQueryKey.ts#L127)

---

Generated using [TypeDoc](https://typedoc.org/) and [typedoc-plugin-markdown](https://www.npmjs.com/package/typedoc-plugin-markdown)
