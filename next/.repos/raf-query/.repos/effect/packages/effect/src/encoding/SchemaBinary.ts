/**
 * A compact binary codec derived from the encoded side of a Schema.
 *
 * The default wire format supports compatible schema evolution. An array of
 * structs is written as a row run: rows declare their shape once and
 * back-reference repeated strings, so both stay off the wire on later rows.
 * Fingerprint mode uses positional layouts and rejects mismatches for smaller
 * frames; its row shapes are presence masks instead of field id lists. Encoded
 * results are arena-backed views; see {@link toCodec} for ownership details.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Arr from "../Array.ts"
import * as BigDecimal from "../BigDecimal.ts"
import * as Cause from "../Cause.ts"
import * as Channel from "../Channel.ts"
import * as Chunk from "../Chunk.ts"
import * as DateTime from "../DateTime.ts"
import * as Duration from "../Duration.ts"
import * as Effect from "../Effect.ts"
import * as Exit from "../Exit.ts"
import { dual, memoize } from "../Function.ts"
import * as HashMap from "../HashMap.ts"
import * as HashSet from "../HashSet.ts"
import { assignProperty } from "../internal/record.ts"
import * as InternalParserProtocol from "../internal/schema/parser.ts"
import * as Option from "../Option.ts"
import * as Predicate from "../Predicate.ts"
import * as Pull from "../Pull.ts"
import * as Redacted from "../Redacted.ts"
import * as Result from "../Result.ts"
import * as Schema from "../Schema.ts"
import * as SchemaAST from "../SchemaAST.ts"
import * as SchemaIssue from "../SchemaIssue.ts"
import * as SchemaParser from "../SchemaParser.ts"
import * as SchemaTransformation from "../SchemaTransformation.ts"

/**
 * Selects the wire mode.
 *
 * **Details**
 *
 * The default mode supports compatible schema evolution. `fingerprint: true`
 * uses positional layouts and an 8-byte layout hash for smaller frames, but
 * requires peers to use the same schema definition.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Options {
  /**
   * Uses a compact positional layout with a schema fingerprint.
   *
   * @stability unstable
   * @since 4.0.0
   */
  readonly fingerprint?: boolean | undefined
}

/**
 * The codec type returned by {@link toCodec}.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface toCodec<S extends Schema.Constraint> extends
  Schema.Codec<
    S["Type"],
    Uint8Array<ArrayBuffer>,
    S["DecodingServices"],
    S["EncodingServices"]
  >
{}

const codecCache = new WeakMap<Schema.Constraint, toCodec<any>>()
const fingerprintCodecCache = new WeakMap<Schema.Constraint, toCodec<any>>()
const directCodecCache = new WeakMap<Schema.Constraint, toCodec<any>>()
const directFingerprintCodecCache = new WeakMap<Schema.Constraint, toCodec<any>>()

/**
 * Derives a compact binary codec from a schema.
 *
 * **Details**
 *
 * The wire layout is compiled from the encoded side of the schema. Each
 * encode/decode handles exactly one frame; use {@link parser} for streams.
 * Derived codecs are memoized by schema identity and wire mode.
 *
 * Encoded results are arena-backed views and may share a larger buffer. Use
 * `bytes.slice()` when independent ownership is required.
 *
 * **Example** (Deriving a binary codec)
 *
 * ```ts
 * import { Schema } from "effect"
 * import { SchemaBinary } from "effect/encoding"
 *
 * const Person = Schema.Struct({ name: Schema.String, age: Schema.Number })
 * const codec = SchemaBinary.toCodec(Person)
 *
 * const bytes = Schema.encodeUnknownSync(codec)({ name: "Ada", age: 36 })
 * const person = Schema.decodeUnknownSync(codec)(bytes)
 * ```
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export function toCodec<S extends Schema.Constraint>(schema: S, options?: Options): toCodec<S> {
  const cache = options?.fingerprint === true ? fingerprintCodecCache : codecCache
  const cached = cache.get(schema)
  if (cached !== undefined) return cached
  const { exact, layout, recursive, target } = compileTarget(schema)
  const mode = compileMode(layout, options?.fingerprint)
  const trusted: Trusted | undefined = exact ? { value: undefined } : undefined
  const codec = assembleCodec<S>(
    trusted === undefined ? target : withTrustedDecode(target, trusted, !recursive),
    layout,
    mode,
    trusted
  )
  cache.set(schema, codec)
  return codec
}

/**
 * Derives the {@link toCodec} codec without the schema pass around the binary
 * layer.
 *
 * Only schemas the binary layer already validates on its own take the direct
 * path; anything else falls back to {@link toCodec}. A direct codec encodes and
 * decodes the same values as {@link toCodec} but is not a sound `Schema.is`
 * guard, so it is only for callers that never guard on it. Derived codecs are
 * memoized by schema identity and wire mode.
 *
 * @internal
 */
export function toCodecDirect<S extends Schema.Constraint>(schema: S, options?: Options): toCodec<S> {
  const cache = options?.fingerprint === true ? directFingerprintCodecCache : directCodecCache
  const cached = cache.get(schema)
  if (cached !== undefined) return cached
  const { exact, exitSuccess, layout, target } = compileTarget(schema)
  if (!exact) {
    if (!exitSuccess) return toCodec(schema, options)
    const trusted: Trusted = { value: undefined }
    const codec = assembleCodec<S>(
      withExitSuccessDecode(target, trusted),
      layout,
      compileMode(layout, options?.fingerprint),
      trusted,
      true
    )
    cache.set(schema, codec)
    return codec
  }
  const codec = assembleCodec<S>(
    passThrough(target),
    layout,
    compileMode(layout, options?.fingerprint),
    undefined
  )
  cache.set(schema, codec)
  return codec
}

function assembleCodec<S extends Schema.Constraint>(
  target: Schema.Constraint,
  layout: Layout,
  mode: Mode,
  trusted: Trusted | undefined,
  successOnly = false
): toCodec<S> {
  return (Schema.Uint8Array as Schema.instanceOf<Uint8Array<ArrayBuffer>>).pipe(
    Schema.decodeTo(target, makeTransformation(layout, mode, trusted, successOnly))
  ) as unknown as toCodec<S>
}

/**
 * Encodes one frame without the schema pass {@link toCodec} wraps around it.
 *
 * Only schemas the binary layer already validates on its own take the direct
 * path; anything else falls back to the codec, so checks and transformations
 * still run.
 *
 * @internal
 */
export function encodeUnknownSync<S extends Schema.Constraint>(
  schema: S,
  options?: SchemaAST.ParseOptions & Options
): (value: unknown) => Uint8Array<ArrayBuffer> {
  const { exact, exitSuccess, layout } = compileTarget(schema)
  const mode = compileMode(layout, options?.fingerprint)
  const parseOptions: SchemaAST.ParseOptions = options ?? SchemaAST.defaultParseOptions
  if (!exact || parseOptions.onExcessProperty === "error") {
    const fallback = Schema.encodeUnknownSync(
      toCodec(schema, options) as unknown as Schema.ConstraintEncoder<unknown, never>,
      options
    ) as (value: unknown) => Uint8Array<ArrayBuffer>
    // The binary layer drops excess keys instead of reporting them.
    if (!exitSuccess || parseOptions.onExcessProperty === "error") return fallback
    return (value) => {
      if (!isSuccessExit(value)) return fallback(value)
      try {
        return encodeFrame(layout, value, parseOptions, mode)
      } catch (e) {
        throw e instanceof IssueError ? new Schema.SchemaError(e.issue) : e
      }
    }
  }
  return (value) => {
    try {
      return encodeFrame(layout, value, parseOptions, mode)
    } catch (e) {
      throw e instanceof IssueError ? new Schema.SchemaError(e.issue) : e
    }
  }
}

/**
 * Encodes concatenated frames in one writer pass, so a batch costs no more
 * allocations than a single frame.
 *
 * Shares {@link encodeUnknownSync}'s direct path and its fallback.
 *
 * @internal
 */
export function encodeManyUnknownSync<S extends Schema.Constraint>(
  schema: S,
  options?: SchemaAST.ParseOptions & Options
): (values: ReadonlyArray<unknown>) => Uint8Array<ArrayBuffer> {
  const { exact, layout } = compileTarget(schema)
  const parseOptions: SchemaAST.ParseOptions = options ?? SchemaAST.defaultParseOptions
  if (!exact || parseOptions.onExcessProperty === "error") {
    const encode = encodeUnknownSync(schema, options)
    return (values) => concatFrames(values.map(encode))
  }
  const mode = compileMode(layout, options?.fingerprint)
  return (values) => {
    try {
      return encodeFrames(layout, values, parseOptions, mode)
    } catch (e) {
      throw e instanceof IssueError ? new Schema.SchemaError(e.issue) : e
    }
  }
}

function concatFrames(frames: ReadonlyArray<Uint8Array<ArrayBuffer>>): Uint8Array<ArrayBuffer> {
  if (frames.length === 1) return frames[0]
  let length = 0
  for (const frame of frames) length += frame.length
  const out = new Uint8Array(length)
  let offset = 0
  for (const frame of frames) {
    out.set(frame, offset)
    offset += frame.length
  }
  return out
}

/**
 * A stateful frame parser for concatenated {@link toCodec} outputs.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Parser<T> {
  /**
   * Feeds another chunk into the parser and returns any completed values.
   *
   * @stability unstable
   * @since 4.0.0
   */
  feed(chunk: Uint8Array): Effect.Effect<ReadonlyArray<T>, Schema.SchemaError>
  /**
   * Feeds another chunk into the parser synchronously.
   *
   * @stability unstable
   * @since 4.0.0
   */
  feedSync(chunk: Uint8Array): ReadonlyArray<T>
  /**
   * Finishes parsing and fails if an incomplete frame remains.
   *
   * @stability unstable
   * @since 4.0.0
   */
  end: Effect.Effect<void, Schema.SchemaError>
  /**
   * Finishes parsing synchronously and throws for an incomplete frame.
   *
   * @stability unstable
   * @since 4.0.0
   */
  endSync(): void
}

/**
 * Creates a stateful parser for a stream of concatenated frames.
 *
 * **Details**
 *
 * Values completed before a failure remain observable. After a failure, the
 * parser rejects further calls. Use `maxFrameSize` to limit buffered frames.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export function parser<S extends Schema.Constraint>(
  schema: S,
  options?: SchemaAST.ParseOptions & Options & StreamOptions & { readonly maxFrameSize?: number | undefined }
): Parser<S["Type"]> {
  const { exact, exitSuccess, layout, target } = compileTarget(schema)
  const parseOptions: SchemaAST.ParseOptions = options ?? SchemaAST.defaultParseOptions
  const decodeTarget = exact
    ? undefined
    : Schema.decodeUnknownSync(target as Schema.ConstraintDecoder<unknown>, parseOptions)
  const decodeEncoded = decodeTarget !== undefined && exitSuccess
    ? (value: unknown) => isSuccessExit(value) ? value : decodeTarget(value)
    : decodeTarget
  return makeParser(
    layout,
    compileMode(layout, options?.fingerprint),
    parseOptions,
    options?.maxFrameSize,
    decodeEncoded,
    requireDictionary(exact, options)
  )
}

/**
 * Options for the connection-scoped pair, {@link encoder} and {@link parser}.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface StreamOptions {
  /**
   * Share one string dictionary across every frame on the connection, so a
   * string that repeats costs a reference after the first frame that carries
   * it. Frames stop standing alone: they only decode through the parser that
   * saw the frames before them, in order.
   *
   * **Gotchas**
   *
   * Both ends have to set it. A schema the binary layer does not fully
   * validate on its own cannot use it, and asking for it throws.
   *
   * @stability unstable
   * @since 4.0.0
   */
  readonly dictionary?: boolean | undefined
}

function requireDictionary(exact: boolean, options: StreamOptions | undefined): boolean {
  if (options?.dictionary !== true) return false
  if (!exact) {
    throw new Error("Binary layout: dictionary needs a schema the binary layer validates on its own")
  }
  return true
}

/**
 * A writer for one connection. Every frame it produces shares the string
 * dictionary that the matching {@link parser} rebuilds as it reads them, so the
 * two have to be created from the same schema and the same options.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export function encoder<S extends Schema.Constraint>(
  schema: S,
  options?: SchemaAST.ParseOptions & Options & StreamOptions
): Encoder {
  const { exact, layout, target } = compileTarget(schema)
  const dictionary = requireDictionary(exact, options)
  const encode = encodeUnknownSync(schema, options)
  const encodeMany = encodeManyUnknownSync(schema, options)
  if (!dictionary) return { encode, encodeMany }
  const mode = compileMode(layout, options?.fingerprint)
  const parseOptions: SchemaAST.ParseOptions = options ?? SchemaAST.defaultParseOptions
  const validate = parseOptions.onExcessProperty === "error"
    ? Schema.encodeUnknownSync(
      target as Schema.ConstraintEncoder<unknown, never>,
      options
    ) as (value: unknown) => unknown
    : undefined
  const dict = makeDictWrite()
  const run = <A>(f: () => A): A => {
    try {
      return f()
    } catch (e) {
      throw e instanceof IssueError ? new Schema.SchemaError(e.issue) : e
    }
  }
  return {
    encode: (value) =>
      run(() => encodeFrame(layout, validate === undefined ? value : validate(value), parseOptions, mode, dict)),
    encodeMany: (values) =>
      run(() =>
        encodeFrames(
          layout,
          validate === undefined ? values : values.map(validate),
          parseOptions,
          mode,
          dict
        )
      )
  }
}

/**
 * The writer returned by {@link encoder}.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Encoder {
  encode(value: unknown): Uint8Array<ArrayBuffer>
  encodeMany(values: ReadonlyArray<unknown>): Uint8Array<ArrayBuffer>
}

// Frame parser over a compiled layout. `decodeEncoded` runs the target schema
// pass on each framed value; `undefined` yields the raw binary-decoded values.
function makeParser<T>(
  layout: Layout,
  mode: Mode,
  parseOptions: SchemaAST.ParseOptions,
  maxFrameSize: number | undefined,
  decodeEncoded: ((value: unknown) => unknown) | undefined,
  dictionary: boolean
): Parser<T> {
  const dict: DictRead | undefined = dictionary ? [] : undefined
  let buffer = new Uint8Array(0)
  let bufferStart = 0
  let bufferEnd = 0
  let stashed: Schema.SchemaError | undefined
  let spent = false
  const body = new Reader()
  const indexSignatures = new IndexSignatureCache(parseOptions, PARSER_INDEX_SIGNATURE_CACHE_SIZE)

  const release = () => {
    body.release()
    indexSignatures.clear()
    buffer = EMPTY_READER_BUFFER
    bufferStart = bufferEnd = 0
  }

  const failSync = (expected: string, input?: unknown): never => {
    throw new Schema.SchemaError(new SchemaIssue.InvalidValue({ expected }, input, parseOptions))
  }

  const takeStashed = (): never => {
    const error = stashed!
    stashed = undefined
    throw error
  }

  // Copy the unconsumed tail of a directly parsed chunk into the buffer.
  const stashTail = (chunk: Uint8Array, start: number) => {
    const remaining = chunk.length - start
    if (remaining > buffer.length) {
      buffer = new Uint8Array(Math.max(256, remaining))
    }
    buffer.set(start === 0 ? chunk : chunk.subarray(start), 0)
    bufferStart = 0
    bufferEnd = remaining
  }

  const self: Parser<T> = {
    feedSync(chunk) {
      if (stashed !== undefined) return takeStashed()
      if (spent) return failSync("parser is spent")
      // Complete frames in a fresh chunk parse in place; only partial frames
      // are ever copied into the buffer.
      const direct = bufferEnd === bufferStart
      let buf: Uint8Array
      let pos: number
      let end: number
      if (direct) {
        buf = chunk
        pos = 0
        end = chunk.length
      } else {
        if (chunk.length > 0) {
          const remaining = bufferEnd - bufferStart
          const required = remaining + chunk.length
          if (required > buffer.length) {
            const next = new Uint8Array(Math.max(256, buffer.length * 2, required))
            next.set(buffer.subarray(bufferStart, bufferEnd))
            buffer = next
            bufferStart = 0
            bufferEnd = remaining
          } else if (bufferStart > 0) {
            buffer.copyWithin(0, bufferStart, bufferEnd)
            bufferStart = 0
            bufferEnd = remaining
          }
          buffer.set(chunk, bufferEnd)
          bufferEnd += chunk.length
        }
        buf = buffer
        pos = bufferStart
        end = bufferEnd
      }
      const out: Array<T> = []
      const done = (): Array<T> => {
        if (direct) {
          if (pos < end) stashTail(chunk, pos)
        } else {
          bufferStart = pos
          if (bufferStart === bufferEnd) bufferStart = bufferEnd = 0
        }
        return out
      }
      const fail = (expected: string, input?: unknown): Array<T> => {
        spent = true
        const error = new Schema.SchemaError(new SchemaIssue.InvalidValue({ expected }, input, parseOptions))
        release()
        if (out.length === 0) throw error
        stashed = error
        return out
      }
      while (true) {
        // Use bigint only for frame lengths wider than six varint groups.
        let frameLen = 0
        let headerLen = -1
        const buffered = end - pos
        let scale = 1
        for (let i = 0; i < Math.min(6, buffered); i++) {
          const b = buf[pos + i]
          frameLen += (b & 0x7F) * scale
          if ((b & 0x80) === 0) {
            headerLen = i + 1
            break
          }
          scale *= 128
        }
        if (headerLen === -1) {
          if (buffered < 6) return done()
          let n = BigInt(frameLen)
          for (let i = 6; i < Math.min(10, buffered); i++) {
            const b = buf[pos + i]
            n |= BigInt(b & 0x7F) << BigInt(i * 7)
            if ((b & 0x80) === 0) {
              headerLen = i + 1
              if (n > MAX_SAFE_BIGINT) return fail("safe integer length", n)
              frameLen = Number(n)
              break
            }
          }
          if (headerLen === -1) {
            if (buffered >= 10) return fail("uvarint", buf.subarray(pos, pos + 10))
            return done()
          }
        }
        if (frameLen === 0) return fail("nonzero frame length", frameLen)
        if (maxFrameSize !== undefined && frameLen > maxFrameSize) {
          return fail("frame within maxFrameSize", frameLen)
        }
        if (headerLen + frameLen > buffered) return done()
        const savedPathLen = issuePathLen
        try {
          issuePathLen = 0
          const bodyStart = pos + headerLen
          indexSignatures.beginFrame()
          body.reset(buf, bodyStart, bodyStart + frameLen, parseOptions, indexSignatures, mode.positional, dict)
          const value = decodeFrameBody(layout, body, mode)
          out.push((decodeEncoded === undefined ? value : decodeEncoded(value)) as T)
        } catch (e) {
          spent = true
          release()
          const error = e instanceof IssueError
            ? new Schema.SchemaError(e.issue)
            : Schema.isSchemaError(e)
            ? e
            : (() => {
              throw e
            })()
          if (out.length === 0) throw error
          stashed = error
          return out
        } finally {
          issuePathLen = savedPathLen
        }
        pos += headerLen + frameLen
      }
    },
    endSync() {
      if (stashed !== undefined) return takeStashed()
      if (spent) return failSync("parser is spent")
      spent = true
      const input = bufferStart < bufferEnd ? buffer.subarray(bufferStart, bufferEnd) : undefined
      release()
      if (input !== undefined) return failSync("complete value", input)
    },
    feed: (chunk) =>
      Effect.suspend(() => {
        try {
          return Effect.succeed(self.feedSync(chunk))
        } catch (e) {
          if (Schema.isSchemaError(e)) return Effect.fail(e)
          throw e
        }
      }),
    end: Effect.suspend(() => {
      try {
        self.endSync()
        return Effect.void
      } catch (e) {
        if (Schema.isSchemaError(e)) return Effect.fail(e)
        throw e
      }
    })
  }
  return self
}

/**
 * Creates a channel that encodes chunks of schema values into binary frames.
 *
 * **Details**
 *
 * Each input chunk is emitted as one byte element holding concatenated frames
 * written in one writer pass, so a batch costs no more allocations than a
 * single frame. Schemas with transformations first run one schema pass per
 * chunk to the binary-adjusted encoded side — supporting async transformations
 * and encoding services — before that writer pass. Failures are
 * `Schema.SchemaError`, matching {@link toCodec}. `maxFrameSize` only applies
 * to {@link decode} and is ignored here.
 *
 * @stability unstable
 * @category channels
 * @since 4.0.0
 */
export const encode = <S extends Schema.Constraint>(
  schema: S,
  options?: SchemaAST.ParseOptions & Options & { readonly maxFrameSize?: number | undefined }
) =>
<IE = never, Done = unknown>(): Channel.Channel<
  Arr.NonEmptyReadonlyArray<Uint8Array<ArrayBuffer>>,
  Schema.SchemaError | IE,
  Done,
  Arr.NonEmptyReadonlyArray<S["Type"]>,
  IE,
  Done,
  S["EncodingServices"]
> => {
  // Everything here depends only on schema and options, so it is derived once
  // per channel rather than once per run.
  const { exact, layout, target } = compileTarget(schema)
  const parseOptions: SchemaAST.ParseOptions = options ?? SchemaAST.defaultParseOptions
  const mode = compileMode(layout, options?.fingerprint)
  const write = (
    values: ReadonlyArray<unknown>
  ): Effect.Effect<Arr.NonEmptyReadonlyArray<Uint8Array<ArrayBuffer>>, Schema.SchemaError> => {
    try {
      return Effect.succeed(Arr.of(encodeFrames(layout, values, parseOptions, mode)))
    } catch (e) {
      if (e instanceof IssueError) return Effect.fail(new Schema.SchemaError(e.issue))
      return Effect.die(e)
    }
  }
  if (exact && parseOptions.onExcessProperty !== "error") {
    return Channel.fromTransform((upstream, _scope) => Effect.sync(() => Effect.flatMap(upstream, write)))
  }
  // One schema pass per chunk brings the values to the binary-adjusted encoded
  // side the writer expects, so the writer pass stays one sync batch.
  const encodeValues = Schema.encodeUnknownEffect(
    Schema.NonEmptyArray(target) as unknown as Schema.ConstraintEncoder<unknown, never>,
    options
  ) as (values: ReadonlyArray<unknown>) => Effect.Effect<ReadonlyArray<unknown>, Schema.SchemaError>
  return Channel.fromTransform((upstream, _scope) =>
    Effect.sync(() => Effect.flatMap(upstream, (chunk) => Effect.flatMap(encodeValues(chunk), write)))
  )
}

