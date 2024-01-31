# Interface: UseTRPCSuspenseQueryOptions\<TOutput, TData, TError\>

## Extends

- `DistributiveOmit`\< `UseSuspenseQueryOptions`\< `TOutput`, `TError`, `TData`, `any` \>, `"queryKey"` \>.[`TRPCUseQueryBaseOptions`](TRPCUseQueryBaseOptions.md)

## Type parameters

• **TOutput**

• **TData**

• **TError**

## Properties

### \_defaulted?

> **\_defaulted**?: `boolean`

#### Inherited from

`DistributiveOmit._defaulted`

#### Source

node\_modules/.pnpm/@tanstack+query-core@5.0.0/node\_modules/@tanstack/query-core/build/legacy/queryClient-5b892aba.d.ts:311

***

### \_optimisticResults?

> **\_optimisticResults**?: `"optimistic"` \| `"isRestoring"`

#### Inherited from

`DistributiveOmit._optimisticResults`

#### Source

node\_modules/.pnpm/@tanstack+query-core@5.0.0/node\_modules/@tanstack/query-core/build/legacy/queryClient-5b892aba.d.ts:420

***

### behavior?

> **behavior**?: `QueryBehavior`\< `TOutput`, `TError`, `TOutput`, `any` \>

#### Inherited from

`DistributiveOmit.behavior`

#### Source

node\_modules/.pnpm/@tanstack+query-core@5.0.0/node\_modules/@tanstack/query-core/build/legacy/queryClient-5b892aba.d.ts:304

***

### gcTime?

> **gcTime**?: `number`

#### Inherited from

`DistributiveOmit.gcTime`

#### Source

node\_modules/.pnpm/@tanstack+query-core@5.0.0/node\_modules/@tanstack/query-core/build/legacy/queryClient-5b892aba.d.ts:296

***

### initialData?

> **initialData**?: `TOutput` \| `InitialDataFunction`\< `TOutput` \>

#### Inherited from

`DistributiveOmit.initialData`

#### Source

node\_modules/.pnpm/@tanstack+query-core@5.0.0/node\_modules/@tanstack/query-core/build/legacy/queryClient-5b892aba.d.ts:302

***

### initialDataUpdatedAt?

> **initialDataUpdatedAt**?: `number` \| () => `undefined` \| `number`

#### Inherited from

`DistributiveOmit.initialDataUpdatedAt`

#### Source

node\_modules/.pnpm/@tanstack+query-core@5.0.0/node\_modules/@tanstack/query-core/build/legacy/queryClient-5b892aba.d.ts:303

***

### maxPages?

> **maxPages**?: `number`

Maximum number of pages to store in the data of an infinite query.

#### Inherited from

`DistributiveOmit.maxPages`

#### Source

node\_modules/.pnpm/@tanstack+query-core@5.0.0/node\_modules/@tanstack/query-core/build/legacy/queryClient-5b892aba.d.ts:320

***

### meta?

> **meta**?: `Record`\< `string`, `unknown` \>

Additional payload to be stored on each query.
Use this property to pass information that can be used in other places.

#### Inherited from

`DistributiveOmit.meta`

#### Source

node\_modules/.pnpm/@tanstack+query-core@5.0.0/node\_modules/@tanstack/query-core/build/legacy/queryClient-5b892aba.d.ts:316

***

### networkMode?

> **networkMode**?: `NetworkMode`

#### Inherited from

`DistributiveOmit.networkMode`

#### Source

node\_modules/.pnpm/@tanstack+query-core@5.0.0/node\_modules/@tanstack/query-core/build/legacy/queryClient-5b892aba.d.ts:295

***

### notifyOnChangeProps?

> **notifyOnChangeProps**?: `NotifyOnChangeProps`

If set, the component will only re-render if any of the listed properties change.
When set to `['data', 'error']`, the component will only re-render when the `data` or `error` properties change.
When set to `'all'`, the component will re-render whenever a query is updated.
When set to a function, the function will be executed to compute the list of properties.
By default, access to properties will be tracked, and the component will only re-render when one of the tracked properties change.

#### Inherited from

`DistributiveOmit.notifyOnChangeProps`

#### Source

node\_modules/.pnpm/@tanstack+query-core@5.0.0/node\_modules/@tanstack/query-core/build/legacy/queryClient-5b892aba.d.ts:397

