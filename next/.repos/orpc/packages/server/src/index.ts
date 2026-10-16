export * from './builder'
export * from './builder-variants'
export * from './constants'
export * from './context'
export * from './implementer'
export * from './implementer-procedure'
export * from './implementer-router'
export * from './lazy'
export * from './middleware'
export * from './middleware-decorated'
export * from './procedure'
export * from './procedure-client'
export * from './procedure-decorated'
export * from './procedure-utils'
export * from './router'
export type {
  /**
   * @deprecated Use `InferRouterFinalContexts` instead.
   */
  InferRouterFinalContexts as InferRouterCurrentContexts,
} from './router'
export * from './router-client'
export * from './router-hidden'
export * from './router-utils'

export type {
  AnyORPCError,
  AnyORPCErrorJSON,
  Client,
  ClientContext,
  ClientOptions,
  ClientRest,
  FriendlyClientOptions,
  ORPCErrorCode,
  ORPCErrorJSON,
  ORPCErrorOptions,
  RPCJsonSerialization,
  RPCJsonSerializationMeta,
  RPCJsonSerializerHandler,
  RPCJsonSerializerOptions,
  RPCSerializerOptions,
  RPCSerializerSerializeOptions,
  SafeResult,
} from '@orpc/client'

export {
  cloneORPCError,
  COMMON_ERROR_STATUS_MAP,
  isDefinedError,
  ORPCError,
  RPCJsonSerializer,
  RPCSerializer,
  safe,
  toORPCError,
} from '@orpc/client'

export type {
  AnyMetaPlugin,
  AnySchema,
  ErrorMap,
  ErrorMapItem,
  InferSchemaInput,
  InferSchemaOutput,
  InitialInputSchema,
  InitialOutputSchema,
  MergedErrorMap,
  Meta,
  MetaPlugin,
  MetaPluginDefinition,
  ORPCErrorConstructorMap,
  ORPCErrorConstructorMapItem,
  ORPCErrorConstructorMapItemOptions,
  ORPCErrorFactory,
  ORPCErrorFactoryOptions,
  ORPCErrorFromErrorMap,
  ProcedureContract,
  ProcedureContractDefinition,
  RouterContract,
  Schema,
} from '@orpc/contract'

export {
  asyncIteratorObject,
  defineMeta,
  error,
  eventIterator,
  reconcileORPCError,
  type,
  ValidationError,
} from '@orpc/contract'

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
   * Retrieves metadata attached to a single iterator event value.
   *
   * @see {@link https://orpc.dev/docs/helpers/publisher | Publisher Helpers}
   */
  getEventMeta,
  unwrapEvent,
  /**
   * Returns a new iterator event value with attached, validated metadata.
   *
   * @see {@link https://orpc.dev/docs/async-iterator-object#last-event-id--event-metadata | AsyncIteratorObject (SSE) - Last Event ID & Event Metadata}
   */
  withEventMeta,
} from '@standard-server/core'
