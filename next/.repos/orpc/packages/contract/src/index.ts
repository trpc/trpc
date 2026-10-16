export * from './builder'
export * from './builder-variants'
export * from './client-factory'
export * from './error'
export * from './error-factory'
export * from './error-utils'
export * from './meta'
export * from './meta-built-in'
export * from './meta-utils'
export * from './procedure'
export type {
  /**
   * @deprecated Use `AnyProcedureContract` instead.
   */
  AnyProcedureContract as AnyContractProcedure,
} from './procedure'
export * from './procedure-client'
export * from './router'
export type {
  /**
   * @deprecated Use `RouterContract` instead.
   */
  RouterContract as AnyContractRouter,
  /**
   * @deprecated Use `InferRouterContractErrorMap` instead.
   */
  InferRouterContractErrorMap as InferContractRouterErrorMap,
  /**
   * @deprecated Use `InferRouterContractInputs` instead.
   */
  InferRouterContractInputs as InferContractRouterInputs,
  /**
   * @deprecated Use `InferRouterContractOutputs` instead.
   */
  InferRouterContractOutputs as InferContractRouterOutputs,
} from './router'
export * from './router-client'
export type {
  /**
   * @deprecated Use `RouterContractClient` instead.
   */
  RouterContractClient as ContractRouterClient,
} from './router-client'
export * from './router-utils'
export {
  /**
   * @deprecated Use `getRouterContract` instead.
   */
  getRouterContract as getContractRouter,
  /**
   * @deprecated Use `minifyRouterContract` instead.
   */
  minifyRouterContract as minifyContractRouter,
} from './router-utils'
export * from './schema'
export * from './schema-built-in'
export {
  /**
   * @deprecated Use `asyncIteratorObject` instead.
   */
  asyncIteratorObject as eventIterator,
} from './schema-built-in'
export * from './schema-utils'

export type {
  Client,
  ClientContext,
  ClientOptions,
  ClientRest,
  FriendlyClientOptions,
} from '@orpc/client'

export type {
  PromiseWithError,
  Registry,
  ThrowableError,
} from '@orpc/shared'
