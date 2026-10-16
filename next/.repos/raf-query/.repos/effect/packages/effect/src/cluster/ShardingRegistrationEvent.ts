/**
 * The `ShardingRegistrationEvent` module models the live notifications emitted
 * by `Sharding` when the local runner registers an entity handler or singleton.
 * Consumers can use these events to wait for registrations during startup,
 * inspect which capabilities a runner made available, or assert registration
 * behavior in tests.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Data from "../Data.ts"
import type { Entity } from "./Entity.ts"
import type { SingletonAddress } from "./SingletonAddress.ts"

/**
 * Represents events that can occur when a runner registers entities or singletons.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type ShardingRegistrationEvent =
  | EntityRegistered
  | SingletonRegistered

/**
 * Represents an event that occurs when a new entity is registered with a runner.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface EntityRegistered {
  readonly _tag: "EntityRegistered"
  readonly entity: Entity<any, any>
}

/**
 * Represents an event that occurs when a new singleton is registered with a
 * runner.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface SingletonRegistered {
  readonly _tag: "SingletonRegistered"
  readonly address: SingletonAddress
}

/**
 * Constructors and matchers for sharding registration events.
 *
 * @stability unstable
 * @category pattern matching
 * @since 4.0.0
 */
export const {
  /**
   * Pattern matches on a sharding registration event and dispatches to the
   * matching variant handler.
   *
   * @stability unstable
   * @category pattern matching
   * @since 4.0.0
   */
  $match: match,
  /**
   * Creates an event for an entity registered by the local runner.
   *
   * @stability unstable
   * @category constructors
   * @since 4.0.0
   */
  EntityRegistered,
  /**
   * Creates an event for a singleton registered by the local runner.
   *
   * @stability unstable
   * @category constructors
   * @since 4.0.0
   */
  SingletonRegistered
} = Data.taggedEnum<ShardingRegistrationEvent>()
