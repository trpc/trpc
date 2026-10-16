import type { Promisable, Value } from '@orpc/shared'
import type { StandardLazyRequest } from '@standard-server/core'
import type { Context } from '../../context'
import type { StandardHandlerHandleOptions } from './handler'

export type FriendlyStandardHandlerHandleOptions<T extends Context>
  = & Omit<StandardHandlerHandleOptions<T>, 'context'>
    & (object extends T ? { context?: Value<Promisable<T>, [request: StandardLazyRequest]> } : { context: Value<Promisable<T>, [request: StandardLazyRequest]> })

export function resolveFriendlyStandardHandlerHandleOptions<T extends Context>(options: FriendlyStandardHandlerHandleOptions<T>): StandardHandlerHandleOptions<T> {
  return {
    ...options,
    context: options.context ?? {} as T, // Context only optional if all fields are optional
  }
}