/**
 * Creates a channel that decodes chunks of binary frames into schema values.
 *
 * **Details**
 *
 * The channel keeps one frame parser for its lifetime: frames may be
 * fragmented across chunks or concatenated within one, values completed before
 * a failure remain observable, and a leftover incomplete frame fails when the
 * upstream is done. Schemas with transformations run the schema pass per
 * framed value, which supports async transformations and decoding services.
 * Failures are `Schema.SchemaError`, matching {@link toCodec}.
 *
 * @stability unstable
 * @category channels
 * @since 4.0.0
 */
export const decode = <S extends Schema.Constraint>(
  schema: S,
  options?: SchemaAST.ParseOptions & Options & { readonly maxFrameSize?: number | undefined }
) =>
<IE = never, Done = unknown>(): Channel.Channel<
  Arr.NonEmptyReadonlyArray<S["Type"]>,
  Schema.SchemaError | IE,
  Done,
  Arr.NonEmptyReadonlyArray<Uint8Array<ArrayBuffer>>,
  IE,
  Done,
  S["DecodingServices"]
> => {
  // Everything here depends only on schema and options, so it is derived once
  // per channel; the frame parser and failure stash below stay per run.
  const { exact, exitSuccess, layout, target } = compileTarget(schema)
  const parseOptions: SchemaAST.ParseOptions = options ?? SchemaAST.defaultParseOptions
  const mode = compileMode(layout, options?.fingerprint)
  const decodeTarget = exact
    ? undefined
    : Schema.decodeUnknownEffect(target as Schema.ConstraintDecoder<unknown>, parseOptions)
  const decodeEncoded = decodeTarget !== undefined && exitSuccess
    ? (value: unknown) => isSuccessExit(value) ? Effect.succeed(value) : decodeTarget(value)
    : decodeTarget
  return Channel.fromTransform((upstream, _scope) =>
    Effect.sync(() => {
      const frames = makeParser<unknown>(layout, mode, parseOptions, options?.maxFrameSize, undefined, false)
      let stashed: Schema.SchemaError | undefined

      // Decodes framed values in order. On a failure, values decoded before it
      // are emitted first and the error fails the next pull.
      const decodeAll = (
        raw: ReadonlyArray<unknown>
      ): Pull.Pull<Arr.NonEmptyReadonlyArray<S["Type"]>, Schema.SchemaError | IE, Done> => {
        const out: Array<S["Type"]> = []
        const loop: Effect.Effect<Arr.NonEmptyReadonlyArray<S["Type"]>, Schema.SchemaError> = Effect.suspend(() =>
          out.length === raw.length
            ? Effect.succeed(out as unknown as Arr.NonEmptyReadonlyArray<S["Type"]>)
            : Effect.flatMap(decodeEncoded!(raw[out.length]), (value) => {
              out.push(value as S["Type"])
              return loop
            })
        )
        return Effect.catch(loop, (error) => {
          if (out.length === 0) {
            stashed = undefined
            return Effect.fail(error)
          }
          stashed = error
          return Effect.succeed(out as unknown as Arr.NonEmptyReadonlyArray<S["Type"]>)
        })
      }

      const feed = (
        chunk: Arr.NonEmptyReadonlyArray<Uint8Array<ArrayBuffer>>
      ): Pull.Pull<Arr.NonEmptyReadonlyArray<S["Type"]>, Schema.SchemaError | IE, Done> => {
        const raw: Array<unknown> = []
        try {
          for (let i = 0; i < chunk.length; i++) {
            const values = frames.feedSync(chunk[i])
            for (let j = 0; j < values.length; j++) raw.push(values[j])
          }
        } catch (e) {
          if (!Schema.isSchemaError(e)) return Effect.die(e)
          if (raw.length === 0) return Effect.fail(e)
          // Emit the values framed before the failure, then fail on the next
          // pull.
          stashed = e
        }
        if (!Arr.isReadonlyArrayNonEmpty(raw)) return pull
        return decodeEncoded === undefined
          ? Effect.succeed(raw as Arr.NonEmptyReadonlyArray<S["Type"]>)
          : decodeAll(raw)
      }

      const pull: Pull.Pull<Arr.NonEmptyReadonlyArray<S["Type"]>, Schema.SchemaError | IE, Done> = Effect.suspend(() =>
        stashed !== undefined ? Effect.fail(stashed) : Pull.matchEffect(upstream, {
          onSuccess: feed,
          onFailure: Effect.failCause,
          onDone: (done): Pull.Pull<never, Schema.SchemaError, Done> => {
            try {
              frames.endSync()
              return Cause.done(done)
            } catch (e) {
              if (Schema.isSchemaError(e)) return Effect.fail(e)
              throw e
            }
          }
        })
      )

      return pull
    })
  )
}

/**
 * Wraps a bidirectional byte channel with schema-driven binary encoding and
 * decoding.
 *
 * **Details**
 *
 * Values sent to the wrapped channel are encoded with `inputSchema` as binary
 * frames; bytes received from it are decoded with `outputSchema`.
 *
 * @stability unstable
 * @category channels
 * @since 4.0.0
 */
export const duplex: {
  <In extends Schema.Constraint, Out extends Schema.Constraint>(
    options: SchemaAST.ParseOptions & Options & {
      readonly inputSchema: In
      readonly outputSchema: Out
      readonly maxFrameSize?: number | undefined
    }
  ): <OutErr, OutDone, InErr, InDone, R>(
    self: Channel.Channel<
      Arr.NonEmptyReadonlyArray<Uint8Array<ArrayBuffer>>,
      OutErr,
      OutDone,
      Arr.NonEmptyReadonlyArray<Uint8Array<ArrayBuffer>>,
      Schema.SchemaError | InErr,
      InDone,
      R
    >
  ) => Channel.Channel<
    Arr.NonEmptyReadonlyArray<Out["Type"]>,
    Schema.SchemaError | OutErr,
    OutDone,
    Arr.NonEmptyReadonlyArray<In["Type"]>,
    InErr,
    InDone,
    R | In["EncodingServices"] | Out["DecodingServices"]
  >
  <Out extends Schema.Constraint, In extends Schema.Constraint, OutErr, OutDone, InErr, InDone, R>(
    self: Channel.Channel<
      Arr.NonEmptyReadonlyArray<Uint8Array<ArrayBuffer>>,
      OutErr,
      OutDone,
      Arr.NonEmptyReadonlyArray<Uint8Array<ArrayBuffer>>,
      Schema.SchemaError | InErr,
      InDone,
      R
    >,
    options: SchemaAST.ParseOptions & Options & {
      readonly inputSchema: In
      readonly outputSchema: Out
      readonly maxFrameSize?: number | undefined
    }
  ): Channel.Channel<
    Arr.NonEmptyReadonlyArray<Out["Type"]>,
    Schema.SchemaError | OutErr,
    OutDone,
    Arr.NonEmptyReadonlyArray<In["Type"]>,
    InErr,
    InDone,
    R | In["EncodingServices"] | Out["DecodingServices"]
  >
} = dual(2, <Out extends Schema.Constraint, In extends Schema.Constraint, OutErr, OutDone, InErr, InDone, R>(
  self: Channel.Channel<
    Arr.NonEmptyReadonlyArray<Uint8Array<ArrayBuffer>>,
    OutErr,
    OutDone,
    Arr.NonEmptyReadonlyArray<Uint8Array<ArrayBuffer>>,
    Schema.SchemaError | InErr,
    InDone,
    R
  >,
  options: SchemaAST.ParseOptions & Options & {
    readonly inputSchema: In
    readonly outputSchema: Out
    readonly maxFrameSize?: number | undefined
  }
): Channel.Channel<
  Arr.NonEmptyReadonlyArray<Out["Type"]>,
  Schema.SchemaError | OutErr,
  OutDone,
  Arr.NonEmptyReadonlyArray<In["Type"]>,
  InErr,
  InDone,
  R | In["EncodingServices"] | Out["DecodingServices"]
> =>
  encode(options.inputSchema, options)<InErr, InDone>().pipe(
    Channel.pipeTo(self),
    Channel.pipeTo(decode(options.outputSchema, options)())
  ))

/**
 * Assigns an explicit wire field id to a struct property.
 *
 * **When to use**
 *
 * Use to preserve the wire id across a rename or resolve a hash collision.
 *
 * **Details**
 *
 * Valid ids are integers from 1 through 4294967295.
 *
 * **Example** (Assigning a wire field id)
 *
 * ```ts
 * import { Schema } from "effect"
 * import { SchemaBinary } from "effect/encoding"
 *
 * const Person = Schema.Struct({
 *   id: Schema.String.pipe(SchemaBinary.fieldId(1))
 * })
 * ```
 *
 * @stability unstable
 * @category annotations
 * @since 4.0.0
 */
export function fieldId(id: number) {
  if (!Number.isInteger(id) || id <= 0 || id > 0xFFFFFFFF) {
    throw new Error(`Binary layout field id must be an integer in [1, 4294967295], got ${id}`)
  }
  const annotations = { [FIELD_ID_ANNOTATION_KEY]: id }
  const annotateLastLink = SchemaAST.applyToLastLink((ast) => SchemaAST.annotateKey(ast, annotations))
  return <S extends Schema.Top>(self: S): S["Rebuild"] =>
    self.rebuild(annotateLastLink(SchemaAST.annotateKey(self.ast, annotations)))
}

const FIELD_ID_ANNOTATION_KEY = "~effect/encoding/SchemaBinary/fieldId"

// Bit 0 selects fingerprint mode; all other flag bits are reserved.
const ENVELOPE = 0x20 // version nibble 2, flags 0
const ENVELOPE_FINGERPRINT = 0x21 // version nibble 2, flag bit 0

const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER)
const BIGINT_ZERO = BigInt(0)
const BIGINT_ONE = BigInt(1)
const BIGINT_TWO = BigInt(2)
const BIGINT_SEVEN = BigInt(7)
const BIGINT_VARINT_MASK = BigInt(0x7F)
const BIGINT_NANOS_PER_MILLI = BigInt(1_000_000)
const BIGINT_BYTE_MASK = BigInt(0xFF)
const BIGINT_U32_MASK = BigInt(0xFFFFFFFF)
const BIGINT_THIRTY_TWO = BigInt(32)

const utf8Encode = new TextEncoder()
const utf8DecodeFatal = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true })

// General numbers use up to seven varint bytes, a varint mantissa with a
// decimal scale byte, or an eight-byte f64.
const NUMBER_VARINT_MAX_BYTES = 7

const NUMBER_VARINT_MAX_MAGNITUDE = 281_474_976_710_655 // 2 ** 48 - 1

// Above this magnitude, build the sign-magnitude code with bigint.
const EXACT_MAGNITUDE_MAX = 4_503_599_627_370_495 // 2 ** 52 - 1

const NUMBER_RUN_F64 = 0
const NUMBER_RUN_VARINT = 1
const NUMBER_RUN_DECIMAL = 2

// Recursive layouts must fail before the JavaScript stack does. This is high
// enough for practical payloads while keeping the decoder's stack bounded.
const MAX_NESTING_DEPTH = 512

// Variable-width elements must be backed by frame bytes apart from a bounded
// allowance. Provably zero-width elements need their own absolute bound.
const ARRAY_ALLOCATION_SLACK = 1_048_576
const ZERO_WIDTH_ARRAY_MAX = 4_194_304

// Struct field tags pack the field id with enough information to skip the
// payload without consulting the schema. Decimal is a sign-magnitude mantissa
// varint followed by an unsigned scale varint.
const FIELD_WIRE_SIZED = 0
const FIELD_WIRE_VARINT = 1
const FIELD_WIRE_FIXED64 = 2
const FIELD_WIRE_FALSE = 3
const FIELD_WIRE_TRUE = 4
const FIELD_WIRE_DECIMAL = 5
const FIELD_WIRE_FIXED32 = 6
const FIELD_WIRE_EMPTY = 7
const FIELD_WIRE_FACTOR = 8

function isVarintNumber(value: unknown): boolean {
  return typeof value === "number" && Number.isInteger(value) &&
    value >= -NUMBER_VARINT_MAX_MAGNITUDE && value <= NUMBER_VARINT_MAX_MAGNITUDE
}

// Short decimals ride the varint path as mantissa + one scale byte. The
// mantissa is capped at six varint bytes so the total stays under the
// eight-byte f64 discriminator.
const DECIMAL_SCALE_MAX = 8
const DECIMAL_MANTISSA_MAX = 2_199_023_255_551 // 2 ** 41 - 1

const POW10 = [1, 10, 100, 1000, 10000, 100000, 1000000, 10000000, 100000000]

// The scale that makes `value` an exact short-decimal mantissa, or 0.
function decimalScale(value: number): number {
  for (let scale = 1; scale <= DECIMAL_SCALE_MAX; scale++) {
    const mantissa = Math.round(value * POW10[scale])
    // The mantissa only grows with the scale, so once it leaves the range no
    // later scale can fit; this also rejects NaN and the infinities in one
    // comparison.
    if (!(mantissa >= -DECIMAL_MANTISSA_MAX && mantissa <= DECIMAL_MANTISSA_MAX)) return 0
    if (mantissa / POW10[scale] === value) return scale
  }
  return 0
}

// Sign-magnitude preserves `-0`, unlike zigzag.
function decodeSignMagnitude(code: number): number {
  const magnitude = Math.floor(code / 2)
  return code % 2 === 1 ? -magnitude : magnitude
}

const K = {
  bool: 1,
  null: 2,
  undefined: 3,
  number: 4,
  string: 5,
  bytes: 6,
  bigint: 7,
  int64: 8,
  struct: 9,
  variant: 10,
  array: 11,
  option: 12,
  result: 13,
  duration: 14,
  bigDecimal: 15,
  dateTimeZoned: 16,
  json: 17,
  exit: 18,
  cause: 19,
  causeReason: 20
} as const

function fnv32(bytes: ArrayLike<number>): number {
  let hash = 0x811C9DC5
  for (let i = 0; i < bytes.length; i++) {
    hash = Math.imul(hash ^ bytes[i], 0x01000193)
  }
  return hash >>> 0
}

const FNV64_OFFSET_BASIS = BigInt("14695981039346656037")
const FNV64_PRIME = BigInt("1099511628211")
const FNV64_MASK = BigInt("18446744073709551615")

function fnv64(bytes: ArrayLike<number>): bigint {
  let hash = FNV64_OFFSET_BASIS
  for (let i = 0; i < bytes.length; i++) {
    hash = ((hash ^ BigInt(bytes[i])) * FNV64_PRIME) & FNV64_MASK
  }
  return hash
}

function pushBytes(out: Array<number>, bytes: ArrayLike<number>) {
  for (let i = 0; i < bytes.length; i++) out.push(bytes[i])
}

function pushUvarint(out: Array<number>, n: number) {
  while (n > 0x7F) {
    out.push((n & 0x7F) | 0x80)
    n = Math.floor(n / 128)
  }
  out.push(n)
}

function pushU32(out: Array<number>, n: number) {
  out.push(n & 0xFF, (n >>> 8) & 0xFF, (n >>> 16) & 0xFF, (n >>> 24) & 0xFF)
}

function pushU64(out: Array<number>, n: bigint) {
  for (let i = 0; i < 8; i++) {
    out.push(Number((n >> BigInt(i * 8)) & BIGINT_BYTE_MASK))
  }
}

function compareBytes(a: Uint8Array, b: Uint8Array): number {
  const len = Math.min(a.length, b.length)
  for (let i = 0; i < len; i++) {
    if (a[i] !== b[i]) return a[i] - b[i]
  }
  return a.length - b.length
}

class IssueError extends Error {
  readonly issue: SchemaIssue.Issue
  constructor(issue: SchemaIssue.Issue) {
    super("SchemaBinary failure")
    this.issue = issue
  }
}

function invalid(expected: string, input?: unknown, options?: SchemaAST.ParseOptions): never {
  throw issueError(new SchemaIssue.InvalidValue({ expected }, input, options))
}

// Materialize the ambient path only when raising an issue.
const issuePath: Array<PropertyKey> = []
let issuePathLen = 0

function issueError(issue: SchemaIssue.Issue): IssueError {
  return new IssueError(
    issuePathLen === 0 ? issue : new SchemaIssue.Pointer(issuePath.slice(0, issuePathLen), issue)
  )
}

function uvarintBytes(n: number): Uint8Array {
  const out = new Uint8Array(uvarintSize(n))
  let p = 0
  while (n > 0x7F) {
    out[p++] = (n & 0x7F) | 0x80
    n = Math.floor(n / 128)
  }
  out[p] = n
  return out
}

function uvarintSize(n: number): number {
  let size = 1
  while (n > 0x7F) {
    n = Math.floor(n / 128)
    size++
  }
  return size
}

// Avoid TextDecoder's fixed cost for short strings.
const UTF8_INLINE_LIMIT = 32

function decodeUtf8(
  buf: Uint8Array,
  start: number,
  end: number,
  options: SchemaAST.ParseOptions | undefined
): string {
  const len = end - start
  if (len === 0) return ""
  if (len <= UTF8_INLINE_LIMIT) {
    const ascii = decodeAscii(buf, start, end)
    if (ascii !== undefined) return ascii
  }
  try {
    return utf8DecodeFatal.decode(buf.subarray(start, end))
  } catch {
    invalid("utf-8", undefined, options)
  }
}

// Sixteen and eight code unit blocks, checking their high bits together and
// giving up on the first non-ASCII byte, then one call for the 0-7 tail.
function decodeAscii(buf: Uint8Array, start: number, end: number): string | undefined {
  let out = ""
  let i = start
  for (; i + 16 <= end; i += 16) {
    const a = buf[i], b = buf[i + 1], c = buf[i + 2], d = buf[i + 3]
    const e = buf[i + 4], f = buf[i + 5], g = buf[i + 6], h = buf[i + 7]
    const a2 = buf[i + 8], b2 = buf[i + 9], c2 = buf[i + 10], d2 = buf[i + 11]
    const e2 = buf[i + 12], f2 = buf[i + 13], g2 = buf[i + 14], h2 = buf[i + 15]
    if ((a | b | c | d | e | f | g | h | a2 | b2 | c2 | d2 | e2 | f2 | g2 | h2) > 0x7F) return undefined
    out += String.fromCharCode(a, b, c, d, e, f, g, h, a2, b2, c2, d2, e2, f2, g2, h2)
  }
  if (i + 8 <= end) {
    const a = buf[i], b = buf[i + 1], c = buf[i + 2], d = buf[i + 3]
    const e = buf[i + 4], f = buf[i + 5], g = buf[i + 6], h = buf[i + 7]
    if ((a | b | c | d | e | f | g | h) > 0x7F) return undefined
    out += String.fromCharCode(a, b, c, d, e, f, g, h)
    i += 8
  }
  switch (end - i) {
    case 0:
      return out
    case 1: {
      const a = buf[i]
      if (a > 0x7F) return undefined
      return out + String.fromCharCode(a)
    }
    case 2: {
      const a = buf[i], b = buf[i + 1]
      if ((a | b) > 0x7F) return undefined
      return out + String.fromCharCode(a, b)
    }
    case 3: {
      const a = buf[i], b = buf[i + 1], c = buf[i + 2]
      if ((a | b | c) > 0x7F) return undefined
      return out + String.fromCharCode(a, b, c)
    }
    case 4: {
      const a = buf[i], b = buf[i + 1], c = buf[i + 2], d = buf[i + 3]
      if ((a | b | c | d) > 0x7F) return undefined
      return out + String.fromCharCode(a, b, c, d)
    }
    case 5: {
      const a = buf[i], b = buf[i + 1], c = buf[i + 2], d = buf[i + 3], e = buf[i + 4]
      if ((a | b | c | d | e) > 0x7F) return undefined
      return out + String.fromCharCode(a, b, c, d, e)
    }
    case 6: {
      const a = buf[i], b = buf[i + 1], c = buf[i + 2], d = buf[i + 3]
      const e = buf[i + 4], f = buf[i + 5]
      if ((a | b | c | d | e | f) > 0x7F) return undefined
      return out + String.fromCharCode(a, b, c, d, e, f)
    }
    default: {
      const a = buf[i], b = buf[i + 1], c = buf[i + 2], d = buf[i + 3]
      const e = buf[i + 4], f = buf[i + 5], g = buf[i + 6]
      if ((a | b | c | d | e | f | g) > 0x7F) return undefined
      return out + String.fromCharCode(a, b, c, d, e, f, g)
    }
  }
}

const OUTPUT_ARENA_SIZE = 64 * 1024

// Bound attacker-controlled keys retained between parser feeds.
const PARSER_INDEX_SIGNATURE_CACHE_SIZE = 256

// Bound the last universal record shape retained by a compiled layout.
const ENCODE_INDEX_SIGNATURE_CACHE_KEYS = 512
const ENCODE_INDEX_SIGNATURE_CACHE_CODE_UNITS = 16 * 1024

interface OutputArena {
  readonly buf: Uint8Array<ArrayBuffer>
  readonly view: DataView<ArrayBuffer>
  offset: number
  writing: boolean
}

function makeOutputArena(size: number): OutputArena {
  const buf: Uint8Array<ArrayBuffer> = new Uint8Array(size)
  return { buf, view: new DataView(buf.buffer), offset: 0, writing: false }
}

let outputArena = makeOutputArena(OUTPUT_ARENA_SIZE)

