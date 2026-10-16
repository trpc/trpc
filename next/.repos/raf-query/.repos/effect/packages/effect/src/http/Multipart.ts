/**
 * Parses and persists HTTP `multipart/form-data` request bodies.
 *
 * `Multipart` turns incoming byte streams into typed form parts. Text parts
 * become decoded fields, while upload parts stay as streamed files until they
 * are collected or written to scoped temporary files. The persisted
 * representation can then be decoded with schemas for handlers that receive
 * fields and uploaded files together. This module also includes multipart error
 * types, schema helpers for persisted files, and parser limit settings.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Arr from "../Array.ts"
import * as ByteSize from "../ByteSize.ts"
import * as Cause from "../Cause.ts"
import * as Channel from "../Channel.ts"
import * as Context from "../Context.ts"
import * as Data from "../Data.ts"
import * as Effect from "../Effect.ts"
import * as ErrorReporter from "../ErrorReporter.ts"
import * as Exit from "../Exit.ts"
import * as FileSystem from "../FileSystem.ts"
import { constant, dual } from "../Function.ts"
import * as Inspectable from "../Inspectable.ts"
import * as Option from "../Option.ts"
import * as Path from "../Path.ts"
import * as Predicate from "../Predicate.ts"
import * as Pull from "../Pull.ts"
import * as Schema from "../Schema.ts"
import type { ParseOptions } from "../SchemaAST.ts"
import * as SchemaTransformation from "../SchemaTransformation.ts"
import type * as Scope from "../Scope.ts"
import * as Stream from "../Stream.ts"
import * as IncomingMessage from "./HttpIncomingMessage.ts"
import * as HttpServerRespondable from "./HttpServerRespondable.ts"
import * as HttpServerResponse from "./HttpServerResponse.ts"
import * as MP from "./MultipartParser.ts"

/**
 * Type identifier used to brand multipart part values.
 *
 * @stability unstable
 * @category type IDs
 * @since 4.0.0
 */
export const TypeId = "~effect/http/Multipart"

/**
 * A parsed multipart part.
 *
 * **Details**
 *
 * A part is either a text `Field` or a streamed `File`.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type Part = Field | File

/**
 * Namespace containing shared multipart part model types.
 *
 * @stability unstable
 * @since 4.0.0
 */
export declare namespace Part {
  /**
   * Common protocol implemented by multipart part values.
   *
   * **Details**
   *
   * It provides the multipart type identifier, tag, and inspectable behavior shared
   * by fields, files, and persisted files.
   *
   * @stability unstable
   * @category models
   * @since 4.0.0
   */
  export interface Proto extends Inspectable.Inspectable {
    readonly [TypeId]: typeof TypeId
    readonly _tag: string
  }
}

/**
 * Multipart form field containing a decoded text value.
 *
 * **Details**
 *
 * The `key` is the field name, `contentType` is the part media type, and `value`
 * is the decoded field content.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Field extends Part.Proto {
  readonly _tag: "Field"
  readonly key: string
  readonly contentType: string
  readonly value: string
}

/**
 * Returns `true` when a value has the multipart part type identifier.
 *
 * **Details**
 *
 * This includes `Field`, `File`, and `PersistedFile` values. Use
 * `isStreamPart` to identify only parsed, streamed parts.
 *
 * @stability unstable
 * @category guards
 * @since 4.0.0
 */
export const isPart = (u: unknown): u is Part => Predicate.hasProperty(u, TypeId)

/**
 * Returns `true` when a value is a multipart text `Field` or streamed `File`.
 *
 * @stability unstable
 * @category guards
 * @since 4.0.0
 */
export const isStreamPart = (u: unknown): u is Part => isPart(u) && (u._tag === "Field" || u._tag === "File")

/**
 * Returns `true` when a value is a multipart text `Field`.
 *
 * @stability unstable
 * @category guards
 * @since 4.0.0
 */
export const isField = (u: unknown): u is Field => isPart(u) && u._tag === "Field"

/**
 * Multipart file part.
 *
 * **Gotchas**
 *
 * The file content is exposed as a byte stream. `contentEffect` collects the full
 * file into memory and should be used only when the file size is acceptable.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface File extends Part.Proto {
  readonly _tag: "File"
  readonly key: string
  readonly name: string
  readonly contentType: string
  readonly content: Stream.Stream<Uint8Array, MultipartError>
  readonly contentEffect: Effect.Effect<Uint8Array, MultipartError>
}

/**
 * Returns `true` when a value is a multipart `File`.
 *
 * @stability unstable
 * @category guards
 * @since 4.0.0
 */
