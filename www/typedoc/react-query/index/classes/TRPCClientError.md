# Class: TRPCClientError\<TRouterOrProcedure\>

## Extends

- `Error`

## Type parameters

• **TRouterOrProcedure** extends `TRPCInferrable`

## Implements

- [`TRPCClientErrorBase`](../interfaces/TRPCClientErrorBase.md)\< `inferErrorShape`\< `TRouterOrProcedure` \> \>

## Constructors

### new TRPCClientError(message, opts)

> **new TRPCClientError**\<`TRouterOrProcedure`\>(`message`, `opts`?): [`TRPCClientError`](TRPCClientError.md)\< `TRouterOrProcedure` \>

#### Parameters

• **message**: `string`

• **opts?**: `Object`

• **opts\.cause?**: `Error`

• **opts\.meta?**: `Record`\< `string`, `unknown` \>

• **opts\.result?**: `Maybe`\< `TRPCErrorResponse`\< `inferErrorShape`\< `TRouterOrProcedure` \> \> \>

#### Returns

[`TRPCClientError`](TRPCClientError.md)\< `TRouterOrProcedure` \>

#### Overrides

`Error.constructor`

#### Source

packages/client/dist/TRPCClientError.d.ts:18

## Properties

### cause

> **`readonly`** **cause**: `undefined` \| `Error`

#### Overrides

`Error.cause`

#### Source

packages/client/dist/TRPCClientError.d.ts:10

***

### data

> **`readonly`** **data**: `Maybe`\< `inferErrorShape`\< `TRouterOrProcedure` \>\[`"data"`\] \>

#### Implementation of

[`index.TRPCClientErrorBase.data`](../interfaces/TRPCClientErrorBase.md#data)

#### Source

packages/client/dist/TRPCClientError.d.ts:12

***

### message

> **message**: `string`

#### Implementation of

[`index.TRPCClientErrorBase.message`](../interfaces/TRPCClientErrorBase.md#message)

#### Inherited from

`Error.message`

#### Source

node\_modules/.pnpm/typescript@5.2.2/node\_modules/typescript/lib/lib.es5.d.ts:1068

***

### meta

> **meta**: `undefined` \| `Record`\< `string`, `unknown` \>

Additional meta data about the error
In the case of HTTP-errors, we'll have `response` and potentially `responseJSON` here

#### Source

packages/client/dist/TRPCClientError.d.ts:17

***

### name

> **name**: `string`

#### Inherited from

`Error.name`

#### Source

node\_modules/.pnpm/typescript@5.2.2/node\_modules/typescript/lib/lib.es5.d.ts:1067

***

### shape

> **`readonly`** **shape**: `Maybe`\< `inferErrorShape`\< `TRouterOrProcedure` \> \>

#### Implementation of

[`index.TRPCClientErrorBase.shape`](../interfaces/TRPCClientErrorBase.md#shape)

#### Source

packages/client/dist/TRPCClientError.d.ts:11

***

### stack?

> **stack**?: `string`

#### Inherited from

`Error.stack`

#### Source

node\_modules/.pnpm/typescript@5.2.2/node\_modules/typescript/lib/lib.es5.d.ts:1069

***

### prepareStackTrace?

> **`static`** **prepareStackTrace**?: (`err`, `stackTraces`) => `any`

Optional override for formatting stack traces

#### Parameters

• **err**: `Error`

• **stackTraces**: `CallSite`[]

#### Returns

`any`

#### See

https://v8.dev/docs/stack-trace-api#customizing-stack-traces

#### Inherited from

`Error.prepareStackTrace`

#### Source

node\_modules/.pnpm/@types+node@20.10.4/node\_modules/@types/node/globals.d.ts:28

***

### stackTraceLimit

> **`static`** **stackTraceLimit**: `number`

#### Inherited from

`Error.stackTraceLimit`

#### Source

node\_modules/.pnpm/@types+node@20.10.4/node\_modules/@types/node/globals.d.ts:30

## Methods

### captureStackTrace()

> **`static`** **captureStackTrace**(`targetObject`, `constructorOpt`?): `void`

Create .stack property on a target object

#### Parameters

• **targetObject**: `object`

• **constructorOpt?**: `Function`

#### Returns

`void`

#### Inherited from

`Error.captureStackTrace`

#### Source

node\_modules/.pnpm/@types+node@20.10.4/node\_modules/@types/node/globals.d.ts:21

***

### from()

> **`static`** **from**\<`TRouterOrProcedure`\>(`_cause`, `opts`?): [`TRPCClientError`](TRPCClientError.md)\< `TRouterOrProcedure` \>

#### Type parameters

• **TRouterOrProcedure** extends `TRPCInferrable`

#### Parameters

• **\_cause**: `Error` \| `TRPCErrorResponse`\< `any` \>

• **opts?**: `Object`

• **opts\.meta?**: `Record`\< `string`, `unknown` \>

#### Returns

[`TRPCClientError`](TRPCClientError.md)\< `TRouterOrProcedure` \>

#### Source

packages/client/dist/TRPCClientError.d.ts:23

***

Generated using [TypeDoc](https://typedoc.org) and [typedoc-plugin-markdown](https://typedoc-plugin-markdown.org).