class Writer {
  buf: Uint8Array<ArrayBuffer> = new Uint8Array(0)
  view = new DataView(this.buf.buffer)
  arena: OutputArena | undefined
  start = 0
  limit = 0
  len = 0
  reset() {
    let arena = outputArena
    // Nested codecs cannot share the active arena tail.
    if (arena.writing || arena.offset >= arena.buf.length) {
      arena = outputArena = makeOutputArena(OUTPUT_ARENA_SIZE)
    }
    arena.writing = true
    this.arena = arena
    this.buf = arena.buf
    this.view = arena.view
    this.start = arena.offset
    this.limit = arena.buf.length - arena.offset
    this.len = 0
  }
  ensure(n: number) {
    if (this.len + n > this.limit) {
      const previous = this.arena!
      const required = this.len + n
      let size = OUTPUT_ARENA_SIZE
      while (size < required) size *= 2
      const next = makeOutputArena(size)
      next.writing = true
      next.buf.set(this.buf.subarray(this.start, this.start + this.len))
      previous.writing = false
      this.arena = outputArena = next
      this.buf = next.buf
      this.view = next.view
      this.start = 0
      this.limit = next.buf.length
    }
  }
  byte(b: number) {
    this.ensure(1)
    this.buf[this.start + this.len++] = b
  }
  bytes(b: Uint8Array) {
    this.ensure(b.length)
    this.buf.set(b, this.start + this.len)
    this.len += b.length
  }
  uvarint(n: number) {
    this.ensure(10)
    const buf = this.buf
    let p = this.start + this.len
    if (n < 0x80) {
      buf[p++] = n
    } else {
      buf[p++] = (n & 0x7F) | 0x80
      if (n < 0x4000) {
        buf[p++] = n >>> 7
      } else {
        buf[p++] = ((n >>> 7) & 0x7F) | 0x80
        n = Math.floor(n / 0x4000)
        while (n > 0x7F) {
          buf[p++] = (n & 0x7F) | 0x80
          n = Math.floor(n / 128)
        }
        buf[p++] = n
      }
    }
    this.len = p - this.start
  }
  uvarintBig(n: bigint) {
    while (n > BIGINT_VARINT_MASK) {
      this.byte(Number(n & BIGINT_VARINT_MASK) | 0x80)
      n >>= BIGINT_SEVEN
    }
    this.byte(Number(n))
  }
  zigzag(n: bigint) {
    this.uvarintBig(n >= BIGINT_ZERO ? n << BIGINT_ONE : (-n << BIGINT_ONE) - BIGINT_ONE)
  }
  numberVarint(n: number) {
    const negative = n < 0 || (n === 0 && 1 / n < 0)
    const magnitude = negative ? -n : n
    if (magnitude <= EXACT_MAGNITUDE_MAX) {
      this.uvarint(magnitude * 2 + (negative ? 1 : 0))
    } else {
      this.uvarintBig(BigInt(magnitude) * BIGINT_TWO + (negative ? BIGINT_ONE : BIGINT_ZERO))
    }
  }
  f64(n: number) {
    this.ensure(8)
    this.view.setFloat64(this.start + this.len, n, true)
    this.len += 8
  }
  i64(n: bigint) {
    this.ensure(8)
    this.view.setBigInt64(this.start + this.len, n, true)
    this.len += 8
  }
  u32le(n: number) {
    this.ensure(4)
    this.view.setUint32(this.start + this.len, n >>> 0, true)
    this.len += 4
  }
  i32le(n: number) {
    this.ensure(4)
    this.view.setInt32(this.start + this.len, n | 0, true)
    this.len += 4
  }
  // Writes a field id and reserves its length byte under one bounds check.
  idAndMark(idBytes: Uint8Array): number {
    const n = idBytes.length
    this.ensure(n + 1)
    const buf = this.buf
    let p = this.start + this.len
    for (let i = 0; i < n; i++) buf[p++] = idBytes[i]
    const mark = p - this.start
    this.len = mark + 1
    return mark
  }
  // Reserve one byte, then expand and backfill the length prefix if needed.
  beginSized(): number {
    this.ensure(1)
    return this.len++
  }
  endSized(mark: number) {
    const code = this.len - mark - 1
    if (code < 0x80) this.buf[this.start + mark] = code
    else this.growSized(mark, code)
  }
  // Row-run regions prefix `length * 2`; odd codes are back-references.
  endSizedRun(mark: number) {
    const code = (this.len - mark - 1) * 2
    if (code < 0x80) this.buf[this.start + mark] = code
    else this.growSized(mark, code)
  }
  private growSized(mark: number, code: number) {
    const size = uvarintSize(code)
    const extra = size - 1
    this.ensure(extra)
    const absoluteMark = this.start + mark
    this.buf.copyWithin(absoluteMark + size, absoluteMark + 1, this.start + this.len)
    this.len += extra
    let n = code
    let p = absoluteMark
    while (n > 0x7F) {
      this.buf[p++] = (n & 0x7F) | 0x80
      n = Math.floor(n / 128)
    }
    this.buf[p] = n
  }
  string(s: string) {
    const n = s.length
    if (n === 0) return
    this.ensure(n * 3)
    const buf = this.buf
    let p = this.start + this.len
    let i = 0
    for (; i + 4 <= n; i += 4) {
      const a = s.charCodeAt(i)
      const b = s.charCodeAt(i + 1)
      const c = s.charCodeAt(i + 2)
      const d = s.charCodeAt(i + 3)
      if ((a | b | c | d) > 0x7F) {
        this.len += utf8Encode.encodeInto(s, buf.subarray(this.start + this.len)).written
        return
      }
      buf[p++] = a
      buf[p++] = b
      buf[p++] = c
      buf[p++] = d
    }
    for (; i < n; i++) {
      const c = s.charCodeAt(i)
      if (c > 0x7F) {
        this.len += utf8Encode.encodeInto(s, buf.subarray(this.start + this.len)).written
        return
      }
      buf[p++] = c
    }
    this.len = p - this.start
  }
  out(): Uint8Array<ArrayBuffer> {
    const arena = this.arena!
    const out = new Uint8Array(arena.buf.buffer, this.start, this.len)
    if (arena === outputArena) arena.offset = this.start + this.len
    arena.writing = false
    this.arena = undefined
    return out
  }
  abort() {
    const arena = this.arena
    if (arena === undefined) return
    if (arena === outputArena) arena.offset = this.start
    arena.writing = false
    this.arena = undefined
  }
}

// Index-signature predicates are not part of the fingerprint, so unmatched
// keys are dropped in both modes.
// A plain string parameter accepts every key without running the matcher.
function matchesEveryKey(parameter: SchemaAST.AST): boolean {
  const ast = SchemaAST.toEncoded(parameter)
  return ast._tag === "String" && ast.checks === undefined
}

function matchIndexSignature(
  layout: StructLayout,
  key: string,
  options: SchemaAST.ParseOptions
): ExtraSignature | undefined {
  return layout.extra.find((s) => SchemaAST.getIndexSignatureKeys({ [key]: null }, s.parameter, options).length > 0)
}

class IndexSignatureCache {
  entries = new WeakMap<StructLayout, Map<string, ExtraSignature | undefined>>()
  readonly orderLayouts: Array<StructLayout | undefined> | undefined
  readonly orderKeys: Array<string | undefined> | undefined
  readonly options: SchemaAST.ParseOptions
  size = 0
  next = 0
  replace = false
  // Only the parser cache outlives one operation, and it is always bounded.
  constructor(options: SchemaAST.ParseOptions, capacity?: number) {
    this.options = options
    this.orderLayouts = capacity === undefined ? undefined : new Array(capacity)
    this.orderKeys = capacity === undefined ? undefined : new Array(capacity)
  }
  beginFrame() {
    this.replace = true
  }
  find(layout: StructLayout, key: string): ExtraSignature | undefined {
    let entries = this.entries.get(layout)
    if (entries === undefined) {
      entries = new Map()
      this.entries.set(layout, entries)
    }
    if (entries.has(key)) return entries.get(key)
    const signature = matchIndexSignature(layout, key, this.options)
    const orderLayouts = this.orderLayouts
    if (orderLayouts === undefined) {
      entries.set(key, signature)
      return signature
    }
    const orderKeys = this.orderKeys!
    if (this.size < orderLayouts.length) {
      orderLayouts[this.size] = layout
      orderKeys[this.size] = key
      this.size++
      entries.set(key, signature)
    } else if (this.replace) {
      this.replace = false
      const evictedLayout = orderLayouts[this.next]!
      const evictedEntries = evictedLayout === layout ? entries : this.entries.get(evictedLayout)
      evictedEntries?.delete(orderKeys[this.next]!)
      orderLayouts[this.next] = layout
      orderKeys[this.next] = key
      this.next = (this.next + 1) % orderLayouts.length
      entries.set(key, signature)
    }
    return signature
  }
  clear() {
    this.entries = new WeakMap()
    this.orderLayouts?.fill(undefined)
    this.orderKeys?.fill(undefined)
    this.size = this.next = 0
    this.replace = false
  }
}

// A named buffer preserves the build's pure annotation for these placeholders.
const EMPTY_READER_ARRAY_BUFFER = new ArrayBuffer(0)
const EMPTY_READER_BUFFER = new Uint8Array(EMPTY_READER_ARRAY_BUFFER)
const EMPTY_READER_VIEW = new DataView(EMPTY_READER_ARRAY_BUFFER)

class Reader {
  pos = 0
  nesting = 0
  buf: Uint8Array = EMPTY_READER_BUFFER
  // Frames of varints and strings never need a view, so it is built on demand
  // and reused while the reader stays on one buffer.
  view: DataView | undefined
  viewCache: DataView = EMPTY_READER_VIEW
  viewBuffer: ArrayBufferLike = EMPTY_READER_ARRAY_BUFFER
  viewOffset = 0
  viewLength = 0
  end = 0
  options: SchemaAST.ParseOptions = SchemaAST.defaultParseOptions
  indexSignatures: IndexSignatureCache | undefined
  positional = false
  // Handed to the row-run field's immediate consumer, then cleared.
  intern: Array<unknown> | undefined
  // String tables shared by every frame on one connection; `undefined` for a
  // one-shot decode, where each frame stands alone.
  dict: DictRead | undefined
  reset(
    buf: Uint8Array,
    start: number,
    end: number,
    options: SchemaAST.ParseOptions,
    indexSignatures: IndexSignatureCache | undefined,
    positional: boolean,
    dict: DictRead | undefined
  ) {
    this.nesting = 0
    this.view = undefined
    this.buf = buf
    this.pos = start
    this.end = end
    this.options = options
    this.indexSignatures = indexSignatures
    this.positional = positional
    this.intern = undefined
    this.dict = dict
  }
  release() {
    this.pos = this.end = this.nesting = 0
    this.buf = EMPTY_READER_BUFFER
    this.view = undefined
    this.viewCache = EMPTY_READER_VIEW
    this.viewBuffer = EMPTY_READER_ARRAY_BUFFER
    this.viewOffset = this.viewLength = 0
    this.options = SchemaAST.defaultParseOptions
    this.indexSignatures = undefined
    this.positional = false
    this.intern = undefined
    this.dict = undefined
  }
  get remaining(): number {
    return this.end - this.pos
  }
  dataView(): DataView {
    const buf = this.buf
    if (
      buf.buffer !== this.viewBuffer || buf.byteOffset !== this.viewOffset || buf.byteLength !== this.viewLength
    ) {
      this.viewBuffer = buf.buffer
      this.viewOffset = buf.byteOffset
      this.viewLength = buf.byteLength
      this.viewCache = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
    }
    return this.view = this.viewCache
  }
  byte(): number {
    if (this.pos >= this.end) invalid("complete value", undefined, this.options)
    return this.buf[this.pos++]
  }
  take(n: number): Uint8Array {
    if (this.pos + n > this.end) invalid("complete value", undefined, this.options)
    const out = this.buf.subarray(this.pos, this.pos + n)
    this.pos += n
    return out
  }
  // Decoded bytes outlive the parser's buffer, so they are copied, not viewed.
  takeCopy(n: number): Uint8Array<ArrayBuffer> {
    if (this.pos + n > this.end) invalid("complete value", undefined, this.options)
    const out = this.buf.slice(this.pos, this.pos + n) as Uint8Array<ArrayBuffer>
    this.pos += n
    return out
  }
  // Decode a bounded child value without allocating another reader.
  enter(len: number): number {
    if (this.pos + len > this.end) invalid("complete value", undefined, this.options)
    const saved = this.end
    this.end = this.pos + len
    return saved
  }
  exit(saved: number) {
    this.pos = this.end
    this.end = saved
  }
  readUtf8(n: number): string {
    if (this.pos + n > this.end) invalid("complete value", undefined, this.options)
    const start = this.pos
    this.pos += n
    return decodeUtf8(this.buf, start, start + n, this.options)
  }
  // Use bitwise arithmetic for the first four varint groups.
  uvarint(): number {
    const buf = this.buf
    const end = this.end
    let pos = this.pos
    if (pos >= end) invalid("complete value", undefined, this.options)
    let b = buf[pos++]
    if (b < 0x80) {
      this.pos = pos
      return b
    }
    let value = b & 0x7F
    if (pos >= end) invalid("complete value", undefined, this.options)
    b = buf[pos++]
    value |= (b & 0x7F) << 7
    if (b < 0x80) {
      this.pos = pos
      return value
    }
    if (pos >= end) invalid("complete value", undefined, this.options)
    b = buf[pos++]
    value |= (b & 0x7F) << 14
    if (b < 0x80) {
      this.pos = pos
      return value
    }
    if (pos >= end) invalid("complete value", undefined, this.options)
    b = buf[pos++]
    value |= (b & 0x7F) << 21
    if (b < 0x80) {
      this.pos = pos
      return value
    }
    let scale = 268435456 // 2 ** 28
    for (let i = 4; i < 10; i++) {
      if (pos >= end) {
        this.pos = pos
        invalid("complete value", undefined, this.options)
      }
      b = buf[pos++]
      const chunk = (b & 0x7F) * scale
      if (chunk > Number.MAX_SAFE_INTEGER - value) {
        this.pos = pos
        invalid("safe integer length", undefined, this.options)
      }
      value += chunk
      if (b < 0x80) {
        this.pos = pos
        return value
      }
      scale *= 128
    }
    this.pos = pos
    invalid("uvarint", undefined, this.options)
  }
  // Field tags are capped at 35 bits, so their common five-byte form can skip
  // the general safe-integer loop in uvarint.
  fieldTag(): number {
    const buf = this.buf
    const end = this.end
    let pos = this.pos
    if (pos >= end) invalid("complete value", undefined, this.options)
    let b = buf[pos++]
    if (b < 0x80) {
      this.pos = pos
      return b
    }
    let value = b & 0x7F
    if (pos >= end) invalid("complete value", undefined, this.options)
    b = buf[pos++]
    value |= (b & 0x7F) << 7
    if (b < 0x80) {
      this.pos = pos
      return value
    }
    if (pos >= end) invalid("complete value", undefined, this.options)
    b = buf[pos++]
    value |= (b & 0x7F) << 14
    if (b < 0x80) {
      this.pos = pos
      return value
    }
    if (pos >= end) invalid("complete value", undefined, this.options)
    b = buf[pos++]
    value |= (b & 0x7F) << 21
    if (b < 0x80) {
      this.pos = pos
      return value
    }
    if (pos >= end) invalid("complete value", undefined, this.options)
    b = buf[pos++]
    this.pos = pos
    if (b >= 0x80) invalid("uvarint", undefined, this.options)
    return value + b * 268435456
  }
  uvarintBig(): bigint {
    let value = BIGINT_ZERO
    let shift = BIGINT_ZERO
    while (true) {
      const b = this.byte()
      value |= BigInt(b & 0x7F) << shift
      if ((b & 0x80) === 0) return value
      shift += BIGINT_SEVEN
    }
  }
  // Wider schema-proven integers switch to bigint arithmetic.
  numberVarint(): number {
    const buf = this.buf
    const end = this.end
    let pos = this.pos
    let value = 0
    let scale = 1
    for (let i = 0; i < NUMBER_VARINT_MAX_BYTES; i++) {
      if (pos >= end) {
        this.pos = pos
        invalid("complete value", undefined, this.options)
      }
      const b = buf[pos++]
      value += (b & 0x7F) * scale
      if (b < 0x80) {
        this.pos = pos
        return decodeSignMagnitude(value)
      }
      scale *= 128
    }
    const code = this.uvarintBig()
    const magnitude = Number(code >> BIGINT_ONE)
    if (!Number.isFinite(magnitude)) invalid("safe integer length", undefined, this.options)
    return (code & BIGINT_ONE) === BIGINT_ONE ? -magnitude : magnitude
  }
  zigzag(): bigint {
    const u = this.uvarintBig()
    return (u & BIGINT_ONE) === BIGINT_ONE
      ? -((u + BIGINT_ONE) >> BIGINT_ONE)
      : u >> BIGINT_ONE
  }
  f64(): number {
    if (this.pos + 8 > this.end) invalid("complete value", undefined, this.options)
    const value = (this.view ?? this.dataView()).getFloat64(this.pos, true)
    this.pos += 8
    return value
  }
  i64(): bigint {
    if (this.pos + 8 > this.end) invalid("complete value", undefined, this.options)
    const value = (this.view ?? this.dataView()).getBigInt64(this.pos, true)
    this.pos += 8
    return value
  }
  u32le(): number {
    if (this.pos + 4 > this.end) invalid("complete value", undefined, this.options)
    const value = (this.view ?? this.dataView()).getUint32(this.pos, true)
    this.pos += 4
    return value
  }
  i32le(): number {
    if (this.pos + 4 > this.end) invalid("complete value", undefined, this.options)
    const value = (this.view ?? this.dataView()).getInt32(this.pos, true)
    this.pos += 4
    return value
  }
}

type LeafKind =
  | "bool"
  | "null"
  | "undefined"
  | "number"
  | "int"
  | "string"
  | "symbol"
  | "bytes"
  | "bigint"
  | "json"
  | "duration"
  | "bigDecimal"
  | "dateTimeZoned"

type Layout =
  | LeafLayout
  | LiteralLayout
  | { readonly _: "int64"; readonly flavor: "date" | "utc" }
  | { readonly _: "never"; readonly ast: SchemaAST.AST }
  | StructLayout
  | ArrayLayout
  | UnionLayout
  | { readonly _: "option"; value: Layout }
  | { readonly _: "result"; success: Layout; failure: Layout }
  | { readonly _: "exit"; value: Layout; cause: ReasonLayout }
  | ReasonLayout

// Every leaf carries a `slot`, so they all share one shape and the layout
// switch stays monomorphic on them. Only strings use it: it indexes their table
// in a connection dictionary, and both ends compile the same schema in the same
// order, so they number the leaves the same way.
interface LeafLayout {
  readonly _: LeafKind
  readonly slot: number
}

// Literal values are validated here rather than by a downstream schema pass.
interface LiteralLayout {
  readonly _: "literal"
  readonly leaf: Layout
  readonly values: ReadonlyArray<SchemaAST.LiteralValue>
  // Larger literal sets (enums) check membership in a set instead of a scan.
  readonly valueSet: ReadonlySet<SchemaAST.LiteralValue> | undefined
}

function literalLayout(leaf: Layout, values: ReadonlyArray<SchemaAST.LiteralValue>): LiteralLayout {
  return { _: "literal", leaf, values, valueSet: values.length > 4 ? new Set(values) : undefined }
}

function hasLiteral(layout: LiteralLayout, value: unknown): boolean {
  const values = layout.values
  return layout.valueSet !== undefined
    ? layout.valueSet.has(value as SchemaAST.LiteralValue)
    : values.length === 1
    ? value === values[0]
    : values.includes(value as SchemaAST.LiteralValue)
}

function literalExpected(layout: LiteralLayout): string {
  return layout.values.map((value) => typeof value === "string" ? JSON.stringify(value) : String(value)).join(" | ")
}

interface ReasonLayout {
  readonly _: "cause" | "causeReason"
  error: Layout
  defect: Layout
}

interface Field {
  readonly name: string
  readonly id: number
  readonly tagBytes: Uint8Array
  index: number
  readonly optional: boolean
  readonly annotations: Schema.Annotations.Key<unknown> | undefined
  layout: Layout
  wireMask: number
  inline: boolean
}

interface ExtraSignature {
  readonly parameter: SchemaAST.IndexSignature["parameter"]
  layout: Layout
  wireMask: number
}

interface StructLayout {
  readonly _: "struct"
  readonly ast: SchemaAST.AST
  readonly fields: Array<Field>
  readonly byId: Map<number, Field>
  readonly extra: Array<ExtraSignature>
  // The lone signature every key matches, so lookups skip the cache.
  readonly extraAll: ExtraSignature | undefined
  readonly names: Set<string>
  // Reuse the last universal index-signature shape across encode calls.
  extraShape: ExtraShape | undefined
  optionalCount: number
  // Required field indices below 32 as one comparison; wider structs with
  // required fields past that keep the per-field check.
  requiredMask: number
  requiredWide: boolean
}

interface Slot {
  readonly optional: boolean
  layout: Layout
}

interface ArrayLayout {
  readonly _: "array"
  readonly ast: SchemaAST.AST
  readonly elements: Array<Slot>
  readonly rest: Array<Layout>
  readonly hasCount: boolean
  readonly minCount: number
  // Shared layout for `Schema.Array(S)`.
  uniform: Layout | undefined
  uniformInline: boolean
  uniformPacked: number | undefined
  uniformNumbers: boolean
  // Lazily compiled row-run plan; `null` once known to be unavailable.
  run: RunPlan | null | undefined
}

// Struct rows repeated in one array share their field ids and repeated strings.
interface RunPlan {
  readonly struct: StructLayout
  // Per field index: INTERN_NONE / SELF / ELEMENTS / KEYS.
  readonly intern: Array<number>
  readonly shapes: boolean
  readonly byName: Map<string, number> | undefined
}

const INTERN_NONE = 0
const INTERN_SELF = 1
const INTERN_ELEMENTS = 2
const INTERN_KEYS = 3

// Rows carry a presence mask over fields plus one bit for the extra block.
const RUN_MAX_FIELDS = 30
const RUN_EXTRA_BIT = 1 << RUN_MAX_FIELDS

interface VariantRow {
  readonly tag: number
  readonly sentinels: ReadonlyArray<SchemaAST.Sentinel>
  readonly tuple: boolean
  payload: Layout
  position: number
}

interface UnionMember {
  readonly kind: number
  readonly layout: Layout
  position: number
}

interface UnionPosition {
  readonly variant: VariantRow | undefined
  readonly layout: Layout
}

// A key every variant pins to its own literal, so encoding picks the variant
// with one lookup instead of scanning.
interface Discriminator {
  readonly key: PropertyKey
  readonly rows: Map<unknown, VariantRow>
}

interface UnionLayout {
  readonly _: "union"
  readonly ast: SchemaAST.AST
  readonly variants: Array<VariantRow>
  readonly byTag: Map<number, VariantRow>
  discriminator: Discriminator | undefined
  readonly others: Array<UnionMember>
  readonly byKind: Map<number, Layout>
  // Canonical order used by fingerprint mode.
  readonly byPos: Array<UnionPosition>
}

function isSelfDelimiting(layout: Layout): boolean {
  return layout._ === "literal" ? isSelfDelimiting(layout.leaf) : layout._ === "int"
}

