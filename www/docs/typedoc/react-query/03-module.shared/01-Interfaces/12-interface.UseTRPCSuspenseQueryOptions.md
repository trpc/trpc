---
sidebar_label: UseTRPCSuspenseQueryOptions
pagination_prev: null
pagination_next: null
custom_edit_url: null
---

# Interface: UseTRPCSuspenseQueryOptions`<TOutput, TData, TError>`

## Extends

- `DistributiveOmit`< `UseSuspenseQueryOptions`< `TOutput`, `TError`, `TData`, `any` \>, `"queryKey"` \>.[`TRPCUseQueryBaseOptions`](06-interface.TRPCUseQueryBaseOptions.md)

## Type parameters

| Parameter |
| :-------- |
| `TOutput` |
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

### \_optimisticResults

> `optional` **\_optimisticResults**: `"optimistic"` \| `"isRestoring"`

#### Source

node_modules/.pnpm/@tanstack+query-core@5.0.0/node_modules/@tanstack/query-core/build/legacy/queryClient-5b892aba.d.ts:420

#### Inherited from

DistributiveOmit.\_optimisticResults

---

### behavior

> `optional` **behavior**: `QueryBehavior`< `TOutput`, `TError`, `TOutput`, `any` \>

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

> `optional` **initialData**: `TOutput` \| `InitialDataFunction`< `TOutput` \>

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

### notifyOnChangeProps

> `optional` **notifyOnChangeProps**: `NotifyOnChangeProps`

If set, the component will only re-render if any of the listed properties change.
When set to `['data', 'error']`, the component will only re-render when the `data` or `error` properties change.
When set to `'all'`, the component will re-render whenever a query is updated.
When set to a function, the function will be executed to compute the list of properties.
By default, access to properties will be tracked, and the component will only re-render when one of the tracked properties change.

#### Source

node_modules/.pnpm/@tanstack+query-core@5.0.0/node_modules/@tanstack/query-core/build/legacy/queryClient-5b892aba.d.ts:397

#### Inherited from

DistributiveOmit.notifyOnChangeProps

---

### persister

> `optional` **persister**: (`queryFn`, `context`, `query`) => `NoInfer`< `TOutput` \> \| `Promise`< `NoInfer`< `TOutput` \> \>

#### Parameters

| Parameter          | Type                                                        |
| :----------------- | :---------------------------------------------------------- |
| `queryFn`          | `QueryFunction`< `NoInfer`< `TOutput` \>, `any`, `never` \> |
| `context`          | `object`                                                    |
| `context.meta`     | `undefined` \| `Record`< `string`, `unknown` \>             |
| `context.queryKey` | `any`                                                       |
| `context.signal`   | `AbortSignal`                                               |
| `query`            | `Query`< `unknown`, `Error`, `unknown`, `QueryKey` \>       |

#### Returns

`NoInfer`< `TOutput` \> \| `Promise`< `NoInfer`< `TOutput` \> \>

#### Source

node_modules/.pnpm/@tanstack+query-core@5.0.0/node_modules/@tanstack/query-core/build/legacy/queryClient-5b892aba.d.ts:298

#### Inherited from

DistributiveOmit.persister

---

### queryFn

> `optional` **queryFn**: `QueryFunction`< `TOutput`, `any`, `never` \>

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

### queryKeyHashFn

> `optional` **queryKeyHashFn**: `QueryKeyHashFunction`< `any` \>

#### Source

node_modules/.pnpm/@tanstack+query-core@5.0.0/node_modules/@tanstack/query-core/build/legacy/queryClient-5b892aba.d.ts:301

#### Inherited from

DistributiveOmit.queryKeyHashFn

---

### refetchInterval

> `optional` **refetchInterval**: `number` \| `false` \| (`query`) => `undefined` \| `number` \| `false`

If set to a number, the query will continuously refetch at this frequency in milliseconds.
If set to a function, the function will be executed with the latest data and query to compute a frequency
Defaults to `false`.

#### Source

