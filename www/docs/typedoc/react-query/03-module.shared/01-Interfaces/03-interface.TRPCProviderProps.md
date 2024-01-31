---
sidebar_label: TRPCProviderProps
pagination_prev: null
pagination_next: null
custom_edit_url: null
---

# Interface: TRPCProviderProps`<TRouter, TSSRContext>`

## Extends

- [`TRPCContextProps`](01-interface.TRPCContextProps.md)< `TRouter`, `TSSRContext` \>

## Type parameters

| Parameter                       |
| :------------------------------ |
| `TRouter` _extends_ `AnyRouter` |
| `TSSRContext`                   |

## Properties

### abortOnUnmount

> `optional` **abortOnUnmount**: `boolean`

#### Deprecated

pass abortOnUnmount to `createTRPCReact` instead
Abort loading query calls when unmounting a component - usually when navigating to a new page

#### Default

```ts
false;
```

#### Source

[packages/react-query/src/internals/context.tsx:78](https://github.com/trpc/trpc/blob/caccce64/packages/react-query/src/internals/context.tsx#L78)

#### Inherited from

[`TRPCContextProps`](01-interface.TRPCContextProps.md).[`abortOnUnmount`](01-interface.TRPCContextProps.md#abortonunmount)

---

### children

> **children**: `ReactNode`

#### Source

[packages/react-query/src/shared/hooks/types.ts:148](https://github.com/trpc/trpc/blob/caccce64/packages/react-query/src/shared/hooks/types.ts#L148)

---

### client

> **client**: [`TRPCUntypedClient`](../../01-module.index/02-Classes/02-class.TRPCUntypedClient.md)< `TRouter` \>

The `TRPCClient`

#### Source

[packages/react-query/src/internals/context.tsx:58](https://github.com/trpc/trpc/blob/caccce64/packages/react-query/src/internals/context.tsx#L58)

#### Inherited from

[`TRPCContextProps`](01-interface.TRPCContextProps.md).[`client`](01-interface.TRPCContextProps.md#client)

---

### queryClient

> **queryClient**: `QueryClient`

The react-query `QueryClient`

#### Source

[packages/react-query/src/internals/context.tsx:96](https://github.com/trpc/trpc/blob/caccce64/packages/react-query/src/internals/context.tsx#L96)

#### Inherited from

[`TRPCContextProps`](01-interface.TRPCContextProps.md).[`queryClient`](01-interface.TRPCContextProps.md#queryclient)

---

### ssrContext

> `optional` **ssrContext**: `null` \| `TSSRContext`

The SSR context when server-side rendering

#### Default

```ts
null;
```

#### Source

[packages/react-query/src/internals/context.tsx:63](https://github.com/trpc/trpc/blob/caccce64/packages/react-query/src/internals/context.tsx#L63)

#### Inherited from

[`TRPCContextProps`](01-interface.TRPCContextProps.md).[`ssrContext`](01-interface.TRPCContextProps.md#ssrcontext)

---

### ssrState

> `optional` **ssrState**: `SSRState`

State of SSR hydration.

- `false` if not using SSR.
- `prepass` when doing a prepass to fetch queries' data
- `mounting` before TRPCProvider has been rendered on the client
- `mounted` when the TRPCProvider has been rendered on the client

#### Default

```ts
false;
```

#### Source

[packages/react-query/src/internals/context.tsx:72](https://github.com/trpc/trpc/blob/caccce64/packages/react-query/src/internals/context.tsx#L72)

#### Inherited from

[`TRPCContextProps`](01-interface.TRPCContextProps.md).[`ssrState`](01-interface.TRPCContextProps.md#ssrstate)

---

Generated using [TypeDoc](https://typedoc.org/) and [typedoc-plugin-markdown](https://www.npmjs.com/package/typedoc-plugin-markdown)
