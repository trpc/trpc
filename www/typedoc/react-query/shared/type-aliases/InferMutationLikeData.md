# Type alias: InferMutationLikeData\<TMutationLike\>

> **InferMutationLikeData**\<`TMutationLike`\>: `TMutationLike` extends [`MutationLike`](MutationLike.md)\< infer TConfig, infer TProcedure \> ? `inferTransformedProcedureOutput`\< `TConfig`, `TProcedure` \> : `never`

Use to unwrap a MutationLike's data output

## Type parameters

• **TMutationLike** extends [`MutationLike`](MutationLike.md)\< `any`, `any` \>

## Source

[packages/react-query/src/shared/polymorphism/mutationLike.ts:36](https://github.com/trpc/trpc/blob/caccce64/packages/react-query/src/shared/polymorphism/mutationLike.ts#L36)

***

Generated using [TypeDoc](https://typedoc.org) and [typedoc-plugin-markdown](https://typedoc-plugin-markdown.org).
