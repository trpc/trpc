import type * as Duration from "../Duration.ts"
import * as Headers from "../http/Headers.ts"
import * as Result from "../Result.ts"
import * as Schema from "../Schema.ts"
import * as SchemaGetter from "../SchemaGetter.ts"

// Keep headers branded at runtime while encoding only their string entries.
export const HeadersSchema = Schema.Record(Schema.String, Schema.String).pipe(
  Schema.decodeTo(Schema.declare<Headers.Headers>(Headers.isHeaders), {
    decode: SchemaGetter.transform(Headers.fromInput),
    encode: SchemaGetter.transform((headers) => ({ ...headers }))
  })
)

/**
 * Parses a `Retry-After` header value, either whole seconds or an HTTP date,
 * into a `Duration` measured from `now` (epoch milliseconds). Anything else,
 * such as `1.5` or `-1`, yields `undefined`.
 */
export const parseRetryAfter = (value: string | undefined, now: number): Duration.Duration | undefined => {
  if (value === undefined) return undefined
  const retryAfter = Headers.parseRetryAfter(value)
  return Result.isSuccess(retryAfter) ? Headers.retryAfterDelay(retryAfter.success, now) : undefined
}
