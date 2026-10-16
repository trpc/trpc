/**
 * HTTP propagation helpers for Effect tracing context.
 *
 * This module converts Effect `Tracer.Span` values into outbound trace headers
 * and decodes inbound propagation headers into `Tracer.ExternalSpan` parents.
 * HTTP clients use it to continue the current span across outgoing requests, and
 * server middleware uses it to parent request spans from upstream services.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Option from "../Option.ts"
import * as Tracer from "../Tracer.ts"
import * as Headers from "./Headers.ts"

/**
 * Function type for decoding tracing headers into an external span.
 *
 * **Details**
 *
 * Returns `Option.none` when the headers do not contain a supported or valid trace
 * context.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface FromHeaders {
  (headers: Headers.Headers): Option.Option<Tracer.ExternalSpan>
}

/**
 * Encodes a span into HTTP trace propagation headers.
 *
 * **Details**
 *
 * The generated headers include both compact B3 (`b3`) and W3C `traceparent`
 * formats.
 *
 * @stability unstable
 * @category encoding
 * @since 4.0.0
 */
export const toHeaders = (span: Tracer.Span): Headers.Headers =>
  Headers.fromRecordUnsafe({
    b3: `${span.traceId}-${span.spanId}-${span.sampled ? "1" : "0"}${
      Option.match(span.parent, {
        onNone: () => "",
        onSome: (parent) => `-${parent.spanId}`
      })
    }`,
    traceparent: `00-${span.traceId}-${span.spanId}-${span.sampled ? "01" : "00"}`
  })

/**
 * Decodes an external span safely from HTTP trace propagation headers.
 *
 * **Details**
 *
 * W3C `traceparent` is tried first, followed by compact B3 (`b3`) and then
 * multi-header B3 (`x-b3-*`).
 *
 * @stability unstable
 * @category decoding
 * @since 4.0.0
 */
export const fromHeaders = (headers: Headers.Headers): Option.Option<Tracer.ExternalSpan> => {
  let span = w3c(headers)
  if (Option.isSome(span)) {
    return span
  }
  span = b3(headers)
  if (Option.isSome(span)) {
    return span
  }
  return xb3(headers)
}

/**
 * Decodes an external span safely from the compact B3 `b3` header.
 *
 * **Details**
 *
 * Returns `Option.none` when the header is missing or does not contain trace and
 * span identifiers.
 *
 * @stability unstable
 * @category decoding
 * @since 4.0.0
 */
export const b3: FromHeaders = (headers) => {
  if (!("b3" in headers)) {
    return Option.none()
  }
  const parts = headers["b3"].split("-")
  if (parts.length < 2) {
    return Option.none()
  }
  return Option.some(Tracer.externalSpan({
    traceId: parts[0],
    spanId: parts[1],
    sampled: parts[2] ? parts[2] === "1" || parts[2] === "d" : true
  }))
}

/**
 * Decodes an external span safely from multi-header B3 propagation headers.
 *
 * **Details**
 *
 * The decoder reads `x-b3-traceid`, `x-b3-spanid`, and optional `x-b3-sampled`
 * and `x-b3-flags` headers. Debug flags override the sampling decision.
 *
 * @stability unstable
 * @category decoding
 * @since 4.0.0
 */
export const xb3: FromHeaders = (headers) => {
  if (!(headers["x-b3-traceid"]) || !(headers["x-b3-spanid"])) {
    return Option.none()
  }
  return Option.some(Tracer.externalSpan({
    traceId: headers["x-b3-traceid"],
    spanId: headers["x-b3-spanid"],
    sampled: headers["x-b3-flags"] === "1" ||
      (headers["x-b3-sampled"] ? headers["x-b3-sampled"] === "1" || headers["x-b3-sampled"] === "true" : true)
  }))
}

const w3cTraceId = /^[0-9a-f]{32}$/i
const w3cSpanId = /^[0-9a-f]{16}$/i

/**
 * Decodes an external span safely from the W3C `traceparent` header.
 *
 * **Details**
 *
 * Only version `00` headers with valid trace and span identifiers are accepted.
 *
 * @stability unstable
 * @category decoding
 * @since 4.0.0
 */
export const w3c: FromHeaders = (headers) => {
  if (!(headers["traceparent"])) {
    return Option.none()
  }
  const parts = headers["traceparent"].split("-")
  if (parts.length !== 4) {
    return Option.none()
  }
  const [version, traceId, spanId, flags] = parts
  switch (version) {
    case "00": {
      if (
        w3cTraceId.test(traceId) === false || w3cSpanId.test(spanId) === false ||
        traceId === "00000000000000000000000000000000" || spanId === "0000000000000000"
      ) {
        return Option.none()
      }
      return Option.some(Tracer.externalSpan({
        traceId,
        spanId,
        sampled: (parseInt(flags, 16) & 1) === 1
      }))
    }
    default: {
      return Option.none()
    }
  }
}
