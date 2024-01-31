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

[packages/client/src/links/wsLink.ts:41](https://github.com/trpc/trpc/blob/caccce64/packages/client/src/links/wsLink.ts#L41)

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

[packages/client/src/links/wsLink.ts:58](https://github.com/trpc/trpc/blob/caccce64/packages/client/src/links/wsLink.ts#L58)

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

[packages/client/src/links/wsLink.ts:54](https://github.com/trpc/trpc/blob/caccce64/packages/client/src/links/wsLink.ts#L54)

***

### onOpen?

> **onOpen**?: () => `void`

Triggered when a WebSocket connection is established

#### Returns

`void`

#### Source

[packages/client/src/links/wsLink.ts:50](https://github.com/trpc/trpc/blob/caccce64/packages/client/src/links/wsLink.ts#L50)

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

[packages/client/src/links/wsLink.ts:46](https://github.com/trpc/trpc/blob/caccce64/packages/client/src/links/wsLink.ts#L46)

***

### url

> **url**: `string` \| () => `MaybePromise`\< `string` \>

The URL to connect to (can be a function that returns a URL)

#### Source

[packages/client/src/links/wsLink.ts:37](https://github.com/trpc/trpc/blob/caccce64/packages/client/src/links/wsLink.ts#L37)

***

Generated using [TypeDoc](https://typedoc.org) and [typedoc-plugin-markdown](https://typedoc-plugin-markdown.org).
