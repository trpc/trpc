# Class: TRPCUntypedClient\<TRouter\>

## Type parameters

• **TRouter** extends `AnyRouter`

## Constructors

### new TRPCUntypedClient(opts)

> **new TRPCUntypedClient**\<`TRouter`\>(`opts`): [`TRPCUntypedClient`](TRPCUntypedClient.md)\< `TRouter` \>

#### Parameters

• **opts**: `CreateTRPCClientBaseOptions`\< `TRouter` \> & `Object`

#### Returns

[`TRPCUntypedClient`](TRPCUntypedClient.md)\< `TRouter` \>

#### Source

[packages/client/src/internals/TRPCUntypedClient.ts:94](https://github.com/trpc/trpc/blob/caccce64/packages/client/src/internals/TRPCUntypedClient.ts#L94)

## Properties

### runtime

> **`readonly`** **runtime**: [`TRPCClientRuntime`](../interfaces/TRPCClientRuntime.md)

#### Source

[packages/client/src/internals/TRPCUntypedClient.ts:91](https://github.com/trpc/trpc/blob/caccce64/packages/client/src/internals/TRPCUntypedClient.ts#L91)

## Methods

### mutation()

> **mutation**(`path`, `input`?, `opts`?): `Promise`\< `unknown` \>

#### Parameters

• **path**: `string`

• **input?**: `unknown`

• **opts?**: [`TRPCRequestOptions`](../interfaces/TRPCRequestOptions.md)

#### Returns

`Promise`\< `unknown` \>

#### Source

[packages/client/src/internals/TRPCUntypedClient.ts:192](https://github.com/trpc/trpc/blob/caccce64/packages/client/src/internals/TRPCUntypedClient.ts#L192)

***

### query()

> **query**(`path`, `input`?, `opts`?): `Promise`\< `unknown` \>

#### Parameters

• **path**: `string`

• **input?**: `unknown`

• **opts?**: [`TRPCRequestOptions`](../interfaces/TRPCRequestOptions.md)

#### Returns

`Promise`\< `unknown` \>

#### Source

[packages/client/src/internals/TRPCUntypedClient.ts:183](https://github.com/trpc/trpc/blob/caccce64/packages/client/src/internals/TRPCUntypedClient.ts#L183)

***

### subscription()

> **subscription**(`path`, `input`, `opts`): `Unsubscribable`

#### Parameters

• **path**: `string`

• **input**: `unknown`

• **opts**: `Partial`\< `TRPCSubscriptionObserver`\< `unknown`, [`TRPCClientError`](TRPCClientError.md)\< `AnyRouter` \> \> \> & [`TRPCRequestOptions`](../interfaces/TRPCRequestOptions.md)

#### Returns

`Unsubscribable`

#### Source

[packages/client/src/internals/TRPCUntypedClient.ts:201](https://github.com/trpc/trpc/blob/caccce64/packages/client/src/internals/TRPCUntypedClient.ts#L201)

***

Generated using [TypeDoc](https://typedoc.org) and [typedoc-plugin-markdown](https://typedoc-plugin-markdown.org).
