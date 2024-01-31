---
sidebar_label: QueryLike
pagination_prev: null
pagination_next: null
custom_edit_url: null
---

# Type alias: QueryLike`<TConfig, TProcedure>`

> **QueryLike**: \<`TConfig`, `TProcedure`\> `object`

Use to request a query route which matches a given query procedure's interface

## Type parameters

| Parameter                             |
| :------------------------------------ |
| `TConfig` _extends_ `AnyRootConfig`   |
| `TProcedure` _extends_ `AnyProcedure` |

## Type declaration

### useQuery

**useQuery**: (`variables`, `opts`?) => `InferQueryResult`< `TConfig`, `TProcedure` \>

#### Parameters

| Parameter   | Type                                                    |
| :---------- | :------------------------------------------------------ |
| `variables` | `inferProcedureInput`< `TProcedure` \>                 |
| `opts`?     | `InferQueryOptions`< `TConfig`, `TProcedure`, `any` \> |

#### Returns

`InferQueryResult`< `TConfig`, `TProcedure` \>

---

### useSuspenseQuery

**useSuspenseQuery**: (`variables`, `opts`?) => `UseTRPCSuspenseQueryResult`< `inferProcedureOutput`< `TProcedure` \>, [`TRPCClientErrorLike`](../../01-module.index/04-Type%20Aliases/03-type-alias.TRPCClientErrorLike.md)< `TConfig` \> \>

#### Parameters

| Parameter   | Type                                                    |
| :---------- | :------------------------------------------------------ |
| `variables` | `inferProcedureInput`< `TProcedure` \>                 |
| `opts`?     | `InferQueryOptions`< `TConfig`, `TProcedure`, `any` \> |

#### Returns

`UseTRPCSuspenseQueryResult`< `inferProcedureOutput`< `TProcedure` \>, [`TRPCClientErrorLike`](../../01-module.index/04-Type%20Aliases/03-type-alias.TRPCClientErrorLike.md)< `TConfig` \> \>

## Source

[packages/react-query/src/shared/polymorphism/queryLike.ts:18](https://github.com/trpc/trpc/blob/caccce64/packages/react-query/src/shared/polymorphism/queryLike.ts#L18)

---

Generated using [TypeDoc](https://typedoc.org/) and [typedoc-plugin-markdown](https://www.npmjs.com/package/typedoc-plugin-markdown)
