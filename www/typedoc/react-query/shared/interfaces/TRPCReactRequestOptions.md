# Interface: TRPCReactRequestOptions

## Extends

- `Omit`\< [`TRPCRequestOptions`](../../index/interfaces/TRPCRequestOptions.md), `"signal"` \>

## Properties

### abortOnUnmount?

> **abortOnUnmount**?: `boolean`

Opt out or into aborting request on unmount

#### Source

[packages/react-query/src/shared/hooks/types.ts:49](https://github.com/trpc/trpc/blob/caccce64/packages/react-query/src/shared/hooks/types.ts#L49)

***

### context?

> **context**?: `OperationContext`

Pass additional context to links

#### Inherited from

`Omit.context`

#### Source

packages/client/dist/internals/TRPCUntypedClient.d.ts:35

***

### ssr?

> **ssr**?: `boolean`

Opt out of SSR for this query by passing `ssr: false`

#### Source

[packages/react-query/src/shared/hooks/types.ts:45](https://github.com/trpc/trpc/blob/caccce64/packages/react-query/src/shared/hooks/types.ts#L45)

***

Generated using [TypeDoc](https://typedoc.org) and [typedoc-plugin-markdown](https://typedoc-plugin-markdown.org).