export const isFile = (u: unknown): u is File => isPart(u) && u._tag === "File"

/**
 * Multipart file part that has been written to the filesystem.
 *
 * **Details**
 *
 * The `path` points to the persisted file while the scope used to persist the
 * multipart data remains open.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface PersistedFile extends Part.Proto {
  readonly _tag: "PersistedFile"
  readonly key: string
  readonly name: string
  readonly contentType: string
  readonly path: string
}

/**
 * Returns `true` when a value is a persisted multipart file.
 *
 * @stability unstable
 * @category guards
 * @since 4.0.0
 */
export const isPersistedFile = (u: unknown): u is PersistedFile =>
  Predicate.hasProperty(u, TypeId) && Predicate.isTagged(u, "PersistedFile")

/**
 * Record representation of persisted multipart data.
 *
 * **Details**
 *
 * Field names map to text values, arrays of text values, or arrays of
 * `PersistedFile` values.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Persisted {
  readonly [key: string]: ReadonlyArray<PersistedFile> | ReadonlyArray<string> | string
}

const MultipartErrorTypeId = "~effect/http/Multipart/MultipartError"

const toMultipartError = (cause: unknown): MultipartError =>
  isMultipartError(cause)
    ? cause
    : MultipartError.fromReason("InternalError", cause)

/**
 * Error reason carried by a `MultipartError`.
 *
 * **Details**
 *
 * It identifies parser and limit failures such as oversized files or fields, too
 * many parts, total body size limits, parse errors, and internal errors.
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class MultipartErrorReason extends Data.Error<{
  readonly _tag: "FileTooLarge" | "FieldTooLarge" | "BodyTooLarge" | "TooManyParts" | "InternalError" | "Parse"
  readonly cause?: unknown
}> {}

const responseStatusByReason = {
  FileTooLarge: 413,
  FieldTooLarge: 413,
  BodyTooLarge: 413,
  TooManyParts: 413,
  InternalError: 500,
  Parse: 400
} as const satisfies Record<MultipartErrorReason["_tag"], number>

/**
 * Error raised while parsing, streaming, or persisting multipart form data.
 *
 * **Details**
 *
 * The `reason` field contains the concrete `MultipartErrorReason`. When used as
 * a server response, parse errors render as `400`, limit errors as `413`, and
 * internal errors as `500`. Multipart errors are ignored by the error reporter.
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class MultipartError extends Data.TaggedError("MultipartError")<{
  readonly reason: MultipartErrorReason
}> implements HttpServerRespondable.Respondable {
  /**
   * Creates a multipart error from a reason tag and optional cause.
   *
   * @stability unstable
   * @since 4.0.0
   */
  static fromReason(reason: MultipartErrorReason["_tag"], cause?: unknown): MultipartError {
    return new MultipartError({ reason: new MultipartErrorReason({ _tag: reason, cause }) })
  }

  /**
   * Marks this value as a multipart error for runtime guards.
   *
   * @stability unstable
   * @since 4.0.0
   */
  readonly [MultipartErrorTypeId] = MultipartErrorTypeId

  override readonly [ErrorReporter.ignore] = true;

  /**
   * Converts the multipart error into an HTTP response based on its reason.
   *
   * **Details**
   *
   * Parse errors produce `400`, size and part-count limits produce `413`, and
   * internal errors produce `500`.
   *
   * @stability unstable
   * @since 4.0.0
   */
  [HttpServerRespondable.symbol]() {
    return Effect.succeed(HttpServerResponse.empty({ status: responseStatusByReason[this.reason._tag] }))
  }

  /**
   * Uses the concrete multipart error reason as the public message.
   *
   * @stability unstable
   * @since 4.0.0
   */
  override get message(): string {
    return this.reason._tag
  }
}

/**
 * Checks whether a value is a `MultipartError`.
 *
 * @stability unstable
 * @category guards
 * @since 4.0.0
 */
export const isMultipartError = (u: unknown): u is MultipartError => Predicate.hasProperty(u, MultipartErrorTypeId)