function packedSize(layout: Layout): number | undefined {
  switch (layout._) {
    case "literal":
      return packedSize(layout.leaf)
    case "bool":
      return 1
    case "int64":
      return 8
    default:
      return undefined
  }
}

function isInlineSlot(layout: Layout): boolean {
  return packedSize(layout) !== undefined || isSelfDelimiting(layout) ||
    layout._ === "null" || layout._ === "undefined"
}

function isZeroWidthSlot(layout: Layout): boolean {
  return layout._ === "literal" ? isZeroWidthSlot(layout.leaf) : layout._ === "null" || layout._ === "undefined"
}

// One registry row per natively supported declaration: its wire kind and
// whether the binary layer validates it exactly on its own (`true`) or exactly
// when its type parameters are ("parameters"). `compileDeclaration` holds the
// matching layout constructors; its fallback asserts the two stay in sync.
const natives: Record<string, { readonly kind: number; readonly exact: true | "parameters" }> = {
  "effect/schema/Date": { kind: K.int64, exact: true },
  "effect/schema/DateTimeUtc": { kind: K.int64, exact: true },
  "effect/schema/DateTimeZoned": { kind: K.dateTimeZoned, exact: true },
  "effect/schema/Duration": { kind: K.duration, exact: true },
  "effect/schema/BigDecimal": { kind: K.bigDecimal, exact: true },
  "effect/schema/Uint8Array": { kind: K.bytes, exact: true },
  "effect/schema/Option": { kind: K.option, exact: "parameters" },
  "effect/schema/Result": { kind: K.result, exact: "parameters" },
  "effect/schema/Exit": { kind: K.exit, exact: "parameters" },
  "effect/schema/Cause": { kind: K.cause, exact: "parameters" },
  "effect/schema/CauseReason": { kind: K.causeReason, exact: "parameters" }
}

function representationId(ast: SchemaAST.AST): string | undefined {
  const representation = ast.annotations?.representation
  return Predicate.isObject(representation) && typeof (representation as { id?: unknown }).id === "string"
    ? (representation as { id: string }).id
    : undefined
}

const toBinaryAST = SchemaAST.applyToSelfOrLastLinkEncodingIdempotent((ast) => {
  const out = toBinaryASTStep(ast)
  const context = ast.context
  if (out === ast || context === undefined) return out
  return SchemaAST.replaceContextLastLink(
    out,
    new SchemaAST.Context(context.isOptional, context.isMutable, undefined, context.annotations)
  )
})

function toBinaryASTStep(ast: SchemaAST.AST): SchemaAST.AST {
  switch (ast._tag) {
    case "Declaration": {
      const id = representationId(ast)
      if (
        id !== undefined && (id in natives || id === "effect/schema/Json" || id === "effect/schema/MutableJson")
      ) {
        return ast.recur(toBinaryAST)
      }
      const getJson = ast.annotations?.toCodecJson
      const getCodec = ast.annotations?.toCodec
      if (!Predicate.isFunction(getJson) && !Predicate.isFunction(getCodec)) {
        return ast
      }
      const typeParameters = ast.typeParameters.map((tp) => Schema.make<Schema.Constraint>(SchemaAST.toEncoded(tp)))
      const link = (Predicate.isFunction(getJson) ? getJson(typeParameters) : undefined) ??
        (Predicate.isFunction(getCodec) ? getCodec(typeParameters) : undefined)
      return link === undefined ? ast : SchemaAST.replaceEncoding(ast, [SchemaAST.mapLink(link, toBinaryAST)])
    }
    case "Arrays":
    case "Objects":
    case "Union":
    case "Suspend":
      return ast.recur(toBinaryAST)
    default:
      return ast
  }
}

function sentinelSetHash(sentinels: ReadonlyArray<SchemaAST.Sentinel>): number {
  const sorted = [...sentinels].sort((a, b) => {
    const an = typeof a.key === "number"
    const bn = typeof b.key === "number"
    if (an !== bn) return an ? -1 : 1
    if (an) return (a.key as number) - (b.key as number)
    return compareBytes(utf8Encode.encode(a.key as string), utf8Encode.encode(b.key as string))
  })
  const out: Array<number> = []
  for (const sentinel of sorted) {
    const keyBytes = utf8Encode.encode(String(sentinel.key))
    out.push(typeof sentinel.key === "number" ? 0 : 1)
    pushU32(out, keyBytes.length)
    pushBytes(out, keyBytes)
    const literal = sentinel.literal
    const valueBytes = utf8Encode.encode(sentinelLiteralString(literal))
    out.push(sentinelLiteralKind(literal))
    pushU32(out, valueBytes.length)
    pushBytes(out, valueBytes)
  }
  return fnv32(out)
}

function sentinelLiteralKind(literal: SchemaAST.LiteralValue | symbol): number {
  switch (typeof literal) {
    case "string":
      return 1
    case "number":
      return 2
    case "boolean":
      return 3
    case "bigint":
      return 4
    default:
      return 5
  }
}

function sentinelLiteralString(literal: SchemaAST.LiteralValue | symbol): string {
  if (typeof literal === "symbol") {
    const key = globalThis.Symbol.keyFor(literal)
    if (key === undefined) {
      throw new Error("Binary layout: unregistered unique symbol (Symbol.keyFor)")
    }
    return key
  }
  return String(literal)
}

function parameterHasSymbol(parameter: SchemaAST.AST): boolean {
  switch (parameter._tag) {
    case "Symbol":
      return true
    case "Union":
      return parameter.types.some(parameterHasSymbol)
    default:
      return false
  }
}

function isJsonDeclaration(ast: SchemaAST.Declaration): boolean {
  const id = representationId(ast)
  if (id === "effect/schema/Json" || id === "effect/schema/MutableJson") return true
  return Predicate.isFunction(ast.annotations?.toCodecJson)
}

// Detect integer checks nested inside filter groups.
function provesInteger(ast: SchemaAST.AST): boolean {
  const checks = ast.checks
  if (checks === undefined) return false
  const go = (check: SchemaAST.Check<never>): boolean => {
    const id = check.annotations?.representation?.id
    if (id === "effect/schema/isInt") return true
    return check._tag === "FilterGroup" && check.checks.some(go)
  }
  return checks.some(go)
}

function resolveSuspend(ast: SchemaAST.AST): SchemaAST.AST {
  while (ast._tag === "Suspend") {
    ast = ast.thunk()
  }
  return ast
}

function enumsToLiterals(ast: SchemaAST.Enum): SchemaAST.Union<SchemaAST.Literal> {
  return new SchemaAST.Union(
    ast.enums.map((e) => new SchemaAST.Literal(e[1], { title: e[0] }))
  )
}

function flattenMembers(union: SchemaAST.Union): Array<SchemaAST.AST> {
  const out: Array<SchemaAST.AST> = []
  const seen = new Set<SchemaAST.AST>()
  const go = (ast: SchemaAST.AST) => {
    const resolved = resolveSuspend(ast)
    if (seen.has(resolved)) return
    seen.add(resolved)
    switch (resolved._tag) {
      case "Never":
        return
      case "Union":
        resolved.types.forEach(go)
        return
      case "Enum":
        enumsToLiterals(resolved).types.forEach(go)
        return
      default:
        out.push(resolved)
    }
  }
  union.types.forEach(go)
  return out
}

function literalKind(literal: SchemaAST.LiteralValue): LeafKind {
  switch (typeof literal) {
    case "string":
      return "string"
    case "number":
      return "number"
    case "boolean":
      return "bool"
    default:
      return "bigint"
  }
}

// Classify union members without eagerly compiling recursive members.
function astKind(ast: SchemaAST.AST): number {
  switch (ast._tag) {
    case "String":
    case "TemplateLiteral":
    case "Symbol":
      return K.string
    case "UniqueSymbol":
      if (globalThis.Symbol.keyFor(ast.symbol) === undefined) {
        throw new Error("Binary layout: unregistered unique symbol (Symbol.keyFor)")
      }
      return K.string
    case "Boolean":
      return K.bool
    case "Null":
      return K.null
    case "Undefined":
    case "Void":
      return K.undefined
    case "Number":
      return K.number
    case "BigInt":
      return K.bigint
    case "Literal":
      switch (typeof ast.literal) {
        case "string":
          return K.string
        case "number":
          return K.number
        case "boolean":
          return K.bool
        default:
          return K.bigint
      }
    case "Unknown":
    case "Any":
    case "ObjectKeyword":
      return K.json
    case "Objects":
      return K.struct
    case "Arrays":
      return K.array
    case "Declaration": {
      const id = representationId(ast)
      if (id !== undefined && id in natives) return natives[id].kind
      if (isJsonDeclaration(ast)) return K.json
      throw new Error(`Binary layout: declaration ${id ?? "<anonymous>"} has no toCodecJson or toCodec`)
    }
    case "Suspend":
      return astKind(resolveSuspend(ast))
    default:
      throw new Error("Binary layout: union members are not uniquely identifiable")
  }
}

function computeRequired(layout: StructLayout) {
  for (const field of layout.fields) {
    if (field.optional) continue
    if (field.index < 32) layout.requiredMask |= 1 << field.index
    else layout.requiredWide = true
  }
}

interface CompiledLayout {
  readonly layout: Layout
  readonly recursive: boolean
  readonly exact: boolean
  readonly exitSuccess: boolean
}

function compileLayout(root: SchemaAST.AST): CompiledLayout {
  const exact = isExact(root)
  const exitSuccess = !exact && isExitWithExactSuccess(root)
  root = SchemaAST.toEncoded(root)
  const memo = new Map<SchemaAST.AST, Layout>()
  let recursive = false
  let stringSlots = 0

  const leaf = (kind: LeafKind): LeafLayout => ({ _: kind, slot: kind === "string" ? stringSlots++ : 0 })

  function compile(ast: SchemaAST.AST): Layout {
    const hit = memo.get(ast)
    if (hit !== undefined) return hit
    const layout = go(ast)
    memo.set(ast, layout)
    return layout
  }

  function go(ast: SchemaAST.AST): Layout {
    switch (ast._tag) {
      case "String":
      case "TemplateLiteral":
        return leaf("string")
      case "Symbol":
      case "UniqueSymbol":
        return leaf("symbol")
      case "Boolean":
        return leaf("bool")
      case "Null":
        return leaf("null")
      case "Undefined":
      case "Void":
        return leaf("undefined")
      case "Number":
        return leaf(provesInteger(ast) ? "int" : "number")
      case "BigInt":
        return leaf("bigint")
      case "Literal":
        return literalLayout(leaf(literalKind(ast.literal)), [ast.literal])
      case "Unknown":
      case "Any":
      case "ObjectKeyword":
        return leaf("json")
      case "Never":
        return { _: "never", ast }
      case "Enum":
        return compileUnion(ast, flattenMembers(enumsToLiterals(ast)))
      case "Suspend": {
        recursive = true
        const layout = compile(ast.thunk())
        memo.set(ast, layout)
        return layout
      }
      case "Objects":
        return compileStruct(ast)
      case "Arrays":
        return compileArray(ast)
      case "Union":
        return compileUnion(ast, flattenMembers(ast))
      case "Declaration":
        return compileDeclaration(ast)
    }
  }

  function compileStruct(ast: SchemaAST.Objects): StructLayout {
    const fields: Array<Field> = []
    const types: Array<SchemaAST.AST> = []
    const idNames = new Map<number, Array<string>>()
    for (const ps of ast.propertySignatures) {
      if (typeof ps.name === "symbol") {
        throw new Error("Binary layout: symbol property names are illegal")
      }
      const name = String(ps.name)
      const annotations = ps.type.context?.annotations
      const explicit = annotations?.[FIELD_ID_ANNOTATION_KEY]
      const id = typeof explicit === "number" ? explicit : fnv32(utf8Encode.encode(name))
      if (!Number.isInteger(id) || id < 0 || id > 0xFFFFFFFF) {
        throw new Error(`Binary layout: illegal field id for ${name}`)
      }
      const names = idNames.get(id)
      if (names === undefined) idNames.set(id, [name])
      else names.push(name)
      fields.push({
        name,
        id,
        tagBytes: uvarintBytes(id * FIELD_WIRE_FACTOR + FIELD_WIRE_SIZED),
        index: 0,
        optional: ps.type.context?.isOptional === true,
        annotations,
        layout: undefined as unknown as Layout,
        wireMask: 0,
        inline: false
      })
      types.push(ps.type)
    }
    for (const [id, names] of idNames) {
      if (id === 0 || names.length > 1) {
        throw new Error(`Binary layout field id collision: ${id} (${names.join(", ")})`)
      }
    }
    const extra: Array<ExtraSignature> = []
    for (const is of ast.indexSignatures) {
      if (parameterHasSymbol(is.parameter)) {
        throw new Error("Binary layout: symbol property names are illegal")
      }
      extra.push({ parameter: is.parameter, layout: undefined as unknown as Layout, wireMask: 0 })
    }
    const layout: StructLayout = {
      _: "struct",
      ast,
      fields,
      byId: new Map(),
      extra,
      extraAll: extra.length === 1 && matchesEveryKey(extra[0].parameter) ? extra[0] : undefined,
      names: new Set(fields.map((f) => f.name)),
      extraShape: undefined,
      optionalCount: 0,
      requiredMask: 0,
      requiredWide: false
    }
    memo.set(ast, layout)
    for (let i = 0; i < fields.length; i++) {
      const field = fields[i]
      field.layout = compile(types[i])
      field.wireMask = fieldWireMask(field.layout)
      // Recursive placeholders already have the discriminant used here.
      field.inline = isInlineSlot(field.layout)
      if (field.optional) layout.optionalCount++
      layout.byId.set(field.id, field)
    }
    fields.sort((a, b) => a.id - b.id)
    for (let i = 0; i < fields.length; i++) fields[i].index = i
    computeRequired(layout)
    for (let i = 0; i < extra.length; i++) {
      extra[i].layout = compile(ast.indexSignatures[i].type)
      extra[i].wireMask = fieldWireMask(extra[i].layout)
    }
    return layout
  }

  function compileArray(ast: SchemaAST.Arrays): ArrayLayout {
    const hasCount = ast.rest.length > 0 || ast.elements.some((e) => e.context?.isOptional === true)
    const requiredElements = ast.elements.filter((e) => e.context?.isOptional !== true).length
    const tailLen = Math.max(0, ast.rest.length - 1)
    const layout: ArrayLayout = {
      _: "array",
      ast,
      elements: [],
      rest: [],
      hasCount,
      minCount: requiredElements + tailLen,
      uniform: undefined,
      uniformInline: false,
      uniformPacked: undefined,
      uniformNumbers: false,
      run: undefined
    }
    memo.set(ast, layout)
    for (const element of ast.elements) {
      layout.elements.push({
        optional: element.context?.isOptional === true,
        layout: compile(element)
      })
    }
    for (const rest of ast.rest) {
      layout.rest.push(compile(rest))
    }
    if (layout.elements.length === 0 && layout.rest.length === 1) {
      const slot = layout.rest[0]
      layout.uniform = slot
      layout.uniformPacked = packedSize(slot)
      layout.uniformNumbers = slot._ === "number"
      layout.uniformInline = isInlineSlot(slot)
    }
    return layout
  }

  function compileDeclaration(ast: SchemaAST.Declaration): Layout {
    const id = representationId(ast)
    switch (id) {
      case "effect/schema/Date":
        return { _: "int64", flavor: "date" }
      case "effect/schema/DateTimeUtc":
        return { _: "int64", flavor: "utc" }
      case "effect/schema/DateTimeZoned":
        return leaf("dateTimeZoned")
      case "effect/schema/Duration":
        return leaf("duration")
      case "effect/schema/BigDecimal":
        return leaf("bigDecimal")
      case "effect/schema/Uint8Array":
        return leaf("bytes")
    }
    const tps = ast.typeParameters
    switch (id) {
      case "effect/schema/Option": {
        const layout = { _: "option" as const, value: undefined as unknown as Layout }
        memo.set(ast, layout)
        layout.value = compile(tps[0])
        return layout
      }
      case "effect/schema/Result": {
        const layout = {
          _: "result" as const,
          success: undefined as unknown as Layout,
          failure: undefined as unknown as Layout
        }
        memo.set(ast, layout)
        layout.success = compile(tps[0])
        layout.failure = compile(tps[1])
        return layout
      }
      case "effect/schema/Exit": {
        const cause: ReasonLayout = {
          _: "cause",
          error: undefined as unknown as Layout,
          defect: undefined as unknown as Layout
        }
        const layout = { _: "exit" as const, value: undefined as unknown as Layout, cause }
        memo.set(ast, layout)
        layout.value = compile(tps[0])
        cause.error = compile(tps[1])
        cause.defect = compile(tps[2])
        return layout
      }
      case "effect/schema/Cause":
      case "effect/schema/CauseReason": {
        const layout: ReasonLayout = {
          _: id === "effect/schema/Cause" ? "cause" : "causeReason",
          error: undefined as unknown as Layout,
          defect: undefined as unknown as Layout
        }
        memo.set(ast, layout)
        layout.error = compile(tps[0])
        layout.defect = compile(tps[1])
        return layout
      }
    }
    if (id !== undefined && id in natives) {
      throw new Error(`Binary layout: native declaration ${id} has no layout constructor`)
    }
    if (isJsonDeclaration(ast)) return leaf("json")
    throw new Error(`Binary layout: declaration ${id ?? "<anonymous>"} has no toCodecJson or toCodec`)
  }

  function compileUnion(ast: SchemaAST.AST, members: Array<SchemaAST.AST>): Layout {
    if (members.length === 0) return { _: "never", ast }
    const variantMembers: Array<{ member: SchemaAST.AST; sentinels: ReadonlyArray<SchemaAST.Sentinel> }> = []
    const rowMembers: Array<{ member: SchemaAST.AST; kind: number }> = []
    const literalRows = new Map<number, Layout>()
    const literalValues = new Map<number, Array<SchemaAST.LiteralValue>>()
    const addLiteralRow = (kind: number, row: Layout) => {
      const existing = literalRows.get(kind)
      if (existing !== undefined && existing._ !== row._) {
        throw new Error("Binary layout: union members are not uniquely identifiable")
      }
      literalRows.set(kind, row)
    }
    for (const member of members) {
      if (member._tag === "Literal") {
        const kind = astKind(member)
        const values = literalValues.get(kind)
        if (values === undefined) {
          literalValues.set(kind, [member.literal])
        } else if (!values.includes(member.literal)) {
          values.push(member.literal)
        }
        continue
      }
      if (member._tag === "UniqueSymbol") {
        astKind(member) // validates the symbol is registered
        addLiteralRow(K.string, leaf("symbol"))
        continue
      }
      if (member._tag === "Objects" || member._tag === "Arrays") {
        const sentinels = SchemaAST.collectSentinels(member)
        if (sentinels !== undefined && sentinels.length > 0) {
          for (const sentinel of sentinels) {
            if (typeof sentinel.key === "symbol") {
              throw new Error("Binary layout: symbol property names are illegal")
            }
          }
          variantMembers.push({ member, sentinels })
          continue
        }
      }
      rowMembers.push({ member, kind: astKind(member) })
    }
    for (const [kind, values] of literalValues) {
      addLiteralRow(kind, literalLayout(leaf(literalKind(values[0])), values))
    }
    if (variantMembers.length === 0 && rowMembers.length === 0 && literalRows.size === 1) {
      return literalRows.values().next().value!
    }
    const kinds = new Set<number>(literalRows.keys())
    for (const { kind } of rowMembers) {
      if (kinds.has(kind)) {
        throw new Error("Binary layout: union members are not uniquely identifiable")
      }
      kinds.add(kind)
    }
    if (variantMembers.length === 0 && literalRows.size === 0 && rowMembers.length === 1) {
      const layout = compile(rowMembers[0].member)
      memo.set(ast, layout)
      return layout
    }
    const tags = new Map<number, ReadonlyArray<SchemaAST.Sentinel>>()
    const variantTags: Array<number> = []
    for (const { sentinels } of variantMembers) {
      const tag = sentinelSetHash(sentinels)
      if (tags.has(tag)) {
        throw new Error(`Binary layout sentinel collision: ${tag}`)
      }
      tags.set(tag, sentinels)
      variantTags.push(tag)
    }
    const layout: UnionLayout = {
      _: "union",
      ast,
      variants: [],
      byTag: new Map(),
      discriminator: undefined,
      others: [],
      byKind: new Map(),
      byPos: []
    }
    memo.set(ast, layout)
    for (let v = 0; v < variantMembers.length; v++) {
      const { member, sentinels } = variantMembers[v]
      const tag = variantTags[v]
      const full = compile(member)
      let payload: Layout
      let tuple: boolean
      if (member._tag === "Objects") {
        const struct = full as StructLayout
        const sentinelNames = new Set(sentinels.map((s) => String(s.key)))
        const fields = struct.fields.filter((f) => !sentinelNames.has(f.name))
        const payloadStruct: StructLayout = {
          _: "struct",
          ast: struct.ast,
          fields,
          byId: new Map(fields.map((f) => [f.id, f])),
          extra: struct.extra,
          extraAll: struct.extraAll,
          names: struct.names,
          extraShape: undefined,
          optionalCount: fields.reduce((count, f) => f.optional ? count + 1 : count, 0),
          requiredMask: 0,
          requiredWide: false
        }
        computeRequired(payloadStruct)
        payload = payloadStruct
        tuple = false
      } else {
        payload = full
        tuple = true
      }
      const row: VariantRow = { tag, sentinels, tuple, payload, position: 0 }
      layout.variants.push(row)
      layout.byTag.set(tag, row)
    }
    for (const [kind, row] of literalRows) {
      layout.others.push({ kind, layout: row, position: 0 })
      layout.byKind.set(kind, row)
    }
    for (const { kind, member } of rowMembers) {
      const row = compile(member)
      layout.others.push({ kind, layout: row, position: 0 })
      layout.byKind.set(kind, row)
    }
    // Fingerprint positions are independent of declaration order.
    for (const row of [...layout.variants].sort((a, b) => a.tag - b.tag)) {
      row.position = layout.byPos.length
      layout.byPos.push({ variant: row, layout: row.payload })
    }
    for (const member of [...layout.others].sort((a, b) => a.kind - b.kind)) {
      member.position = layout.byPos.length
      layout.byPos.push({ variant: undefined, layout: member.layout })
    }
    // Probe specific runtime guards before `json`, which matches anything.
    layout.others.sort((a, b) => matchRank(a.layout) - matchRank(b.layout))
    layout.discriminator = findDiscriminator(layout.variants)
    return layout
  }

  const layout = compile(root)
  return { layout, recursive, exact, exitSuccess }
}

