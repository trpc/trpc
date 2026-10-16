import * as Predicate from "../Predicate.ts"
import type { SchemaError } from "../Schema.ts"

export const SchemaErrorTypeId = "~effect/Schema/SchemaError"

export function isSchemaError(u: unknown): u is SchemaError {
  return Predicate.hasProperty(u, SchemaErrorTypeId) && u[SchemaErrorTypeId] === SchemaErrorTypeId
}
