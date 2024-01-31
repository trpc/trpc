---
sidebar_label: InferMutationLikeData
pagination_prev: null
pagination_next: null
custom_edit_url: null
---

# Type alias: InferMutationLikeData`<TMutationLike>`

> **InferMutationLikeData**: \<`TMutationLike`\> `TMutationLike` _extends_ [`MutationLike`](09-type-alias.MutationLike.md)< infer TConfig, infer TProcedure \> ? `inferTransformedProcedureOutput`< `TConfig`, `TProcedure` \> : `never`

Use to unwrap a MutationLike's data output

## Type parameters

| Parameter                                                                                  |
| :----------------------------------------------------------------------------------------- |
| `TMutationLike` _extends_ [`MutationLike`](09-type-alias.MutationLike.md)< `any`, `any` \> |

## Source

[packages/react-query/src/shared/polymorphism/mutationLike.ts:36](https://github.com/trpc/trpc/blob/caccce64/packages/react-query/src/shared/polymorphism/mutationLike.ts#L36)

---

Generated using [TypeDoc](https://typedoc.org/) and [typedoc-plugin-markdown](https://www.npmjs.com/package/typedoc-plugin-markdown)
