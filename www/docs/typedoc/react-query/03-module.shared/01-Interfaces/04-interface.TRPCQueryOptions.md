---
sidebar_label: TRPCQueryOptions
pagination_prev: null
pagination_next: null
custom_edit_url: null
---

# Interface: TRPCQueryOptions`<TData, TError>`

## Extends

- `DistributiveOmit`< `QueryOptions`< `TData`, `TError`, `TData`, `any` \>, `"queryKey"` \>.[`TRPCUseQueryBaseOptions`](06-interface.TRPCUseQueryBaseOptions.md)

## Type parameters

| Parameter |
| :-------- |
| `TData`   |
| `TError`  |

## Properties

### \_defaulted

> `optional` **\_defaulted**: `boolean`

#### Source

node_modules/.pnpm/@tanstack+query-core@5.0.0/node_modules/@tanstack/query-core/build/legacy/queryClient-5b892aba.d.ts:311

#### Inherited from

DistributiveOmit.\_defaulted

---

### behavior

> `optional` **behavior**: `QueryBehavior`< `TData`, `TError`, `TData`, `any` \>

#### Source

node_modules/.pnpm/@tanstack+query-core@5.0.0/node_modules/@tanstack/query-core/build/legacy/queryClient-5b892aba.d.ts:304

#### Inherited from

DistributiveOmit.behavior

---

### gcTime

> `optional` **gcTime**: `number`

#### Source

node_modules/.pnpm/@tanstack+query-core@5.0.0/node_modules/@tanstack/query-core/build/legacy/queryClient-5b892aba.d.ts:296

#### Inherited from

DistributiveOmit.gcTime

---

### initialData

> `optional` **initialData**: `TData` \| `InitialDataFunction`< `TData` \>

#### Source

node_modules/.pnpm/@tanstack+query-core@5.0.0/node_modules/@tanstack/query-core/build/legacy/queryClient-5b892aba.d.ts:302

#### Inherited from

DistributiveOmit.initialData

---

### initialDataUpdatedAt

> `optional` **initialDataUpdatedAt**: `number` \| () => `undefined` \| `number`

#### Source

node_modules/.pnpm/@tanstack+query-core@5.0.0/node_modules/@tanstack/query-core/build/legacy/queryClient-5b892aba.d.ts:303

#### Inherited from

DistributiveOmit.initialDataUpdatedAt

---

### maxPages

> `optional` **maxPages**: `number`

Maximum number of pages to store in the data of an infinite query.

#### Source

node_modules/.pnpm/@tanstack+query-core@5.0.0/node_modules/@tanstack/query-core/build/legacy/queryClient-5b892aba.d.ts:320

#### Inherited from

DistributiveOmit.maxPages

---

### meta

> `optional` **meta**: `Record`< `string`, `unknown` \>

Additional payload to be stored on each query.
Use this property to pass information that can be used in other places.

#### Source

node_modules/.pnpm/@tanstack+query-core@5.0.0/node_modules/@tanstack/query-core/build/legacy/queryClient-5b892aba.d.ts:316

#### Inherited from

DistributiveOmit.meta

---

### networkMode

> `optional` **networkMode**: `NetworkMode`

#### Source

node_modules/.pnpm/@tanstack+query-core@5.0.0/node_modules/@tanstack/query-core/build/legacy/queryClient-5b892aba.d.ts:295

#### Inherited from

DistributiveOmit.networkMode

---

### persister

> `optional` **persister**: (`queryFn`, `context`, `query`) => `NoInfer`< `TData` \> \| `Promise`< `NoInfer`< `TData` \> \>

#### Parameters

| Parameter          | Type                                                      |
| :----------------- | :-------------------------------------------------------- |
| `queryFn`          | `QueryFunction`< `NoInfer`< `TData` \>, `any`, `never` \> |
| `context`          | `object`                                                  |
| `context.meta`     | `undefined` \| `Record`< `string`, `unknown` \>           |
| `context.queryKey` | `any`                                                     |
| `context.signal`   | `AbortSignal`                                             |
| `query`            | `Query`< `unknown`, `Error`, `unknown`, `QueryKey` \>     |

