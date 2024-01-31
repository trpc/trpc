---
sidebar_label: WebSocketClientOptions
pagination_prev: null
pagination_next: null
custom_edit_url: null
---

# Interface: WebSocketClientOptions

## Properties

### WebSocket

> `optional` **WebSocket**: (`url`, `protocols`?) => `WebSocket`

Ponyfill which WebSocket implementation to use

#### Parameters

| Parameter    | Type                   |
| :----------- | :--------------------- |
| `url`        | `string` \| `URL`      |
| `protocols`? | `string` \| `string`[] |

#### Returns

`WebSocket`

#### Type declaration

> ##### WebSocket.CLOSED
>
> `readonly` **CLOSED**: `3`
>
> ##### WebSocket.CLOSING
>
> `readonly` **CLOSING**: `2`
>
> ##### WebSocket.CONNECTING
>
> `readonly` **CONNECTING**: `0`
>
> ##### WebSocket.OPEN
>
> `readonly` **OPEN**: `1`
>
> ##### WebSocket.prototype
>
> **prototype**: `WebSocket`

#### Source

packages/client/dist/links/wsLink.d.ts:16

---

### lazy

> `optional` **lazy**: `object`

Lazy mode will close the WebSocket automatically after a period of inactivity (no messages sent or received and no pending requests)

#### Type declaration

> ##### lazy.closeMs
>
> **closeMs**: `number`
>
> Close the WebSocket after this many milliseconds
>
> ###### Default
>
> ```ts
> 0;
> ```
>
> ##### lazy.enabled
>
> **enabled**: `boolean`
>
> Enable lazy mode
>
> ###### Default
>
> ```ts
> false;
> ```

#### Source

packages/client/dist/links/wsLink.d.ts:35

---

### onClose

> `optional` **onClose**: (`cause`?) => `void`

Triggered when a WebSocket connection is closed

#### Parameters

| Parameter     | Type     |
| :------------ | :------- |
| `cause`?      | `object` |
| `cause.code`? | `number` |

#### Returns

`void`

#### Source

packages/client/dist/links/wsLink.d.ts:29

---

### onOpen

> `optional` **onOpen**: () => `void`

Triggered when a WebSocket connection is established

#### Returns

`void`

#### Source

packages/client/dist/links/wsLink.d.ts:25

---

### retryDelayMs

> `optional` **retryDelayMs**: (`attemptIndex`) => `number`

The number of milliseconds before a reconnect is attempted.

#### Default

```ts
{@link exponentialBackoff}
```

#### Parameters

| Parameter      | Type     |
| :------------- | :------- |
| `attemptIndex` | `number` |

#### Returns

`number`

#### Source

packages/client/dist/links/wsLink.d.ts:21

---

### url

> **url**: `string` \| () => `MaybePromise`< `string` \>

The URL to connect to (can be a function that returns a URL)

#### Source

packages/client/dist/links/wsLink.d.ts:12

---

Generated using [TypeDoc](https://typedoc.org/) and [typedoc-plugin-markdown](https://www.npmjs.com/package/typedoc-plugin-markdown)
