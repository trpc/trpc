/**
 * The `EntityId` module defines the branded string used to identify one entity
 * instance within an entity type. The value is the routing key that sharding
 * hashes, stores in entity addresses, and uses when sending messages to a
 * running entity.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Schema from "../Schema.ts"

/**
 * Schema for branded string entity identifiers used inside the cluster.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const EntityId = Schema.String.pipe(Schema.brand("~effect/cluster/EntityId"))

/**
 * Branded string type representing the ID of an entity instance.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type EntityId = typeof EntityId.Type

/**
 * Brands a string as an `EntityId`.
 *
 * **When to use**
 *
 * Use to turn a trusted, stable entity routing key into an `EntityId` before
 * passing it to cluster APIs.
 *
 * **Details**
 *
 * The branded value is the original string at runtime.
 *
 * **Gotchas**
 *
 * `make` does not validate, normalize, or make the value unique. Choose
 * deterministic strings because cluster routing hashes the exact entity id
 * value.
 *
 * @see {@link EntityId} for the schema that validates and encodes branded entity identifiers
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const make = (id: string): EntityId => id as EntityId