// The parser may return the binary decoder's value directly only when that
// decoder proves every predicate and no Schema parser behavior can change it.
// Schemas whose decoded values the binary layer already produces and validates
// on its own, so the schema pass around it would only repeat work. Constructor
// defaults are ignored because they only run during construction.
function isExact(root: SchemaAST.AST): boolean {
  // A suspend that is still being walked counts as exact: if nothing else in
  // the cycle disqualifies it, the whole cycle is exact.
  const walked = new Map<SchemaAST.AST, boolean>()
  const exact = (ast: SchemaAST.AST): boolean => {
    if (
      ast.encoding !== undefined || ast.checks !== undefined ||
      (ast as { readonly encodingChecks?: SchemaAST.Checks }).encodingChecks !== undefined
    ) {
      return false
    }
    switch (ast._tag) {
      case "String":
      case "Symbol":
      case "Boolean":
      case "Null":
      case "Undefined":
      case "Void":
      case "Number":
      case "BigInt":
      case "Literal":
        return true
      // The binary layer rejects every value for a never layout, in both
      // directions, so the schema pass has nothing left to say about it.
      // Inferred schemas hit this through the element type of an empty array.
      case "Never":
        return true
      // Every decoded JSON value is a valid `unknown`, and the encoder already
      // reports the values it cannot represent, so the pass adds nothing.
      // `ObjectKeyword` is not here: the JSON layout can hand it a string.
      case "Unknown":
      case "Any":
        return true
      case "Arrays":
        return ast.elements.every(exact) && ast.rest.every(exact)
      case "Objects":
        return ast.propertySignatures.every((property) => exact(property.type)) &&
          ast.indexSignatures.every((signature) =>
            signature.parameter._tag === "String" && exact(signature.parameter) && exact(signature.type)
          )
      case "Union":
        return (ast.options?.mode ?? "anyOf") === "anyOf" && ast.types.every(exact)
      // The layout compiles straight through a suspend, so the binary layer
      // validates whatever the thunk returns. Only decoding gets to act on
      // this: encoding a recursive schema still needs the cycle walk, which is
      // why {@link toCodec} keeps the schema pass on that side.
      case "Suspend": {
        const seen = walked.get(ast)
        if (seen !== undefined) return seen
        walked.set(ast, true)
        const result = exact(ast.thunk())
        walked.set(ast, result)
        return result
      }
      case "Declaration": {
        const id = representationId(ast)
        const native = id !== undefined ? natives[id] : undefined
        if (native === undefined) return false
        return native.exact === true || ast.typeParameters.every(exact)
      }
      default:
        return false
    }
  }
  return exact(root)
}

// A clean Exit whose success schema is exact: the binary layer fully produces
// and validates success exits, so only failure exits need the schema pass for
// their cause's error and defect encodings.
function isExitWithExactSuccess(root: SchemaAST.AST): boolean {
  return root._tag === "Declaration" &&
    root.encoding === undefined && root.checks === undefined &&
    (root as { readonly encodingChecks?: SchemaAST.Checks }).encodingChecks === undefined &&
    representationId(root) === "effect/schema/Exit" &&
    isExact(root.typeParameters[0])
}

// Layouts sharing a wire kind can still require different fingerprints.
const F = {
  backEdge: 0,
  bool: 1,
  null: 2,
  undefined: 3,
  number: 4,
  int: 5,
  string: 6,
  symbol: 7,
  bytes: 8,
  bigint: 9,
  json: 10,
  duration: 11,
  bigDecimal: 12,
  dateTimeZoned: 13,
  date: 14,
  dateTimeUtc: 15,
  never: 16,
  struct: 17,
  array: 18,
  union: 19,
  option: 20,
  result: 21,
  exit: 22,
  cause: 23,
  causeReason: 24,
  literal: 25
} as const

// Hash the compiled layout graph, including cycle back-edge distances.
function layoutFingerprint(root: Layout): bigint {
  const cache = new Map<Layout, bigint>()
  const stack: Array<Layout> = []
  // Cache only subtrees that do not escape above their own root.
  let escape = Number.MAX_SAFE_INTEGER

  function go(layout: Layout): bigint {
    const at = stack.lastIndexOf(layout)
    if (at >= 0) {
      if (at < escape) escape = at
      const out: Array<number> = [F.backEdge]
      pushUvarint(out, stack.length - at)
      return fnv64(out)
    }
    const cached = cache.get(layout)
    if (cached !== undefined) return cached
    const self = stack.length
    const outerEscape = escape
    escape = Number.MAX_SAFE_INTEGER
    stack.push(layout)
    const hash = fnv64(structure(layout))
    stack.pop()
    const closed = escape >= self
    if (closed) cache.set(layout, hash)
    escape = closed ? outerEscape : Math.min(outerEscape, escape)
    return hash
  }

  function structure(layout: Layout): Array<number> {
    const out: Array<number> = []
    switch (layout._) {
      case "bool":
      case "null":
      case "undefined":
      case "number":
      case "int":
      case "string":
      case "symbol":
      case "bytes":
      case "bigint":
      case "json":
      case "duration":
      case "bigDecimal":
      case "dateTimeZoned":
        out.push(F[layout._])
        return out
      case "literal": {
        out.push(F.literal)
        pushBytes(out, structure(layout.leaf))
        pushUvarint(out, layout.values.length)
        // Sorted, so a union hashes the same whatever order it declares.
        const sorted = layout.values
          .map((value) => [sentinelLiteralKind(value), sentinelLiteralString(value)] as const)
          .sort((a, b) => a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : a[0] - b[0])
        for (const [kind, text] of sorted) {
          out.push(kind)
          const bytes = utf8Encode.encode(text)
          pushUvarint(out, bytes.length)
          pushBytes(out, bytes)
        }
        return out
      }
      case "int64":
        out.push(layout.flavor === "date" ? F.date : F.dateTimeUtc)
        return out
      case "never":
        out.push(F.never)
        return out
      case "struct": {
        out.push(F.struct)
        pushUvarint(out, layout.fields.length)
        for (const field of layout.fields) {
          pushU32(out, field.id)
          out.push(field.optional ? 1 : 0)
          pushU64(out, go(field.layout))
        }
        pushUvarint(out, layout.extra.length)
        for (const signature of layout.extra) pushU64(out, go(signature.layout))
        return out
      }
      case "array": {
        out.push(F.array)
        pushUvarint(out, layout.elements.length)
        for (const slot of layout.elements) {
          out.push(slot.optional ? 1 : 0)
          pushU64(out, go(slot.layout))
        }
        pushUvarint(out, layout.rest.length)
        for (const rest of layout.rest) pushU64(out, go(rest))
        return out
      }
      case "union": {
        out.push(F.union)
        pushUvarint(out, layout.byPos.length)
        for (const position of layout.byPos) {
          const variant = position.variant
          if (variant === undefined) out.push(0)
          else {
            out.push(1, variant.tuple ? 1 : 0)
            pushU32(out, variant.tag)
          }
          pushU64(out, go(position.layout))
        }
        return out
      }
      case "option":
        out.push(F.option)
        pushU64(out, go(layout.value))
        return out
      case "result":
        out.push(F.result)
        pushU64(out, go(layout.success))
        pushU64(out, go(layout.failure))
        return out
      case "exit":
        out.push(F.exit)
        pushU64(out, go(layout.value))
        pushU64(out, go(layout.cause.error))
        pushU64(out, go(layout.cause.defect))
        return out
      case "cause":
      case "causeReason":
        out.push(layout._ === "cause" ? F.cause : F.causeReason)
        pushU64(out, go(layout.error))
        pushU64(out, go(layout.defect))
        return out
    }
  }

  return go(root)
}

// A frame header the decoder can compare byte by byte, so frames that hold no
// wide numbers never build a DataView.
function fingerprintBytes(lo: number, hi: number): Uint8Array {
  const out = new Uint8Array(8)
  for (let i = 0; i < 4; i++) {
    out[i] = (lo >>> (i * 8)) & 0xFF
    out[i + 4] = (hi >>> (i * 8)) & 0xFF
  }
  return out
}

interface Mode {
  readonly positional: boolean
  readonly envelope: number
  readonly expectedEnvelope: string
  readonly fingerprint: Uint8Array
}

const defaultMode: Mode = {
  positional: false,
  envelope: ENVELOPE,
  expectedEnvelope: "version 2 envelope, flags 0",
  fingerprint: new Uint8Array(8)
}

function fingerprintMode(layout: Layout): Mode {
  const fingerprint = layoutFingerprint(layout)
  return {
    positional: true,
    envelope: ENVELOPE_FINGERPRINT,
    expectedEnvelope: "version 2 envelope, flags 1",
    fingerprint: fingerprintBytes(
      Number(fingerprint & BIGINT_U32_MASK),
      Number((fingerprint >> BIGINT_THIRTY_TWO) & BIGINT_U32_MASK)
    )
  }
}

function matchRank(layout: Layout): number {
  switch (layout._) {
    case "json":
      return 2
    case "struct":
      return 1
    default:
      return 0
  }
}

function matchesLayout(layout: Layout, value: unknown): boolean {
  switch (layout._) {
    case "literal":
      return hasLiteral(layout, value)
    case "bool":
      return typeof value === "boolean"
    case "null":
      return value === null
    case "undefined":
      return value === undefined
    case "number":
    case "int":
      return typeof value === "number"
    case "string":
      return typeof value === "string"
    case "symbol":
      return typeof value === "symbol"
    case "bigint":
      return typeof value === "bigint"
    case "bytes":
      return value instanceof Uint8Array
    case "int64":
      return layout.flavor === "date"
        ? value instanceof Date
        : DateTime.isDateTime(value) && value._tag === "Utc"
    case "dateTimeZoned":
      return DateTime.isDateTime(value) && value._tag === "Zoned"
    case "duration":
      return Duration.isDuration(value)
    case "bigDecimal":
      return BigDecimal.isBigDecimal(value)
    case "option":
      return Option.isOption(value)
    case "result":
      return Result.isResult(value)
    case "exit":
      return Exit.isExit(value)
    case "cause":
      return Cause.isCause(value)
    case "causeReason":
      return Cause.isReason(value)
    case "array":
      return Array.isArray(value)
    case "struct":
      return Predicate.isObject(value) && !Array.isArray(value)
    case "json":
      return true
    case "union":
    case "never":
      return false
  }
}

interface EncodeContext {
  readonly options: SchemaAST.ParseOptions
  readonly positional: boolean
  indexSignatures: IndexSignatureCache | undefined
  // Records of one shape repeat within a frame, so the last one is reused.
  extraShape: ExtraShape | undefined
  // Handed to the row-run field's immediate consumer, then cleared.
  intern: InternWrite | undefined
  // String tables shared by every frame on one connection; `undefined` for a
  // one-shot encode, where each frame stands alone.
  readonly dict: DictWrite | undefined
}

function encodeFail(expected: string, input: unknown, options: SchemaAST.ParseOptions): never {
  throw issueError(new SchemaIssue.InvalidValue({ expected }, input, options))
}

function isCyclic(value: unknown, stack = new Set<object>()): boolean {
  if (!Predicate.isObjectOrArray(value)) return false
  const isArray = Array.isArray(value)
  const prototype = Object.getPrototypeOf(value)
  if (isArray || prototype === Object.prototype || prototype === null) {
    if (stack.has(value)) return true
    stack.add(value)
    try {
      if (isArray) {
        for (let i = 0; i < value.length; i++) {
          if (isCyclic(value[i], stack)) return true
        }
      } else {
        for (const key of Object.keys(value)) {
          if (isCyclic((value as Record<string, unknown>)[key], stack)) return true
        }
      }
    } finally {
      stack.delete(value)
    }
    return false
  }
  if (
    value instanceof Date ||
    value instanceof Uint8Array ||
    DateTime.isDateTime(value) ||
    Duration.isDuration(value) ||
    BigDecimal.isBigDecimal(value)
  ) return false
  if (stack.has(value)) return true
  stack.add(value)
  try {
    if (Option.isOption(value)) {
      return Option.isSome(value) && isCyclic(value.value, stack)
    }
    if (Result.isResult(value)) {
      return isCyclic(Result.isSuccess(value) ? value.success : value.failure, stack)
    }
    if (Exit.isExit(value)) {
      return isCyclic(Exit.isSuccess(value) ? value.value : value.cause, stack)
    }
    if (Cause.isCause(value)) {
      return value.reasons.some((reason) => isCyclic(reason, stack))
    }
    if (Cause.isReason(value)) {
      switch (value._tag) {
        case "Fail":
          return isCyclic(value.error, stack)
        case "Die":
          return isCyclic(value.defect, stack)
        case "Interrupt":
          return false
      }
    }
    if (Chunk.isChunk(value)) {
      for (const item of value) {
        if (isCyclic(item, stack)) return true
      }
      return false
    }
    if (HashMap.isHashMap(value)) {
      for (const [key, item] of value) {
        if (isCyclic(key, stack) || isCyclic(item, stack)) return true
      }
      return false
    }
    if (HashSet.isHashSet(value)) {
      for (const item of value) {
        if (isCyclic(item, stack)) return true
      }
      return false
    }
    if (Redacted.isRedacted(value)) {
      return isCyclic(Redacted.value(value), stack)
    }
    for (const key of Object.keys(value)) {
      if (isCyclic((value as Record<string, unknown>)[key], stack)) return true
    }
  } finally {
    stack.delete(value)
  }
  return false
}

function encodeSized(ctx: EncodeContext, layout: Layout, value: unknown, w: Writer) {
  const mark = w.beginSized()
  encodeValue(ctx, layout, value, w)
  w.endSized(mark)
}

function encodeSymbol(ctx: EncodeContext, value: unknown, w: Writer) {
  const key = globalThis.Symbol.keyFor(value as symbol)
  if (key === undefined) encodeFail("registered symbol", value, ctx.options)
  w.string(key)
}

function encodeReason(ctx: EncodeContext, layout: ReasonLayout, value: unknown, w: Writer) {
  const reason = value as Cause.Reason<unknown>
  switch (reason._tag) {
    case "Fail":
      w.byte(0)
      encodeValue(ctx, layout.error, reason.error, w)
      return
    case "Die":
      w.byte(1)
      encodeValue(ctx, layout.defect, reason.defect, w)
      return
    case "Interrupt":
      if (reason.fiberId === undefined) {
        w.byte(2)
      } else {
        w.byte(3)
        w.f64(reason.fiberId)
      }
  }
}

// `keyBytes` stays undefined while every key is ASCII, where code unit order
// and length already match raw UTF-8.
type ExtraPair = [key: string, signature: ExtraSignature, keyBytes: Uint8Array | undefined]

function isAscii(key: string): boolean {
  for (let i = 0; i < key.length; i++) {
    if (key.charCodeAt(i) > 0x7F) return false
  }
  return true
}

interface ExtraShape {
  readonly layout: StructLayout
  readonly keys: ReadonlyArray<string>
  readonly pairs: Array<ExtraPair>
}

function sameShape(shape: ExtraShape, layout: StructLayout, keys: ReadonlyArray<string>): boolean {
  if (shape.layout !== layout || shape.keys.length !== keys.length) return false
  for (let i = 0; i < keys.length; i++) {
    if (shape.keys[i] !== keys[i]) return false
  }
  return true
}

function canCacheExtraShape(layout: StructLayout, keys: ReadonlyArray<string>): boolean {
  if (layout.extraAll === undefined || keys.length > ENCODE_INDEX_SIGNATURE_CACHE_KEYS) return false
  let codeUnits = 0
  for (let i = 0; i < keys.length; i++) {
    codeUnits += keys[i].length
    if (codeUnits > ENCODE_INDEX_SIGNATURE_CACHE_CODE_UNITS) return false
  }
  return true
}

// Sort extra keys by raw UTF-8 for deterministic output.
function extraPairs(ctx: EncodeContext, layout: StructLayout, obj: Record<string, unknown>): Array<ExtraPair> {
  const keys = Object.keys(obj)
  const cached = layout.extraShape
  if (cached !== undefined && sameShape(cached, layout, keys)) return cached.pairs
  const persistent = canCacheExtraShape(layout, keys)
  const shape = persistent ? undefined : ctx.extraShape
  if (shape !== undefined && sameShape(shape, layout, keys)) return shape.pairs
  const named = layout.names
  const every = layout.extraAll
  const pairs: Array<ExtraPair> = []
  let ascii = true
  for (const key of keys) {
    if (named.has(key)) continue
    const signature = every ?? (ctx.indexSignatures ??= new IndexSignatureCache(ctx.options)).find(layout, key)
    if (signature === undefined) continue
    if (ascii && !isAscii(key)) ascii = false
    pairs.push([key, signature, undefined])
  }
  if (ascii) {
    pairs.sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)
  } else {
    for (const pair of pairs) pair[2] = utf8Encode.encode(pair[0])
    pairs.sort((a, b) => compareBytes(a[2]!, b[2]!))
  }
  if (persistent) {
    for (const pair of pairs) pair[2] ??= utf8Encode.encode(pair[0])
  }
  const next = { layout, keys, pairs }
  if (persistent) layout.extraShape = next
  else ctx.extraShape = next
  return pairs
}

function encodeExtraPairs(
  ctx: EncodeContext,
  pairs: Array<ExtraPair>,
  obj: Record<string, unknown>,
  w: Writer,
  keys?: InternWrite | undefined
) {
  for (const [key, signature, keyBytes] of pairs) {
    const keyLength = keyBytes === undefined ? key.length : keyBytes.length
    const value = obj[key]
    const wire = valueWireCode(signature.layout, value, ctx.options)
    const kind = wire % FIELD_WIRE_FACTOR
    if (keys === undefined) {
      w.uvarint(keyLength * FIELD_WIRE_FACTOR + kind)
    } else {
      if (!keys.disabled) {
        const ref = internRef(keys, key)
        if (ref !== undefined) {
          w.uvarint(ref * 16 + kind * 2 + 1)
          issuePath[issuePathLen++] = key
          encodeWirePayload(ctx, signature.layout, value, wire, w)
          issuePathLen--
          continue
        }
        internAdd(keys, key)
      }
      w.uvarint(keyLength * 16 + kind * 2)
    }
    if (keyBytes === undefined) w.string(key)
    else w.bytes(keyBytes)
    issuePath[issuePathLen++] = key
    encodeWirePayload(ctx, signature.layout, value, wire, w)
    issuePathLen--
  }
}

// Decimal scale rides above the low three kind bits internally, avoiding a
// second decimalScale scan when the payload is written.
function valueWireCode(layout: Layout, value: unknown, options: SchemaAST.ParseOptions): number {
  if (layout._ === "literal") {
    if (!hasLiteral(layout, value)) encodeFail(literalExpected(layout), value, options)
    return valueWireCode(layout.leaf, value, options)
  }
  switch (layout._) {
    case "bool":
      if (typeof value !== "boolean") encodeFail("a boolean", value, options)
      return value ? FIELD_WIRE_TRUE : FIELD_WIRE_FALSE
    case "number":
      if (typeof value !== "number") encodeFail("a number", value, options)
      if (isVarintNumber(value)) return FIELD_WIRE_VARINT
      {
        const scale = decimalScale(value)
        return scale === 0 ? FIELD_WIRE_FIXED64 : scale * FIELD_WIRE_FACTOR + FIELD_WIRE_DECIMAL
      }
    case "int":
      if (!Number.isSafeInteger(value)) encodeFail("an integer", value, options)
      return FIELD_WIRE_VARINT
    default:
      return FIELD_WIRE_SIZED
  }
}

function encodeWirePayload(ctx: EncodeContext, layout: Layout, value: unknown, wire: number, w: Writer) {
  const kind = wire % FIELD_WIRE_FACTOR
  switch (kind) {
    // EMPTY and FIXED32 are decoder-side skip support only; `valueWireCode`
    // never produces them.
    case FIELD_WIRE_FALSE:
    case FIELD_WIRE_TRUE:
      return
    case FIELD_WIRE_VARINT:
      w.numberVarint(value as number)
      return
    case FIELD_WIRE_FIXED64:
      w.f64(value as number)
      return
    case FIELD_WIRE_DECIMAL: {
      const scale = Math.floor(wire / FIELD_WIRE_FACTOR)
      w.numberVarint(Math.round((value as number) * POW10[scale]))
      w.uvarint(scale)
      return
    }
    default:
      encodeSized(ctx, layout, value, w)
  }
}

function encodeStructField(ctx: EncodeContext, field: Field, value: unknown, w: Writer) {
  const wire = valueWireCode(field.layout, value, ctx.options)
  const kind = wire % FIELD_WIRE_FACTOR
  if (kind === FIELD_WIRE_SIZED) {
    const mark = w.idAndMark(field.tagBytes)
    encodeValue(ctx, field.layout, value, w)
    w.endSized(mark)
    return
  }
  w.uvarint(field.id * FIELD_WIRE_FACTOR + kind)
  encodeWirePayload(ctx, field.layout, value, wire, w)
}

function runPresenceMask(plan: RunPlan, obj: Record<string, unknown>): number | undefined {
  const byName = plan.byName
  if (byName === undefined) return undefined
  const keys = Object.getOwnPropertyNames(obj)
  let mask = 0
  for (let i = 0; i < keys.length; i++) {
    const index = byName.get(keys[i])
    if (index !== undefined) mask |= 1 << index
  }
  const struct = plan.struct
  if ((mask & struct.requiredMask) !== struct.requiredMask) {
    const fields = struct.fields
    for (let i = 0; i < fields.length; i++) {
      const field = fields[i]
      if (!field.optional && (mask & (1 << i)) === 0) {
        issuePath[issuePathLen++] = field.name
        throw issueError(new SchemaIssue.MissingKey(field.annotations))
      }
    }
  }
  return mask
}

function encodeStructFields(ctx: EncodeContext, layout: StructLayout, value: object, w: Writer) {
  const obj = value as Record<string, unknown>
  if (layout.extra.length > 0) {
    // Only a run field with index signatures hands over an intern table.
    const keys = ctx.intern
    ctx.intern = undefined
    const pairs = extraPairs(ctx, layout, obj)
    if (pairs.length > 0) {
      w.uvarint(0)
      const mark = w.beginSized()
      encodeExtraPairs(ctx, pairs, obj, w, keys)
      w.endSized(mark)
    }
  }
  const fields = layout.fields
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i]
    const name = field.name
    if (!Object.hasOwn(obj, name)) {
      if (field.optional) continue
      issuePath[issuePathLen++] = name
      throw issueError(new SchemaIssue.MissingKey(field.annotations))
    }
    issuePath[issuePathLen++] = name
    encodeStructField(ctx, field, obj[name], w)
    issuePathLen--
  }
}

