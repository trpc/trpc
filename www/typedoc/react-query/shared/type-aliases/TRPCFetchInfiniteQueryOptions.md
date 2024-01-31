# Type alias: TRPCFetchInfiniteQueryOptions\<TInput, TOutput, TError\>

> **TRPCFetchInfiniteQueryOptions**\<`TInput`, `TOutput`, `TError`\>: `DistributiveOmit`\< `FetchInfiniteQueryOptions`\< `TOutput`, `TError`, `TOutput`, `TRPCQueryKey`, [`ExtractCursorType`](ExtractCursorType.md)\< `TInput` \> \>, `"queryKey"` \| `"initialPageParam"` \> & [`TRPCRequestOptions`](../../index/interfaces/TRPCRequestOptions.md) & `Object`

## Type declaration

### initialCursor?

> **initialCursor**?: [`ExtractCursorType`](ExtractCursorType.md)\< `TInput` \>

## Type parameters

• **TInput**

• **TOutput**

• **TError**

## Source

[packages/react-query/src/internals/context.tsx:36](https://github.com/trpc/trpc/blob/caccce64/packages/react-query/src/internals/context.tsx#L36)

***

Generated using [TypeDoc](https://typedoc.org) and [typedoc-plugin-markdown](https://typedoc-plugin-markdown.org).
