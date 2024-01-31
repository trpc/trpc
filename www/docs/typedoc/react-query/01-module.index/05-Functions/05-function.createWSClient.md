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

### connection

`readonly` **connection**: \{`id`: `number`;} & \{`state`: `"open"`; `ws`: `WebSocket`;} \| \{`state`: `"closed"`; `ws`: `WebSocket`;} \| \{`state`: `"connecting"`; `ws`: `WebSocket`;} \| `null`

### request

**request**: (`op`, `callbacks`) => `UnsubscribeFn`

#### Parameters

| Parameter   | Type                                            |
| :---------- | :---------------------------------------------- |
| `op`        | `Operation`                                     |
| `callbacks` | `WSCallbackObserver`< `AnyRouter`, `unknown` \> |

#### Returns

`UnsubscribeFn`

## Source

packages/client/dist/links/wsLink.d.ts:48

---

Generated using [TypeDoc](https://typedoc.org/) and [typedoc-plugin-markdown](https://www.npmjs.com/package/typedoc-plugin-markdown)
