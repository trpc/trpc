import type { AsyncIteratorClass, WrapAsyncIteratorOptions } from '@orpc/shared'
import { isTypescriptObject, wrapAsyncIterator } from '@orpc/shared'
import { getEventMeta, withEventMeta } from '@standard-server/core'

export function wrapAsyncIteratorPreservingEventMeta<TYield, TReturn, TMappedYield = TYield, TMappedReturn = TReturn>(
  iterator: AsyncIterator<TYield, TReturn>,
  { mapResult, mapError, ...rest }: WrapAsyncIteratorOptions<TYield, TReturn, TMappedYield, TMappedReturn>,
): AsyncIteratorClass<TMappedYield, TMappedReturn> {
  return wrapAsyncIterator<TYield, TReturn, TMappedYield, TMappedReturn>(iterator, {
    ...rest,
    mapResult: mapResult && (async (result) => {
      const mapped = await mapResult(result)

      if (mapped.value !== result.value) {
        const meta = getEventMeta(result.value)
        if (meta && isTypescriptObject(mapped.value)) {
          return { done: mapped.done, value: withEventMeta(mapped.value, meta) } as any
        }
      }

      return mapped
    }),
    mapError: mapError && (async (error) => {
      const mapped = await mapError(error)

      if (mapped !== error) {
        const meta = getEventMeta(error)
        if (meta && isTypescriptObject(mapped)) {
          return withEventMeta(mapped, meta)
        }
      }

      return mapped
    }),
  })
}
