---
sidebar_label: WebSocketLinkOptions
pagination_prev: null
pagination_next: null
custom_edit_url: null
---

# Interface: WebSocketLinkOptions

## Properties

### client

> **client**: `object`

#### Type declaration

> ##### client.close
>
> **close**: () => `void`
>
> ###### Returns
>
> `void`
>
> ##### client.connection
>
> `readonly` **connection**: `null` \| `Object`
>
> ##### client.request
>
> **request**: (`op`, `callbacks`) => `UnsubscribeFn`
>
> ###### Parameters
>
> | Parameter   | Type                                            |
> | :---------- | :---------------------------------------------- |
> | `op`        | `Operation`                                     |
> | `callbacks` | `WSCallbackObserver`< `AnyRouter`, `unknown` \> |
>
> ###### Returns
>
> `UnsubscribeFn`

#### Source

packages/client/dist/links/wsLink.d.ts:66

---

Generated using [TypeDoc](https://typedoc.org/) and [typedoc-plugin-markdown](https://www.npmjs.com/package/typedoc-plugin-markdown)
