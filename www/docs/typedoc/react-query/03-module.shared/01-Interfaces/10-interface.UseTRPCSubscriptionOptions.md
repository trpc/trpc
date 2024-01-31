---
sidebar_label: UseTRPCSubscriptionOptions
pagination_prev: null
pagination_next: null
custom_edit_url: null
---

# Interface: UseTRPCSubscriptionOptions`<TOutput, TError>`

## Type parameters

| Parameter |
| :-------- |
| `TOutput` |
| `TError`  |

## Properties

### enabled

> `optional` **enabled**: `boolean`

#### Source

[packages/react-query/src/shared/hooks/types.ts:141](https://github.com/trpc/trpc/blob/caccce64/packages/react-query/src/shared/hooks/types.ts#L141)

---

### onData

> **onData**: (`data`) => `void`

#### Parameters

| Parameter | Type      |
| :-------- | :-------- |
| `data`    | `TOutput` |

#### Returns

`void`

#### Source

[packages/react-query/src/shared/hooks/types.ts:143](https://github.com/trpc/trpc/blob/caccce64/packages/react-query/src/shared/hooks/types.ts#L143)

---

### onError

> `optional` **onError**: (`err`) => `void`

#### Parameters

| Parameter | Type     |
| :-------- | :------- |
| `err`     | `TError` |

#### Returns

`void`

#### Source

[packages/react-query/src/shared/hooks/types.ts:144](https://github.com/trpc/trpc/blob/caccce64/packages/react-query/src/shared/hooks/types.ts#L144)

---

### onStarted

> `optional` **onStarted**: () => `void`

#### Returns

`void`

#### Source

[packages/react-query/src/shared/hooks/types.ts:142](https://github.com/trpc/trpc/blob/caccce64/packages/react-query/src/shared/hooks/types.ts#L142)

---

Generated using [TypeDoc](https://typedoc.org/) and [typedoc-plugin-markdown](https://www.npmjs.com/package/typedoc-plugin-markdown)
