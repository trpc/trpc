# Type alias: RouterLikeInner\<TConfig, TProcedures\>

> **RouterLikeInner**\<`TConfig`, `TProcedures`\>: `{ [TKey in keyof TProcedures]: TProcedures[TKey] extends AnyRouter ? RouterLikeInner<TConfig, TProcedures[TKey]["_def"]["record"]> : TProcedures[TKey] extends AnyQueryProcedure ? QueryLike<TConfig, TProcedures[TKey]> : TProcedures[TKey] extends AnyMutationProcedure ? MutationLike<TConfig, TProcedures[TKey]> : never }`

## Type parameters

• **TConfig** extends `AnyRootConfig`

• **TProcedures** extends `AnyProcedure`

## Source

[packages/react-query/src/shared/polymorphism/routerLike.ts:18](https://github.com/trpc/trpc/blob/caccce64/packages/react-query/src/shared/polymorphism/routerLike.ts#L18)

***

Generated using [TypeDoc](https://typedoc.org) and [typedoc-plugin-markdown](https://typedoc-plugin-markdown.org).
