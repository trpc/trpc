---
sidebar_label: TRPCReactRequestOptions
pagination_prev: null
pagination_next: null
custom_edit_url: null
---

# Interface: TRPCReactRequestOptions

## Extends

- `Omit`< [`TRPCRequestOptions`](../../01-module.index/03-Interfaces/07-interface.TRPCRequestOptions.md), `"signal"` \>

## Properties

### abortOnUnmount

> `optional` **abortOnUnmount**: `boolean`

Opt out or into aborting request on unmount

#### Source

[packages/react-query/src/shared/hooks/types.ts:49](https://github.com/trpc/trpc/blob/caccce64/packages/react-query/src/shared/hooks/types.ts#L49)

---

### context

> `optional` **context**: `OperationContext`

Pass additional context to links

#### Source

packages/client/dist/internals/TRPCUntypedClient.d.ts:35

#### Inherited from

Omit.context

---

### ssr

> `optional` **ssr**: `boolean`

Opt out of SSR for this query by passing `ssr: false`

#### Source

[packages/react-query/src/shared/hooks/types.ts:45](https://github.com/trpc/trpc/blob/caccce64/packages/react-query/src/shared/hooks/types.ts#L45)

---

Generated using [TypeDoc](https://typedoc.org/) and [typedoc-plugin-markdown](https://www.npmjs.com/package/typedoc-plugin-markdown)
