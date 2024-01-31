# Class: TRPCUntypedClient\<TRouter\>

## Type parameters

• **TRouter** extends `AnyRouter`

## Constructors

### new TRPCUntypedClient(opts)

> **new TRPCUntypedClient**\<`TRouter`\>(`opts`): [`TRPCUntypedClient`](TRPCUntypedClient.md)\< `TRouter` \>

#### Parameters

• **opts**: `CreateTRPCClientOptions`\< `TRouter` \>

#### Returns

[`TRPCUntypedClient`](TRPCUntypedClient.md)\< `TRouter` \>

#### Source

packages/client/dist/internals/TRPCUntypedClient.d.ts:55

## Properties

### runtime

> **`readonly`** **runtime**: [`TRPCClientRuntime`](../interfaces/TRPCClientRuntime.md)

#### Source

packages/client/dist/internals/TRPCUntypedClient.d.ts:53

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

packages/client/dist/internals/TRPCUntypedClient.d.ts:59

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

packages/client/dist/internals/TRPCUntypedClient.d.ts:58

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

packages/client/dist/internals/TRPCUntypedClient.d.ts:60

***

Generated using [TypeDoc](https://typedoc.org) and [typedoc-plugin-markdown](https://typedoc-plugin-markdown.org).
