# Function: createServerSideHelpers()

> **createServerSideHelpers**\<`TRouter`\>(`opts`): `ProtectedIntersection`\< `Object`, `DecoratedProcedureSSGRecord`\< `TRouter` \> \>

Create functions you can use for server-side rendering / static generation

## Type parameters

• **TRouter** extends `AnyRouter`

## Parameters

• **opts**: `CreateServerSideHelpersOptions`\< `TRouter` \>

## Returns

`ProtectedIntersection`\< `Object`, `DecoratedProcedureSSGRecord`\< `TRouter` \> \>

> ### dehydrate
>
> > **dehydrate**: (`opts`?) => `DehydratedState`
>
> #### Parameters
>
> • **opts?**: `DehydrateOptions`
>
> #### Returns
>
> `DehydratedState`
>
> ### queryClient
>
> > **queryClient**: `QueryClient`
>

## Link

https://trpc.io/docs/v11/client/nextjs/server-side-helpers

## Source

[packages/react-query/src/server/ssgProxy.ts:129](https://github.com/trpc/trpc/blob/caccce64/packages/react-query/src/server/ssgProxy.ts#L129)

***

Generated using [TypeDoc](https://typedoc.org) and [typedoc-plugin-markdown](https://typedoc-plugin-markdown.org).
