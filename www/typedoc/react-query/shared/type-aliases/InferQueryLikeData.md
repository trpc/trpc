# Type alias: InferQueryLikeData\<TQueryLike\>

> **InferQueryLikeData**\<`TQueryLike`\>: `TQueryLike` extends [`QueryLike`](QueryLike.md)\< infer TConfig, infer TProcedure \> ? `inferTransformedProcedureOutput`\< `TConfig`, `TProcedure` \> : `never`

Use to unwrap a QueryLike's data output

## Type parameters

• **TQueryLike** extends [`QueryLike`](QueryLike.md)\< `any`, `any` \>

## Source

[packages/react-query/src/shared/polymorphism/queryLike.ts:47](https://github.com/trpc/trpc/blob/caccce64/packages/react-query/src/shared/polymorphism/queryLike.ts#L47)

***

Generated using [TypeDoc](https://typedoc.org) and [typedoc-plugin-markdown](https://typedoc-plugin-markdown.org).
