---
sidebar_label: TRPCUntypedClient
pagination_prev: null
pagination_next: null
custom_edit_url: null
---

# Class: TRPCUntypedClient`<TRouter>`

## Type parameters

| Parameter                       |
| :------------------------------ |
| `TRouter` _extends_ `AnyRouter` |

## Constructors

### constructor()

> **new TRPCUntypedClient**\<`TRouter`\>(`opts`): [`TRPCUntypedClient`](02-class.TRPCUntypedClient.md)< `TRouter` \>

<!-- markdownlint-disable MD024 -->

#### Type parameters

| Parameter                       |
| :------------------------------ |
| `TRouter` _extends_ `AnyRouter` |

#### Parameters

| Parameter | Type                                                                                                                                    |
| :-------- | :-------------------------------------------------------------------------------------------------------------------------------------- |
| `opts`    | `CreateTRPCClientBaseOptions`< `TRouter` \> & \{`links`: [`TRPCLink`](../04-Type%20Aliases/04-type-alias.TRPCLink.md)< `TRouter` \>[];} |

#### Returns

[`TRPCUntypedClient`](02-class.TRPCUntypedClient.md)< `TRouter` \>

#### Source

[packages/client/src/internals/TRPCUntypedClient.ts:94](https://github.com/trpc/trpc/blob/caccce64/packages/client/src/internals/TRPCUntypedClient.ts#L94)

## Properties

### runtime

> `readonly` **runtime**: [`TRPCClientRuntime`](../03-Interfaces/06-interface.TRPCClientRuntime.md)

#### Source

[packages/client/src/internals/TRPCUntypedClient.ts:91](https://github.com/trpc/trpc/blob/caccce64/packages/client/src/internals/TRPCUntypedClient.ts#L91)

## Methods

### mutation()

> **mutation**(
> `path`,
> `input`?,
> `opts`?): `Promise`< `unknown` \>

#### Parameters

| Parameter | Type                                                                        |
| :-------- | :-------------------------------------------------------------------------- |
| `path`    | `string`                                                                    |
| `input`?  | `unknown`                                                                   |
| `opts`?   | [`TRPCRequestOptions`](../03-Interfaces/07-interface.TRPCRequestOptions.md) |

#### Returns

`Promise`< `unknown` \>

#### Source

[packages/client/src/internals/TRPCUntypedClient.ts:192](https://github.com/trpc/trpc/blob/caccce64/packages/client/src/internals/TRPCUntypedClient.ts#L192)

---

### query()

> **query**(
> `path`,
> `input`?,
> `opts`?): `Promise`< `unknown` \>

#### Parameters

| Parameter | Type                                                                        |
| :-------- | :-------------------------------------------------------------------------- |
| `path`    | `string`                                                                    |
| `input`?  | `unknown`                                                                   |
| `opts`?   | [`TRPCRequestOptions`](../03-Interfaces/07-interface.TRPCRequestOptions.md) |

#### Returns

`Promise`< `unknown` \>

#### Source

[packages/client/src/internals/TRPCUntypedClient.ts:183](https://github.com/trpc/trpc/blob/caccce64/packages/client/src/internals/TRPCUntypedClient.ts#L183)

---

### subscription()

> **subscription**(
> `path`,
> `input`,
> `opts`): `Unsubscribable`

#### Parameters

| Parameter | Type                                                                                                                                                                                                   |
| :-------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `path`    | `string`                                                                                                                                                                                               |
| `input`   | `unknown`                                                                                                                                                                                              |
| `opts`    | `Partial`< `TRPCSubscriptionObserver`< `unknown`, [`TRPCClientError`](01-class.TRPCClientError.md)< `AnyRouter` \> \> \> & [`TRPCRequestOptions`](../03-Interfaces/07-interface.TRPCRequestOptions.md) |

#### Returns

`Unsubscribable`

#### Source

[packages/client/src/internals/TRPCUntypedClient.ts:201](https://github.com/trpc/trpc/blob/caccce64/packages/client/src/internals/TRPCUntypedClient.ts#L201)

---

Generated using [TypeDoc](https://typedoc.org/) and [typedoc-plugin-markdown](https://www.npmjs.com/package/typedoc-plugin-markdown)
