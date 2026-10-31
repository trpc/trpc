import * as Context from "../Context.ts"

/**
 * The transaction service of the innermost transaction started with
 * `SqlClient.makeWithTransaction`. `SqlResolver` reads it to find that
 * transaction when the request's context has no `SqlClient` for it. Removing
 * the service from a context also hides the transaction from this lookup.
 *
 * @internal
 */
export const CurrentTransactionService = Context.Reference<Context.Key<any, object> | undefined>(
  "effect/sql/CurrentTransactionService",
  { defaultValue: () => undefined }
)
