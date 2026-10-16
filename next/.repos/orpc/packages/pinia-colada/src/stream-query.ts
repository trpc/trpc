import type { Promisable } from '@orpc/shared'
import type { UseQueryFnContext } from './types'

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
 * A Pinia Colada query function that accumulates streamed chunks into an array,
 * publishing each chunk to the cache entry as it arrives.
 *
 * Inspired by [TanStack Query streamedQuery](https://tanstack.com/query/latest/docs/reference/streamedQuery) where:
 * - Options are serializable
 * - The output is predictable
 */
export function serializableStreamedQuery<T>(
  queryFn: (
    context: UseQueryFnContext,
  ) => Promisable<AsyncIterable<T>>,
  { refetchMode = 'reset', maxChunks = Number.POSITIVE_INFINITY }: SerializableStreamedQueryOptions = {},
): (context: UseQueryFnContext) => Promise<T[]> {
  return async (context) => {
    const { entry, signal } = context

    const previousData = entry.state.value.data as T[] | undefined
    const hasPreviousData = previousData !== undefined

    if (hasPreviousData && refetchMode === 'reset') {
      entry.state.value = { status: 'pending', data: undefined, error: null }
    }

    const stream = await queryFn(context)
    const shouldUpdateCacheDuringStream = !hasPreviousData || refetchMode !== 'replace'

    let result: T[] = hasPreviousData && refetchMode === 'append'
      ? limitArraySize(previousData, maxChunks)
      : []

    if (shouldUpdateCacheDuringStream) {
      entry.state.value = { status: 'success', data: result, error: null } as any
    }

    for await (const chunk of stream) {
      if (signal.aborted) {
        throw signal.reason
      }

      result = limitArraySize([...result, chunk], maxChunks)

      if (shouldUpdateCacheDuringStream) {
        entry.state.value = { status: 'success', data: result, error: null } as any
      }
    }

    return result
  }
}

function limitArraySize<T>(items: T[], maxSize: number): T[] {
  if (items.length <= maxSize) {
    return items
  }

  return items.slice(items.length - maxSize)
}
