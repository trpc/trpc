/**
 * The `DeliverAt` module defines the protocol used by cluster message payloads
 * that carry their own scheduled delivery time. A value implements the protocol
 * by exposing a method at the `DeliverAt` symbol that returns the target
 * `DateTime`.
 *
 * @stability unstable
 * @since 4.0.0
 */
import type { DateTime } from "../DateTime.ts"
import { hasProperty } from "../Predicate.ts"

/**
 * Defines the property key used by values that provide a scheduled delivery time.
 *
 * **When to use**
 *
 * Use to implement the scheduled-delivery protocol on cluster message payloads
 * by defining a method at this property key.
 *
 * @stability unstable
 * @category symbols
 * @since 4.0.0
 */
export const symbol = "~effect/cluster/DeliverAt"

/**
 * Interface for payloads that specify when a cluster message should be delivered
 * by returning the target delivery `DateTime` through the `DeliverAt` symbol
 * method.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface DeliverAt {
  [symbol](): DateTime
}

/**
 * Returns `true` if the value implements the `DeliverAt` scheduled-delivery
 * protocol.
 *
 * @stability unstable
 * @category guards
 * @since 4.0.0
 */
export const isDeliverAt = (self: unknown): self is DeliverAt => hasProperty(self, symbol)

/**
 * Returns the scheduled delivery time in epoch milliseconds when the value
 * implements `DeliverAt`, or `null` otherwise.
 *
 * @stability unstable
 * @category accessors
 * @since 4.0.0
 */
export const toMillis = (self: unknown): number | null => {
  if (isDeliverAt(self)) {
    return self[symbol]().epochMilliseconds
  }
  return null
}