// Fingerprint structs use a presence bitmap followed by positional fields.
function encodeStructPositional(ctx: EncodeContext, layout: StructLayout, value: object, w: Writer) {
  const obj = value as Record<string, unknown>
  // Only a run field with index signatures hands over an intern table. Extras
  // encode after the fields here, so claim it before a nested field can.
  const keys = ctx.intern
  ctx.intern = undefined
  const bitmapBytes = (layout.optionalCount + 7) >> 3
  let bitmap = 0
  if (bitmapBytes > 0) {
    bitmap = w.len
    for (let i = 0; i < bitmapBytes; i++) w.byte(0)
  }
  const fields = layout.fields
  let optionalIndex = 0
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i]
    const name = field.name
    const present = Object.hasOwn(obj, name)
    if (field.optional) {
      // Resolve the bitmap address again after any arena growth.
      if (present) w.buf[w.start + bitmap + (optionalIndex >> 3)] |= 1 << (optionalIndex & 7)
      optionalIndex++
      if (!present) continue
    } else if (!present) {
      issuePath[issuePathLen++] = name
      throw issueError(new SchemaIssue.MissingKey(field.annotations))
    }
    issuePath[issuePathLen++] = name
    if (field.inline) encodeValue(ctx, field.layout, obj[name], w)
    else encodeSized(ctx, field.layout, obj[name], w)
    issuePathLen--
  }
  if (layout.extra.length > 0) {
    const pairs = extraPairs(ctx, layout, obj)
    w.uvarint(pairs.length)
    encodeExtraPairs(ctx, pairs, obj, w, keys)
  }
}

function internKind(layout: Layout): number {
  switch (layout._) {
    case "string":
      return INTERN_SELF
    case "array":
      return layout.uniform?._ === "string" ? INTERN_ELEMENTS : INTERN_NONE
    case "struct":
      return layout.extra.length > 0 ? INTERN_KEYS : INTERN_NONE
    default:
      return INTERN_NONE
  }
}

// `Schema.Array(S)` and `Schema.NonEmptyArray(S)` both give every slot one layout.
function runStruct(layout: ArrayLayout): StructLayout | undefined {
  let uniform = layout.uniform
  if (uniform === undefined) {
    if (layout.rest.length !== 1) return undefined
    uniform = layout.rest[0]
    for (const slot of layout.elements) {
      if (slot.optional || slot.layout !== uniform) return undefined
    }
  }
  return uniform._ === "struct" ? uniform : undefined
}

function runPlan(layout: ArrayLayout): RunPlan | null {
  let plan = layout.run
  if (plan !== undefined) return plan
  const struct = runStruct(layout)
  if (struct === undefined) {
    layout.run = plan = null
    return plan
  }
  const intern = struct.fields.map((field) => internKind(field.layout))
  const shapes = struct.fields.length <= RUN_MAX_FIELDS
  plan = {
    struct,
    intern,
    shapes,
    byName: shapes && struct.extra.length === 0
      ? new Map(struct.fields.map((field, index) => [field.name, index]))
      : undefined
  }
  layout.run = plan
  return plan
}

// One table per field, so a field the reader skips can never shift another
// field's references. Holds the values written literally so far, in reference
// order. Short runs scan the array and longer ones build a map, while a table
// whose first `INTERN_DISABLE_AT` values never repeated stops tracking
// entirely: references are optional for writers, and the reader keeps indexing
// literal values either way, so only repeats with more than that many distinct
// values between them lose their back-references.
interface InternWrite {
  readonly values: Array<unknown>
  refs: Map<unknown, number> | undefined
  hits: number
  disabled: boolean
}

const INTERN_MAP_AT = 16
const INTERN_DISABLE_AT = 64

function internWrite(tables: Array<InternWrite | undefined>, index: number): InternWrite {
  return tables[index] ??= { values: [], refs: undefined, hits: 0, disabled: false }
}

function internRef(table: InternWrite, value: unknown): number | undefined {
  const refs = table.refs
  if (refs !== undefined) {
    const ref = refs.get(value)
    if (ref !== undefined) table.hits++
    return ref
  }
  const values = table.values
  for (let i = 0; i < values.length; i++) {
    if (values[i] === value) {
      table.hits++
      return i
    }
  }
  return undefined
}

function internAdd(table: InternWrite, value: unknown) {
  const values = table.values
  if (table.refs !== undefined) {
    if (table.hits === 0 && values.length >= INTERN_DISABLE_AT) {
      table.disabled = true
      table.refs = undefined
      return
    }
    table.refs.set(value, values.length)
  } else if (values.length >= INTERN_MAP_AT) {
    const refs = table.refs = new Map()
    for (let i = 0; i < values.length; i++) refs.set(values[i], i)
    refs.set(value, values.length)
  }
  values.push(value)
}

// A connection dictionary: string tables that outlive a single frame. The
// writer and the reader build the same tables from the same frames, so a
// reference means the same string on both ends. Fields that share a schema
// object share a table, which is why `Schema.String` fields all land in one:
// splitting them costs every layout a few percent and buys the RPC envelope,
// where every string repeats, nothing.
//
// A leaf starts out only watching. It writes plain strings and remembers them
// until one comes back, and only then starts writing references. A leaf whose
// strings never repeat gives up and goes back to writing plain strings for
// good, so it never costs a byte more than no dictionary at all.
const DICT_WATCHING = 0
const DICT_REFERENCING = 1
const DICT_GAVE_UP = 2

// How many distinct strings a leaf watches before giving up on it.
const DICT_WATCH_LIMIT = 64
// How many strings one leaf keeps once it is referencing.
const DICT_MAX_ENTRIES = 512

interface DictSlot {
  readonly values: Array<string>
  readonly refs: Map<string, number>
  state: number
  // Frame that last touched this slot, so a frame records one mark per slot.
  stamp: number
}

type DictRead = Array<DictSlot | undefined>

interface DictWrite {
  readonly slots: DictRead
  // A frame that fails is never sent, so its additions have to come back out or
  // the reader's tables drift from the writer's.
  readonly marks: Array<DictMark>
  frame: number
}

interface DictMark {
  readonly slot: DictSlot
  readonly length: number
  readonly state: number
}

function makeDictWrite(): DictWrite {
  return { slots: [], marks: [], frame: 0 }
}

function dictSlot(slots: DictRead, index: number): DictSlot {
  return slots[index] ??= { values: [], refs: new Map(), state: DICT_WATCHING, stamp: -1 }
}

function dictWatch(slot: DictSlot, value: string) {
  if (slot.refs.has(value)) {
    slot.state = DICT_REFERENCING
    return
  }
  slot.refs.set(value, slot.values.length)
  slot.values.push(value)
  if (slot.values.length >= DICT_WATCH_LIMIT) slot.state = DICT_GAVE_UP
}

function dictAdd(slot: DictSlot, value: string) {
  const values = slot.values
  if (values.length >= DICT_MAX_ENTRIES) return
  slot.refs.set(value, values.length)
  values.push(value)
}

function dictMark(dict: DictWrite, slot: DictSlot) {
  if (slot.stamp === dict.frame) return
  slot.stamp = dict.frame
  dict.marks.push({ slot, length: slot.values.length, state: slot.state })
}

function dictCommit(dict: DictWrite) {
  dict.marks.length = 0
  dict.frame++
}

function dictRollback(dict: DictWrite) {
  const marks = dict.marks
  for (let i = marks.length - 1; i >= 0; i--) {
    const { length, slot, state } = marks[i]
    const values = slot.values
    for (let j = length; j < values.length; j++) slot.refs.delete(values[j])
    values.length = length
    slot.state = state
  }
  marks.length = 0
  dict.frame++
}

// A referencing leaf writes either a reference or a zero marker and the string.
// A watching leaf writes the string alone, so watching costs nothing on the
// wire.
function encodeString(dict: DictWrite, layout: LeafLayout, value: string, w: Writer) {
  const slot = dictSlot(dict.slots, layout.slot)
  const state = slot.state
  if (state === DICT_GAVE_UP) {
    w.string(value)
    return
  }
  dictMark(dict, slot)
  if (state === DICT_WATCHING) {
    w.string(value)
    dictWatch(slot, value)
    return
  }
  const ref = slot.refs.get(value)
  if (ref !== undefined) {
    w.uvarint(ref * 2 + 1)
    return
  }
  w.byte(0)
  dictAdd(slot, value)
  w.string(value)
}

function decodeString(dict: DictRead, layout: LeafLayout, r: Reader): string {
  const slot = dictSlot(dict, layout.slot)
  const state = slot.state
  if (state === DICT_GAVE_UP) return r.readUtf8(r.end - r.pos)
  if (state === DICT_WATCHING) {
    const value = r.readUtf8(r.end - r.pos)
    dictWatch(slot, value)
    return value
  }
  const marker = r.uvarint()
  if ((marker & 1) === 1) {
    const ref = (marker - 1) / 2
    const values = slot.values
    if (ref >= values.length) invalid("a dictionary reference", marker, r.options)
    return values[ref]
  }
  if (marker !== 0) invalid("a dictionary marker", marker, r.options)
  const value = r.readUtf8(r.end - r.pos)
  dictAdd(slot, value)
  return value
}

function encodeInterned(table: InternWrite, ctx: EncodeContext, layout: Layout, value: unknown, w: Writer) {
  if (!table.disabled) {
    const ref = internRef(table, value)
    if (ref !== undefined) {
      w.uvarint(ref * 2 + 1)
      return
    }
    internAdd(table, value)
  }
  const mark = w.beginSized()
  encodeValue(ctx, layout, value, w)
  w.endSizedRun(mark)
}

function encodeStructRun(ctx: EncodeContext, plan: RunPlan, arr: ReadonlyArray<unknown>, count: number, w: Writer) {
  const shapes: Array<number> = []
  const tables: Array<InternWrite | undefined> = []
  for (let i = 0; i < count; i++) {
    issuePath[issuePathLen++] = i
    const mark = w.beginSized()
    encodeRunRow(ctx, plan, shapes, tables, arr[i], w)
    w.endSized(mark)
    issuePathLen--
  }
}

function encodeRunRow(
  ctx: EncodeContext,
  plan: RunPlan,
  shapes: Array<number>,
  tables: Array<InternWrite | undefined>,
  value: unknown,
  w: Writer
) {
  const struct = plan.struct
  const obj = value as Record<string, unknown>
  const fields = struct.fields
  let pairs: Array<ExtraPair> | undefined
  if (struct.extra.length > 0) {
    const found = extraPairs(ctx, struct, obj)
    if (found.length > 0) pairs = found
  }
  const wide = !plan.shapes
  let mask = pairs === undefined ? 0 : RUN_EXTRA_BIT
  const presenceMask = runPresenceMask(plan, obj)
  if (presenceMask !== undefined) {
    mask = presenceMask
  } else {
    for (let i = 0; i < fields.length; i++) {
      const field = fields[i]
      if (Object.hasOwn(obj, field.name)) {
        if (!wide) mask |= 1 << i
      } else if (!field.optional) {
        issuePath[issuePathLen++] = field.name
        throw issueError(new SchemaIssue.MissingKey(field.annotations))
      }
    }
  }
  let shape = -1
  for (let i = 0; i < shapes.length; i++) {
    if (shapes[i] === mask) {
      shape = i
      break
    }
  }
  if (shape >= 0) {
    w.uvarint(shape + 1)
  } else {
    w.uvarint(0)
    if (!wide) shapes.push(mask)
  }
  const declare = shape < 0
  // Fingerprint mode proves both layouts match, so a declared shape is the
  // presence mask instead of a field id list.
  const positionalShape = ctx.positional && !wide
  if (declare && positionalShape) w.uvarint(mask)
  if (pairs !== undefined) {
    if (declare && !positionalShape) w.uvarint(0)
    const mark = w.beginSized()
    encodeExtraPairs(ctx, pairs, obj, w)
    w.endSizedRun(mark)
  }
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i]
    if (wide ? !Object.hasOwn(obj, field.name) : (mask & (1 << i)) === 0) continue
    if (declare && !positionalShape) w.uvarint(field.id)
    issuePath[issuePathLen++] = field.name
    const kind = plan.intern[i]
    if (kind === INTERN_SELF) {
      encodeInterned(internWrite(tables, i), ctx, field.layout, obj[field.name], w)
    } else {
      if (kind !== INTERN_NONE) ctx.intern = internWrite(tables, i)
      const mark = w.beginSized()
      encodeValue(ctx, field.layout, obj[field.name], w)
      w.endSizedRun(mark)
      ctx.intern = undefined
    }
    issuePathLen--
  }
}

function arraySlot(layout: ArrayLayout, index: number, count: number): Layout {
  const elementLen = layout.elements.length
  if (index < elementLen) return layout.elements[index].layout
  const tailLen = Math.max(0, layout.rest.length - 1)
  const tailThreshold = Math.max(elementLen, count - tailLen)
  return index >= tailThreshold ? layout.rest[index - tailThreshold + 1] : layout.rest[0]
}

function encodeArray(ctx: EncodeContext, layout: ArrayLayout, arr: ReadonlyArray<unknown>, w: Writer) {
  const count = arr.length
  if (layout.rest.length === 0 && count > layout.elements.length) {
    issuePath[issuePathLen++] = layout.elements.length
    throw issueError(
      new SchemaIssue.UnexpectedKey(layout.ast, arr[layout.elements.length], ctx.options)
    )
  }
  if (count < layout.minCount) {
    issuePath[issuePathLen++] = count
    throw issueError(new SchemaIssue.MissingKey(undefined))
  }
  if (layout.hasCount) w.uvarint(count)
  if (count > 0) {
    const plan = runPlan(layout)
    if (plan !== null) {
      encodeStructRun(ctx, plan, arr, count, w)
      return
    }
  }
  const uniform = layout.uniform
  if (uniform !== undefined) {
    if (layout.uniformNumbers) {
      encodeNumberRun(ctx, arr, count, w)
      return
    }
    // Only a run field holding an array of strings hands over an intern table.
    const table = ctx.intern
    ctx.intern = undefined
    if (table !== undefined) {
      for (let i = 0; i < count; i++) {
        issuePath[issuePathLen++] = i
        encodeInterned(table, ctx, uniform, arr[i], w)
        issuePathLen--
      }
      return
    }
    const inline = layout.uniformInline
    for (let i = 0; i < count; i++) {
      issuePath[issuePathLen++] = i
      if (inline) encodeValue(ctx, uniform, arr[i], w)
      else encodeSized(ctx, uniform, arr[i], w)
      issuePathLen--
    }
    return
  }
  for (let i = 0; i < count; i++) {
    const slot = arraySlot(layout, i, count)
    issuePath[issuePathLen++] = i
    if (isInlineSlot(slot)) {
      encodeValue(ctx, slot, arr[i], w)
    } else {
      encodeSized(ctx, slot, arr[i], w)
    }
    issuePathLen--
  }
}

// Uniform number arrays share one mode byte: varint, packed decimal, or f64.
// Scales found by the classification pass, reused by the decimal write pass so
// each non-integer scans `decimalScale` once. Only written and read within one
// synchronous `encodeNumberRun` call.
const numberRunScales: Array<number> = []

function encodeNumberRun(ctx: EncodeContext, arr: ReadonlyArray<unknown>, count: number, w: Writer) {
  let varint = true
  let decimal = true
  for (let i = 0; i < count; i++) {
    const value = arr[i]
    if (typeof value !== "number") {
      issuePath[issuePathLen++] = i
      encodeFail("a number", value, ctx.options)
    }
    if (isVarintNumber(value)) {
      const magnitude = value < 0 ? -value : value
      if (magnitude > DECIMAL_MANTISSA_MAX) decimal = false
    } else {
      varint = false
      const scale = decimalScale(value)
      if (scale === 0) decimal = false
      else numberRunScales[i] = scale
    }
    if (!varint && !decimal) break
  }
  if (varint) {
    w.byte(NUMBER_RUN_VARINT)
    for (let i = 0; i < count; i++) w.numberVarint(arr[i] as number)
  } else if (decimal) {
    w.byte(NUMBER_RUN_DECIMAL)
    for (let i = 0; i < count; i++) {
      const value = arr[i] as number
      // Integers take scale 0 even when a scale would fit, matching the
      // classification pass writing scales only for non-integers.
      const scale = Number.isInteger(value) ? 0 : numberRunScales[i]
      const mantissa = scale === 0 ? value : Math.round(value * POW10[scale])
      const negative = mantissa < 0 || (mantissa === 0 && 1 / mantissa < 0)
      const magnitude = negative ? -mantissa : mantissa
      w.uvarint((magnitude * 2 + (negative ? 1 : 0)) * 16 + scale)
    }
  } else {
    w.byte(NUMBER_RUN_F64)
    for (let i = 0; i < count; i++) w.f64(arr[i] as number)
  }
}

function findDiscriminator(variants: ReadonlyArray<VariantRow>): Discriminator | undefined {
  if (variants.length < 2 || variants.some((variant) => variant.tuple)) return undefined
  for (const candidate of variants[0].sentinels) {
    const rows = new Map<unknown, VariantRow>()
    for (const variant of variants) {
      const sentinel = variant.sentinels.find((s) => s.key === candidate.key)
      // `NaN` matches under `Map`'s key equality but not under `===`.
      if (sentinel === undefined || rows.has(sentinel.literal) || Number.isNaN(sentinel.literal)) break
      rows.set(sentinel.literal, variant)
    }
    if (rows.size === variants.length) return { key: candidate.key, rows }
  }
  return undefined
}

// An inherited sentinel does not select a variant, matching the schema pass.
function hasSentinels(variant: VariantRow, value: Record<PropertyKey, unknown>): boolean {
  const sentinels = variant.sentinels
  for (let i = 0; i < sentinels.length; i++) {
    const { key, literal } = sentinels[i]
    if (value[key] !== literal || !Object.hasOwn(value, key)) return false
  }
  return true
}

function matchesVariant(variant: VariantRow, value: unknown): boolean {
  return variant.tuple
    ? Array.isArray(value) && hasSentinels(variant, value as unknown as Record<PropertyKey, unknown>)
    : Predicate.isObject(value) && !Array.isArray(value) &&
      hasSentinels(variant, value as Record<PropertyKey, unknown>)
}

function encodeVariant(ctx: EncodeContext, variant: VariantRow, value: unknown, w: Writer) {
  if (ctx.positional) {
    w.uvarint(variant.position)
  } else {
    w.byte(K.variant)
    w.u32le(variant.tag)
  }
  encodeValue(ctx, variant.payload, value, w)
}

function encodeUnion(ctx: EncodeContext, layout: UnionLayout, value: unknown, w: Writer) {
  const discriminator = layout.discriminator
  if (discriminator !== undefined) {
    // A miss rules out every variant, because each one pins this key to a
    // literal no other variant uses.
    if (Predicate.isObject(value) && !Array.isArray(value)) {
      const record = value as Record<PropertyKey, unknown>
      const variant = discriminator.rows.get(record[discriminator.key])
      if (variant !== undefined && hasSentinels(variant, record)) {
        encodeVariant(ctx, variant, value, w)
        return
      }
    }
  } else {
    for (const variant of layout.variants) {
      if (matchesVariant(variant, value)) {
        encodeVariant(ctx, variant, value, w)
        return
      }
    }
  }
  for (const member of layout.others) {
    if (matchesLayout(member.layout, value)) {
      if (ctx.positional) w.uvarint(member.position)
      else w.byte(member.kind)
      encodeValue(ctx, member.layout, value, w)
      return
    }
  }
  throw issueError(new SchemaIssue.InvalidType(layout.ast, value, ctx.options))
}