#### Returns

`NoInfer`< `TData` \> \| `Promise`< `NoInfer`< `TData` \> \>

#### Source

node_modules/.pnpm/@tanstack+query-core@5.0.0/node_modules/@tanstack/query-core/build/legacy/queryClient-5b892aba.d.ts:298

#### Inherited from

DistributiveOmit.persister

---

### queryFn

> `optional` **queryFn**: `QueryFunction`< `TData`, `any`, `never` \>

#### Source

node_modules/.pnpm/@tanstack+query-core@5.0.0/node_modules/@tanstack/query-core/build/legacy/queryClient-5b892aba.d.ts:297

#### Inherited from

DistributiveOmit.queryFn

---

### queryHash

> `optional` **queryHash**: `string`

#### Source

node_modules/.pnpm/@tanstack+query-core@5.0.0/node_modules/@tanstack/query-core/build/legacy/queryClient-5b892aba.d.ts:299

#### Inherited from

DistributiveOmit.queryHash

---

### queryKey

> **queryKey**: `TRPCQueryKey`

#### Source

[packages/react-query/src/shared/hooks/types.ts:93](https://github.com/trpc/trpc/blob/caccce64/packages/react-query/src/shared/hooks/types.ts#L93)

---

### queryKeyHashFn

> `optional` **queryKeyHashFn**: `QueryKeyHashFunction`< `any` \>

#### Source

node_modules/.pnpm/@tanstack+query-core@5.0.0/node_modules/@tanstack/query-core/build/legacy/queryClient-5b892aba.d.ts:301

#### Inherited from

DistributiveOmit.queryKeyHashFn

---

### retry

> `optional` **retry**: `RetryValue`< `TError` \>

If `false`, failed queries will not retry by default.
If `true`, failed queries will retry infinitely., failureCount: num
If set to an integer number, e.g. 3, failed queries will retry until the failed query count meets that number.
If set to a function `(failureCount, error) => boolean` failed queries will retry until the function returns false.

#### Source

node_modules/.pnpm/@tanstack+query-core@5.0.0/node_modules/@tanstack/query-core/build/legacy/queryClient-5b892aba.d.ts:293

#### Inherited from

DistributiveOmit.retry

---

### retryDelay

> `optional` **retryDelay**: `RetryDelayValue`< `TError` \>

#### Source

node_modules/.pnpm/@tanstack+query-core@5.0.0/node_modules/@tanstack/query-core/build/legacy/queryClient-5b892aba.d.ts:294

#### Inherited from

DistributiveOmit.retryDelay

---

### structuralSharing

> `optional` **structuralSharing**: `boolean` \| \<T\>(`oldData`, `newData`) => `T`

Set this to `false` to disable structural sharing between query results.
Set this to a function which accepts the old and new data and returns resolved data of the same type to implement custom structural sharing logic.
Defaults to `true`.

#### Source

node_modules/.pnpm/@tanstack+query-core@5.0.0/node_modules/@tanstack/query-core/build/legacy/queryClient-5b892aba.d.ts:310

#### Inherited from

DistributiveOmit.structuralSharing

---

### trpc

> `optional` **trpc**: [`TRPCReactRequestOptions`](05-interface.TRPCReactRequestOptions.md)

tRPC-related options

#### Source

[packages/react-query/src/shared/hooks/types.ts:56](https://github.com/trpc/trpc/blob/caccce64/packages/react-query/src/shared/hooks/types.ts#L56)

#### Inherited from

[`TRPCUseQueryBaseOptions`](06-interface.TRPCUseQueryBaseOptions.md).[`trpc`](06-interface.TRPCUseQueryBaseOptions.md#trpc)

---

Generated using [TypeDoc](https://typedoc.org/) and [typedoc-plugin-markdown](https://www.npmjs.com/package/typedoc-plugin-markdown)
