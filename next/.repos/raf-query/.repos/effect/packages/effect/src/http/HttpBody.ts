/**
 * Describes HTTP request and response bodies before they reach a platform
 * adapter.
 *
 * `HttpBody` is the shared body representation used by the HTTP modules. Each
 * variant stores the payload together with metadata that can be known before
 * sending it, such as `contentType` and `contentLength`. This module includes
 * body constructors for common payload shapes, support for schema-encoded JSON
 * bodies, streaming and file-backed bodies, and the error type used when body
 * construction fails.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as ByteSize from "../ByteSize.ts"
import * as Data from "../Data.ts"
import * as Effect from "../Effect.ts"
import * as FileSystem from "../FileSystem.ts"
import { format } from "../Formatter.ts"
import * as Inspectable from "../Inspectable.ts"
import * as Option from "../Option.ts"
import * as PlatformError from "../PlatformError.ts"
import * as Predicate from "../Predicate.ts"
import * as Schema from "../Schema.ts"
import type { ParseOptions } from "../SchemaAST.ts"
import type { Issue } from "../SchemaIssue.ts"
import * as SchemaParser from "../SchemaParser.ts"
import type * as Stream_ from "../Stream.ts"
import * as UrlParams from "./UrlParams.ts"

const TypeId = "~effect/http/HttpBody"

/**
 * Returns `true` if the provided value is an `HttpBody`.
 *
 * @stability unstable
 * @category guards
 * @since 4.0.0
 */
export const isHttpBody = (u: unknown): u is HttpBody => Predicate.hasProperty(u, TypeId)

/**
 * Represents an HTTP request body.
 *
 * **Details**
 *
 * Supported variants include empty bodies, raw bodies, byte arrays, `FormData`, and streams of bytes.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type HttpBody = Empty | Raw | Uint8Array | FormData | Stream

/**
 * Namespace containing type-level members associated with `HttpBody`.
 *
 * @stability unstable
 * @since 4.0.0
 */
export declare namespace HttpBody {
  /**
   * Common protocol implemented by all HTTP body variants.
   *
   * **Details**
   *
   * It carries the variant tag plus optional `contentType` and `contentLength` metadata.
   *
   * @stability unstable
   * @category models
   * @since 4.0.0
   */
  export interface Proto extends Inspectable.Inspectable {
    readonly [TypeId]: typeof TypeId
    readonly _tag: string
    readonly contentType?: string | undefined
    readonly contentLength?: number | undefined
  }

  /**
   * Minimal Web `File`-like shape used by HTTP helpers that need file metadata.
   *
   * @stability unstable
   * @category models
   * @since 4.0.0
   */
  export interface FileLike {
    readonly name: string
    readonly lastModified: number
    readonly size: number
    readonly stream: () => unknown
    readonly type: string
  }
}

const HttpBodyErrorTypeId = "~effect/http/HttpBody/HttpBodyError"

/**
 * Error produced while constructing an HTTP body from JSON or schema-encoded input.
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class HttpBodyError extends Data.TaggedError("HttpBodyError")<{
  readonly reason: ErrorReason
  readonly cause?: unknown
}> {
  /**
   * Marks this value as an HTTP body error for runtime guards.
   *
   * @stability unstable
   * @since 4.0.0
   */
  readonly [HttpBodyErrorTypeId] = HttpBodyErrorTypeId
}

/**
 * Checks whether a value is an `HttpBodyError`.
 *
 * @stability unstable
 * @category guards
 * @since 4.0.0
 */
export const isHttpBodyError = (u: unknown): u is HttpBodyError => Predicate.hasProperty(u, HttpBodyErrorTypeId)

/**
 * Reason for an `HttpBodyError`.
 *
 * **Details**
 *
 * `JsonError` represents a `JSON.stringify` failure; `SchemaError` represents a schema encoding issue.
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export type ErrorReason = {
  readonly _tag: "JsonError"
} | {
  readonly _tag: "SchemaError"
  readonly issue: Issue
}

abstract class Proto implements HttpBody.Proto {
  readonly [TypeId]: typeof TypeId
  abstract readonly _tag: string
  constructor() {
    this[TypeId] = TypeId
  }
  abstract toJSON(): unknown
  [Inspectable.NodeInspectSymbol](): unknown {
    return this.toJSON()
  }
  toString(): string {
    return format(this, { ignoreToString: true })
  }
}

/**
 * HTTP body variant representing the absence of request content.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export class Empty extends Proto {
  readonly _tag = "Empty"
  toJSON(): unknown {
    return {
      _id: "effect/HttpBody",
      _tag: "Empty"
    }
  }
}

/**
 * Provides the singleton empty HTTP body.
 *
 * **When to use**
 *
 * Use when you need an HTTP body value that represents no body content.
 *
 * @stability unstable
 * @category constants
 * @since 4.0.0
 */
