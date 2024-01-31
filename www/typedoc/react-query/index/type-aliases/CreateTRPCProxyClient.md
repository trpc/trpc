# Type alias: CreateTRPCProxyClient\<TRouter\>

> **CreateTRPCProxyClient**\<`TRouter`\>: [`inferRouterProxyClient`](inferRouterProxyClient.md)\< `TRouter` \> extends infer $ProcedureRecord ? `UntypedClientProperties` & keyof `$ProcedureRecord` extends `never` ? [`inferRouterProxyClient`](inferRouterProxyClient.md)\< `TRouter` \> : `IntersectionError`\< `UntypedClientProperties` & keyof `$ProcedureRecord` \> : `never`

Creates a proxy client and shows type errors if you have query names that collide with built-in properties

## Type parameters

• **TRouter** extends `AnyRouter`

## Source

packages/client/dist/createTRPCClient.d.ts:32

***

Generated using [TypeDoc](https://typedoc.org) and [typedoc-plugin-markdown](https://typedoc-plugin-markdown.org).
