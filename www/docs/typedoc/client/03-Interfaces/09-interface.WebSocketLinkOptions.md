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
>
> ##### client.connection
>
> `get` connection(): `null` \| `Connection`

#### Source

[packages/client/src/links/wsLink.ts:433](https://github.com/trpc/trpc/blob/caccce64/packages/client/src/links/wsLink.ts#L433)

---

Generated using [TypeDoc](https://typedoc.org/) and [typedoc-plugin-markdown](https://www.npmjs.com/package/typedoc-plugin-markdown)
