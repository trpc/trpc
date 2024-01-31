---
sidebar_label: TRPCFetchInfiniteQueryOptions
pagination_prev: null
pagination_next: null
custom_edit_url: null
---

# Type alias: TRPCFetchInfiniteQueryOptions`<TInput, TOutput, TError>`

> **TRPCFetchInfiniteQueryOptions**: \<`TInput`, `TOutput`, `TError`\> `DistributiveOmit`< `FetchInfiniteQueryOptions`< `TOutput`, `TError`, `TOutput`, `TRPCQueryKey`, [`ExtractCursorType`](04-type-alias.ExtractCursorType.md)< `TInput` \> \>, `"queryKey"` \| `"initialPageParam"` \> & [`TRPCRequestOptions`](../../01-module.index/03-Interfaces/07-interface.TRPCRequestOptions.md) & \{`initialCursor`: [`ExtractCursorType`](04-type-alias.ExtractCursorType.md)< `TInput` \>;}

> ## TRPCFetchInfiniteQueryOptions.initialCursor
>
> `optional` **initialCursor**: [`ExtractCursorType`](04-type-alias.ExtractCursorType.md)< `TInput` \>

## Type parameters

| Parameter |
| :-------- |
| `TInput`  |
| `TOutput` |
| `TError`  |

## Source

[packages/react-query/src/internals/context.tsx:36](https://github.com/trpc/trpc/blob/caccce64/packages/react-query/src/internals/context.tsx#L36)

---

Generated using [TypeDoc](https://typedoc.org/) and [typedoc-plugin-markdown](https://www.npmjs.com/package/typedoc-plugin-markdown)
