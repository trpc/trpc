/**
 * Groups of GraphQL operations, merged to build a client. Group middleware
 * runs outside operation middleware. `@effect/graphql-generator` emits one
 * group per document file.
 *
 * @stability experimental
 * @since 4.0.0
 */
import { type Pipeable, pipeArguments } from "../Pipeable.ts"
import { hasProperty } from "../Predicate.ts"
import type * as GraphQL from "./GraphQL.ts"
import type * as GraphQLMiddleware from "./GraphQLMiddleware.ts"

const TypeId = "~effect/graphql/GraphQLGroup"

/**
 * A set of operations plus the middleware attached at the group level.
 *
 * @stability experimental
 * @category models
 * @since 4.0.0
 */
export interface GraphQLGroup<out Ops extends GraphQL.Any> extends Pipeable {
  readonly [TypeId]: typeof TypeId
  readonly operations: ReadonlyArray<Ops>
  /** Middleware attached to the group, outermost first. */
  readonly middlewares: ReadonlyArray<GraphQLMiddleware.AnyService>
  /**
   * Attaches a middleware to every operation in the group. Group middleware
   * runs outside operation middleware; several group middleware run in the
   * order attached.
   */
  middleware<M extends GraphQLMiddleware.AnyService>(middleware: M): GraphQLGroup<GraphQL.AddMiddleware<Ops, M>>
}

/**
 * Any group, with its operations erased.
 *
 * @stability experimental
 * @category utility types
 * @since 4.0.0
 */
export type Any = GraphQLGroup<GraphQL.Any>

/**
 * Extracts the union of operations in a group.
 *
 * @stability experimental
 * @category utility types
 * @since 4.0.0
 */
export type Operations<G> = G extends GraphQLGroup<infer Ops> ? Ops : never

/**
 * Tests whether a value is a {@link GraphQLGroup}.
 *
 * @stability experimental
 * @category guards
 * @since 4.0.0
 */
export const isGraphQLGroup = (u: unknown): u is Any => hasProperty(u, TypeId)

const Proto = {
  [TypeId]: TypeId,
  pipe() {
    return pipeArguments(this, arguments)
  },
  middleware(this: Any, middleware: GraphQLMiddleware.AnyService) {
    return makeProto(this.operations, [...this.middlewares, middleware])
  }
}

// The operation and middleware types of a group are phantom: at runtime a
// group holds erased `GraphQL.Any` operations and `AnyService` tags, so the
// typed constructors below state their group type with one assertion each.
const makeProto = (
  operations: ReadonlyArray<GraphQL.Any>,
  middlewares: ReadonlyArray<GraphQLMiddleware.AnyService>
): Any => {
  const byName = new Map<string, GraphQL.Any>()
  for (const operation of operations) {
    const existing = byName.get(operation.name)
    if (existing !== undefined && existing !== operation) {
      throw new Error(`GraphQLGroup: duplicate operation name "${operation.name}"`)
    }
    byName.set(operation.name, operation)
  }
  return Object.assign(Object.create(Proto), { operations: Array.from(byName.values()), middlewares })
}

/**
 * Builds a group from operations. Operation names must be unique within a
 * group, because they become the client's method names.
 *
 * **Example** (One group per `.graphql` file)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 * import { GraphQL, GraphQLGroup } from "effect/graphql"
 *
 * const Viewer = GraphQL.query("Viewer", {
 *   document: "query Viewer{viewer{login}}",
 *   result: Schema.Struct({ viewer: Schema.Struct({ login: Schema.String }) })
 * })
 *
 * const ViewerGraphQLGroup = GraphQLGroup.make(Viewer)
 *
 * ViewerGraphQLGroup.operations.map((op) => op.name) // => ["Viewer"]
 * ```
 *
 * @stability experimental
 * @category constructors
 * @since 4.0.0
 */
export const make = <const Ops extends ReadonlyArray<GraphQL.Any>>(...operations: Ops): GraphQLGroup<Ops[number]> =>
  makeProto(operations, []) as GraphQLGroup<Ops[number]>

/**
 * Merges groups into one. Middleware attached to a source group stays
 * attached to that group's operations; middleware attached to the merged
 * group afterwards runs outside all of it.
 *
 * **Example** (Auth on one file, logging on everything)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 * import { GraphQL, GraphQLGroup, GraphQLMiddleware } from "effect/graphql"
 *
 * class Auth extends GraphQLMiddleware.Service<Auth>()("app/Auth") {}
 * class Logging extends GraphQLMiddleware.Service<Logging>()("app/Logging") {}
 *
 * const Viewer = GraphQL.query("Viewer", {
 *   document: "query Viewer{viewer{login}}",
 *   result: Schema.Struct({ viewer: Schema.Struct({ login: Schema.String }) })
 * })
 * const Rate = GraphQL.query("Rate", {
 *   document: "query Rate{rateLimit{remaining}}",
 *   result: Schema.Struct({ rateLimit: Schema.Struct({ remaining: Schema.Int }) })
 * })
 *
 * const all = GraphQLGroup.merge(GraphQLGroup.make(Viewer).middleware(Auth), GraphQLGroup.make(Rate))
 *   .middleware(Logging)
 *
 * all.operations.map((op) => op.name) // => ["Viewer", "Rate"]
 * all.middlewares.map((m) => m.key) // => ["app/Logging"]
 * all.operations[0].middlewares.map((m) => m.key) // => ["app/Auth"]
 * ```
 *
 * @stability experimental
 * @category combinators
 * @since 4.0.0
 */
export const merge = <const Groups extends ReadonlyArray<Any>>(
  ...groups: Groups
): GraphQLGroup<Operations<Groups[number]>> =>
  makeProto(
    groups.flatMap((group) =>
      group.middlewares.length === 0
        ? group.operations
        : group.operations.map((operation): GraphQL.Any =>
          Object.assign(Object.create(Object.getPrototypeOf(operation)), operation, {
            middlewares: [...group.middlewares, ...operation.middlewares]
          })
        )
    ),
    []
  ) as GraphQLGroup<Operations<Groups[number]>>