***

### persister?

> **persister**?: (`queryFn`, `context`, `query`) => `NoInfer`\< `TOutput` \> \| `Promise`\< `NoInfer`\< `TOutput` \> \>

#### Parameters

• **queryFn**: `QueryFunction`\< `NoInfer`\< `TOutput` \>, `any`, `never` \>

• **context**: `Object`

• **context\.meta**: `undefined` \| `Record`\< `string`, `unknown` \>

• **context\.queryKey**: `any`

• **context\.signal**: `AbortSignal`

• **query**: `Query`\< `unknown`, `Error`, `unknown`, `QueryKey` \>

#### Returns

`NoInfer`\< `TOutput` \> \| `Promise`\< `NoInfer`\< `TOutput` \> \>

#### Inherited from

`DistributiveOmit.persister`

#### Source

node\_modules/.pnpm/@tanstack+query-core@5.0.0/node\_modules/@tanstack/query-core/build/legacy/queryClient-5b892aba.d.ts:298

***

### queryFn?

> **queryFn**?: `QueryFunction`\< `TOutput`, `any`, `never` \>

#### Inherited from

`DistributiveOmit.queryFn`

#### Source

node\_modules/.pnpm/@tanstack+query-core@5.0.0/node\_modules/@tanstack/query-core/build/legacy/queryClient-5b892aba.d.ts:297

***

### queryHash?

> **queryHash**?: `string`

#### Inherited from

`DistributiveOmit.queryHash`

#### Source

node\_modules/.pnpm/@tanstack+query-core@5.0.0/node\_modules/@tanstack/query-core/build/legacy/queryClient-5b892aba.d.ts:299

***

### queryKeyHashFn?

> **queryKeyHashFn**?: `QueryKeyHashFunction`\< `any` \>

#### Inherited from

`DistributiveOmit.queryKeyHashFn`

#### Source

node\_modules/.pnpm/@tanstack+query-core@5.0.0/node\_modules/@tanstack/query-core/build/legacy/queryClient-5b892aba.d.ts:301

***

### refetchInterval?

> **refetchInterval**?: `number` \| `false` \| (`query`) => `undefined` \| `number` \| `false`

If set to a number, the query will continuously refetch at this frequency in milliseconds.
If set to a function, the function will be executed with the latest data and query to compute a frequency
Defaults to `false`.

#### Inherited from

`DistributiveOmit.refetchInterval`

#### Source

node\_modules/.pnpm/@tanstack+query-core@5.0.0/node\_modules/@tanstack/query-core/build/legacy/queryClient-5b892aba.d.ts:355

***

### refetchIntervalInBackground?

> **refetchIntervalInBackground**?: `boolean`

If set to `true`, the query will continue to refetch while their tab/window is in the background.
Defaults to `false`.

#### Inherited from

`DistributiveOmit.refetchIntervalInBackground`

#### Source

node\_modules/.pnpm/@tanstack+query-core@5.0.0/node\_modules/@tanstack/query-core/build/legacy/queryClient-5b892aba.d.ts:360

***

### refetchOnMount?

> **refetchOnMount**?: `boolean` \| `"always"` \| (`query`) => `boolean` \| `"always"`

If set to `true`, the query will refetch on mount if the data is stale.
If set to `false`, will disable additional instances of a query to trigger background refetches.
If set to `'always'`, the query will always refetch on mount.
If set to a function, the function will be executed with the latest data and query to compute the value
Defaults to `true`.

#### Inherited from

`DistributiveOmit.refetchOnMount`

#### Source

node\_modules/.pnpm/@tanstack+query-core@5.0.0/node\_modules/@tanstack/query-core/build/legacy/queryClient-5b892aba.d.ts:384

***

### refetchOnReconnect?

> **refetchOnReconnect**?: `boolean` \| `"always"` \| (`query`) => `boolean` \| `"always"`

If set to `true`, the query will refetch on reconnect if the data is stale.
If set to `false`, the query will not refetch on reconnect.
If set to `'always'`, the query will always refetch on reconnect.
If set to a function, the function will be executed with the latest data and query to compute the value.
Defaults to the value of `networkOnline` (`true`)

#### Inherited from

