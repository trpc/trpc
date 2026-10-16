import type { Promisable } from '@orpc/shared'
import type { QueryFunction, QueryFunctionContext, QueryKey } from '@tanstack/query-core'

export interface SerializableStreamedQueryOptions {
  /**
   * Determines how data is handled when the query is fetched again
   *
   * - `'reset'`: Clears existing data and returns the query to a pending state.
   * - `'append'`: Adds new streamed chunks to the existing data.
   * - `'replace'`: Buffers streamed data and replaces the cache after the stream completes.
   *
   * @default 'reset'
   */
  refetchMode?: 'append' | 'reset' | 'replace'

  /**
   * Limits the number of data chunks stored in the query result.
   * Older chunks are removed when the limit is reached.
   *
   * @default Number.POSITIVE_INFINITY (unlimited)
   */
  maxChunks?: number
}

/**
 * A variant of `streamedQuery` where:
 * - Options are serializable
 * - The output is predictable
 */
export function serializableStreamedQuery<
  TQueryFnData = unknown,
  TQueryKey extends QueryKey = QueryKey,
>(
  queryFn: (
    context: QueryFunctionContext<TQueryKey>,
  ) => Promisable<AsyncIterable<TQueryFnData>>,
  { refetchMode = 'reset', maxChunks = Number.POSITIVE_INFINITY }: SerializableStreamedQueryOptions = {},
): QueryFunction<TQueryFnData[], TQueryKey> {
  /**
   * below code is inspired from old `streamedQuery`: https://github.com/TanStack/query/blob/9973e0f1d82acd6ccf5a49d9a0b5e7e401fc5489/packages/query-core/src/streamedQuery.ts#L19
   */
  return async (context) => {
    const query = context.client
      .getQueryCache()
      .find({ queryKey: context.queryKey, exact: true })
    const hasPreviousData = !!query && query.state.data !== undefined

    if (hasPreviousData) {
      if (refetchMode === 'reset') {
        query.setState({
          status: 'pending',
          data: undefined,
          error: null,
          fetchStatus: 'fetching',
        })
      }
      else {
        context.client.setQueryData<Array<TQueryFnData>>(
          context.queryKey,
          (prev = []) => limitArraySize(prev, maxChunks),
        )
      }
    }

    let result: Array<TQueryFnData> = []
    const stream = await queryFn(context)
    const shouldUpdateCacheDuringStream = !hasPreviousData || refetchMode !== 'replace'

    // after resolve stream successfully we can treat result as empty array
    context.client.setQueryData<Array<TQueryFnData>>(
      context.queryKey,
      (prev = []) => limitArraySize(prev, maxChunks),
    )

    for await (const chunk of stream) {
      if (context.signal.aborted) {
        throw context.signal.reason
      }

      result.push(chunk)
      result = limitArraySize(result, maxChunks)

      if (shouldUpdateCacheDuringStream) {
        context.client.setQueryData<Array<TQueryFnData>>(
          context.queryKey,
          (prev = []) => limitArraySize([...prev, chunk], maxChunks),
        )
      }
    }

    if (!shouldUpdateCacheDuringStream) {
      context.client.setQueryData<Array<TQueryFnData>>(context.queryKey, result)
    }

    const cachedData = context.client.getQueryData<Array<TQueryFnData>>(context.queryKey)
    if (cachedData) {
      return limitArraySize(cachedData, maxChunks)
    }

    return result
  }
}

function limitArraySize<T>(items: Array<T>, maxSize: number): Array<T> {
  if (items.length <= maxSize) {
    return items
  }
  return items.slice(items.length - maxSize)
}
