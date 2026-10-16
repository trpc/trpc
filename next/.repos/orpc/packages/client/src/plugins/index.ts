export * from './batch'
export * from './dedupe'
export {
  /**
   * @deprecated Use `DedupeLinkPlugin` instead.
   */
  DedupeLinkPlugin as DedupeRequestsPlugin,
} from './dedupe'
export * from './request-compression'
export * from './response-compression'
export * from './retry'
export {
  /**
   * @deprecated Use `RetryLinkPlugin` instead.
   */
  RetryLinkPlugin as ClientRetryPlugin,
} from './retry'
export type {
  /**
   * @deprecated Use `RetryLinkPluginContext` instead.
   */
  RetryLinkPluginContext as ClientRetryPluginContext,
} from './retry'
export * from './retry-after'
export {
  /**
   * @deprecated Use `RetryAfterLinkPlugin` instead.
   */
  RetryAfterLinkPlugin as RetryAfterPlugin,
} from './retry-after'
export * from './timeout'
