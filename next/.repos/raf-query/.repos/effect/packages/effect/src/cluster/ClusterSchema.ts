/**
 * The `ClusterSchema` module collects the annotations that add cluster behavior
 * to RPC protocols and entity definitions. These annotations describe how
 * requests are persisted, handled in transactions, interrupted, traced, and
 * routed to shard groups without changing the request or response schema.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Cause from "../Cause.ts"
import * as Context from "../Context.ts"
import { constFalse, constTrue, constUndefined, identity } from "../Function.ts"
import type * as Rpc from "../rpc/Rpc.ts"
import type { EntityId } from "./EntityId.ts"
import type { Request } from "./Envelope.ts"

/**
 * Annotation carried by an interruption when a persisted cluster request is
 * abandoned by its current runner and must continue under another owner.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class Abandon extends Context.Service<Abandon, true>()("effect/cluster/ClusterSchema/Abandon") {
  static annotation = this.context(true).pipe(
    Context.add(Cause.StackTrace, {
      name: "ClusterAbandon",
      stack: constUndefined,
      parent: undefined
    })
  )
}

/**
 * Annotation that marks whether a cluster request should be persisted in mailbox
 * storage.
 *
 * **Details**
 *
 * The default value is `false`.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export const Persisted = Context.Reference<boolean>("effect/cluster/ClusterSchema/Persisted", {
  defaultValue: constFalse
})

/**
 * Annotation that marks whether request handling should be wrapped in the
 * configured message storage transaction.
 *
 * **When to use**
 *
 * Use when you need server-side request handling or storage work wrapped in the
 * storage transaction.
 *
 * **Details**
 *
 * The default value is `false`. When `true`, entity handling wraps server
 * writes with the configured storage transaction.
 *
 * **Gotchas**
 *
 * This annotation has transactional behavior only when the configured
 * `MessageStorage` implements it.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export const WithTransaction = Context.Reference<boolean>(
  "effect/cluster/ClusterSchema/WithTransaction",
  { defaultValue: constFalse }
)

/**
 * Annotation that controls whether a cluster request is treated as
 * uninterruptible.
 *
 * **Details**
 *
 * Use `true` for both client and server handling, `"client"` for client-side
 * handling only, `"server"` for server-side handling only, or `false` to allow
 * interruption.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export const Uninterruptible = Context.Reference<boolean | "client" | "server">(
  "effect/cluster/ClusterSchema/Uninterruptible",
  { defaultValue: constFalse }
)

/**
 * Returns whether the `Uninterruptible` annotation applies to server-side
 * request handling for the provided context.
 *
 * **Details**
 *
 * Returns `true` only when `Uninterruptible` is `true` or `"server"`.
 *
 * @see {@link Uninterruptible} for the annotation values interpreted by this helper
 * @see {@link isUninterruptibleForClient} for the client-side counterpart
 *
 * @stability unstable
 * @category predicates
 * @since 4.0.0
 */
export const isUninterruptibleForServer = (context: Context.Context<never>): boolean => {
  const value = Context.get(context, Uninterruptible)
  return value === true || value === "server"
}

/**
 * Returns whether the `Uninterruptible` annotation applies to client-side
 * request handling for the provided context.
 *
 * **When to use**
 *
 * Use when you need client-side cluster request handling to decide whether to
 * ignore an interrupt.
 *
 * **Details**
 *
 * Returns `true` when `Uninterruptible` is `true` or `"client"`, and `false`
 * for `"server"` or the default `false`.
 *
 * @see {@link Uninterruptible} for the annotation values interpreted by this helper
 * @see {@link isUninterruptibleForServer} for the server-side counterpart
 *
 * @stability unstable
 * @category predicates
 * @since 4.0.0
 */
export const isUninterruptibleForClient = (context: Context.Context<never>): boolean => {
  const value = Context.get(context, Uninterruptible)
  return value === true || value === "client"
}

/**
 * Annotation that selects the shard group for an entity id.
 *
 * **Details**
 *
 * By default, every entity id is assigned to the `"default"` shard group.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export const ShardGroup = Context.Reference<(entityId: EntityId) => string>(
  "effect/cluster/ClusterSchema/ShardGroup",
  { defaultValue: () => (_) => "default" }
)

/**
 * Annotation that controls whether client-side cluster request tracing is
 * enabled.
 *
 * **Details**
 *
 * The default value is `true`.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export const ClientTracingEnabled = Context.Reference<boolean>("effect/cluster/ClusterSchema/ClientTracingEnabled", {
  defaultValue: constTrue
})

/**
 * Context reference for deriving request annotations from a cluster request.
 *
 * **When to use**
 *
 * Use to customize server-side request annotations based on the decoded
 * request value.
 *
 * **Gotchas**
 *
 * This only applies to requests handled by the entity, not to the generated
 * client.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export const Dynamic = Context.Reference<
  (annotations: Context.Context<never>, request: Request<Rpc.AnyWithProps>) => Context.Context<never>
>(
  "effect/cluster/ClusterSchema/Dynamic",
  { defaultValue: () => identity }
)