function encodeValue(ctx: EncodeContext, layout: Layout, value: unknown, w: Writer): void {
  switch (layout._) {
    case "literal":
      if (!hasLiteral(layout, value)) encodeFail(literalExpected(layout), value, ctx.options)
      encodeValue(ctx, layout.leaf, value, w)
      return
    case "bool":
      if (typeof value !== "boolean") encodeFail("a boolean", value, ctx.options)
      w.byte(value === true ? 1 : 0)
      return
    case "null":
      if (value !== null) encodeFail("null", value, ctx.options)
      return
    case "undefined":
      if (value !== undefined) encodeFail("undefined", value, ctx.options)
      return
    case "number": {
      if (typeof value !== "number") encodeFail("a number", value, ctx.options)
      if (isVarintNumber(value)) {
        w.numberVarint(value)
        return
      }
      const scale = decimalScale(value)
      if (scale > 0) {
        w.numberVarint(Math.round(value * POW10[scale]))
        w.byte(scale)
      } else {
        w.f64(value)
      }
      return
    }
    case "int": {
      // `disableChecks` can bypass the integer check used to select this layout.
      if (!Number.isSafeInteger(value)) encodeFail("an integer", value, ctx.options)
      w.numberVarint(value as number)
      return
    }
    case "string": {
      if (typeof value !== "string") encodeFail("a string", value, ctx.options)
      const dict = ctx.dict
      if (dict === undefined) w.string(value)
      else encodeString(dict, layout, value, w)
      return
    }
    case "symbol":
      if (typeof value !== "symbol") encodeFail("a symbol", value, ctx.options)
      encodeSymbol(ctx, value, w)
      return
    case "bytes":
      if (!(value instanceof Uint8Array)) encodeFail("a Uint8Array", value, ctx.options)
      w.bytes(value)
      return
    case "bigint":
      if (typeof value !== "bigint") encodeFail("a bigint", value, ctx.options)
      w.zigzag(value)
      return
    case "int64": {
      if (!matchesLayout(layout, value)) {
        encodeFail(layout.flavor === "date" ? "a Date" : "a DateTime.Utc", value, ctx.options)
      }
      const millis = layout.flavor === "date" ? (value as Date).getTime() : (value as DateTime.Utc).epochMilliseconds
      if (Number.isNaN(millis)) encodeFail("a valid Date", value, ctx.options)
      w.i64(BigInt(millis))
      return
    }
    case "dateTimeZoned": {
      if (!matchesLayout(layout, value)) encodeFail("a DateTime.Zoned", value, ctx.options)
      const zoned = value as DateTime.Zoned
      w.i64(BigInt(zoned.epochMilliseconds))
      if (zoned.zone._tag === "Offset") {
        w.byte(0)
        w.i32le(zoned.zone.offset)
      } else {
        w.byte(1)
        w.string(zoned.zone.id)
      }
      return
    }
    case "duration": {
      if (!Duration.isDuration(value)) encodeFail("a Duration", value, ctx.options)
      const duration = value.value
      switch (duration._tag) {
        case "Infinity":
          w.byte(1)
          return
        case "NegativeInfinity":
          w.byte(2)
          return
        case "Nanos":
          w.byte(0)
          w.zigzag(duration.nanos)
          return
        case "Millis":
          w.byte(0)
          w.zigzag(BigInt(duration.millis) * BIGINT_NANOS_PER_MILLI)
          return
      }
    }
    case "bigDecimal": {
      if (!BigDecimal.isBigDecimal(value)) encodeFail("a BigDecimal", value, ctx.options)
      const normalized = BigDecimal.normalize(value)
      w.zigzag(normalized.value)
      w.zigzag(BigInt(normalized.scale))
      return
    }
    case "json": {
      let text: string | undefined
      try {
        text = JSON.stringify(value)
      } catch {
        text = undefined
      }
      if (text === undefined) {
        if (isCyclic(value)) encodeFail("acyclic value", value, ctx.options)
        encodeFail("a JSON-serializable value", value, ctx.options)
      }
      w.string(text)
      return
    }
    case "option": {
      if (!Option.isOption(value)) encodeFail("an Option", value, ctx.options)
      const option = value
      if (option._tag === "None") {
        w.byte(0)
      } else {
        w.byte(1)
        encodeValue(ctx, layout.value, option.value, w)
      }
      return
    }
    case "result": {
      if (!Result.isResult(value)) encodeFail("a Result", value, ctx.options)
      const result = value
      if (result._tag === "Success") {
        w.byte(0)
        encodeValue(ctx, layout.success, result.success, w)
      } else {
        w.byte(1)
        encodeValue(ctx, layout.failure, result.failure, w)
      }
      return
    }
    case "exit": {
      if (!Exit.isExit(value)) encodeFail("an Exit", value, ctx.options)
      const exit = value
      if (exit._tag === "Success") {
        w.byte(0)
        encodeValue(ctx, layout.value, exit.value, w)
      } else {
        w.byte(1)
        encodeValue(ctx, layout.cause, exit.cause, w)
      }
      return
    }
    case "cause": {
      if (!Cause.isCause(value)) encodeFail("a Cause", value, ctx.options)
      const reasons = value.reasons
      w.uvarint(reasons.length)
      for (const reason of reasons) {
        const mark = w.beginSized()
        encodeReason(ctx, layout, reason, w)
        w.endSized(mark)
      }
      return
    }
    case "causeReason": {
      if (!Cause.isReason(value)) encodeFail("a Cause.Reason", value, ctx.options)
      encodeReason(ctx, layout, value, w)
      return
    }
    case "struct": {
      if (!Predicate.isObject(value) || Array.isArray(value)) encodeFail("an object", value, ctx.options)
      if (ctx.positional) encodeStructPositional(ctx, layout, value, w)
      else encodeStructFields(ctx, layout, value, w)
      return
    }
    case "array": {
      if (!Array.isArray(value)) encodeFail("an array", value, ctx.options)
      encodeArray(ctx, layout, value, w)
      return
    }
    case "union":
      encodeUnion(ctx, layout, value, w)
      return
    case "never":
      throw issueError(new SchemaIssue.InvalidType(layout.ast, value, ctx.options))
  }
}

// Reuse one top-level writer while allowing nested codecs to allocate their own.
let pooledWriter: Writer | undefined = new Writer()

function writeFrame(ctx: EncodeContext, layout: Layout, value: unknown, mode: Mode, w: Writer) {
  const mark = w.beginSized()
  w.byte(mode.envelope)
  if (mode.positional) w.bytes(mode.fingerprint)
  encodeValue(ctx, layout, value, w)
  w.endSized(mark)
}

// One context and one writer across a batch, so the caches built for the
// first frame serve the rest and the frames need no second pass to join. The
// single-value and batch entry points share this wrapper: the pooled-writer
// protocol (checkout, reset, abort, restore) must not drift between them.
function runFrames(
  layout: Layout,
  value: unknown,
  values: ReadonlyArray<unknown> | undefined,
  options: SchemaAST.ParseOptions,
  mode: Mode,
  dict: DictWrite | undefined
): Uint8Array<ArrayBuffer> {
  const ctx: EncodeContext = {
    options,
    positional: mode.positional,
    indexSignatures: undefined,
    extraShape: undefined,
    intern: undefined,
    dict
  }
  const w = pooledWriter ?? new Writer()
  const pooled = w === pooledWriter
  if (pooled) pooledWriter = undefined
  w.reset()
  const savedPathLen = issuePathLen
  // A batch is one output: a failure anywhere discards every frame in it, so
  // the dictionary commits or rolls back once for the whole call.
  let sent = false
  try {
    if (values === undefined) {
      issuePathLen = 0
      writeFrame(ctx, layout, value, mode, w)
    } else {
      for (let i = 0; i < values.length; i++) {
        issuePathLen = 0
        writeFrame(ctx, layout, values[i], mode, w)
      }
    }
    const out = w.out()
    sent = true
    return out
  } finally {
    if (dict !== undefined) {
      if (sent) dictCommit(dict)
      else dictRollback(dict)
    }
    w.abort()
    issuePathLen = savedPathLen
    if (pooled) pooledWriter = w
  }
}

function encodeFrames(
  layout: Layout,
  values: ReadonlyArray<unknown>,
  options: SchemaAST.ParseOptions,
  mode: Mode,
  dict?: DictWrite | undefined
): Uint8Array<ArrayBuffer> {
  return runFrames(layout, undefined, values, options, mode, dict)
}

function encodeFrame(
  layout: Layout,
  value: unknown,
  options: SchemaAST.ParseOptions,
  mode: Mode,
  dict?: DictWrite | undefined
): Uint8Array<ArrayBuffer> {
  return runFrames(layout, value, undefined, options, mode, dict)
}

// The direct paths bypass the schema pass for values the binary layer fully
// validates on its own; success exits are that case for `exitSuccess` targets.
function isSuccessExit(value: unknown): boolean {
  return Exit.isExit(value) && Exit.isSuccess(value)
}

// Unknown union members resolve to this sentinel.
const ABSENT = globalThis.Symbol.for("~effect/encoding/SchemaBinary/absent")

function decodeChecked(layout: Layout, r: Reader): unknown {
  const value = decodeValue(layout, r)
  if (value !== ABSENT && r.pos !== r.end) invalid("no leftover bytes", undefined, r.options)
  return value
}

function decodeSized(layout: Layout, r: Reader): unknown {
  const saved = r.enter(r.uvarint())
  const value = decodeChecked(layout, r)
  r.exit(saved)
  return value
}

function decodeSlot(layout: Layout, r: Reader): unknown {
  if (isSelfDelimiting(layout)) return decodeValue(layout, r)
  const size = packedSize(layout)
  const saved = r.enter(
    size !== undefined ? size : layout._ === "null" || layout._ === "undefined" ? 0 : r.uvarint()
  )
  const value = decodeChecked(layout, r)
  r.exit(saved)
  return value
}

// Records are usually small, so duplicate keys scan a list and only wide
// records spill into a set.
const SEEN_LIST_MAX = 8

interface SeenKeys {
  readonly list: Array<string>
  set: Set<string> | undefined
}

function seenKey(seen: SeenKeys, key: string): boolean {
  const set = seen.set
  if (set !== undefined) {
    if (set.has(key)) return true
    set.add(key)
    return false
  }
  const list = seen.list
  if (list.includes(key)) return true
  if (list.length >= SEEN_LIST_MAX) {
    const set = seen.set = new Set<string>()
    for (let i = 0; i < list.length; i++) set.add(list[i])
    set.add(key)
  } else {
    list.push(key)
  }
  return false
}

function decodeExtraPair(
  layout: StructLayout,
  r: Reader,
  out: Record<string, unknown>,
  seen: SeenKeys,
  keys?: Array<unknown> | undefined
) {
  const code = r.uvarint()
  const keyCode = keys === undefined ? Math.floor(code / FIELD_WIRE_FACTOR) : Math.floor(code / 16)
  const kind = keys === undefined ? code - keyCode * FIELD_WIRE_FACTOR : Math.floor((code - keyCode * 16) / 2)
  const key = keys === undefined
    ? r.readUtf8(keyCode)
    : decodeExtraKey(keys, code, keyCode, r)
  if (layout.names.has(key)) invalid("an extra key distinct from declared fields", key, r.options)
  if (seenKey(seen, key)) invalid("unique extra keys", undefined, r.options)
  const signature = layout.extraAll ??
    (r.indexSignatures ??= new IndexSignatureCache(r.options)).find(layout, key)
  if (signature === undefined) {
    skipFieldPayload(kind, r)
    return
  }
  issuePath[issuePathLen++] = key
  const value = decodeFieldPayload(signature.layout, signature.wireMask, kind, r)
  issuePathLen--
  if (value !== ABSENT) assignProperty(out, key, value)
}

function decodeExtraKey(keys: Array<unknown>, code: number, keyCode: number, r: Reader): string {
  if ((code & 1) === 1) {
    if (keyCode >= keys.length) invalid("a known back-reference", undefined, r.options)
    return keys[keyCode] as string
  }
  const key = r.readUtf8(keyCode)
  keys.push(key)
  return key
}

function missingKeyIssue(field: Field): SchemaIssue.Issue {
  return new SchemaIssue.Pointer([field.name], new SchemaIssue.MissingKey(field.annotations))
}

function throwMissingKeys(layout: StructLayout, issues: Array<SchemaIssue.Issue>): never {
  throw issueError(
    new SchemaIssue.Composite(layout.ast, issues as [SchemaIssue.Issue, ...Array<SchemaIssue.Issue>])
  )
}

function skipFieldVarint(r: Reader) {
  while ((r.byte() & 0x80) !== 0) {
    // Scan without accumulating an attacker-controlled bigint.
  }
}

function skipFieldPayload(kind: number, r: Reader) {
  switch (kind) {
    case FIELD_WIRE_SIZED:
      r.take(r.uvarint())
      return
    case FIELD_WIRE_VARINT:
      skipFieldVarint(r)
      return
    case FIELD_WIRE_FIXED64:
      r.take(8)
      return
    case FIELD_WIRE_FALSE:
    case FIELD_WIRE_TRUE:
    case FIELD_WIRE_EMPTY:
      return
    case FIELD_WIRE_DECIMAL:
      skipFieldVarint(r)
      skipFieldVarint(r)
      return
    case FIELD_WIRE_FIXED32:
      r.take(4)
      return
  }
}

function fieldWireMask(layout: Layout): number {
  if (layout._ === "literal") return fieldWireMask(layout.leaf)
  switch (layout._) {
    case "bool":
      return (1 << FIELD_WIRE_FALSE) | (1 << FIELD_WIRE_TRUE)
    case "number":
      return (1 << FIELD_WIRE_VARINT) | (1 << FIELD_WIRE_FIXED64) | (1 << FIELD_WIRE_DECIMAL)
    case "int":
      return 1 << FIELD_WIRE_VARINT
    default:
      return 1 << FIELD_WIRE_SIZED
  }
}

function decodeScalarField(kind: number, r: Reader): unknown {
  switch (kind) {
    case FIELD_WIRE_FALSE:
      return false
    case FIELD_WIRE_TRUE:
      return true
    case FIELD_WIRE_VARINT:
      return r.numberVarint()
    case FIELD_WIRE_FIXED64:
      return r.f64()
    case FIELD_WIRE_DECIMAL: {
      const mantissa = r.numberVarint()
      const scale = r.uvarint()
      if (scale === 0 || scale > DECIMAL_SCALE_MAX) invalid("a decimal scale in [1, 8]", scale, r.options)
      return mantissa / POW10[scale]
    }
  }
  return invalid("matching field wire kind", undefined, r.options)
}

function decodeFieldPayload(layout: Layout, wireMask: number, kind: number, r: Reader): unknown {
  if ((wireMask & (1 << kind)) === 0) {
    skipFieldPayload(kind, r)
    return ABSENT
  }
  if (kind !== FIELD_WIRE_SIZED) {
    const value = decodeScalarField(kind, r)
    if (layout._ === "literal" && !hasLiteral(layout, value)) {
      invalid(literalExpected(layout), value, r.options)
    }
    return value
  }
  const saved = r.enter(r.uvarint())
  const value = decodeChecked(layout, r)
  r.exit(saved)
  return value
}

function decodeStruct(layout: StructLayout, r: Reader): unknown {
  // Only a run field with index signatures hands over an intern table.
  let keys: Array<unknown> | undefined
  if (layout.extra.length > 0) {
    keys = r.intern
    r.intern = undefined
  }
  const out: Record<string, unknown> = {}
  // Use bitmasks for common structs and allocate sets only when needed.
  let seenMask = 0
  let presentMask = 0
  let seenWide: Set<number> | undefined
  let presentWide: Set<number> | undefined
  let seenUnknown: Set<number> | undefined
  let seenExtra = false
  // Fast-path fields in encoder order and fall back to the id map.
  const fields = layout.fields
  let cursor = 0
  while (r.pos < r.end) {
    const tag = r.fieldTag()
    const id = Math.floor(tag / FIELD_WIRE_FACTOR)
    const kind = tag - id * FIELD_WIRE_FACTOR
    if (id === 0) {
      if (seenExtra) invalid("unique field ids", undefined, r.options)
      seenExtra = true
      if (kind !== FIELD_WIRE_SIZED) invalid("extra field map", undefined, r.options)
      const saved = r.enter(r.uvarint())
      decodeExtraPairs(layout, r, out, keys)
      r.exit(saved)
      continue
    }
    let field: Field | undefined
    if (cursor < fields.length && fields[cursor].id === id) {
      field = fields[cursor]
      cursor++
    } else {
      field = layout.byId.get(id)
      if (field !== undefined) cursor = field.index + 1
    }
    if (field === undefined) {
      if (seenUnknown === undefined) seenUnknown = new Set()
      else if (seenUnknown.has(id)) invalid("unique field ids", undefined, r.options)
      seenUnknown.add(id)
      skipFieldPayload(kind, r)
      continue
    }
    const index = field.index
    if (index < 32) {
      const bit = 1 << index
      if ((seenMask & bit) !== 0) invalid("unique field ids", undefined, r.options)
      seenMask |= bit
    } else if (seenWide === undefined) {
      seenWide = new Set([index])
    } else {
      if (seenWide.has(index)) invalid("unique field ids", undefined, r.options)
      seenWide.add(index)
    }
    issuePath[issuePathLen++] = field.name
    const value = decodeFieldPayload(field.layout, field.wireMask, kind, r)
    issuePathLen--
    if (value !== ABSENT) {
      assignProperty(out, field.name, value)
      if (index < 32) presentMask |= 1 << index
      else (presentWide ??= new Set()).add(index)
    }
  }
  checkRequiredFields(layout, presentMask, presentWide, r)
  return out
}

// Fails when a required field is absent, honoring `errors: "all"`.
function checkRequiredFields(
  struct: StructLayout,
  presentMask: number,
  presentWide: Set<number> | undefined,
  r: Reader
): void {
  if ((presentMask & struct.requiredMask) === struct.requiredMask && !struct.requiredWide) return
  const fields = struct.fields
  let issues: Array<SchemaIssue.Issue> | undefined
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i]
    const index = field.index
    const present = index < 32 ? (presentMask & (1 << index)) !== 0 : presentWide?.has(index) === true
    if (!field.optional && !present) {
      ;(issues ??= []).push(missingKeyIssue(field))
      if (r.options.errors !== "all") break
    }
  }
  if (issues !== undefined) throwMissingKeys(struct, issues)
}

function decodeStructPositional(layout: StructLayout, r: Reader): unknown {
  // Only a run field with index signatures hands over an intern table. Extras
  // decode after the fields here, so claim it before a nested field can.
  let keys: Array<unknown> | undefined
  if (layout.extra.length > 0) {
    keys = r.intern
    r.intern = undefined
  }
  const out: Record<string, unknown> = {}
  const bitmapBytes = (layout.optionalCount + 7) >> 3
  let bitmap = 0
  if (bitmapBytes > 0) {
    if (r.pos + bitmapBytes > r.end) invalid("complete value", undefined, r.options)
    bitmap = r.pos
    r.pos += bitmapBytes
  }
  const buf = r.buf
  const fields = layout.fields
  let optionalIndex = 0
  let issues: Array<SchemaIssue.Issue> | undefined
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i]
    if (field.optional) {
      const present = (buf[bitmap + (optionalIndex >> 3)] & (1 << (optionalIndex & 7))) !== 0
      optionalIndex++
      if (!present) continue
    }
    issuePath[issuePathLen++] = field.name
    const value = field.inline ? decodeSlot(field.layout, r) : decodeSized(field.layout, r)
    issuePathLen--
    if (value !== ABSENT) assignProperty(out, field.name, value)
    else if (!field.optional) {
      ;(issues ??= []).push(missingKeyIssue(field))
      if (r.options.errors !== "all") break
    }
  }
  if (issues !== undefined) throwMissingKeys(layout, issues)
  if (layout.extra.length > 0) {
    const count = r.uvarint()
    if (count > r.remaining) invalid("complete value", undefined, r.options)
    if (count > 0) {
      const seen: SeenKeys = { list: [], set: undefined }
      for (let i = 0; i < count; i++) decodeExtraPair(layout, r, out, seen, keys)
    }
  }
  return out
}

function decodeExtraPairs(
  layout: StructLayout,
  r: Reader,
  out: Record<string, unknown>,
  keys?: Array<unknown> | undefined
) {
  const seen: SeenKeys = { list: [], set: undefined }
  while (r.pos < r.end) decodeExtraPair(layout, r, out, seen, keys)
}

// A row shape is the writer's tag order: a known field, `null` for the extra
// block, or `undefined` for a field this reader does not have.
// A future shape version can retain scalar wire kinds here so reused rows can
// omit their per-value extents too.
type RunSlot = Field | null | undefined

function decodeInterned(table: Array<unknown>, layout: Layout, r: Reader): unknown {
  const code = r.uvarint()
  if ((code & 1) === 1) {
    const ref = (code - 1) / 2
    if (ref >= table.length) invalid("a known back-reference", undefined, r.options)
    return table[ref]
  }
  // Plain strings consume their whole region, so they skip the reader window.
  if (layout._ === "string") {
    if (r.dict !== undefined) {
      const saved = r.enter(code / 2)
      const value = decodeChecked(layout, r)
      r.exit(saved)
      table.push(value)
      return value
    }
    const value = r.readUtf8(code / 2)
    table.push(value)
    return value
  }
  const saved = r.enter(code / 2)
  const value = decodeChecked(layout, r)
  r.exit(saved)
  table.push(value)
  return value
}

function decodeStructRun(plan: RunPlan, count: number, r: Reader): Array<unknown> {
  const out: Array<unknown> = new Array(count)
  const shapes: Array<Array<RunSlot>> = []
  const tables: Array<Array<unknown> | undefined> = []
  for (let i = 0; i < count; i++) {
    issuePath[issuePathLen++] = i
    const saved = r.enter(r.uvarint())
    out[i] = decodeRunRow(plan, shapes, tables, r)
    r.exit(saved)
    issuePathLen--
  }
  return out
}

// A positional shape is the presence mask over layout field order.
function positionalRunShape(struct: StructLayout, r: Reader): Array<RunSlot> {
  const mask = r.uvarint()
  const fields = struct.fields
  const fieldBits = mask & ~RUN_EXTRA_BIT
  if (mask > RUN_EXTRA_BIT * 2 - 1 || (fieldBits >>> fields.length) !== 0) {
    invalid("a known row shape", undefined, r.options)
  }
  const shape: Array<RunSlot> = []
  if ((mask & RUN_EXTRA_BIT) !== 0) shape.push(null)
  for (let i = 0; i < fields.length; i++) {
    if ((fieldBits & (1 << i)) !== 0) shape.push(fields[i])
  }
  return shape
}

function decodeRunRow(
  plan: RunPlan,
  shapes: Array<Array<RunSlot>>,
  tables: Array<Array<unknown> | undefined>,
  r: Reader
): unknown {
  const struct = plan.struct
  const out: Record<string, unknown> = {}
  let presentMask = 0
  let presentWide: Set<number> | undefined
  const code = r.uvarint()
  let shape: Array<RunSlot> | undefined
  if (code === 0) {
    if (r.positional && plan.shapes) {
      shape = positionalRunShape(struct, r)
      shapes.push(shape)
    }
  } else {
    shape = shapes[code - 1]
    if (shape === undefined) invalid("a known row shape", undefined, r.options)
  }
  if (shape !== undefined) {
    for (let i = 0; i < shape.length; i++) {
      const filled = decodeRunSlot(plan, tables, shape[i], out, r)
      if (filled >= 0) {
        if (filled < 32) presentMask |= 1 << filled
        else (presentWide ??= new Set()).add(filled)
      }
    }
    if (r.pos !== r.end) invalid("no leftover bytes", undefined, r.options)
  } else {
    const declared: Array<RunSlot> | undefined = plan.shapes ? [] : undefined
    let seenMask = 0
    let seenWide: Set<number> | undefined
    let seenIds: Set<number> | undefined
    let seenExtra = false
    while (r.pos < r.end) {
      const id = r.uvarint()
      let slot: RunSlot
      if (id === 0) {
        if (seenExtra) invalid("unique field ids", undefined, r.options)
        seenExtra = true
        slot = null
      } else {
        slot = struct.byId.get(id)
        if (slot === undefined) {
          if (seenIds === undefined) seenIds = new Set([id])
          else if (seenIds.has(id)) invalid("unique field ids", undefined, r.options)
          else seenIds.add(id)
        } else if (slot.index < 32) {
          if ((seenMask & (1 << slot.index)) !== 0) invalid("unique field ids", undefined, r.options)
          seenMask |= 1 << slot.index
        } else if (seenWide === undefined) {
          seenWide = new Set([slot.index])
        } else {
          if (seenWide.has(slot.index)) invalid("unique field ids", undefined, r.options)
          seenWide.add(slot.index)
        }
      }
      declared?.push(slot)
      const filled = decodeRunSlot(plan, tables, slot, out, r)
      if (filled >= 0) {
        if (filled < 32) presentMask |= 1 << filled
        else (presentWide ??= new Set()).add(filled)
      }
    }
    if (declared !== undefined) shapes.push(declared)
  }
  checkRequiredFields(struct, presentMask, presentWide, r)
  return out
}

