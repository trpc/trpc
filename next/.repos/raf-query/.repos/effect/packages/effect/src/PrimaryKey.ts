/**
 * The `PrimaryKey` module defines a small protocol for values that can expose
 * a stable, string-based identifier. A value participates by implementing a
 * method at {@link symbol}; consumers can check unknown values with
 * {@link isPrimaryKey} and read the key with {@link value}.
 *
 * @since 2.0.0
 */

import { hasProperty } from "./Predicate.ts"

/**
 * Defines the unique identifier used to identify objects that implement the `PrimaryKey` interface.
 *
 * **When to use**
 *
 * Use to implement the `PrimaryKey` protocol as a computed property key on
 * classes or object literals that expose a stable string identifier.
 *
 * @see {@link PrimaryKey} for the protocol interface that declares the method keyed by this symbol
 * @see {@link value} for reading the string key from a `PrimaryKey` value
 * @see {@link isPrimaryKey} for checking whether an unknown value carries this method
 *
 * @category symbols
 * @since 2.0.0
 */
export const symbol = "~effect/PrimaryKey"

/**
 * An interface for objects that can provide a string-based primary key.
 *
 * **When to use**
 *
 * Use to define values that expose a stable string identifier for equality,
 * hashing, caching, or persistence.
 *
 * **Details**
 *
 * Objects implementing this interface must provide a method that returns
 * a unique string identifier.
 *
 * **Example** (Implementing a primary key)
 *
 * ```ts import.meta.vitest
 * import { PrimaryKey } from "effect"
 *
 * class ProductId implements PrimaryKey.PrimaryKey {
 *   constructor(private category: string, private id: number) {}
 *
 *   [PrimaryKey.symbol](): string {
 *     return `${this.category}-${this.id}`
 *   }
 * }
 *
 * const productId = new ProductId("electronics", 42)
 * PrimaryKey.value(productId) // => "electronics-42"
 * ```
 *
 * @category models
 * @since 2.0.0
 */
export interface PrimaryKey {
  [symbol](): string
}

/**
 * Checks whether a value implements the `PrimaryKey` protocol.
 *
 * **When to use**
 *
 * Use to narrow an unknown value before treating it as a `PrimaryKey`.
 *
 * **Details**
 *
 * This is a structural guard for the `PrimaryKey.symbol` property.
 *
 * **Gotchas**
 *
 * This guard does not call the method or verify that it returns a string.
 *
 * @see {@link PrimaryKey} for the protocol being checked
 * @see {@link value} for extracting the string value after narrowing
 *
 * @category guards
 * @since 4.0.0
 */
export const isPrimaryKey = (u: unknown): u is PrimaryKey => hasProperty(u, symbol)

/**
 * Extracts the string value from a `PrimaryKey`.
 *
 * **When to use**
 *
 * Use to read the stable string identifier from a value that implements
 * `PrimaryKey`.
 *
 * **Example** (Reading primary key values)
 *
 * ```ts import.meta.vitest
 * import { PrimaryKey } from "effect"
 *
 * class OrderId implements PrimaryKey.PrimaryKey {
 *   constructor(private timestamp: number, private sequence: number) {}
 *
 *   [PrimaryKey.symbol](): string {
 *     return `order_${this.timestamp}_${this.sequence}`
 *   }
 * }
 *
 * const orderId = new OrderId(1640995200000, 1)
 * PrimaryKey.value(orderId) // => "order_1640995200000_1"
 *
 * // Can also be used with simple string-based implementations
 * const simpleKey = {
 *   [PrimaryKey.symbol]: () => "simple-key-123"
 * }
 * PrimaryKey.value(simpleKey) // => "simple-key-123"
 * ```
 *
 * @category getters
 * @since 2.0.0
 */
export const value = (self: PrimaryKey): string => self[symbol]()
