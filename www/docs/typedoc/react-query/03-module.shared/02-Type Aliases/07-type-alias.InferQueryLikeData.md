---
sidebar_label: InferQueryLikeData
pagination_prev: null
pagination_next: null
custom_edit_url: null
---

# Type alias: InferQueryLikeData`<TQueryLike>`

> **InferQueryLikeData**: \<`TQueryLike`\> `TQueryLike` _extends_ [`QueryLike`](11-type-alias.QueryLike.md)< infer TConfig, infer TProcedure \> ? `inferTransformedProcedureOutput`< `TConfig`, `TProcedure` \> : `never`

Use to unwrap a QueryLike's data output

## Type parameters

| Parameter                                                                         |
| :-------------------------------------------------------------------------------- |
| `TQueryLike` _extends_ [`QueryLike`](11-type-alias.QueryLike.md)< `any`, `any` \> |

## Source

[packages/react-query/src/shared/polymorphism/queryLike.ts:47](https://github.com/trpc/trpc/blob/caccce64/packages/react-query/src/shared/polymorphism/queryLike.ts#L47)

---

Generated using [TypeDoc](https://typedoc.org/) and [typedoc-plugin-markdown](https://www.npmjs.com/package/typedoc-plugin-markdown)
