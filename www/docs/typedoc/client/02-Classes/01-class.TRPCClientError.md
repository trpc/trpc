---
sidebar_label: TRPCClientError
pagination_prev: null
pagination_next: null
custom_edit_url: null
---

# Class: TRPCClientError`<TRouterOrProcedure>`

## Extends

- `Error`

## Type parameters

| Parameter                                       |
| :---------------------------------------------- |
| `TRouterOrProcedure` _extends_ `TRPCInferrable` |

## Implements

- [`TRPCClientErrorBase`](../03-Interfaces/05-interface.TRPCClientErrorBase.md)< `inferErrorShape`< `TRouterOrProcedure` \> \>

## Constructors

### constructor()

> **new TRPCClientError**\<`TRouterOrProcedure`\>(`message`, `opts`?): [`TRPCClientError`](01-class.TRPCClientError.md)< `TRouterOrProcedure` \>

<!-- markdownlint-disable MD024 -->
#### Type parameters

| Parameter                                       |
| :---------------------------------------------- |
| `TRouterOrProcedure` _extends_ `TRPCInferrable` |

#### Parameters

| Parameter      | Type                                                                              |
| :------------- | :-------------------------------------------------------------------------------- |
| `message`      | `string`                                                                          |
| `opts`?        | `object`                                                                          |
| `opts.cause`?  | `Error`                                                                           |
| `opts.meta`?   | `Record`< `string`, `unknown` \>                                                 |
| `opts.result`? | `Maybe`< `TRPCErrorResponse`< `inferErrorShape`< `TRouterOrProcedure` \> \> \> |

#### Returns

[`TRPCClientError`](01-class.TRPCClientError.md)< `TRouterOrProcedure` \>

#### Overrides

Error.constructor

#### Source

[packages/client/src/TRPCClientError.ts:57](https://github.com/trpc/trpc/blob/caccce64/packages/client/src/TRPCClientError.ts#L57)

## Properties

### cause

> `readonly` **cause**: `undefined` \| `Error`

#### Source

[packages/client/src/TRPCClientError.ts:47](https://github.com/trpc/trpc/blob/caccce64/packages/client/src/TRPCClientError.ts#L47)

#### Overrides

Error.cause

---

### data

> `readonly` **data**: `Maybe`< `inferErrorShape`< `TRouterOrProcedure` \>[`"data"`] \>

#### Source

[packages/client/src/TRPCClientError.ts:49](https://github.com/trpc/trpc/blob/caccce64/packages/client/src/TRPCClientError.ts#L49)

#### Implementation of

[`TRPCClientErrorBase`](../03-Interfaces/05-interface.TRPCClientErrorBase.md).[`data`](../03-Interfaces/05-interface.TRPCClientErrorBase.md#data)

---

### message

> **message**: `string`

#### Source

node_modules/.pnpm/typescript@5.1.6/node_modules/typescript/lib/lib.es5.d.ts:1068

#### Implementation of

[`TRPCClientErrorBase`](../03-Interfaces/05-interface.TRPCClientErrorBase.md).[`message`](../03-Interfaces/05-interface.TRPCClientErrorBase.md#message)

#### Inherited from

Error.message

---

### meta

> **meta**: `undefined` \| `Record`< `string`, `unknown` \>

Additional meta data about the error
In the case of HTTP-errors, we'll have `response` and potentially `responseJSON` here

#### Source

[packages/client/src/TRPCClientError.ts:55](https://github.com/trpc/trpc/blob/caccce64/packages/client/src/TRPCClientError.ts#L55)

---

### name

> **name**: `string`

#### Source

node_modules/.pnpm/typescript@5.1.6/node_modules/typescript/lib/lib.es5.d.ts:1067

#### Inherited from

Error.name

---

### shape

> `readonly` **shape**: `Maybe`< `inferErrorShape`< `TRouterOrProcedure` \> \>

#### Source

[packages/client/src/TRPCClientError.ts:48](https://github.com/trpc/trpc/blob/caccce64/packages/client/src/TRPCClientError.ts#L48)

#### Implementation of

[`TRPCClientErrorBase`](../03-Interfaces/05-interface.TRPCClientErrorBase.md).[`shape`](../03-Interfaces/05-interface.TRPCClientErrorBase.md#shape)

---

### stack

> `optional` **stack**: `string`

#### Source

node_modules/.pnpm/typescript@5.1.6/node_modules/typescript/lib/lib.es5.d.ts:1069

#### Inherited from

Error.stack

---

### prepareStackTrace

> `static` `optional` **prepareStackTrace**: (`err`, `stackTraces`) => `any`

Optional override for formatting stack traces

#### See

https://v8.dev/docs/stack-trace-api#customizing-stack-traces

#### Parameters

| Parameter     | Type         |
| :------------ | :----------- |
| `err`         | `Error`      |
| `stackTraces` | `CallSite`[] |

#### Returns

`any`

#### Source

node_modules/.pnpm/@types+node@20.10.4/node_modules/@types/node/globals.d.ts:28

#### Inherited from

Error.prepareStackTrace

---

### stackTraceLimit

> `static` **stackTraceLimit**: `number`

#### Source

node_modules/.pnpm/@types+node@20.10.4/node_modules/@types/node/globals.d.ts:30

#### Inherited from

Error.stackTraceLimit

## Methods

### captureStackTrace()

> `static` **captureStackTrace**(`targetObject`, `constructorOpt`?): `void`

Create .stack property on a target object

#### Parameters

| Parameter         | Type       |
| :---------------- | :--------- |
| `targetObject`    | `object`   |
| `constructorOpt`? | `Function` |

#### Returns

`void`

#### Inherited from

Error.captureStackTrace

#### Source

node_modules/.pnpm/@types+node@20.10.4/node_modules/@types/node/globals.d.ts:21

---

### from()

> `static` **from**\<`TRouterOrProcedure`\>(`_cause`, `opts` = `{}`): [`TRPCClientError`](01-class.TRPCClientError.md)< `TRouterOrProcedure` \>

#### Type parameters

| Parameter                                       |
| :---------------------------------------------- |
| `TRouterOrProcedure` _extends_ `TRPCInferrable` |

#### Parameters

| Parameter    | Type                                      |
| :----------- | :---------------------------------------- |
| `_cause`     | `Error` \| `TRPCErrorResponse`< `any` \> |
| `opts`       | `object`                                  |
| `opts.meta`? | `Record`< `string`, `unknown` \>         |

#### Returns

[`TRPCClientError`](01-class.TRPCClientError.md)< `TRouterOrProcedure` \>

#### Source

[packages/client/src/TRPCClientError.ts:81](https://github.com/trpc/trpc/blob/caccce64/packages/client/src/TRPCClientError.ts#L81)

---

Generated using [TypeDoc](https://typedoc.org/) and [typedoc-plugin-markdown](https://www.npmjs.com/package/typedoc-plugin-markdown)