/**
 * Schema type for persisted multipart files.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export interface PersistedFileSchema extends Schema.declare<PersistedFile> {}

const PersistedFileEncoded = Schema.Struct({
  key: Schema.String,
  name: Schema.String,
  contentType: Schema.String.annotate({ contentEncoding: "binary" }),
  path: Schema.String
})

/**
 * Schema for persisted multipart files.
 *
 * **Details**
 *
 * The encoded form contains the field key, original file name, content type, and
 * filesystem path.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const PersistedFileSchema: PersistedFileSchema = Schema.declare(
  isPersistedFile,
  {
    representation: {
      id: "effect/http/PersistedFile",
      payload: null
    },
    toCode: () => ({
      runtime: "Multipart.PersistedFileSchema",
      Type: "Multipart.PersistedFile",
      importDeclarations: [`import * as Multipart from "effect/http/Multipart"`]
    }),
    expected: "PersistedFile",
    toCodecJson: () =>
      Schema.link<PersistedFile>()(
        PersistedFileEncoded,
        SchemaTransformation.transform({
          decode: ({ contentType, key, name, path }) => new PersistedFileImpl(key, name, contentType, path),
          encode: (file) => ({
            key: file.key,
            name: file.name,
            contentType: file.contentType,
            path: file.path
          })
        })
      )
  }
)

/**
 * Schema for an array of persisted multipart files.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const FilesSchema: Schema.$Array<PersistedFileSchema> = Schema.Array(PersistedFileSchema)

/**
 * Schema for exactly one persisted multipart file.
 *
 * **Details**
 *
 * The encoded form is a one-element file array, while the decoded value is the
 * single `PersistedFile`.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const SingleFileSchema: Schema.decodeTo<PersistedFileSchema, Schema.$Array<PersistedFileSchema>> = FilesSchema
  .check(
    Schema.isBetweenLength(1, 1)
  ).pipe(
    Schema.decodeTo(
      PersistedFileSchema,
      SchemaTransformation.transform({
        decode: ([file]) => file,
        encode: (file) => [file]
      })
    )
  )

/**
 * Creates a decoder for persisted multipart data using the supplied schema.
 *
 * **Details**
 *
 * The returned function decodes an unknown input into the schema output and fails
 * with `SchemaError` when validation fails.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const schemaPersisted = <A, I extends Partial<Persisted>, RD>(
  schema: Schema.ConstraintCodec<A, I, RD, unknown>
): (input: unknown, options?: ParseOptions) => Effect.Effect<A, Schema.SchemaError, RD> =>
  Schema.decodeUnknownEffect(schema)

/**
 * Creates a decoder for a JSON-encoded field in persisted multipart data.
 *
 * **Details**
 *
 * The selected field is parsed from a JSON string and decoded with the supplied
 * schema.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const schemaJson = <A, RD>(
  schema: Schema.ConstraintDecoder<A, RD>,
  options?: (ParseOptions & IncomingMessage.JsonOptions) | undefined
): {
  (
    field: string
  ): (persisted: Persisted) => Effect.Effect<A, Schema.SchemaError, RD>
  (
    persisted: Persisted,
    field: string
  ): Effect.Effect<A, Schema.SchemaError, RD>
} => {
  const fromJson = Schema.fromJsonString(schema, options)
  return dual(2, (persisted: Persisted, field: string): Effect.Effect<A, Schema.SchemaError, RD> =>
    Effect.map(
      Schema.decodeUnknownEffect(Schema.Struct({ [field]: fromJson }))(persisted, options),
      (_) => _[field]
    ))
}

/**
 * Builds the low-level multipart parser configuration from request headers and
 * the current fiber context.
 *
 * **Details**
 *
 * Parser limits are read from the multipart references, including maximum parts,
 * field size, file size, total body size, and field MIME type overrides.
 *
 * @stability unstable
 * @category configuration
 * @since 4.0.0
 */
export const makeConfig = (
  headers: Record<string, string>
): Effect.Effect<MP.BaseConfig> =>
  Effect.withFiber((fiber) => {
    const mimeTypes = Context.get(fiber.context, FieldMimeTypes)
    return Effect.succeed<MP.BaseConfig>({
      headers,
      maxParts: fiber.getRef(MaxParts),
      maxFieldSize: fiber.getRef(MaxFieldSize),
      maxPartSize: fiber.getRef(MaxFileSize),
      maxTotalSize: fiber.getRef(IncomingMessage.MaxBodySize),
      isFile: mimeTypes.length === 0 ? undefined : (info: MP.PartInfo): boolean =>
        !mimeTypes.some(
          (_) => info.contentType.includes(_)
        ) && MP.defaultIsFile(info)
    })
  })

