import type { Differ } from "../../Differ.ts"
import * as JsonPatch from "../../JsonPatch.ts"
import type * as Schema from "../../Schema.ts"
import * as SchemaParser from "../../SchemaParser.ts"
import * as InternalToCodec from "./toCodec.ts"

/** @internal */
export function toDifferJsonPatch<T>(
  schema: Schema.ConstraintCodec<T, unknown>
): Differ<T, JsonPatch.JsonPatch> {
  const serializer = InternalToCodec.toCodecJson(schema)
  const get = SchemaParser.encodeSync(serializer)
  const set = SchemaParser.decodeSync(serializer)
  return {
    empty: [],
    diff: (oldValue, newValue) => JsonPatch.get(get(oldValue), get(newValue)),
    combine: (first, second) => [...first, ...second],
    patch: (oldValue, patch) => {
      const value = get(oldValue)
      const patched = JsonPatch.apply(patch, value)
      return Object.is(patched, value) ? oldValue : set(patched)
    }
  }
}
