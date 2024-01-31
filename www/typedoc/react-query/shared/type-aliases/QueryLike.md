# Type alias: QueryLike\<TConfig, TProcedure\>

> **QueryLike**\<`TConfig`, `TProcedure`\>: `Object`

Use to request a query route which matches a given query procedure's interface

## Type parameters

• **TConfig** extends `AnyRootConfig`

• **TProcedure** extends `AnyProcedure`

## Type declaration

### useQuery

> **useQuery**: (`variables`, `opts`?) => `InferQueryResult`\< `TConfig`, `TProcedure` \>

#### Parameters

• **variables**: `inferProcedureInput`\< `TProcedure` \>

• **opts?**: `InferQueryOptions`\< `TConfig`, `TProcedure`, `any` \>

#### Returns

`InferQueryResult`\< `TConfig`, `TProcedure` \>

### useSuspenseQuery

> **useSuspenseQuery**: (`variables`, `opts`?) => `UseTRPCSuspenseQueryResult`\< `inferProcedureOutput`\< `TProcedure` \>, [`TRPCClientErrorLike`](../../index/type-aliases/TRPCClientErrorLike.md)\< `TConfig` \> \>

#### Parameters

• **variables**: `inferProcedureInput`\< `TProcedure` \>

• **opts?**: `InferQueryOptions`\< `TConfig`, `TProcedure`, `any` \>

#### Returns

`UseTRPCSuspenseQueryResult`\< `inferProcedureOutput`\< `TProcedure` \>, [`TRPCClientErrorLike`](../../index/type-aliases/TRPCClientErrorLike.md)\< `TConfig` \> \>

## Source

[packages/react-query/src/shared/polymorphism/queryLike.ts:18](https://github.com/trpc/trpc/blob/caccce64/packages/react-query/src/shared/polymorphism/queryLike.ts#L18)

***

Generated using [TypeDoc](https://typedoc.org) and [typedoc-plugin-markdown](https://typedoc-plugin-markdown.org).
