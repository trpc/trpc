---
sidebar_label: UseTRPCMutationOptions
pagination_prev: null
pagination_next: null
custom_edit_url: null
---

# Interface: UseTRPCMutationOptions`<TInput, TError, TOutput, TContext>`

## Extends

- `UseMutationOptions`< `TOutput`, `TError`, `TInput`, `TContext` \>.[`TRPCUseQueryBaseOptions`](06-interface.TRPCUseQueryBaseOptions.md)

## Type parameters

| Parameter  | Default   |
| :--------- | :-------- |
| `TInput`   | -         |
| `TError`   | -         |
| `TOutput`  | -         |
| `TContext` | `unknown` |

## Properties

### gcTime

> `optional` **gcTime**: `number`

#### Source

node_modules/.pnpm/@tanstack+query-core@5.0.0/node_modules/@tanstack/query-core/build/legacy/queryClient-5b892aba.d.ts:604

#### Inherited from

UseMutationOptions.gcTime

---

### meta

> `optional` **meta**: `Record`< `string`, `unknown` \>

#### Source

node_modules/.pnpm/@tanstack+query-core@5.0.0/node_modules/@tanstack/query-core/build/legacy/queryClient-5b892aba.d.ts:606

#### Inherited from

UseMutationOptions.meta

---

### mutationFn

> `optional` **mutationFn**: `MutationFunction`< `TOutput`, `TInput` \>

#### Source

node_modules/.pnpm/@tanstack+query-core@5.0.0/node_modules/@tanstack/query-core/build/legacy/queryClient-5b892aba.d.ts:595

#### Inherited from

UseMutationOptions.mutationFn

---

### mutationKey

> `optional` **mutationKey**: `MutationKey`

#### Source

node_modules/.pnpm/@tanstack+query-core@5.0.0/node_modules/@tanstack/query-core/build/legacy/queryClient-5b892aba.d.ts:596

#### Inherited from

UseMutationOptions.mutationKey

---

### networkMode

> `optional` **networkMode**: `NetworkMode`

#### Source

node_modules/.pnpm/@tanstack+query-core@5.0.0/node_modules/@tanstack/query-core/build/legacy/queryClient-5b892aba.d.ts:603

#### Inherited from

UseMutationOptions.networkMode

---

### onError

> `optional` **onError**: (`error`, `variables`, `context`) => `unknown`

#### Parameters

| Parameter   | Type                      |
| :---------- | :------------------------ |
| `error`     | `TError`                  |
| `variables` | `TInput`                  |
| `context`   | `undefined` \| `TContext` |

#### Returns

`unknown`

#### Source

node_modules/.pnpm/@tanstack+query-core@5.0.0/node_modules/@tanstack/query-core/build/legacy/queryClient-5b892aba.d.ts:599

#### Inherited from

UseMutationOptions.onError

---

### onMutate

> `optional` **onMutate**: (`variables`) => `undefined` \| `TContext` \| `Promise`< `undefined` \| `TContext` \>

#### Parameters

| Parameter   | Type     |
| :---------- | :------- |
| `variables` | `TInput` |

#### Returns

`undefined` \| `TContext` \| `Promise`< `undefined` \| `TContext` \>

#### Source

node_modules/.pnpm/@tanstack+query-core@5.0.0/node_modules/@tanstack/query-core/build/legacy/queryClient-5b892aba.d.ts:597

#### Inherited from

UseMutationOptions.onMutate

---

### onSettled

> `optional` **onSettled**: (`data`, `error`, `variables`, `context`) => `unknown`

#### Parameters

| Parameter   | Type                      |
| :---------- | :------------------------ |
| `data`      | `undefined` \| `TOutput`  |
| `error`     | `null` \| `TError`        |
| `variables` | `TInput`                  |
| `context`   | `undefined` \| `TContext` |

#### Returns

`unknown`

#### Source

node_modules/.pnpm/@tanstack+query-core@5.0.0/node_modules/@tanstack/query-core/build/legacy/queryClient-5b892aba.d.ts:600

#### Inherited from

UseMutationOptions.onSettled

---

### onSuccess

> `optional` **onSuccess**: (`data`, `variables`, `context`) => `unknown`

#### Parameters

| Parameter   | Type                      |
| :---------- | :------------------------ |
| `data`      | `TOutput`                 |
| `variables` | `TInput`                  |
| `context`   | `undefined` \| `TContext` |

#### Returns

`unknown`

#### Source

node_modules/.pnpm/@tanstack+query-core@5.0.0/node_modules/@tanstack/query-core/build/legacy/queryClient-5b892aba.d.ts:598

#### Inherited from

UseMutationOptions.onSuccess

---

### retry

> `optional` **retry**: `RetryValue`< `TError` \>

#### Source

node_modules/.pnpm/@tanstack+query-core@5.0.0/node_modules/@tanstack/query-core/build/legacy/queryClient-5b892aba.d.ts:601

#### Inherited from

UseMutationOptions.retry

---

### retryDelay

> `optional` **retryDelay**: `RetryDelayValue`< `TError` \>

#### Source

node_modules/.pnpm/@tanstack+query-core@5.0.0/node_modules/@tanstack/query-core/build/legacy/queryClient-5b892aba.d.ts:602

#### Inherited from

UseMutationOptions.retryDelay

---

### throwOnError

> `optional` **throwOnError**: `boolean` \| (`error`) => `boolean`

#### Source

node_modules/.pnpm/@tanstack+query-core@5.0.0/node_modules/@tanstack/query-core/build/legacy/queryClient-5b892aba.d.ts:609

#### Inherited from

UseMutationOptions.throwOnError

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