/**
 * Creates a channel that parses multipart byte chunks into multipart parts.
 *
 * **Details**
 *
 * The channel consumes non-empty batches of `Uint8Array` chunks and emits
 * non-empty batches of parsed `Part` values, failing with `MultipartError` for
 * parser and limit failures.
 *
 * @stability unstable
 * @category parsing
 * @since 4.0.0
 */
export const makeChannel = <IE>(headers: Record<string, string>): Channel.Channel<
  Arr.NonEmptyReadonlyArray<Part>,
  MultipartError | IE,
  void,
  Arr.NonEmptyReadonlyArray<Uint8Array>,
  IE,
  unknown
> =>
  Channel.fromTransform((upstream) =>
    Effect.map(makeConfig(headers), (config) => {
      let partsBuffer: Array<Part> = []
      let exit = Option.none<Exit.Exit<never, IE | MultipartError | Cause.Done>>()
      let ended = false

      const parser = MP.make({
        ...config,
        onField(info, value) {
          partsBuffer.push(new FieldImpl(info.name, info.contentType, MP.decodeField(info, value)))
        },
        onFile(info) {
          let chunks: Array<Uint8Array> = []
          let finished = false
          const pullChunks = Channel.fromPull(
            Effect.succeed(
              Effect.suspend(function loop(): Pull.Pull<Arr.NonEmptyReadonlyArray<Uint8Array>, IE | MultipartError> {
                if (!Arr.isReadonlyArrayNonEmpty(chunks)) {
                  if (finished) {
                    return Cause.done()
                  }
                  if (Option.isSome(exit)) {
                    return exit.value
                  }
                  return Effect.flatMap(pump, loop)
                }
                const chunk = chunks
                chunks = []
                return Effect.succeed(chunk)
              })
            )
          )
          partsBuffer.push(new FileImpl(info, Channel.mapError(pullChunks, toMultipartError)))
          return function(chunk) {
            if (chunk === null) {
              finished = true
            } else {
              chunks.push(chunk)
            }
          }
        },
        onError(error_) {
          exit = Option.some(Exit.fail(convertError(error_)))
        },
        onDone() {
          if (Option.isNone(exit)) {
            exit = Option.some(Exit.fail(Cause.Done()))
          }
        }
      })

      const pump = upstream.pipe(
        Effect.flatMap((chunk) => {
          for (let i = 0; i < chunk.length; i++) {
            parser.write(chunk[i])
          }
          return Effect.void
        }),
        Effect.catchCause((cause) => {
          if (Pull.isDoneCause(cause)) {
            if (!ended) {
              ended = true
              parser.end()
            }
          } else {
            exit = Option.some(Exit.failCause(cause)) as any
          }
          return Effect.void
        })
      )

      return Effect.suspend(function loop(): Pull.Pull<Arr.NonEmptyReadonlyArray<Part>, IE | MultipartError> {
        if (!Arr.isReadonlyArrayNonEmpty(partsBuffer)) {
          if (Option.isSome(exit)) {
            return exit.value
          }
          return Effect.flatMap(pump, loop)
        }
        const parts = partsBuffer
        partsBuffer = []
        return Effect.succeed(parts)
      })
    })
  )

function convertError(cause: MP.MultipartError): MultipartError {
  switch (cause._tag) {
    case "ReachedLimit": {
      switch (cause.limit) {
        case "MaxParts": {
          return MultipartError.fromReason("TooManyParts", cause)
        }
        case "MaxFieldSize": {
          return MultipartError.fromReason("FieldTooLarge", cause)
        }
        case "MaxPartSize": {
          return MultipartError.fromReason("FileTooLarge", cause)
        }
        case "MaxTotalSize": {
          return MultipartError.fromReason("BodyTooLarge", cause)
        }
      }
    }
    default: {
      return MultipartError.fromReason("Parse", cause)
    }
  }
}

abstract class PartBase extends Inspectable.Class {
  readonly [TypeId]: typeof TypeId
  constructor() {
    super()
    this[TypeId] = TypeId
  }
}

