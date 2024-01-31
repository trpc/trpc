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

#### Type parameters

| Parameter                       |
| :------------------------------ |
| `TRouter` _extends_ `AnyRouter` |

#### Parameters

| Parameter | Type                                     |
| :-------- | :--------------------------------------- |
| `opts`    | `CreateTRPCClientOptions`< `TRouter` \> |

#### Returns

[`TRPCUntypedClient`](02-class.TRPCUntypedClient.md)< `TRouter` \>

#### Source

packages/client/dist/internals/TRPCUntypedClient.d.ts:55

## Properties

### runtime

> `readonly` **runtime**: [`TRPCClientRuntime`](../03-Interfaces/06-interface.TRPCClientRuntime.md)

#### Source

packages/client/dist/internals/TRPCUntypedClient.d.ts:53

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

packages/client/dist/internals/TRPCUntypedClient.d.ts:59

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

packages/client/dist/internals/TRPCUntypedClient.d.ts:58

---

### subscription()

> **subscription**(
> `path`,
> `input`,
> `opts`): `Unsubscribable`

#### Parameters

| Parameter | Type                                                                                                                                                                                                      |
| :-------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `path`    | `string`                                                                                                                                                                                                  |
| `input`   | `unknown`                                                                                                                                                                                                 |
| `opts`    | `Partial`< `TRPCSubscriptionObserver`< `unknown`, [`TRPCClientError`](01-class.TRPCClientError.md)< `AnyRouter` \> \> \> & [`TRPCRequestOptions`](../03-Interfaces/07-interface.TRPCRequestOptions.md) |

#### Returns

`Unsubscribable`

#### Source

packages/client/dist/internals/TRPCUntypedClient.d.ts:60

---

Generated using [TypeDoc](https://typedoc.org/) and [typedoc-plugin-markdown](https://www.npmjs.com/package/typedoc-plugin-markdown)
