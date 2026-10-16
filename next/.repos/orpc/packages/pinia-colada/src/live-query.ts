import type { Promisable } from '@orpc/shared'
import type { UseQueryFnContext } from './types'
import { stringifyJSON } from '@orpc/shared'

/**
 * A Pinia Colada query function that publishes each streamed chunk to the
 * cache entry as it arrives, replacing the previous value.
 */
export function liveQuery<T>(
  queryFn: (
    context: UseQueryFnContext,
  ) => Promisable<AsyncIterable<T>>,
): (context: UseQueryFnContext) => Promise<T> {
  return async (context) => {
    const { entry, signal } = context

    const stream = await queryFn(context)
    let last: { chunk: T } | undefined

    for await (const chunk of stream) {
      if (signal.aborted) {
        throw signal.reason
      }

      last = { chunk }
      entry.state.value = { status: 'success', data: chunk, error: null } as any
    }

    if (!last) {
      throw new TypeError(
        `Live query for ${stringifyJSON(entry.key)} did not yield any data. Ensure the query function returns an AsyncIterable with at least one chunk.`,
      )
    }

    return last.chunk
  }
}
