# Type alias: inferReactQueryProcedureOptions\<TRouter\>

> **inferReactQueryProcedureOptions**\<`TRouter`\>: `{ [TKey in keyof TRouter["_def"]["record"]]: TRouter["_def"]["record"][TKey] extends infer TRouterOrProcedure ? TRouterOrProcedure extends AnyRouter ? inferReactQueryProcedureOptions<TRouterOrProcedure> : TRouterOrProcedure extends AnyMutationProcedure ? InferMutationOptions<TRouter["_def"]["_config"], TRouterOrProcedure> : TRouterOrProcedure extends AnyQueryProcedure ? InferQueryOptions<TRouter["_def"]["_config"], TRouterOrProcedure> : never : never }`

## Type parameters

• **TRouter** extends `AnyRouter`

## Source

[packages/react-query/src/utils/inferReactQueryProcedure.ts:72](https://github.com/trpc/trpc/blob/caccce64/packages/react-query/src/utils/inferReactQueryProcedure.ts#L72)

***

Generated using [TypeDoc](https://typedoc.org) and [typedoc-plugin-markdown](https://typedoc-plugin-markdown.org).
