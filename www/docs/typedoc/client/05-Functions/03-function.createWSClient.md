---
sidebar_label: createWSClient
pagination_prev: null
pagination_next: null
custom_edit_url: null
---

# Function: createWSClient()

> **createWSClient**(`opts`): `object`

## Parameters

| Parameter | Type                                                                                |
| :-------- | :---------------------------------------------------------------------------------- |
| `opts`    | [`WebSocketClientOptions`](../03-Interfaces/08-interface.WebSocketClientOptions.md) |

## Returns

### close

**close**: () => `void`

#### Returns

`void`

### request

**request**: (`op`, `callbacks`) => `UnsubscribeFn`

#### Parameters

| Parameter   | Type                                            |
| :---------- | :---------------------------------------------- |
| `op`        | `Operation`                                     |
| `callbacks` | `WSCallbackObserver`< `AnyRouter`, `unknown` \> |

#### Returns

`UnsubscribeFn`

### connection

`get` connection(): `null` \| `Connection`

## Source

[packages/client/src/links/wsLink.ts:77](https://github.com/trpc/trpc/blob/caccce64/packages/client/src/links/wsLink.ts#L77)

---

Generated using [TypeDoc](https://typedoc.org/) and [typedoc-plugin-markdown](https://www.npmjs.com/package/typedoc-plugin-markdown)