class FieldImpl extends PartBase implements Field {
  readonly _tag = "Field"
  readonly key: string
  readonly contentType: string
  readonly value: string

  constructor(
    key: string,
    contentType: string,
    value: string
  ) {
    super()
    this.key = key
    this.contentType = contentType
    this.value = value
  }

  toJSON(): unknown {
    return {
      _id: "@effect/platform/Multipart/Part",
      _tag: "Field",
      key: this.key,
      contentType: this.contentType,
      value: this.value
    }
  }
}

class FileImpl extends PartBase implements File {
  readonly _tag = "File"
  readonly key: string
  readonly name: string
  readonly contentType: string
  readonly content: Stream.Stream<Uint8Array, MultipartError>
  readonly contentEffect: Effect.Effect<Uint8Array, MultipartError>

  constructor(
    info: MP.PartInfo,
    channel: Channel.Channel<Arr.NonEmptyReadonlyArray<Uint8Array>, MultipartError>
  ) {
    super()
    this.key = info.name
    this.name = info.filename ?? info.name
    this.contentType = info.contentType
    this.content = Stream.fromChannel(channel)
    this.contentEffect = Channel.mkUint8Array(channel)
  }

  toJSON(): unknown {
    return {
      _id: "@effect/platform/Multipart/Part",
      _tag: "File",
      key: this.key,
      name: this.name,
      contentType: this.contentType
    }
  }
}

const defaultWriteFile = (path: string, file: File) =>
  Effect.flatMap(
    FileSystem.FileSystem,
    (fs) => Effect.mapError(Stream.run(file.content, fs.sink(path)), toMultipartError)
  )

/**
 * Runs a channel of byte chunks and collects all output into a single
 * `Uint8Array`.
 *
 * **Gotchas**
 *
 * This materializes the full content in memory.
 * The source channel must not reuse or mutate emitted buffers, which are retained
 * until collection completes.
 *
 * @stability unstable
 * @category converting
 * @since 4.0.0
 */
export const collectUint8Array = <OE, OD, R>(
  self: Channel.Channel<Arr.NonEmptyReadonlyArray<Uint8Array>, OE, OD, unknown, unknown, unknown, R>
): Effect.Effect<Uint8Array<ArrayBuffer>, OE, R> => Channel.mkUint8Array(self)

/**
 * Persists a stream of multipart parts into a record.
 *
 * **Details**
 *
 * Text fields are collected as strings, and file parts are written to files in a
 * scoped temporary directory.
 *
 * **Gotchas**
 *
 * Persisted file paths remain valid for the lifetime of the scope.
 *
 * @stability unstable
 * @category converting
 * @since 4.0.0
 */
export const toPersisted = (
  stream: Stream.Stream<Part, MultipartError>,
  writeFile = defaultWriteFile
): Effect.Effect<Persisted, MultipartError, FileSystem.FileSystem | Path.Path | Scope.Scope> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path_ = yield* Path.Path
    const dir = yield* fs.makeTempDirectoryScoped()
    const persisted: Record<string, Array<PersistedFile> | Array<string> | string> = Object.create(null)
    const usedPaths = new Set<string>()
    let fileIndex = 0
    yield* Stream.runForEach(stream, (part) => {
      if (part._tag === "Field") {
        if (!(part.key in persisted)) {
          persisted[part.key] = part.value
        } else if (typeof persisted[part.key] === "string") {
          persisted[part.key] = [persisted[part.key] as string, part.value]
        } else {
          ;(persisted[part.key] as Array<string>).push(part.value)
        }
        return Effect.void
      } else if (part.name === "") {
        return Effect.void
      }
      const file = part
      const fileName = path_.basename(file.name).slice(-128)
      let path = path_.join(dir, fileName)
      while (usedPaths.has(path)) {
        path = path_.join(dir, `${fileIndex++}-${fileName}`)
      }
      usedPaths.add(path)
      const filePart = new PersistedFileImpl(
        file.key,
        file.name,
        file.contentType,
        path
      )
      if (Array.isArray(persisted[part.key])) {
        ;(persisted[part.key] as Array<PersistedFile>).push(filePart)
      } else {
        persisted[part.key] = [filePart]
      }
      return writeFile(path, file)
    })
    return persisted
  }).pipe(
    Effect.catchTag("PlatformError", (cause) => Effect.fail(MultipartError.fromReason("InternalError", cause)))
  )

