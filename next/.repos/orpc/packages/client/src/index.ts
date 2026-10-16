export * from './async-iterator-object'
export * from './client'
export * from './client-safe'
export * from './consts'
export * from './dynamic-link'
export * from './error'
export * from './error-utils'
export * from './rpc-json-serializer'
export * from './rpc-serializer'
export * from './types'
export type {
  /**
   * @deprecated Use `InferClientError` instead.
   */
  InferClientError as InferClientErrorUnion,
} from './types'
export * from './utils'

export type {
  AsyncCleanupFn,
  AsyncIteratorClassNextFn,
  MaybeOptionalOptions,
  PromiseWithError,
  Registry,
  ThrowableError,
} from '@orpc/shared'

export {
  AsyncIteratorClass,
  asyncIteratorToStream,
  asyncIteratorToUnproxiedDataStream,
  consumeAsyncIterator,
  /**
   * @deprecated Use `consumeAsyncIterator` instead.
   */
  consumeAsyncIterator as consumeEventIterator,
  /**
   * @deprecated Use `asyncIteratorToStream` instead.
   */
  asyncIteratorToStream as eventIteratorToStream,
  /**
   * @deprecated Use `asyncIteratorToUnproxiedDataStream` instead.
   */
  asyncIteratorToUnproxiedDataStream as eventIteratorToUnproxiedDataStream,
  onAsyncIteratorObjectError,
  onError,
  onFinish,
  onReadableStreamError,
  onStart,
  onSuccess,
  streamToAsyncIteratorObject,
  /**
   * @deprecated Use `streamToAsyncIteratorObject` instead.
   */
  streamToAsyncIteratorObject as streamToEventIterator,
} from '@orpc/shared'

export type {
  /**
   * @deprecated Use `PromiseWithError` instead.
   */
  PromiseWithError as ClientPromiseResult,
} from '@orpc/shared'

export type {
  EventMeta,
  StandardBody,
  StandardBodyHint,
  StandardHeaders,
  StandardLazyRequest,
  StandardLazyResponse,
  StandardMethod,
  StandardRequest,
  StandardResponse,
  StandardUrl,
} from '@standard-server/core'

export {
  ErrorEvent,
  /**
   * Retrieves event metadata (such as the event id and retry interval)
   * attached to a single iterator event value.
   *
   * @see {@link https://orpc.dev/docs/client/async-iterator-object#event-metadata | AsyncIteratorObject in Client - Event Metadata}
   */
  getEventMeta,
  unwrapEvent,
  withEventMeta,
} from '@standard-server/core'
