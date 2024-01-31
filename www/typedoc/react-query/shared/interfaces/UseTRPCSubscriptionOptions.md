# Interface: UseTRPCSubscriptionOptions\<TOutput, TError\>

## Type parameters

• **TOutput**

• **TError**

## Properties

### enabled?

> **enabled**?: `boolean`

#### Source

[packages/react-query/src/shared/hooks/types.ts:141](https://github.com/trpc/trpc/blob/caccce64/packages/react-query/src/shared/hooks/types.ts#L141)

***

### onData

> **onData**: (`data`) => `void`

#### Parameters

• **data**: `TOutput`

#### Returns

`void`

#### Source

[packages/react-query/src/shared/hooks/types.ts:143](https://github.com/trpc/trpc/blob/caccce64/packages/react-query/src/shared/hooks/types.ts#L143)

***

### onError?

> **onError**?: (`err`) => `void`

#### Parameters

• **err**: `TError`

#### Returns

`void`

#### Source

[packages/react-query/src/shared/hooks/types.ts:144](https://github.com/trpc/trpc/blob/caccce64/packages/react-query/src/shared/hooks/types.ts#L144)

***

### onStarted?

> **onStarted**?: () => `void`

#### Returns

`void`

#### Source

[packages/react-query/src/shared/hooks/types.ts:142](https://github.com/trpc/trpc/blob/caccce64/packages/react-query/src/shared/hooks/types.ts#L142)

***

Generated using [TypeDoc](https://typedoc.org) and [typedoc-plugin-markdown](https://typedoc-plugin-markdown.org).