`DistributiveOmit.refetchOnReconnect`

#### Source

node\_modules/.pnpm/@tanstack+query-core@5.0.0/node\_modules/@tanstack/query-core/build/legacy/queryClient-5b892aba.d.ts:376

***

### refetchOnWindowFocus?

> **refetchOnWindowFocus**?: `boolean` \| `"always"` \| (`query`) => `boolean` \| `"always"`

If set to `true`, the query will refetch on window focus if the data is stale.
If set to `false`, the query will not refetch on window focus.
If set to `'always'`, the query will always refetch on window focus.
If set to a function, the function will be executed with the latest data and query to compute the value.
Defaults to `true`.

#### Inherited from

`DistributiveOmit.refetchOnWindowFocus`

#### Source

node\_modules/.pnpm/@tanstack+query-core@5.0.0/node\_modules/@tanstack/query-core/build/legacy/queryClient-5b892aba.d.ts:368

***

### retry?

> **retry**?: `RetryValue`\< `TError` \>

If `false`, failed queries will not retry by default.
If `true`, failed queries will retry infinitely., failureCount: num
If set to an integer number, e.g. 3, failed queries will retry until the failed query count meets that number.
If set to a function `(failureCount, error) => boolean` failed queries will retry until the function returns false.

#### Inherited from

`DistributiveOmit.retry`

#### Source

node\_modules/.pnpm/@tanstack+query-core@5.0.0/node\_modules/@tanstack/query-core/build/legacy/queryClient-5b892aba.d.ts:293

***

### retryDelay?

> **retryDelay**?: `RetryDelayValue`\< `TError` \>

#### Inherited from

`DistributiveOmit.retryDelay`

#### Source

node\_modules/.pnpm/@tanstack+query-core@5.0.0/node\_modules/@tanstack/query-core/build/legacy/queryClient-5b892aba.d.ts:294

***

### retryOnMount?

> **retryOnMount**?: `boolean`

If set to `false`, the query will not be retried on mount if it contains an error.
Defaults to `true`.

#### Inherited from

`DistributiveOmit.retryOnMount`

#### Source

node\_modules/.pnpm/@tanstack+query-core@5.0.0/node\_modules/@tanstack/query-core/build/legacy/queryClient-5b892aba.d.ts:389

***

### select?

> **select**?: (`data`) => `TData`

This option can be used to transform or select a part of the data returned by the query function.

#### Parameters

• **data**: `TOutput`

#### Returns

`TData`

#### Inherited from

`DistributiveOmit.select`

#### Source

node\_modules/.pnpm/@tanstack+query-core@5.0.0/node\_modules/@tanstack/query-core/build/legacy/queryClient-5b892aba.d.ts:409

***

### staleTime?

> **staleTime**?: `number`

The time in milliseconds after data is considered stale.
If set to `Infinity`, the data will never be considered stale.

#### Inherited from

`DistributiveOmit.staleTime`

#### Source

node\_modules/.pnpm/@tanstack+query-core@5.0.0/node\_modules/@tanstack/query-core/build/legacy/queryClient-5b892aba.d.ts:349

***

### structuralSharing?

> **structuralSharing**?: `boolean` \| \<`T`\>(`oldData`, `newData`) => `T`

Set this to `false` to disable structural sharing between query results.
Set this to a function which accepts the old and new data and returns resolved data of the same type to implement custom structural sharing logic.
Defaults to `true`.

#### Inherited from

`DistributiveOmit.structuralSharing`

#### Source

node\_modules/.pnpm/@tanstack+query-core@5.0.0/node\_modules/@tanstack/query-core/build/legacy/queryClient-5b892aba.d.ts:310

***

### trpc?

> **trpc**?: [`TRPCReactRequestOptions`](TRPCReactRequestOptions.md)

tRPC-related options

#### Inherited from

[`shared.TRPCUseQueryBaseOptions.trpc`](TRPCUseQueryBaseOptions.md#trpc)

#### Source

[packages/react-query/src/shared/hooks/types.ts:56](https://github.com/trpc/trpc/blob/caccce64/packages/react-query/src/shared/hooks/types.ts#L56)

***

Generated using [TypeDoc](https://typedoc.org) and [typedoc-plugin-markdown](https://typedoc-plugin-markdown.org).
