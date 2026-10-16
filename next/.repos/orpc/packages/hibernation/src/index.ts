export * from './encode-event'
export * from './handler-plugin'
export {
  /**
   * @deprecated Use `HibernationHandlerPlugin` instead.
   */
  HibernationHandlerPlugin as HibernationPlugin,
} from './handler-plugin'
export {
  /**
   * An async iterator designed for the Hibernation APIs. Instead of streaming
   * events directly, it invokes a callback with an ID you can save and later
   * use to send events via `encodeHibernationRPCEvent`.
   *
   * @see {@link https://orpc.dev/docs/integrations/hibernation | Hibernation Integration}
   */
  HibernationAsyncIteratorClass,
} from '@standard-server/peer'
export {
  /**
   * @deprecated Use `HibernationAsyncIteratorClass` instead.
   */
  HibernationAsyncIteratorClass as HibernationEventIterator,
} from '@standard-server/peer'
export type { HibernationAsyncIteratorClassCallback } from '@standard-server/peer'
