---
sidebar_label: TRPCContextPropsBase
pagination_prev: null
pagination_next: null
custom_edit_url: null
---

# Interface: TRPCContextPropsBase`<TRouter, TSSRContext>`

## Extended By

- [`TRPCContextProps`](01-interface.TRPCContextProps.md)

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
false
```

#### Source

[packages/react-query/src/internals/context.tsx:78](https://github.com/trpc/trpc/blob/caccce64/packages/react-query/src/internals/context.tsx#L78)

---

### client

> **client**: [`TRPCUntypedClient`](../../01-module.index/02-Classes/02-class.TRPCUntypedClient.md)< `TRouter` \>

The `TRPCClient`

#### Source

[packages/react-query/src/internals/context.tsx:58](https://github.com/trpc/trpc/blob/caccce64/packages/react-query/src/internals/context.tsx#L58)

---

### ssrContext

> `optional` **ssrContext**: `null` \| `TSSRContext`

The SSR context when server-side rendering

#### Default

```ts
null
```

#### Source

[packages/react-query/src/internals/context.tsx:63](https://github.com/trpc/trpc/blob/caccce64/packages/react-query/src/internals/context.tsx#L63)

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
false
```

#### Source

[packages/react-query/src/internals/context.tsx:72](https://github.com/trpc/trpc/blob/caccce64/packages/react-query/src/internals/context.tsx#L72)

---

Generated using [TypeDoc](https://typedoc.org/) and [typedoc-plugin-markdown](https://www.npmjs.com/package/typedoc-plugin-markdown)