export const empty: Empty = new Empty()

/**
 * HTTP body variant containing an arbitrary runtime body value with optional content metadata.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export class Raw extends Proto {
  readonly _tag = "Raw"
  readonly body: unknown
  readonly contentType: string | undefined
  readonly contentLength: number | undefined

  constructor(
    body: unknown,
    contentType: string | undefined,
    contentLength: number | undefined
  ) {
    super()
    this.body = body
    this.contentType = contentType
    this.contentLength = contentLength
  }
  toJSON(): unknown {
    return {
      _id: "effect/HttpBody",
      _tag: "Raw",
      body: this.body,
      contentType: this.contentType,
      contentLength: this.contentLength
    }
  }
}

/**
 * Creates a raw HTTP body from an arbitrary value and optional `contentType` and `contentLength` metadata.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const raw = (
  body: unknown,
  options?: {
    readonly contentType?: string | undefined
    readonly contentLength?: number | undefined
  } | undefined
): Raw => new Raw(body, options?.contentType, options?.contentLength)

/**
 * HTTP body variant backed by a `Uint8Array`.
 *
 * **Details**
 *
 * It stores the bytes, content type, and byte length.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export class Uint8Array extends Proto {
  readonly _tag = "Uint8Array"
  readonly contentType: string
  readonly contentLength: number
  /** Original text retained for adapters that can skip encoding. */
  readonly text: string | undefined
  private _body: globalThis.Uint8Array | undefined

  constructor(
    body: globalThis.Uint8Array | undefined,
    contentType: string,
    contentLength: number,
    text?: string
  ) {
    super()
    this._body = body
    this.text = text
    this.contentType = contentType
    this.contentLength = contentLength
  }
  get body(): globalThis.Uint8Array {
    return this._body ??= encodeText(this.text!)
  }
  toJSON(): unknown {
    const toString = this.contentType.startsWith("text/") || this.contentType.endsWith("json")
    return {
      _id: "effect/HttpBody",
      _tag: "Uint8Array",
      body: toString ? new TextDecoder().decode(this.body) : `Uint8Array(${this.body.length})`,
      contentType: this.contentType,
      contentLength: this.contentLength
    }
  }
}