// Returns the field index this slot filled, or -1.
function decodeRunSlot(
  plan: RunPlan,
  tables: Array<Array<unknown> | undefined>,
  slot: RunSlot,
  out: Record<string, unknown>,
  r: Reader
): number {
  const code = r.uvarint()
  if ((code & 1) === 1) {
    if (slot === null || slot === undefined) return -1
    const table = tables[slot.index]
    const ref = (code - 1) / 2
    if (table === undefined || ref >= table.length) {
      invalid("a known back-reference", undefined, r.options)
    }
    const value = table[ref]
    if (value === ABSENT) return -1
    assignProperty(out, slot.name, value)
    return slot.index
  }
  const saved = r.enter(code / 2)
  if (slot === null) {
    decodeExtraPairs(plan.struct, r, out)
    r.exit(saved)
    return -1
  }
  if (slot === undefined) {
    r.exit(saved)
    return -1
  }
  const kind = plan.intern[slot.index]
  if (kind === INTERN_ELEMENTS || kind === INTERN_KEYS) {
    r.intern = tables[slot.index] ??= []
  }
  issuePath[issuePathLen++] = slot.name
  const value = decodeChecked(slot.layout, r)
  issuePathLen--
  r.intern = undefined
  r.exit(saved)
  if (kind === INTERN_SELF) (tables[slot.index] ??= []).push(value)
  if (value === ABSENT) return -1
  assignProperty(out, slot.name, value)
  return slot.index
}

function decodeArray(layout: ArrayLayout, r: Reader): unknown {
  const elementLen = layout.elements.length
  const count = layout.hasCount ? r.uvarint() : elementLen
  if (layout.rest.length === 0 && count > elementLen) {
    issuePath[issuePathLen++] = elementLen
    throw issueError(new SchemaIssue.UnexpectedKey(layout.ast, undefined, r.options))
  }
  if (count < layout.minCount) {
    issuePath[issuePathLen++] = count
    throw issueError(new SchemaIssue.MissingKey(undefined))
  }
  if (layout.hasCount) {
    const allocationLimit = layout.rest.length > 0 && isZeroWidthSlot(layout.rest[0])
      ? ZERO_WIDTH_ARRAY_MAX
      : r.remaining + ARRAY_ALLOCATION_SLACK
    if (count > allocationLimit) invalid("array count within allocation limit", count, r.options)
  }
  if (count > 0) {
    const plan = runPlan(layout)
    if (plan !== null) return decodeStructRun(plan, count, r)
  }
  const out: Array<unknown> = new Array(count)
  const uniform = layout.uniform
  if (uniform !== undefined) {
    if (layout.uniformNumbers) return decodeNumberRun(out, count, r)
    // Only a run field holding an array of strings hands over an intern table.
    const table = r.intern
    r.intern = undefined
    if (table !== undefined) {
      for (let i = 0; i < count; i++) {
        issuePath[issuePathLen++] = i
        const value = decodeInterned(table, uniform, r)
        if (value === ABSENT) throw issueError(new SchemaIssue.MissingKey(undefined))
        issuePathLen--
        out[i] = value
      }
      return out
    }
    if (isSelfDelimiting(uniform)) {
      for (let i = 0; i < count; i++) {
        issuePath[issuePathLen++] = i
        out[i] = decodeValue(uniform, r)
        issuePathLen--
      }
      return out
    }
    // Strings consume their whole region, so they skip the reader window.
    if (uniform._ === "string") {
      for (let i = 0; i < count; i++) {
        issuePath[issuePathLen++] = i
        out[i] = r.dict === undefined ? r.readUtf8(r.uvarint()) : decodeSized(uniform, r)
        issuePathLen--
      }
      return out
    }
    const packed = layout.uniformPacked
    const inline = layout.uniformInline
    for (let i = 0; i < count; i++) {
      issuePath[issuePathLen++] = i
      const saved = r.enter(inline ? packed ?? 0 : r.uvarint())
      const value = decodeChecked(uniform, r)
      r.exit(saved)
      if (value === ABSENT) throw issueError(new SchemaIssue.MissingKey(undefined))
      issuePathLen--
      out[i] = value
    }
    return out
  }
  for (let i = 0; i < count; i++) {
    const slot = arraySlot(layout, i, count)
    const optional = i < elementLen && layout.elements[i].optional
    if (!layout.hasCount && r.remaining === 0 && !optional && slot._ !== "null" && slot._ !== "undefined") {
      issuePath[issuePathLen++] = i
      throw issueError(new SchemaIssue.MissingKey(undefined))
    }
    issuePath[issuePathLen++] = i
    const value = decodeSlot(slot, r)
    if (value === ABSENT) {
      if (optional) invalid("known union member", undefined, r.options)
      throw issueError(new SchemaIssue.MissingKey(undefined))
    }
    issuePathLen--
    out[i] = value
  }
  if (!layout.hasCount && r.pos < r.end) {
    issuePath[issuePathLen++] = elementLen
    throw issueError(new SchemaIssue.UnexpectedKey(layout.ast, undefined, r.options))
  }
  return out
}

function decodeNumberRun(out: Array<unknown>, count: number, r: Reader): Array<unknown> {
  const mode = r.byte()
  if (mode === NUMBER_RUN_F64) {
    if (r.remaining !== count * 8) invalid("f64", undefined, r.options)
    for (let i = 0; i < count; i++) out[i] = r.f64()
    return out
  }
  if (mode === NUMBER_RUN_DECIMAL) {
    for (let i = 0; i < count; i++) {
      issuePath[issuePathLen++] = i
      const code = r.uvarint()
      const scale = code % 16
      if (scale > DECIMAL_SCALE_MAX) invalid("decimal", undefined, r.options)
      const value = decodeSignMagnitude((code - scale) / 16)
      out[i] = scale === 0 ? value : value / POW10[scale]
      issuePathLen--
    }
    return out
  }
  if (mode !== NUMBER_RUN_VARINT) invalid("f64", undefined, r.options)
  for (let i = 0; i < count; i++) {
    issuePath[issuePathLen++] = i
    out[i] = r.numberVarint()
    issuePathLen--
  }
  return out
}

function decodeUnion(layout: UnionLayout, r: Reader): unknown {
  const kind = r.byte()
  if (kind === K.variant) {
    const tag = r.u32le()
    const variant = layout.byTag.get(tag)
    if (variant === undefined) {
      r.take(r.remaining)
      return ABSENT
    }
    const payload = decodeChecked(variant.payload, r)
    if (payload === ABSENT) return ABSENT
    if (!variant.tuple) {
      for (const sentinel of variant.sentinels) {
        assignProperty(payload as object, sentinel.key, sentinel.literal)
      }
    }
    return payload
  }
  const member = layout.byKind.get(kind)
  if (member === undefined) {
    r.take(r.remaining)
    return ABSENT
  }
  return decodeChecked(member, r)
}

// Fingerprint mode rejects selectors outside its canonical member table.
function decodeUnionPositional(layout: UnionLayout, r: Reader): unknown {
  const position = layout.byPos[r.uvarint()]
  if (position === undefined) invalid("known union member", undefined, r.options)
  const payload = decodeChecked(position.layout, r)
  const variant = position.variant
  if (variant !== undefined && !variant.tuple && payload !== ABSENT) {
    for (const sentinel of variant.sentinels) {
      assignProperty(payload as object, sentinel.key, sentinel.literal)
    }
  }
  return payload
}

function decodeReason(layout: ReasonLayout, r: Reader): unknown {
  const tag = r.byte()
  switch (tag) {
    case 0:
      return Cause.makeFailReason(requirePresent(decodeChecked(layout.error, r)))
    case 1:
      return Cause.makeDieReason(requirePresent(decodeChecked(layout.defect, r)))
    case 2:
      if (r.remaining !== 0) invalid("empty", undefined, r.options)
      return Cause.makeInterruptReason()
    case 3: {
      if (r.remaining !== 8) invalid("f64", undefined, r.options)
      return Cause.makeInterruptReason(r.f64())
    }
    default:
      r.take(r.remaining)
      return ABSENT
  }
}

function requirePresent(value: unknown): unknown {
  if (value === ABSENT) throw issueError(new SchemaIssue.MissingKey(undefined))
  return value
}

function decodeValue(layout: Layout, r: Reader): unknown {
  if (r.nesting >= MAX_NESTING_DEPTH) {
    invalid(`nesting depth at most ${MAX_NESTING_DEPTH}`, r.nesting + 1, r.options)
  }
  r.nesting++
  try {
    return decodeValueUnchecked(layout, r)
  } finally {
    r.nesting--
  }
}

function decodeValueUnchecked(layout: Layout, r: Reader): unknown {
  switch (layout._) {
    case "literal": {
      const value = decodeValue(layout.leaf, r)
      if (!hasLiteral(layout, value)) invalid(literalExpected(layout), value, r.options)
      return value
    }
    case "bool": {
      if (r.remaining !== 1) invalid("bool", undefined, r.options)
      const b = r.byte()
      if (b > 1) invalid("bool", undefined, r.options)
      return b === 1
    }
    case "null":
      if (r.remaining !== 0) invalid("empty", undefined, r.options)
      return null
    case "undefined":
      if (r.remaining !== 0) invalid("empty", undefined, r.options)
      return undefined
    case "number": {
      const len = r.remaining
      if (len === 8) return r.f64()
      if (len === 0 || len > NUMBER_VARINT_MAX_BYTES) invalid("f64", undefined, r.options)
      const value = r.numberVarint()
      if (r.remaining === 0) return value
      const scale = r.byte()
      if (r.remaining !== 0 || scale === 0 || scale > DECIMAL_SCALE_MAX) {
        invalid("decimal", undefined, r.options)
      }
      return value / POW10[scale]
    }
    case "int":
      return r.numberVarint()
    case "string": {
      const dict = r.dict
      return dict === undefined ? r.readUtf8(r.end - r.pos) : decodeString(dict, layout, r)
    }
    case "symbol":
      return globalThis.Symbol.for(r.readUtf8(r.end - r.pos))
    case "bytes":
      return r.takeCopy(r.end - r.pos)
    case "bigint":
      return r.zigzag()
    case "int64": {
      if (r.remaining !== 8) invalid("int64", undefined, r.options)
      const millis = Number(r.i64())
      const date = new Date(millis)
      if (Number.isNaN(date.getTime())) {
        invalid(layout.flavor === "date" ? "a valid Date" : "a valid DateTime", millis, r.options)
      }
      return layout.flavor === "date" ? date : DateTime.makeUnsafe(millis)
    }
    case "dateTimeZoned": {
      const millis = Number(r.i64())
      const tag = r.byte()
      let timeZone: number | string
      if (tag === 0) {
        if (r.remaining !== 4) invalid("time zone", undefined, r.options)
        timeZone = r.i32le()
      } else if (tag === 1) {
        timeZone = r.readUtf8(r.end - r.pos)
      } else {
        return invalid("time zone", undefined, r.options)
      }
      try {
        return DateTime.makeZonedUnsafe(millis, { timeZone })
      } catch {
        return invalid("time zone", undefined, r.options)
      }
    }
    case "duration": {
      const tag = r.byte()
      switch (tag) {
        case 0:
          return Duration.nanos(r.zigzag())
        case 1:
          return Duration.infinity
        case 2:
          return Duration.negativeInfinity
        default:
          return invalid("duration", undefined, r.options)
      }
    }
    case "bigDecimal": {
      const value = r.zigzag()
      const scale = r.zigzag()
      if (scale > MAX_SAFE_BIGINT || -scale > MAX_SAFE_BIGINT) invalid("safe integer length", undefined, r.options)
      return BigDecimal.make(value, Number(scale))
    }
    case "json": {
      const text = r.readUtf8(r.end - r.pos)
      try {
        return JSON.parse(text)
      } catch {
        return invalid("json", undefined, r.options)
      }
    }
    case "option": {
      const tag = r.byte()
      if (tag === 0) {
        if (r.remaining !== 0) invalid("empty", undefined, r.options)
        return Option.none()
      }
      if (tag !== 1) invalid("bool", undefined, r.options)
      return Option.some(requirePresent(decodeChecked(layout.value, r)))
    }
    case "result": {
      const tag = r.byte()
      if (tag === 0) return Result.succeed(requirePresent(decodeChecked(layout.success, r)))
      if (tag !== 1) invalid("bool", undefined, r.options)
      return Result.fail(requirePresent(decodeChecked(layout.failure, r)))
    }
    case "exit": {
      const tag = r.byte()
      if (tag === 0) return Exit.succeed(requirePresent(decodeChecked(layout.value, r)))
      if (tag !== 1) invalid("bool", undefined, r.options)
      const cause = decodeValue(layout.cause, r)
      return Exit.failCause(cause as Cause.Cause<unknown>)
    }
    case "cause": {
      const count = r.uvarint()
      const reasons: Array<Cause.Reason<unknown>> = []
      for (let i = 0; i < count; i++) {
        issuePath[issuePathLen++] = i
        const saved = r.enter(r.uvarint())
        const reason = decodeReason(layout, r)
        r.exit(saved)
        issuePathLen--
        if (reason !== ABSENT) reasons.push(reason as Cause.Reason<unknown>)
      }
      if (r.pos !== r.end) invalid("no leftover bytes", undefined, r.options)
      return Cause.fromReasons(reasons)
    }
    case "causeReason":
      return decodeReason(layout, r)
    case "struct":
      return r.positional ? decodeStructPositional(layout, r) : decodeStruct(layout, r)
    case "array":
      return decodeArray(layout, r)
    case "union":
      return r.positional ? decodeUnionPositional(layout, r) : decodeUnion(layout, r)
    case "never":
      throw issueError(new SchemaIssue.InvalidType(layout.ast, undefined, r.options))
  }
}

function decodeFrameBody(layout: Layout, r: Reader, mode: Mode): unknown {
  const envelope = r.byte()
  if (envelope !== mode.envelope) invalid(mode.expectedEnvelope, envelope, r.options)
  if (mode.positional) {
    if (r.remaining < 8) invalid("complete value", undefined, r.options)
    const buf = r.buf
    const expected = mode.fingerprint
    const pos = r.pos
    for (let i = 0; i < 8; i++) {
      if (buf[pos + i] !== expected[i]) invalid("matching layout fingerprint", undefined, r.options)
    }
    r.pos = pos + 8
  }
  const value = decodeChecked(layout, r)
  if (value === ABSENT) throw issueError(new SchemaIssue.MissingKey(undefined))
  return value
}

// Reuse one top-level reader while allowing nested codecs to allocate their own.
let pooledReader: Reader | undefined = new Reader()

function decodeOneShot(
  layout: Layout,
  bytes: Uint8Array,
  options: SchemaAST.ParseOptions,
  mode: Mode
): unknown {
  const r = pooledReader ?? new Reader()
  const pooled = r === pooledReader
  if (pooled) pooledReader = undefined
  r.reset(bytes, 0, bytes.length, options, undefined, mode.positional, undefined)
  const savedPathLen = issuePathLen
  issuePathLen = 0
  try {
    const n = r.uvarint()
    if (n === 0) invalid("nonzero frame length", undefined, options)
    const saved = r.enter(n)
    const value = decodeFrameBody(layout, r, mode)
    r.exit(saved)
    if (r.pos !== bytes.length) invalid("no leftover bytes", undefined, options)
    return value
  } finally {
    issuePathLen = savedPathLen
    r.release()
    if (pooled) pooledReader = r
  }
}

function makeTransformation(
  layout: Layout,
  mode: Mode,
  trusted: Trusted | undefined,
  successOnly = false
): SchemaTransformation.Transformation<unknown, Uint8Array<ArrayBuffer>> {
  return SchemaTransformation.transformEffect({
    decode: (bytes: Uint8Array<ArrayBuffer>, options) => {
      try {
        const value = decodeOneShot(layout, bytes, options, mode)
        if (
          trusted !== undefined && Predicate.isObjectOrArray(value) &&
          (!successOnly || isSuccessExit(value))
        ) trusted.value = value
        return Effect.succeed(value)
      } catch (e) {
        return e instanceof IssueError ? Effect.fail(e.issue) : Effect.die(e)
      }
    },
    encode: (value: unknown, options) => {
      try {
        return Effect.succeed(encodeFrame(layout, value, options, mode))
      } catch (e) {
        return e instanceof IssueError ? Effect.fail(e.issue) : Effect.die(e)
      }
    }
  })
}

const fingerprintModeMemo = memoize(fingerprintMode)

function compileMode(layout: Layout, fingerprint: boolean | undefined): Mode {
  return fingerprint === true ? fingerprintModeMemo(layout) : defaultMode
}

interface CompiledTarget {
  readonly target: Schema.Constraint
  readonly layout: Layout
  readonly exact: boolean
  readonly exitSuccess: boolean
  // A recursive schema can hold a cyclic value, which only the schema pass
  // detects, so encoding one keeps that pass even when the layout is exact.
  readonly recursive: boolean
}

const compileTargetFromAst = memoize((ast: SchemaAST.AST): CompiledTarget => {
  const raw = Schema.make<Schema.Constraint>(toBinaryAST(ast))
  const { exact, exitSuccess, layout, recursive } = compileLayout(raw.ast)
  // Only recursive schemas need the cycle walk.
  return { target: recursive ? withCycleGuard(raw) : raw, layout, exact, exitSuccess, recursive }
})

function compileTarget(schema: Schema.Constraint): CompiledTarget {
  return compileTargetFromAst(schema.ast)
}

// The value the binary decoder produced most recently. The schema pass around
// the decode runs straight after it, so one slot is all the handoff needs, and
// a value that misses the slot just pays the real check. The slot holds that
// one value until the next decode replaces it.
interface Trusted {
  value: object | undefined
}

function takeTrusted(trusted: Trusted, input: unknown): boolean {
  if (trusted.value === undefined || input !== trusted.value) return false
  trusted.value = undefined
  return true
}

// A target that bypasses the schema pass when `accept` takes the input, and
// otherwise runs the target's type schema. The two directions get their own
// predicate: `flip` swaps the declaration's encoding run in when encoding, the
// way it already swaps `encodingChecks`.
function bypassPass(
  target: Schema.Constraint,
  decodeAccept: (input: unknown, options: SchemaAST.ParseOptions) => boolean,
  encodeAccept: (input: unknown, options: SchemaAST.ParseOptions) => boolean
): Schema.Constraint {
  const type = Schema.make(SchemaAST.toType(target.ast))
  const parse = SchemaParser.decodeUnknownEffect(type as Schema.ConstraintDecoder<unknown>)
  // A bypassed input comes back unchanged, which the shared "same value" exit
  // says without allocating one per call.
  const run = (
    accept: (input: unknown, options: SchemaAST.ParseOptions) => boolean
  ): SchemaAST.Declaration["run"] =>
  () =>
  (input, _ast, options) => accept(input, options) ? InternalParserProtocol.sameExit : parse(input, options)
  return Schema.make(
    new SchemaAST.Declaration(
      [type.ast],
      run(decodeAccept),
      { identifier: "binary value" },
      undefined,
      undefined,
      undefined,
      undefined,
      run(encodeAccept)
    )
  )
}

// The binary layer drops unknown keys instead of reporting them, so only
// `onExcessProperty: "error"` needs the schema pass to see the input.
function reportsExcess(_input: unknown, options: SchemaAST.ParseOptions): boolean {
  return options.onExcessProperty !== "error"
}

// The binary layer already validates an exact schema in both directions, so the
// schema pass around it repeats that work. Encoding skips it outright. Decoding
// only lets values the binary layer just produced through, so every other
// input, `Schema.is` included, still runs the real check.
function withTrustedDecode(
  target: Schema.Constraint,
  trusted: Trusted,
  bypassEncode: boolean
): Schema.Constraint {
  return bypassPass(
    target,
    (input) => takeTrusted(trusted, input),
    // A recursive schema keeps the pass on encode: decoding cannot build a
    // cycle, but a caller can hand one in, and the cycle walk lives there.
    bypassEncode ? reportsExcess : constFalse
  )
}

function constFalse(): boolean {
  return false
}

// Success exits with an exact success schema are fully validated by the binary
// layer, so only failure exits pay the schema pass for their cause's error and
// defect encodings. The type parameter flips with the direction, so the same
// fallback decodes binary failure exits and encodes failure exits back to the
// wire representation. Under `onExcessProperty: "error"` only decoder-produced
// values bypass the pass: the binary layer drops unknown keys instead of
// reporting them, so other success exits keep the schema pass. It is not a
// sound `Schema.is` guard, which is why only {@link toCodecDirect} uses it.
function withExitSuccessDecode(target: Schema.Constraint, trusted: Trusted): Schema.Constraint {
  return Schema.declareConstructor<unknown>()(
    [target],
    ([codec]) => {
      const parse = SchemaParser.decodeUnknownEffect(codec as Schema.ConstraintDecoder<unknown>)
      return (input, _ast, options) =>
        takeTrusted(trusted, input) ||
          (isSuccessExit(input) && options.onExcessProperty !== "error")
          ? Effect.succeed(input)
          : parse(input, options)
    },
    { identifier: "binary exit value" }
  )
}

// An exact schema is fully validated by the binary layer in both directions, so
// this target adds nothing, except under `onExcessProperty: "error"`. It is not
// a sound `Schema.is` guard, which is why only {@link toCodecDirect} uses it.
function passThrough(target: Schema.Constraint): Schema.Constraint {
  return bypassPass(target, reportsExcess, reportsExcess)
}

// Skip the cycle walk once for structurally decoded values.
function withCycleGuard(target: Schema.Constraint): Schema.Constraint {
  const type = Schema.make(SchemaAST.toType(target.ast))
  const decoded = new WeakSet<object>()
  const guard = Schema.declareConstructor<unknown>()(
    [type],
    ([type]) => (input, ast, options) => {
      if (Predicate.isObjectOrArray(input) && decoded.delete(input)) {
        return Effect.succeed(input)
      }
      return isCyclic(input)
        ? Effect.fail(new SchemaIssue.InvalidType(ast, input, options))
        : SchemaParser.decodeUnknownEffect(type)(input, options)
    },
    { identifier: "acyclic value" }
  )
  return Schema.decodeTo(
    guard,
    SchemaTransformation.transform({
      decode: (value) => {
        if (Predicate.isObjectOrArray(value)) decoded.add(value)
        return value
      },
      encode: (value) => value
    })
  )(target)
}