class PersistedFileImpl extends PartBase implements PersistedFile {
  readonly _tag = "PersistedFile"
  readonly key: string
  readonly name: string
  readonly contentType: string
  readonly path: string

  constructor(
    key: string,
    name: string,
    contentType: string,
    path: string
  ) {
    super()
    this.key = key
    this.name = name
    this.contentType = contentType
    this.path = path
  }

  toJSON(): unknown {
    return {
      _id: "@effect/platform/Multipart/Part",
      _tag: "PersistedFile",
      key: this.key,
      name: this.name,
      contentType: this.contentType,
      path: this.path
    }
  }
}

/**
 * Creates a context containing multipart parser limit settings.
 *
 * **Details**
 *
 * The context can provide maximum part count, field size, file size, total body
 * size, and MIME types that should be parsed as fields.
 *
 * @stability unstable
 * @category references
 * @since 4.0.0
 */
export const limitsServices = (options: {
  readonly maxParts?: number | undefined
  readonly maxFieldSize?: ByteSize.Input | undefined
  readonly maxFileSize?: ByteSize.Input | undefined
  readonly maxTotalSize?: ByteSize.Input | undefined
  readonly fieldMimeTypes?: ReadonlyArray<string> | undefined
}): Context.Context<never> => {
  const map = new Map<string, unknown>()
  if (options.maxParts !== undefined) {
    map.set(MaxParts.key, options.maxParts)
  }
  if (options.maxFieldSize !== undefined) {
    map.set(MaxFieldSize.key, ByteSize.fromInputUnsafe(options.maxFieldSize))
  }
  if (options.maxFileSize !== undefined) {
    map.set(MaxFileSize.key, ByteSize.fromInputUnsafe(options.maxFileSize))
  }
  if (options.maxTotalSize !== undefined) {
    map.set(IncomingMessage.MaxBodySize.key, ByteSize.fromInputUnsafe(options.maxTotalSize))
  }
  if (options.fieldMimeTypes !== undefined) {
    map.set(FieldMimeTypes.key, options.fieldMimeTypes)
  }
  return Context.makeUnsafe(map)
}

/**
 * Namespace containing multipart parser limit option types.
 *
 * @stability unstable
 * @since 4.0.0
 */
export declare namespace withLimits {
  /**
   * Options for overriding multipart parser limits.
   *
   * **Details**
   *
   * These settings control maximum part count, field size, file size, total body
   * size, and MIME types that should be treated as fields instead of files.
   *
   * @stability unstable
   * @category options
   * @since 4.0.0
   */
  export type Options = {
    readonly maxParts?: number | undefined
    readonly maxFieldSize?: ByteSize.Input | undefined
    readonly maxFileSize?: ByteSize.Input | undefined
    readonly maxTotalSize?: ByteSize.Input | undefined
    readonly fieldMimeTypes?: ReadonlyArray<string> | undefined
  }
}

/**
 * Context reference for the maximum number of multipart parts allowed.
 *
 * **Details**
 *
 * The default is `undefined`, meaning no explicit part-count limit.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export const MaxParts = Context.Reference<number | undefined>("effect/http/Multipart/MaxParts", {
  defaultValue: () => undefined
})

/**
 * Context reference for the maximum size of a multipart field value.
 *
 * **Details**
 *
 * The default limit is 10 MiB.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export const MaxFieldSize = Context.Reference<ByteSize.ByteSize>("effect/http/Multipart/MaxFieldSize", {
  defaultValue: constant(ByteSize.mebibytes(10))
})

/**
 * Context reference for the maximum size of a multipart file part.
 *
 * **Details**
 *
 * The default is `undefined`, meaning no explicit per-file limit.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export const MaxFileSize = Context.Reference<ByteSize.ByteSize | undefined>(
  "effect/http/Multipart/MaxFileSize",
  { defaultValue: () => undefined }
)

/**
 * Context reference for MIME type fragments that should be parsed as multipart
 * fields instead of files.
 *
 * **Details**
 *
 * The default treats `application/json` parts as fields.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export const FieldMimeTypes = Context.Reference<ReadonlyArray<string>>("effect/http/Multipart/FieldMimeTypes", {
  defaultValue: constant(["application/json"])
})
