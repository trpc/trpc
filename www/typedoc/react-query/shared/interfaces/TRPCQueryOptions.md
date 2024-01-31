# Interface: TRPCQueryOptions\<TData, TError\>

## Extends

- `DistributiveOmit`\< `QueryOptions`\< `TData`, `TError`, `TData`, `any` \>, `"queryKey"` \>.[`TRPCUseQueryBaseOptions`](TRPCUseQueryBaseOptions.md)

## Type parameters

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

### behavior?

> **behavior**?: `QueryBehavior`\< `TData`, `TError`, `TData`, `any` \>

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

> **initialData**?: `TData` \| `InitialDataFunction`\< `TData` \>

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

### persister?

> **persister**?: (`queryFn`, `context`, `query`) => `NoInfer`\< `TData` \> \| `Promise`\< `NoInfer`\< `TData` \> \>

#### Parameters

• **queryFn**: `QueryFunction`\< `NoInfer`\< `TData` \>, `any`, `never` \>

• **context**: `Object`

• **context\.meta**: `undefined` \| `Record`\< `string`, `unknown` \>

• **context\.queryKey**: `any`

• **context\.signal**: `AbortSignal`

• **query**: `Query`\< `unknown`, `Error`, `unknown`, `QueryKey` \>

#### Returns

`NoInfer`\< `TData` \> \| `Promise`\< `NoInfer`\< `TData` \> \>

#### Inherited from

`DistributiveOmit.persister`

#### Source

node\_modules/.pnpm/@tanstack+query-core@5.0.0/node\_modules/@tanstack/query-core/build/legacy/queryClient-5b892aba.d.ts:298

***

### queryFn?

> **queryFn**?: `QueryFunction`\< `TData`, `any`, `never` \>

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

### queryKey

> **queryKey**: `TRPCQueryKey`

#### Source

[packages/react-query/src/shared/hooks/types.ts:93](https://github.com/trpc/trpc/blob/caccce64/packages/react-query/src/shared/hooks/types.ts#L93)

***

### queryKeyHashFn?

> **queryKeyHashFn**?: `QueryKeyHashFunction`\< `any` \>

#### Inherited from

`DistributiveOmit.queryKeyHashFn`

#### Source

node\_modules/.pnpm/@tanstack+query-core@5.0.0/node\_modules/@tanstack/query-core/build/legacy/queryClient-5b892aba.d.ts:301

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
