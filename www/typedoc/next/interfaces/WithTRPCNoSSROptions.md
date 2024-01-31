# Interface: WithTRPCNoSSROptions\<TRouter\>

## Extends

- `WithTRPCOptions`\< `TRouter` \>

## Type parameters

• **TRouter** extends `AnyRouter`

## Properties

### abortOnUnmount?

> **abortOnUnmount**?: `boolean`

Abort all queries when unmounting

#### Default

```ts
false
```

#### Inherited from

`WithTRPCOptions.abortOnUnmount`

#### Source

react-query/dist/shared/types.d.ts:34

***

### config

> **config**: (`info`) => [`WithTRPCConfig`](../type-aliases/WithTRPCConfig.md)\< `TRouter` \>

#### Parameters

• **info**: `Object`

• **info\.ctx?**: `NextPageContext`

#### Returns

[`WithTRPCConfig`](../type-aliases/WithTRPCConfig.md)\< `TRouter` \>

#### Inherited from

`WithTRPCOptions.config`

#### Source

[next/src/withTRPC.tsx:64](https://github.com/trpc/trpc/blob/caccce64/packages/next/src/withTRPC.tsx#L64)

***

### context?

> **context**?: `Context`\< `any` \>

Override the default context provider

#### Default

```ts
undefined
```

#### Inherited from

`WithTRPCOptions.context`

#### Source

react-query/dist/shared/types.d.ts:39

***

### overrides?

> **overrides**?: `Object`

Override behaviors of the built-in hooks

#### Type declaration

##### useMutation?

> **useMutation**?: `Partial`\< `UseMutationOverride` \>

#### Inherited from

`WithTRPCOptions.overrides`

#### Source

react-query/dist/shared/types.d.ts:27

***

### ssr?

> **ssr**?: `false`

#### Source

[next/src/withTRPC.tsx:77](https://github.com/trpc/trpc/blob/caccce64/packages/next/src/withTRPC.tsx#L77)

***

Generated using [TypeDoc](https://typedoc.org) and [typedoc-plugin-markdown](https://typedoc-plugin-markdown.org).
