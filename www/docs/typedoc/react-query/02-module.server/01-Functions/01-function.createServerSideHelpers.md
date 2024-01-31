---
sidebar_label: createServerSideHelpers
pagination_prev: null
pagination_next: null
custom_edit_url: null
---

# Function: createServerSideHelpers()

> **createServerSideHelpers**\<`TRouter`\>(`opts`): `ProtectedIntersection`< \{`dehydrate`: (`opts`?) => `DehydratedState`; `queryClient`: `QueryClient`;}, `DecoratedProcedureSSGRecord`< `TRouter` \> \>

Create functions you can use for server-side rendering / static generation

## Link

https://trpc.io/docs/v11/client/nextjs/server-side-helpers

## Type parameters

| Parameter                       |
| :------------------------------ |
| `TRouter` _extends_ `AnyRouter` |

## Parameters

| Parameter | Type                                            |
| :-------- | :---------------------------------------------- |
| `opts`    | `CreateServerSideHelpersOptions`< `TRouter` \> |

## Returns

`ProtectedIntersection`< \{`dehydrate`: (`opts`?) => `DehydratedState`; `queryClient`: `QueryClient`;}, `DecoratedProcedureSSGRecord`< `TRouter` \> \>

## Source

[packages/react-query/src/server/ssgProxy.ts:129](https://github.com/trpc/trpc/blob/caccce64/packages/react-query/src/server/ssgProxy.ts#L129)

---

Generated using [TypeDoc](https://typedoc.org/) and [typedoc-plugin-markdown](https://www.npmjs.com/package/typedoc-plugin-markdown)
