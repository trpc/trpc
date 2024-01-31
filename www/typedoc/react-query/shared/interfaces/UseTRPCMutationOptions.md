# Interface: UseTRPCMutationOptions\<TInput, TError, TOutput, TContext\>

## Extends

- `UseMutationOptions`\< `TOutput`, `TError`, `TInput`, `TContext` \>.[`TRPCUseQueryBaseOptions`](TRPCUseQueryBaseOptions.md)

## Type parameters

• **TInput**

• **TError**

• **TOutput**

• **TContext** = `unknown`

## Properties

### gcTime?

> **gcTime**?: `number`

#### Inherited from

`UseMutationOptions.gcTime`

#### Source

node\_modules/.pnpm/@tanstack+query-core@5.0.0/node\_modules/@tanstack/query-core/build/legacy/queryClient-5b892aba.d.ts:604

***

### meta?

> **meta**?: `Record`\< `string`, `unknown` \>

#### Inherited from

`UseMutationOptions.meta`

#### Source

node\_modules/.pnpm/@tanstack+query-core@5.0.0/node\_modules/@tanstack/query-core/build/legacy/queryClient-5b892aba.d.ts:606

***

### mutationFn?

> **mutationFn**?: `MutationFunction`\< `TOutput`, `TInput` \>

#### Inherited from

`UseMutationOptions.mutationFn`

#### Source

node\_modules/.pnpm/@tanstack+query-core@5.0.0/node\_modules/@tanstack/query-core/build/legacy/queryClient-5b892aba.d.ts:595

***

### mutationKey?

> **mutationKey**?: `MutationKey`

#### Inherited from

`UseMutationOptions.mutationKey`

#### Source

node\_modules/.pnpm/@tanstack+query-core@5.0.0/node\_modules/@tanstack/query-core/build/legacy/queryClient-5b892aba.d.ts:596

***

### networkMode?

> **networkMode**?: `NetworkMode`

#### Inherited from

`UseMutationOptions.networkMode`

#### Source

node\_modules/.pnpm/@tanstack+query-core@5.0.0/node\_modules/@tanstack/query-core/build/legacy/queryClient-5b892aba.d.ts:603

***

### onError?

> **onError**?: (`error`, `variables`, `context`) => `unknown`

#### Parameters

• **error**: `TError`

• **variables**: `TInput`

• **context**: `undefined` \| `TContext`

#### Returns

`unknown`

#### Inherited from

`UseMutationOptions.onError`

#### Source

node\_modules/.pnpm/@tanstack+query-core@5.0.0/node\_modules/@tanstack/query-core/build/legacy/queryClient-5b892aba.d.ts:599

***

### onMutate?

> **onMutate**?: (`variables`) => `undefined` \| `TContext` \| `Promise`\< `undefined` \| `TContext` \>

#### Parameters

• **variables**: `TInput`

#### Returns

`undefined` \| `TContext` \| `Promise`\< `undefined` \| `TContext` \>

#### Inherited from

`UseMutationOptions.onMutate`

#### Source

node\_modules/.pnpm/@tanstack+query-core@5.0.0/node\_modules/@tanstack/query-core/build/legacy/queryClient-5b892aba.d.ts:597

***

### onSettled?

> **onSettled**?: (`data`, `error`, `variables`, `context`) => `unknown`

#### Parameters

• **data**: `undefined` \| `TOutput`

• **error**: `null` \| `TError`

• **variables**: `TInput`

• **context**: `undefined` \| `TContext`

#### Returns

`unknown`

#### Inherited from

`UseMutationOptions.onSettled`

#### Source

node\_modules/.pnpm/@tanstack+query-core@5.0.0/node\_modules/@tanstack/query-core/build/legacy/queryClient-5b892aba.d.ts:600

***

### onSuccess?

> **onSuccess**?: (`data`, `variables`, `context`) => `unknown`

#### Parameters

• **data**: `TOutput`

• **variables**: `TInput`

• **context**: `undefined` \| `TContext`

#### Returns

`unknown`

#### Inherited from

`UseMutationOptions.onSuccess`

#### Source

node\_modules/.pnpm/@tanstack+query-core@5.0.0/node\_modules/@tanstack/query-core/build/legacy/queryClient-5b892aba.d.ts:598

***

### retry?

> **retry**?: `RetryValue`\< `TError` \>

#### Inherited from

`UseMutationOptions.retry`

#### Source

node\_modules/.pnpm/@tanstack+query-core@5.0.0/node\_modules/@tanstack/query-core/build/legacy/queryClient-5b892aba.d.ts:601

***

### retryDelay?

> **retryDelay**?: `RetryDelayValue`\< `TError` \>

#### Inherited from

`UseMutationOptions.retryDelay`

#### Source

node\_modules/.pnpm/@tanstack+query-core@5.0.0/node\_modules/@tanstack/query-core/build/legacy/queryClient-5b892aba.d.ts:602

***

### throwOnError?

> **throwOnError**?: `boolean` \| (`error`) => `boolean`

#### Inherited from

`UseMutationOptions.throwOnError`

#### Source

node\_modules/.pnpm/@tanstack+query-core@5.0.0/node\_modules/@tanstack/query-core/build/legacy/queryClient-5b892aba.d.ts:609

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
