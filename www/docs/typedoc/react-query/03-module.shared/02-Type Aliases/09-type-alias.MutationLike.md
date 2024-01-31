---
sidebar_label: MutationLike
pagination_prev: null
pagination_next: null
custom_edit_url: null
---

# Type alias: MutationLike`<TConfig, TProcedure>`

> **MutationLike**: \<`TConfig`, `TProcedure`\> `object`

Use to describe a mutation route which matches a given mutation procedure's interface

## Type parameters

| Parameter                             |
| :------------------------------------ |
| `TConfig` _extends_ `AnyRootConfig`   |
| `TProcedure` _extends_ `AnyProcedure` |

## Type declaration

### useMutation

**useMutation**: (`opts`?) => `InferMutationResult`< `TConfig`, `TProcedure` \>

#### Parameters

| Parameter | Type                                               |
| :-------- | :------------------------------------------------- |
| `opts`?   | `InferMutationOptions`< `TConfig`, `TProcedure` \> |

#### Returns

`InferMutationResult`< `TConfig`, `TProcedure` \>

## Source

[packages/react-query/src/shared/polymorphism/mutationLike.ts:15](https://github.com/trpc/trpc/blob/caccce64/packages/react-query/src/shared/polymorphism/mutationLike.ts#L15)

---

Generated using [TypeDoc](https://typedoc.org/) and [typedoc-plugin-markdown](https://www.npmjs.com/package/typedoc-plugin-markdown)
