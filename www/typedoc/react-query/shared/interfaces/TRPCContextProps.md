# Interface: TRPCContextProps\<TRouter, TSSRContext\>

## Extends

- [`TRPCContextPropsBase`](TRPCContextPropsBase.md)\< `TRouter`, `TSSRContext` \>

## Type parameters

• **TRouter** extends `AnyRouter`

• **TSSRContext**

## Properties

### ~~abortOnUnmount?~~

> **abortOnUnmount**?: `boolean`

#### Deprecated

pass abortOnUnmount to `createTRPCReact` instead
Abort loading query calls when unmounting a component - usually when navigating to a new page

#### Default

```ts
false
```

#### Inherited from

[`shared.TRPCContextPropsBase.abortOnUnmount`](TRPCContextPropsBase.md#abortonunmount)

#### Source

[packages/react-query/src/internals/context.tsx:78](https://github.com/trpc/trpc/blob/caccce64/packages/react-query/src/internals/context.tsx#L78)

***

### client

> **client**: [`TRPCUntypedClient`](../../index/classes/TRPCUntypedClient.md)\< `TRouter` \>

The `TRPCClient`

#### Inherited from

[`shared.TRPCContextPropsBase.client`](TRPCContextPropsBase.md#client)

#### Source

[packages/react-query/src/internals/context.tsx:58](https://github.com/trpc/trpc/blob/caccce64/packages/react-query/src/internals/context.tsx#L58)

***

### queryClient

> **queryClient**: `QueryClient`

The react-query `QueryClient`

#### Source

[packages/react-query/src/internals/context.tsx:96](https://github.com/trpc/trpc/blob/caccce64/packages/react-query/src/internals/context.tsx#L96)

***

### ssrContext?

> **ssrContext**?: `null` \| `TSSRContext`

The SSR context when server-side rendering

#### Default

```ts
null
```

#### Inherited from

[`shared.TRPCContextPropsBase.ssrContext`](TRPCContextPropsBase.md#ssrcontext)

#### Source

[packages/react-query/src/internals/context.tsx:63](https://github.com/trpc/trpc/blob/caccce64/packages/react-query/src/internals/context.tsx#L63)

***

### ssrState?

> **ssrState**?: `SSRState`

State of SSR hydration.
- `false` if not using SSR.
- `prepass` when doing a prepass to fetch queries' data
- `mounting` before TRPCProvider has been rendered on the client
- `mounted` when the TRPCProvider has been rendered on the client

#### Default

```ts
false
```

#### Inherited from

[`shared.TRPCContextPropsBase.ssrState`](TRPCContextPropsBase.md#ssrstate)

#### Source

[packages/react-query/src/internals/context.tsx:72](https://github.com/trpc/trpc/blob/caccce64/packages/react-query/src/internals/context.tsx#L72)

***

Generated using [TypeDoc](https://typedoc.org) and [typedoc-plugin-markdown](https://typedoc-plugin-markdown.org).