/**
 * Creates a byte-array HTTP body.
 *
 * **Details**
 *
 * The content type defaults to `application/octet-stream`, and the content length is the byte array length.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const uint8Array = (body: globalThis.Uint8Array, contentType?: string): Uint8Array =>
  new Uint8Array(body, contentType ?? "application/octet-stream", body.length)

const encoder = new TextEncoder()

// Buffer encodes UTF-8 faster than TextEncoder when available.
const buffer = (globalThis as {
  readonly Buffer?: {
    readonly from: (body: string, encoding: "utf8") => globalThis.Uint8Array
    readonly byteLength: (body: string, encoding: "utf8") => number
  }
}).Buffer
const encodeText: (body: string) => globalThis.Uint8Array = buffer !== undefined
  ? (body) => buffer.from(body, "utf8")
  : (body) => encoder.encode(body)

/**
 * Creates a UTF-8 encoded text HTTP body.
 *
 * **Details**
 *
 * The content type defaults to `text/plain`. Text bodies are encoded lazily.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const text = (body: string, contentType?: string): Uint8Array => {
  if (typeof body !== "string") {
    // Preserve untyped callers that relied on TextEncoder coercion.
    body = body === undefined ? "" : String(body)
  }
  if (buffer !== undefined) {
    return new Uint8Array(undefined, contentType ?? "text/plain", buffer.byteLength(body, "utf8"), body)
  }
  const bytes = encoder.encode(body)
  return new Uint8Array(bytes, contentType ?? "text/plain", bytes.length, body)
}

/**
 * Creates a JSON HTTP body using `JSON.stringify`, throwing if serialization fails.
 *
 * **Details**
 *
 * The content type defaults to `application/json`.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const jsonUnsafe = (body: unknown, contentType?: string): Uint8Array =>
  text(JSON.stringify(body), contentType ?? "application/json")

/**
 * Creates a JSON HTTP body in an `Effect`.
 *
 * **Details**
 *
 * `JSON.stringify` failures are captured as `HttpBodyError` values, and the content type defaults to `application/json`.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const json = (body: unknown, contentType?: string): Effect.Effect<Uint8Array, HttpBodyError> =>
  Effect.try({
    try: () => text(JSON.stringify(body), contentType ?? "application/json"),
    catch: (cause) => new HttpBodyError({ reason: { _tag: "JsonError" }, cause })
  })

/**
 * Creates a JSON body constructor that first encodes values with the schema's JSON codec.
 *
 * **Details**
 *
 * Schema encoding issues and JSON serialization failures are returned as `HttpBodyError` values.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const jsonSchema = <S extends Schema.Constraint>(
  schema: S,
  options?: ParseOptions | undefined
) => {
  const encode = SchemaParser.encodeUnknownEffect(Schema.toCodecJson(schema))
  return (body: S["Type"], contentType?: string): Effect.Effect<Uint8Array, HttpBodyError, S["EncodingServices"]> =>
    encode(body, options).pipe(
      Effect.mapError((issue) => new HttpBodyError({ reason: { _tag: "SchemaError", issue }, cause: issue })),
      Effect.flatMap((body) => json(body, contentType))
    )
}

/**
 * Creates an `application/x-www-form-urlencoded` HTTP body from `UrlParams`.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const urlParams = (urlParams: UrlParams.Input, contentType?: string): Uint8Array =>
  text(UrlParams.toString(UrlParams.fromInput(urlParams)), contentType ?? "application/x-www-form-urlencoded")

/**
 * HTTP body variant backed by Web `FormData`.
 *
 * **Details**
 *
 * The content type and content length are left unset so the runtime can supply multipart boundaries.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export class FormData extends Proto {
  readonly _tag = "FormData"
  readonly contentType = undefined
  readonly contentLength = undefined
  readonly formData: globalThis.FormData

  constructor(
    formData: globalThis.FormData
  ) {
    super()
    this.formData = formData
  }
  toJSON(): unknown {
    return {
      _id: "effect/HttpBody",
      _tag: "FormData",
      formData: this.formData
    }
  }
}

/**
 * Wraps a Web `FormData` value as an HTTP body.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const formData = (body: globalThis.FormData): FormData => new FormData(body)

/**
 * Record input accepted by `formDataRecord`.
 *
 * **Details**
 *
 * Each field may be a single coercible value or an array of coercible values.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type FormDataInput = Record<string, FormDataCoercible | ReadonlyArray<FormDataCoercible>>

/**
 * Value that can be appended by `formDataRecord`.
 *
 * **Details**
 *
 * `File` and `Blob` values are appended directly, primitive values are converted to strings, and `null` or `undefined` values are skipped.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type FormDataCoercible = string | number | boolean | globalThis.File | globalThis.Blob | null | undefined

const appendFormDataValue = (formData: globalThis.FormData, key: string, value: FormDataCoercible): void => {
  if (value == null) {
    return
  }
  if (typeof value === "object") {
    formData.append(key, value)
    return
  }
  formData.append(key, String(value))
}

/**
 * Creates a `FormData` HTTP body from a record.
 *
 * **Details**
 *
 * Array fields append each item under the same key; primitive values are stringified, `File` and `Blob` values are appended directly, and nullish values are skipped.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const formDataRecord = (entries: FormDataInput): FormData => {
  const data = new globalThis.FormData()
  for (const [key, value] of Object.entries(entries)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        appendFormDataValue(data, key, item)
      }
    } else {
      appendFormDataValue(data, key, value as FormDataCoercible)
    }
  }
  return formData(data)
}

/**
 * HTTP body variant backed by a stream of `Uint8Array` chunks.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export class Stream extends Proto {
  readonly _tag = "Stream"
  readonly stream: Stream_.Stream<globalThis.Uint8Array, unknown>
  readonly contentType: string
  readonly contentLength: number | undefined

  constructor(
    stream: Stream_.Stream<globalThis.Uint8Array, unknown>,
    contentType: string,
    contentLength: number | undefined
  ) {
    super()
    this.stream = stream
    this.contentType = contentType
    this.contentLength = contentLength
  }
  toJSON(): unknown {
    return {
      _id: "effect/HttpBody",
      _tag: "Stream",
      contentType: this.contentType,
      contentLength: this.contentLength
    }
  }
}

/**
 * Creates a streaming HTTP body from a stream of byte chunks.
 *
 * **Details**
 *
 * The content type defaults to `application/octet-stream`; content length is optional.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const stream = (
  body: Stream_.Stream<globalThis.Uint8Array, unknown>,
  contentType?: string,
  contentLength?: number
): Stream => new Stream(body, contentType ?? "application/octet-stream", contentLength)

const fileRangeSize = (
  input: ByteSize.Input,
  field: string,
  method: string
): Effect.Effect<ByteSize.ByteSize, PlatformError.PlatformError> => {
  const size = ByteSize.fromInput(input)
  return Option.isSome(size)
    ? Effect.succeed(size.value)
    : Effect.fail(PlatformError.badArgument({
      module: "HttpBody",
      method,
      description: `Invalid ${field}: ${input}`
    }))
}

const fileContentLength = Effect.fnUntraced(function*(
  size: ByteSize.ByteSize,
  method: string,
  options?: {
    readonly bytesToRead?: ByteSize.Input | undefined
    readonly offset?: ByteSize.Input | undefined
  }
): Effect.fn.Return<number, PlatformError.PlatformError> {
  const offset = options?.offset === undefined ? ByteSize.zero : yield* fileRangeSize(options.offset, "offset", method)
  const bytesToRead = options?.bytesToRead === undefined
    ? undefined
    : yield* fileRangeSize(options.bytesToRead, "bytesToRead", method)
  const available = offset >= size ? BigInt("0") : size - offset
  const length = bytesToRead === undefined || bytesToRead > available ? available : bytesToRead
  if (length > BigInt(Number.MAX_SAFE_INTEGER)) {
    return yield* Effect.fail(PlatformError.badArgument({
      module: "HttpBody",
      method,
      description: `Content length exceeds Number.MAX_SAFE_INTEGER: ${length}`
    }))
  }
  return Number(length)
})

/**
 * Creates a streaming HTTP body for a file path.
 *
 * **Details**
 *
 * The effect requires `FileSystem`, stats the file to set the selected content length, and can fail with
 * `PlatformError`.
 *
 * Range validation and file access are deferred until the effect runs. Numeric range inputs must be
 * non-negative safe integers; bigint and byte-size strings can represent larger values. Malformed strings,
 * negative values, and non-finite, fractional, or unsafe numbers fail with `PlatformError` / `BadArgument`.
 *
 * The selected length is calculated exactly with bigint arithmetic and clamped to the bytes available after
 * `offset` (zero at or past EOF). Since `Stream.contentLength` is a number, a final length above
 * `Number.MAX_SAFE_INTEGER` fails with `BadArgument`. Larger sizes, offsets, and byte counts are valid when
 * the final clamped length is representable; the resulting Content-Length header preserves that exact length.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const file = (
  path: string,
  options?: {
    readonly bytesToRead?: ByteSize.Input | undefined
    readonly chunkSize?: number | undefined
    readonly offset?: ByteSize.Input | undefined
    readonly contentType?: string | undefined
  }
): Effect.Effect<Stream, PlatformError.PlatformError, FileSystem.FileSystem> =>
  Effect.flatMap(
    FileSystem.FileSystem,
    (fs) =>
      Effect.flatMap(fs.stat(path), (info) =>
        Effect.map(fileContentLength(info.size, "file", options), (contentLength) =>
          stream(
            fs.stream(path, options),
            options?.contentType,
            contentLength
          )))
  )

/**
 * Creates a streaming HTTP body for a file path using already-known file information.
 *
 * **Details**
 *
 * The effect requires `FileSystem`, uses the provided file size to determine the selected content length, and can
 * fail with `PlatformError`.
 *
 * Like {@link file}, this constructor validates ranges lazily and calculates the EOF-clamped length with exact
 * bigint arithmetic. Invalid range inputs and final lengths above `Number.MAX_SAFE_INTEGER` fail with
 * `PlatformError` / `BadArgument`. Larger sizes, offsets, and byte counts remain valid when the final length
 * is representable as a safe integer, preserving the exact Content-Length header.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const fileFromInfo = (
  path: string,
  info: FileSystem.File.Info,
  options?: {
    readonly bytesToRead?: ByteSize.Input | undefined
    readonly chunkSize?: number | undefined
    readonly offset?: ByteSize.Input | undefined
    readonly contentType?: string | undefined
  }
): Effect.Effect<Stream, PlatformError.PlatformError, FileSystem.FileSystem> =>
  Effect.flatMap(
    FileSystem.FileSystem,
    (fs) =>
      Effect.map(fileContentLength(info.size, "fileFromInfo", options), (contentLength) =>
        stream(
          fs.stream(path, options),
          options?.contentType,
          contentLength
        ))
  )
