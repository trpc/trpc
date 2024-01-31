# Function: createWSClient()

> **createWSClient**(`opts`): `Object`

## Parameters

• **opts**: [`WebSocketClientOptions`](../interfaces/WebSocketClientOptions.md)

## Returns

`Object`

> ### close
>
> > **close**: () => `void`
>
> #### Returns
>
> `void`
>
> ### connection
>
> > **`readonly`** **connection**: `Object` & `Object` \| `Object` \| `Object` \| `null`
>
> ### request
>
> > **request**: (`op`, `callbacks`) => `UnsubscribeFn`
>
> #### Parameters
>
> • **op**: `Operation`
>
> • **callbacks**: `WSCallbackObserver`\< `AnyRouter`, `unknown` \>
>
> #### Returns
>
> `UnsubscribeFn`
>

## Source

packages/client/dist/links/wsLink.d.ts:48

***

Generated using [TypeDoc](https://typedoc.org) and [typedoc-plugin-markdown](https://typedoc-plugin-markdown.org).
