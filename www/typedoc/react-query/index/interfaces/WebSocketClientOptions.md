# Interface: WebSocketClientOptions

## Properties

### WebSocket?

> **WebSocket**?: (`url`, `protocols`?) => `WebSocket`

Ponyfill which WebSocket implementation to use

#### Parameters

• **url**: `string` \| `URL`

• **protocols?**: `string` \| `string`[]

#### Returns

`WebSocket`

#### Type declaration

##### CLOSED

> **`readonly`** **CLOSED**: `3`

##### CLOSING

> **`readonly`** **CLOSING**: `2`

##### CONNECTING

> **`readonly`** **CONNECTING**: `0`

##### OPEN

> **`readonly`** **OPEN**: `1`

##### prototype

> **prototype**: `WebSocket`

#### Source

packages/client/dist/links/wsLink.d.ts:16

***

### lazy?

> **lazy**?: `Object`

Lazy mode will close the WebSocket automatically after a period of inactivity (no messages sent or received and no pending requests)

#### Type declaration

##### closeMs

> **closeMs**: `number`

Close the WebSocket after this many milliseconds

###### Default

```ts
0
```

##### enabled

> **enabled**: `boolean`

Enable lazy mode

###### Default

```ts
false
```

#### Source

packages/client/dist/links/wsLink.d.ts:35

***

### onClose?

> **onClose**?: (`cause`?) => `void`

Triggered when a WebSocket connection is closed

#### Parameters

• **cause?**: `Object`

• **cause\.code?**: `number`

#### Returns

`void`

#### Source

packages/client/dist/links/wsLink.d.ts:29

***

### onOpen?

> **onOpen**?: () => `void`

Triggered when a WebSocket connection is established

#### Returns

`void`

#### Source

packages/client/dist/links/wsLink.d.ts:25

***

### retryDelayMs?

> **retryDelayMs**?: (`attemptIndex`) => `number`

The number of milliseconds before a reconnect is attempted.

#### Parameters

• **attemptIndex**: `number`

#### Returns

`number`

#### Default

```ts
{@link exponentialBackoff}
```

#### Source

packages/client/dist/links/wsLink.d.ts:21

***

### url

> **url**: `string` \| () => `MaybePromise`\< `string` \>

The URL to connect to (can be a function that returns a URL)

#### Source

packages/client/dist/links/wsLink.d.ts:12

***

Generated using [TypeDoc](https://typedoc.org) and [typedoc-plugin-markdown](https://typedoc-plugin-markdown.org).
