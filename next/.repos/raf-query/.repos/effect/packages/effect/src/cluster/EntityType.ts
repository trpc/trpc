/**
 * The `EntityType` module defines the branded string used to identify a kind of
 * entity in an Effect cluster. Entity type names are part of the cluster routing
 * identity: they distinguish one family of entities from another before an
 * individual entity id is considered.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Schema from "../Schema.ts"

/**
 * Schema for branded string names that identify entity types in the cluster.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const EntityType = Schema.String.pipe(Schema.brand("~effect/cluster/EntityType"))

/**
 * Branded string type representing an entity type name.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type EntityType = typeof EntityType.Type

/**
 * Brands a string as an `EntityType`.
 *
 * **When to use**
 *
 * Use to brand a stable entity family name before passing it to cluster APIs
 * that require an `EntityType`, such as entity addresses.
 *
 * **Details**
 *
 * The returned value is the same runtime string with the `EntityType` brand
 * applied by TypeScript.
 *
 * **Gotchas**
 *
 * `make` only applies the brand at the type level; it does not validate,
 * normalize, or check uniqueness. Use the `EntityType` schema when you need
 * schema-based decoding or validation, and keep names stable because the exact
 * string participates in routing identity.
 *
 * @see {@link EntityType} for schema-based decoding, validation, and encoding of entity type names
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const make = (value: string): EntityType => value as EntityType
