# Type alias: MutationLike\<TConfig, TProcedure\>

> **MutationLike**\<`TConfig`, `TProcedure`\>: `Object`

Use to describe a mutation route which matches a given mutation procedure's interface

## Type parameters

• **TConfig** extends `AnyRootConfig`

• **TProcedure** extends `AnyProcedure`

## Type declaration

### useMutation

> **useMutation**: (`opts`?) => `InferMutationResult`\< `TConfig`, `TProcedure` \>

#### Parameters

• **opts?**: `InferMutationOptions`\< `TConfig`, `TProcedure` \>

#### Returns

`InferMutationResult`\< `TConfig`, `TProcedure` \>

## Source

[packages/react-query/src/shared/polymorphism/mutationLike.ts:15](https://github.com/trpc/trpc/blob/caccce64/packages/react-query/src/shared/polymorphism/mutationLike.ts#L15)

***

Generated using [TypeDoc](https://typedoc.org) and [typedoc-plugin-markdown](https://typedoc-plugin-markdown.org).