node_modules/.pnpm/@tanstack+query-core@5.0.0/node_modules/@tanstack/query-core/build/legacy/queryClient-5b892aba.d.ts:355

#### Inherited from

DistributiveOmit.refetchInterval

---

### refetchIntervalInBackground

> `optional` **refetchIntervalInBackground**: `boolean`

If set to `true`, the query will continue to refetch while their tab/window is in the background.
Defaults to `false`.

#### Source

node_modules/.pnpm/@tanstack+query-core@5.0.0/node_modules/@tanstack/query-core/build/legacy/queryClient-5b892aba.d.ts:360

#### Inherited from

DistributiveOmit.refetchIntervalInBackground

---

### refetchOnMount

> `optional` **refetchOnMount**: `boolean` \| `"always"` \| (`query`) => `boolean` \| `"always"`

If set to `true`, the query will refetch on mount if the data is stale.
If set to `false`, will disable additional instances of a query to trigger background refetches.
If set to `'always'`, the query will always refetch on mount.
If set to a function, the function will be executed with the latest data and query to compute the value
Defaults to `true`.

#### Source

node_modules/.pnpm/@tanstack+query-core@5.0.0/node_modules/@tanstack/query-core/build/legacy/queryClient-5b892aba.d.ts:384

#### Inherited from

DistributiveOmit.refetchOnMount

---

### refetchOnReconnect

> `optional` **refetchOnReconnect**: `boolean` \| `"always"` \| (`query`) => `boolean` \| `"always"`

If set to `true`, the query will refetch on reconnect if the data is stale.
If set to `false`, the query will not refetch on reconnect.
If set to `'always'`, the query will always refetch on reconnect.
If set to a function, the function will be executed with the latest data and query to compute the value.
Defaults to the value of `networkOnline` (`true`)

#### Source

node_modules/.pnpm/@tanstack+query-core@5.0.0/node_modules/@tanstack/query-core/build/legacy/queryClient-5b892aba.d.ts:376

#### Inherited from

DistributiveOmit.refetchOnReconnect

---

### refetchOnWindowFocus

> `optional` **refetchOnWindowFocus**: `boolean` \| `"always"` \| (`query`) => `boolean` \| `"always"`

If set to `true`, the query will refetch on window focus if the data is stale.
If set to `false`, the query will not refetch on window focus.
If set to `'always'`, the query will always refetch on window focus.
If set to a function, the function will be executed with the latest data and query to compute the value.
Defaults to `true`.

#### Source

node_modules/.pnpm/@tanstack+query-core@5.0.0/node_modules/@tanstack/query-core/build/legacy/queryClient-5b892aba.d.ts:368

#### Inherited from

DistributiveOmit.refetchOnWindowFocus

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

### retryOnMount

> `optional` **retryOnMount**: `boolean`

If set to `false`, the query will not be retried on mount if it contains an error.
Defaults to `true`.

#### Source

node_modules/.pnpm/@tanstack+query-core@5.0.0/node_modules/@tanstack/query-core/build/legacy/queryClient-5b892aba.d.ts:389

#### Inherited from

DistributiveOmit.retryOnMount

---

### select

> `optional` **select**: (`data`) => `TData`

This option can be used to transform or select a part of the data returned by the query function.

#### Parameters

| Parameter | Type      |
| :-------- | :-------- |
| `data`    | `TOutput` |

#### Returns

`TData`

#### Source

node_modules/.pnpm/@tanstack+query-core@5.0.0/node_modules/@tanstack/query-core/build/legacy/queryClient-5b892aba.d.ts:409

#### Inherited from

DistributiveOmit.select

---

### staleTime

> `optional` **staleTime**: `number`

The time in milliseconds after data is considered stale.
If set to `Infinity`, the data will never be considered stale.

#### Source

node_modules/.pnpm/@tanstack+query-core@5.0.0/node_modules/@tanstack/query-core/build/legacy/queryClient-5b892aba.d.ts:349

#### Inherited from

DistributiveOmit.staleTime

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
