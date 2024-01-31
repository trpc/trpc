# Interface: WebSocketLinkOptions

## Properties

### client

> **client**: `Object`

#### Type declaration

##### close

> **close**: () => `void`

###### Returns

`void`

##### connection

> **`readonly`** **connection**: `null` \| \{ id: number; } & (\{ state: "open"; ws: WebSocket; } \| \{ state: "closed"; ws: WebSocket; } \| \{ state: "connecting"; ws?: WebSocket \| undefined; })

##### request

> **request**: (`op`, `callbacks`) => `UnsubscribeFn`

###### Parameters

• **op**: `Operation`

• **callbacks**: `WSCallbackObserver`\< `AnyRouter`, `unknown` \>

###### Returns

`UnsubscribeFn`

#### Source

packages/client/dist/links/wsLink.d.ts:66

***

Generated using [TypeDoc](https://typedoc.org) and [typedoc-plugin-markdown](https://typedoc-plugin-markdown.org).
