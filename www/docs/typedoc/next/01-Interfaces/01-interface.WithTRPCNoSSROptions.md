---
sidebar_label: WithTRPCNoSSROptions
pagination_prev: null
pagination_next: null
custom_edit_url: null
---

# Interface: WithTRPCNoSSROptions`<TRouter>`

## Extends

- `WithTRPCOptions`< `TRouter` \>

## Type parameters

| Parameter                       |
| :------------------------------ |
| `TRouter` _extends_ `AnyRouter` |

## Properties

### abortOnUnmount

> `optional` **abortOnUnmount**: `boolean`

Abort all queries when unmounting

#### Default

```ts
false;
```

#### Source

react-query/dist/shared/types.d.ts:34

#### Inherited from

WithTRPCOptions.abortOnUnmount

---

### config

> **config**: (`info`) => [`WithTRPCConfig`](../02-Type%20Aliases/01-type-alias.WithTRPCConfig.md)< `TRouter` \>

#### Parameters

| Parameter   | Type              |
| :---------- | :---------------- |
| `info`      | `object`          |
| `info.ctx`? | `NextPageContext` |

#### Returns

[`WithTRPCConfig`](../02-Type%20Aliases/01-type-alias.WithTRPCConfig.md)< `TRouter` \>

#### Source

[next/src/withTRPC.tsx:64](https://github.com/trpc/trpc/blob/caccce64/packages/next/src/withTRPC.tsx#L64)

#### Inherited from

WithTRPCOptions.config

---

### context

> `optional` **context**: `Context`< `any` \>

Override the default context provider

#### Default

```ts
undefined;
```

#### Source

react-query/dist/shared/types.d.ts:39

#### Inherited from

WithTRPCOptions.context

---

### overrides

> `optional` **overrides**: `object`

Override behaviors of the built-in hooks

#### Type declaration

> ##### overrides.useMutation
>
> `optional` **useMutation**: `Partial`< `UseMutationOverride` \>

#### Source

react-query/dist/shared/types.d.ts:27

#### Inherited from

WithTRPCOptions.overrides

---

### ssr

> `optional` **ssr**: `false`

#### Source

[next/src/withTRPC.tsx:77](https://github.com/trpc/trpc/blob/caccce64/packages/next/src/withTRPC.tsx#L77)

---

Generated using [TypeDoc](https://typedoc.org/) and [typedoc-plugin-markdown](https://www.npmjs.com/package/typedoc-plugin-markdown)