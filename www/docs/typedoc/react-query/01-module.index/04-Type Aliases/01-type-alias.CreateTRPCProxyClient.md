---
sidebar_label: CreateTRPCProxyClient
pagination_prev: null
pagination_next: null
custom_edit_url: null
---

# Type alias: CreateTRPCProxyClient`<TRouter>`

> **CreateTRPCProxyClient**: \<`TRouter`\> [`inferRouterProxyClient`](08-type-alias.inferRouterProxyClient.md)< `TRouter` \> _extends_ infer $ProcedureRecord ? `UntypedClientProperties` & *keyof* `$ProcedureRecord`*extends*`never` ? [`inferRouterProxyClient`](08-type-alias.inferRouterProxyClient.md)< `TRouter`\> :`IntersectionError`< `UntypedClientProperties`& *keyof*`$ProcedureRecord`\> :`never`

Creates a proxy client and shows type errors if you have query names that collide with built-in properties

## Type parameters

| Parameter                       |
| :------------------------------ |
| `TRouter` _extends_ `AnyRouter` |

## Source

packages/client/dist/createTRPCClient.d.ts:32

---

Generated using [TypeDoc](https://typedoc.org/) and [typedoc-plugin-markdown](https://www.npmjs.com/package/typedoc-plugin-markdown)
