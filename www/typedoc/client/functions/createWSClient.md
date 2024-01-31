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
> ### connection
>
> > **`get`** **connection**(): `null` \| `Connection`
>
> #### Returns
>
> `null` \| `Connection`
>

## Source

[packages/client/src/links/wsLink.ts:77](https://github.com/trpc/trpc/blob/caccce64/packages/client/src/links/wsLink.ts#L77)

***

Generated using [TypeDoc](https://typedoc.org) and [typedoc-plugin-markdown](https://typedoc-plugin-markdown.org).
