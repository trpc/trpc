/**
 * Decodes and encodes XML 1.0 documents as streams of events in Effect
 * channels.
 *
 * `decode` and `decodeString` turn UTF-8 bytes or text into events, and
 * `encode` and `encodeString` write events back as XML. `elements` collects
 * repeated elements, such as the items of a feed, into small trees, so that a
 * large document can be processed one record at a time.
 *
 * The decoder checks that documents are well-formed. It never reads external
 * resources and never expands entities declared in a DOCTYPE, so external
 * entity (XXE) and entity expansion attacks do not apply. It does not validate
 * documents against a DTD or schema, and reports names as written, without
 * resolving namespaces.
 *
 * @stability experimental
 * @since 4.0.6
 */
import * as Arr from "../Array.ts"
import * as Cause from "../Cause.ts"
import * as Channel from "../Channel.ts"
import * as Data from "../Data.ts"
import * as Effect from "../Effect.ts"
import * as Predicate from "../Predicate.ts"
import * as Pull from "../Pull.ts"

const XmlErrorTypeId = "~effect/encoding/Xml/XmlError"

/**
 * Error raised when XML cannot be decoded or encoded.
 *
 * **Details**
 *
 * The `kind` field identifies the failure:
 *
 * - `Syntax`: the input is not well-formed XML or not valid UTF-8.
 * - `Unsupported`: the input uses a feature this module does not process, such
 *   as an entity declared in a DOCTYPE or a byte encoding other than UTF-8.
 * - `Limit`: the input exceeds `maxTokenSize`, `maxDepth` or `maxElementSize`.
 * - `InvalidEvent`: the events do not form a well-formed document, such as an
 *   end tag that does not match its start tag.
 *
 * Errors from `decode` and `decodeString` carry the one-based `line` and
 * `column` where the problem was found, also appended to `message`. Columns
 * count UTF-16 code units, and lines end at LF, CR or CRLF.
 *
 * @stability experimental
 * @category errors
 * @since 4.0.6
 */
export class XmlError extends Data.TaggedError("XmlError")<{
  readonly kind: "Syntax" | "Unsupported" | "Limit" | "InvalidEvent"
  readonly message: string
  readonly line?: number | undefined
  readonly column?: number | undefined
}> {
  /**
   * Marks this value as an XML error for runtime guards.
   *
   * @stability experimental
   * @since 4.0.6
   */
  readonly [XmlErrorTypeId] = XmlErrorTypeId
}

/**
 * Checks whether a value is an `XmlError`.
 *
 * @stability experimental
 * @category guards
 * @since 4.0.6
 */
export const isXmlError = (u: unknown): u is XmlError => Predicate.hasProperty(u, XmlErrorTypeId)

/**
 * Event for the XML declaration at the start of a document, such as
 * `<?xml version="1.0" encoding="UTF-8"?>`.
 *
 * **Details**
 *
 * `encoding` and `standalone` are present only when the declaration sets them.
 *
 * @stability experimental
 * @category models
 * @since 4.0.6
 */
export interface Declaration {
  readonly _tag: "Declaration"
  readonly version: string
  readonly encoding?: string | undefined
  readonly standalone?: boolean | undefined
}

/**
 * Event for a document type declaration, such as `<!DOCTYPE html>`.
 *
 * **Details**
 *
 * `publicId` and `systemId` are present only when the declaration names an
 * external DTD; the DTD is never read. Whitespace in `publicId` is collapsed
 * to single spaces and trimmed. The internal subset is not reported.
 *
 * @stability experimental
 * @category models
 * @since 4.0.6
 */
export interface Doctype {
  readonly _tag: "Doctype"
  readonly name: string
  readonly publicId?: string | undefined
  readonly systemId?: string | undefined
}

/**
 * Event for a start tag, with its attributes in document order.
 *
 * **Details**
 *
 * `name` is the qualified name as written and is the only element-name field
 * the encoder reads.
 *
 * Attribute values have their references replaced and whitespace normalized as
 * XML requires. Decoded attributes inherit nothing, so only the attributes of
 * the tag are present and `__proto__` is an ordinary key. Their key order is
 * document order, as XML names are never integer-like. A `structuredClone` of
 * a decoded map gets `Object.prototype` back. A self-closing tag such as
 * `<br/>` is decoded as a `StartElement` followed by an `EndElement`.
 *
 * @stability experimental
 * @category models
 * @since 4.0.6
 */
export interface StartElement {
  readonly _tag: "StartElement"
  readonly name: string
  readonly attributes: Readonly<Record<string, string>>
}

/**
 * Event for an end tag.
 *
 * @stability experimental
 * @category models
 * @since 4.0.6
 */
export interface EndElement {
  readonly _tag: "EndElement"
  readonly name: string
}

/**
 * Event for character data inside the root element.
 *
 * **Details**
 *
 * Adjacent text, references and CDATA sections are decoded into one `Text`
 * event that ends at the next tag, comment or processing instruction, however
 * the input is chunked. Line endings are normalized to `\n`.
 *
 * @stability experimental
 * @category models
 * @since 4.0.6
 */
export interface Text {
  readonly _tag: "Text"
  readonly text: string
}

/**
 * Event for a comment, holding the text between `<!--` and `-->`.
 *
 * @stability experimental
 * @category models
 * @since 4.0.6
 */
export interface Comment {
  readonly _tag: "Comment"
  readonly text: string
}

/**
 * Event for a processing instruction, such as
 * `<?xml-stylesheet href="style.xsl"?>`.
 *
 * **Details**
 *
 * `data` is the text after the target, without leading whitespace.
 *
 * @stability experimental
 * @category models
 * @since 4.0.6
 */
export interface ProcessingInstruction {
  readonly _tag: "ProcessingInstruction"
  readonly target: string
  readonly data: string
}

/**
 * Event produced by the decoders and consumed by the encoders.
 *
 * @stability experimental
 * @category models
 * @since 4.0.6
 */
export type Event =
  | Declaration
  | Doctype
  | StartElement
  | EndElement
  | Text
  | Comment
  | ProcessingInstruction

/**
 * Element collected by `elements`, with its attributes and children.
 *
 * **Details**
 *
 * Children are elements and strings of character data, in document order.
 * Adjacent text is merged into one string; comments and processing
 * instructions are dropped.
 *
 * @stability experimental
 * @category models
 * @since 4.0.6
 */
export interface Element {
  readonly name: string
  readonly attributes: Readonly<Record<string, string>>
  readonly children: ReadonlyArray<Element | string>
}

/**
 * Options for the XML decoders.
 *
 * **Details**
 *
 * - `maxTokenSize`: the maximum length of a single token in UTF-16 code units,
 *   as written in the input: a tag with its attributes, a comment, a processing
 *   instruction, a DOCTYPE, or a text node including its references and CDATA
 *   sections. Defaults to 10 MiB; `Infinity` disables the limit.
 * - `maxDepth`: the maximum number of nested elements. Defaults to 1024;
 *   `Infinity` disables the limit.
 *
 * Memory per token and for open element names is bounded by `maxTokenSize`.
 * Invalid options throw when the channel is created.
 *
 * @stability experimental
 * @category configuration
 * @since 4.0.6
 */
export interface DecodeOptions {
  readonly maxTokenSize?: number | undefined
  readonly maxDepth?: number | undefined
}

/**
 * Options for `elements`.
 *
 * **Details**
 *
 * `maxElementSize` is the maximum size of one collected element, counted as
 * the UTF-16 code units of its names, attribute names and values, and text.
 * Defaults to 16 MiB; `Infinity` disables the limit. Invalid options throw when
 * the channel is created.
 *
 * @stability experimental
 * @category configuration
 * @since 4.0.6
 */
export interface ElementsOptions {
  readonly maxElementSize?: number | undefined
}

/**
 * Creates a channel that decodes XML text chunks into events.
 *
 * **Details**
 *
 * - Tokens can be split anywhere between chunks. Each output chunk holds the
 *   events completed by one input chunk.
 * - The document must have one root element. Whitespace outside it is not
 *   reported.
 * - A leading byte order mark is skipped, and the encoding named by the XML
 *   declaration is ignored.
 * - Events completed before an error are emitted before the channel fails.
 *
 * **Gotchas**
 *
 * - End of input inside the root fails with a `Syntax` error ("unclosed
 *   element"); interruption ends the stream without this check.
 * - A DOCTYPE is reported as a `Doctype` event, and its internal subset is
 *   skipped without checking its declarations. They are not applied, so
 *   default attribute values are not added, and parameter entities are not
 *   expanded.
 * - References to entities other than `&lt;`, `&gt;`, `&amp;`, `&apos;` and
 *   `&quot;` fail with an `Unsupported` `XmlError` when the document has a
 *   DOCTYPE, and with a `Syntax` `XmlError` otherwise. Character references
 *   such as `&#233;` are always decoded.
 * - Names are reported as written, including namespace prefixes, and `xmlns`
 *   declarations are ordinary attributes.
 * - Tokens or aggregate open element names longer than `maxTokenSize`, and
 *   elements nested deeper than `maxDepth`, fail with a `Limit` `XmlError`. A
 *   long token can instead fail with an error found in its first
 *   `maxTokenSize + 1` characters.
 * - Strings in events can share memory with their input chunk, so keeping a
 *   short string, such as an id from each record, can keep the whole chunk in
 *   memory. Copy strings that are kept long, for example with
 *   `structuredClone`.
 *
 * **Example** (Decoding events)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 * import { Xml } from "effect/encoding"
 *
 * const events = Stream.make("<note id=\"1\">Hi &amp; bye<br/></note>").pipe(
 *   Stream.pipeThroughChannel(Xml.decodeString()),
 *   Stream.map((event) => event._tag),
 *   Stream.runCollect
 * )
 * await Effect.runPromise(events) // => ["StartElement", "Text", "StartElement", "EndElement", "EndElement"]
 * ```
 *
 * @see {@link decode} for UTF-8 byte input
 * @see {@link elements} for collecting repeated elements into trees
 * @see {@link encodeString} for the inverse operation
 *
 * @stability experimental
 * @category decoding
 * @since 4.0.6
 */
export const decodeString = <IE = never, Done = unknown>(options?: DecodeOptions): Channel.Channel<
  Arr.NonEmptyReadonlyArray<Event>,
  XmlError | IE,
  Done,
  Arr.NonEmptyReadonlyArray<string>,
  IE,
  Done
> => {
  const parser = makeParser(options, false)
  return makeChannel<string, Event, IE, Done>(() => new TextInput(parser()))
}

/**
 * Creates a channel that decodes UTF-8 XML bytes into events.
 *
 * **Details**
 *
 * Works like `decodeString` after decoding the bytes as UTF-8. Multi-byte
 * characters can be split between chunks, and a leading byte order mark is
 * skipped.
 *
 * **Gotchas**
 *
 * - Invalid or truncated UTF-8 fails with a `Syntax` `XmlError`.
 * - An initial UTF-16 byte order mark or an XML declaration naming an encoding
 *   other than UTF-8 or US-ASCII fails with an `Unsupported` `XmlError`.
 *   Decode such bytes with a `TextDecoder` for that encoding and use `decodeString`.
 *
 * @see {@link decodeString} for text input and the shared gotchas
 *
 * @stability experimental
 * @category decoding
 * @since 4.0.6
 */
export const decode = <IE = never, Done = unknown>(options?: DecodeOptions): Channel.Channel<
  Arr.NonEmptyReadonlyArray<Event>,
  XmlError | IE,
  Done,
  Arr.NonEmptyReadonlyArray<Uint8Array>,
  IE,
  Done
> => {
  const parser = makeParser(options, true)
  return makeChannel<Uint8Array, Event, IE, Done>(() => new Utf8Input(parser()))
}

/**
 * Creates a channel that collects the elements at a path into trees.
 *
 * **When to use**
 *
 * Use to process large documents such as feeds, sitemaps or exports one record
 * at a time, without holding the whole document in memory.
 *
 * **Details**
 *
 * `path` lists element names from the root, and `"*"` matches any name. Each
 * element whose ancestors and own name match the path is emitted once its end
 * tag arrives, with all of its descendants; everything outside the matched
 * elements is skipped. Because paths start at the root, an element nested in a
 * matched element is part of its tree and is not emitted separately.
 *
 * **Gotchas**
 *
 * - A path that does not start at the root element matches nothing.
 * - Whitespace between child elements, such as indentation, is kept as string
 *   children.
 * - A collected element larger than `maxElementSize` fails with a `Limit`
 *   `XmlError`. The size counts characters, not memory: an element with many
 *   small children can take many times its size in memory, so use a lower
 *   limit for untrusted input.
 * - Events that end inside an element, or end an element that was never
 *   started, fail with an `InvalidEvent` `XmlError`.
 * - A path that is empty or contains an invalid name throws when the channel is
 *   created.
 *
 * **Example** (Reading feed items)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 * import { Xml } from "effect/encoding"
 *
 * const feed = `<rss><channel><title>News</title>
 * <item><title>First</title></item>
 * <item><title>Second</title></item>
 * </channel></rss>`
 *
 * const items = await Effect.runPromise(
 *   Stream.make(feed).pipe(
 *     Stream.pipeThroughChannel(Xml.decodeString()),
 *     Stream.pipeThroughChannel(Xml.elements(["rss", "channel", "item"])),
 *     Stream.runCollect
 *   )
 * )
 * items.length // => 2
 * items[1] // => { name: "item", attributes: {}, children: [{ name: "title", attributes: {}, children: ["Second"] }] }
 * ```
 *
 * @see {@link decode} for producing events from bytes
 *
 * @stability experimental
 * @category decoding
 * @since 4.0.6
 */
export const elements = <IE = never, Done = unknown>(
  path: ReadonlyArray<string>,
  options?: ElementsOptions
): Channel.Channel<
  Arr.NonEmptyReadonlyArray<Element>,
  XmlError | IE,
  Done,
  Arr.NonEmptyReadonlyArray<Event>,
  IE,
  Done
> => {
  if (path.length === 0) {
    throw new Error("Xml: elements path must not be empty")
  }
  for (const name of path) {
    if (name !== "*" && !isName(name)) {
      throw new Error(`Xml: invalid element name in path: ${JSON.stringify(name)}`)
    }
  }
  const maxElementSize = checkLimit("maxElementSize", options?.maxElementSize, defaultMaxElementSize)
  const segments = Array.from(path)
  return makeChannel<Event, Element, IE, Done>(() => new Collector(segments, maxElementSize))
}

/**
 * Creates a channel that writes events as XML text.
 *
 * **Details**
 *
 * - Each input chunk is written as one string.
 * - Text escapes `&`, `<` and `>`. Attribute values are double-quoted and
 *   escape `&`, `<`, `"`, tabs and line breaks. Carriage returns are written
 *   as `&#13;` so that they survive decoding.
 * - Start tags are written completely on their event. Empty elements use
 *   explicit closing tags, such as `<br></br>`, never self-closing tags.
 * - Nothing is added between events, so whitespace comes only from `Text`
 *   events.
 *
 * **Gotchas**
 *
 * Events that do not form one well-formed document fail with an
 * `InvalidEvent` `XmlError`, such as an end tag that does not match the open
 * element, a second root element, non-whitespace text outside the root
 * element, invalid names or characters, `--` in a comment, `?>` in processing
 * instruction data, or a declaration that is not the first event. The stream
 * must end with the root element closed.
 *
 * **Example** (Writing a document)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 * import { Xml } from "effect/encoding"
 *
 * const events: ReadonlyArray<Xml.Event> = [
 *   { _tag: "StartElement", name: "a", attributes: { href: "x?a=1&b=2" } },
 *   { _tag: "Text", text: "1 < 2" },
 *   { _tag: "EndElement", name: "a" }
 * ]
 *
 * const xml = Stream.fromIterable(events).pipe(
 *   Stream.pipeThroughChannel(Xml.encodeString()),
 *   Stream.mkString
 * )
 * await Effect.runPromise(xml) // => '<a href="x?a=1&amp;b=2">1 &lt; 2</a>'
 * ```
 *
 * @see {@link encode} for UTF-8 byte output
 * @see {@link decodeString} for the inverse operation
 *
 * @stability experimental
 * @category encoding
 * @since 4.0.6
 */
export const encodeString = <IE = never, Done = unknown>(): Channel.Channel<
  Arr.NonEmptyReadonlyArray<string>,
  XmlError | IE,
  Done,
  Arr.NonEmptyReadonlyArray<Event>,
  IE,
  Done
> => makeChannel<Event, string, IE, Done>(() => new Writer(false))

/**
 * Creates a channel that writes events as UTF-8 XML bytes.
 *
 * **Details**
 *
 * Works like `encodeString`, with one byte array per input chunk.
 *
 * **Gotchas**
 *
 * A `Declaration` event naming an encoding other than UTF-8 fails
 * with an `InvalidEvent` `XmlError`.
 *
 * @see {@link encodeString} for text output and the shared gotchas
 *
 * @stability experimental
 * @category encoding
 * @since 4.0.6
 */
export const encode = <IE = never, Done = unknown>(): Channel.Channel<
  Arr.NonEmptyReadonlyArray<Uint8Array>,
  XmlError | IE,
  Done,
  Arr.NonEmptyReadonlyArray<Event>,
  IE,
  Done
> =>
  Channel.map(makeChannel<Event, string, IE, Done>(() => new Writer(true)), Arr.map((text) => textEncoder.encode(text)))

const defaultMaxTokenSize = 10 * 1024 * 1024
const defaultMaxDepth = 1024
const defaultMaxElementSize = 16 * 1024 * 1024

const checkLimit = (name: string, value: number | undefined, defaultValue: number): number => {
  const limit = value ?? defaultValue
  if (!(limit > 0)) {
    throw new Error(`Xml: ${name} must be positive, got ${limit}`)
  }
  return limit
}

// The per-run state of a channel. `push` and `end` add output to `out`, and
// throw `XmlError`s.
interface Machine<In, Out> {
  out: Array<Out>
  push(input: In): void
  end(): void
}

const makeChannel = <In, Out, IE, Done>(
  make: () => Machine<In, Out>
): Channel.Channel<
  Arr.NonEmptyReadonlyArray<Out>,
  XmlError | IE,
  Done,
  Arr.NonEmptyReadonlyArray<In>,
  IE,
  Done
> =>
  Channel.fromTransform((upstream: Pull.Pull<Arr.NonEmptyReadonlyArray<In>, IE, Done>, _scope) =>
    Effect.sync(() => {
      const machine = make()
      let done: Pull.Pull<never, never, Done> | undefined
      let failure: XmlError | undefined

      // Output completed before an error is emitted before the failure
      const emit = (
        inputs: ReadonlyArray<In> | undefined
      ): Pull.Pull<Arr.NonEmptyReadonlyArray<Out>, XmlError | IE, Done> => {
        try {
          if (inputs === undefined) machine.end()
          else for (let i = 0; i < inputs.length; i++) machine.push(inputs[i])
        } catch (error) {
          if (!isXmlError(error)) throw error
          failure = error
        }
        const out = machine.out
        if (Arr.isArrayNonEmpty(out)) {
          machine.out = []
          return Effect.succeed(out)
        }
        return pull
      }

      const step = Pull.matchEffect(upstream, {
        onSuccess: emit,
        onFailure: Effect.failCause,
        onDone: (value) => {
          done = Cause.done(value)
          return emit(undefined)
        }
      })
      const pull: Pull.Pull<Arr.NonEmptyReadonlyArray<Out>, XmlError | IE, Done> = Effect.suspend(() =>
        failure !== undefined ? Effect.fail(failure) : done ?? step
      )
      return pull
    })
  )

const makeParser = (options: DecodeOptions | undefined, bytes: boolean): () => Parser => {
  const maxTokenSize = checkLimit("maxTokenSize", options?.maxTokenSize, defaultMaxTokenSize)
  const maxDepth = checkLimit("maxDepth", options?.maxDepth, defaultMaxDepth)
  return () => new Parser(maxTokenSize, maxDepth, bytes)
}

const textEncoder = new TextEncoder()

const TAB = 9
const LF = 10
const CR = 13
const SPACE = 32
const BANG = 33
const DQUOTE = 34
const HASH = 35
const AMPERSAND = 38
const SQUOTE = 39
const DASH = 45
const SLASH = 47
const LT = 60
const EQUALS = 61
const GT = 62
const QUESTION = 63
const LBRACKET = 91
const RBRACKET = 93
const LOWER_X = 120

const isSpace = (c: number): boolean => c === SPACE || c === LF || c === TAB || c === CR

// Characters outside the XML `Char` production, including unpaired surrogates
// oxlint-disable-next-line no-control-regex
const invalidChar = /[\0-\x08\x0B\x0C\x0E-\x1F\uFFFE\uFFFF\uD800-\uDFFF]/u

// Decoded UTF-8 has no unpaired surrogates, and without the `u` flag the
// search runs several times faster on non-ASCII text
// oxlint-disable-next-line no-control-regex
const invalidDecodedChar = /[\0-\x08\x0B\x0C\x0E-\x1F\uFFFE\uFFFF]/

// `isWellFormed` (ES2024) finds unpaired surrogates much faster than a `u`
// regex, which is slow on non-ASCII text
const isWellFormed: ((s: string) => boolean) | undefined =
  typeof (String.prototype as { isWellFormed?: unknown }).isWellFormed === "function" ?
    (s) => (s as unknown as { isWellFormed(): boolean }).isWellFormed() :
    undefined

// Returns the index of the first character outside the XML `Char` production,
// or -1
const searchInvalid = (s: string): number =>
  isWellFormed !== undefined && s.search(invalidDecodedChar) === -1 && isWellFormed(s) ? -1 : s.search(invalidChar)

const isChar = (c: number): boolean =>
  c === TAB || c === LF || c === CR || (c >= 0x20 && c <= 0xD7FF) || (c >= 0xE000 && c <= 0xFFFD) ||
  (c >= 0x10000 && c <= 0x10FFFF)

const NAME_START = 1
const NAME_CHAR = 2
const asciiName = new Uint8Array(128)
for (let c = 0; c < 128; c++) {
  if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95 || c === 58) asciiName[c] = NAME_START | NAME_CHAR
  else if ((c >= 48 && c <= 57) || c === DASH || c === 46) asciiName[c] = NAME_CHAR
}

// Name characters of XML 1.0 fifth edition. Supplementary characters are
// accepted by their surrogates, which are paired once input is validated.
const isNameStartCode = (c: number): boolean =>
  c < 128 ?
    (asciiName[c] & NAME_START) !== 0 :
    (c >= 0xC0 && c <= 0xD6) || (c >= 0xD8 && c <= 0xF6) || (c >= 0xF8 && c <= 0x2FF) ||
    (c >= 0x370 && c <= 0x37D) || (c >= 0x37F && c <= 0x1FFF) || (c >= 0x200C && c <= 0x200D) ||
    (c >= 0x2070 && c <= 0x218F) || (c >= 0x2C00 && c <= 0x2FEF) || (c >= 0x3001 && c <= 0xD7FF) ||
    (c >= 0xF900 && c <= 0xFDCF) || (c >= 0xFDF0 && c <= 0xFFFD) || (c >= 0xD800 && c <= 0xDB7F)

const isNameCode = (c: number): boolean =>
  c < 128 ?
    (asciiName[c] & NAME_CHAR) !== 0 :
    isNameStartCode(c) || c === 0xB7 || (c >= 0x300 && c <= 0x36F) || (c >= 0x203F && c <= 0x2040) ||
    (c >= 0xDC00 && c <= 0xDFFF)

// Returns the end of the name starting at `i`, or `i` when there is none
const scanName = (s: string, i: number, end: number): number => {
  if (i >= end || !isNameStartCode(s.charCodeAt(i))) return i
  i++
  while (i < end && isNameCode(s.charCodeAt(i))) i++
  return i
}

// Name characters exclude every invalid character but unpaired surrogates
const isName = (s: string): boolean =>
  s.length > 0 && scanName(s, 0, s.length) === s.length &&
  (isWellFormed !== undefined ? isWellFormed(s) : !invalidChar.test(s))

const skipSpace = (s: string, i: number, end: number): number => {
  while (i < end && isSpace(s.charCodeAt(i))) i++
  return i
}

const lineEndings = /\r\n?/g
const attributeWhitespace = /\r\n|[\t\n\r]/g
// Characters of an attribute value that need decoding, or are not allowed
const attributeSpecial = /[&<\t\n\r]/
const attributeWhitespaceChar = /[\t\n\r]/
// Attribute values shorter than this are scanned with a loop
const shortValue = 24
const publicIdWhitespace = /[ \r\n]+/g
const decimalDigits = /^[0-9]+$/
const hexDigits = /^[0-9a-fA-F]+$/
const versionPattern = /^1\.[0-9]+$/
const encodingPattern = /^[A-Za-z][A-Za-z0-9._-]*$/

const normalizeLines = (s: string): string => s.indexOf("\r") === -1 ? s : s.replace(lineEndings, "\n")

// Normalizes the line endings and whitespace of a literal attribute value part
const normalizeAttribute = (s: string): string => s.replace(attributeWhitespace, " ")

const isReservedTarget = (target: string): boolean => target.length === 3 && target.toLowerCase() === "xml"

const isUtf8 = (encoding: string): boolean => {
  const lower = encoding.toLowerCase()
  return lower === "utf-8" || lower === "us-ascii"
}

const declarationPattern =
  /^[ \t\r\n]+version[ \t\r\n]*=[ \t\r\n]*(?:"(1\.[0-9]+)"|'(1\.[0-9]+)')(?:[ \t\r\n]+encoding[ \t\r\n]*=[ \t\r\n]*(?:"([A-Za-z][A-Za-z0-9._-]*)"|'([A-Za-z][A-Za-z0-9._-]*)'))?(?:[ \t\r\n]+standalone[ \t\r\n]*=[ \t\r\n]*(?:"(yes|no)"|'(yes|no)'))?[ \t\r\n]*$/

const pubidPattern = /^[ \r\na-zA-Z0-9\-'()+,./:=?;!*#@$_%]*$/

// States of `Scanner`, which finds where a token split between chunks ends
const S_START = 0
const S_TEXT = 1
const S_LT = 2 // after "<"
const S_BANG = 3 // after "<!"
const S_KEYWORD = 4 // matching the rest of "<!--", "<![CDATA[" or "<!DOCTYPE"
const S_COMMENT = 5
const S_CDATA = 6
const S_PI = 7
const S_TAG = 8
const S_DOCTYPE = 9 // a DOCTYPE before its internal subset
const S_SUBSET = 10
const S_SUBSET_LT = 11
const S_SUBSET_BANG = 12
const S_SUBSET_BANG_DASH = 13
const S_SUBSET_COMMENT = 14
const S_SUBSET_PI = 15
const S_DECLARATION = 16 // a markup declaration in the internal subset
const S_AFTER_SUBSET = 17

// Scans a token one character at a time, so that the scan can resume in the
// next chunk. A token "ends" where it is complete or where it is known to be
// malformed; the parser then reads the complete token from a single string.
class Scanner {
  state = S_START
  // A count of matched keyword characters or trailing "-", "]" or "?"
  // characters, or an open quote
  aux = 0
  keyword = ""

  reset(state: number): void {
    this.state = state
    this.aux = 0
  }

  // Returns an index of `s` at which the token has ended, or -1
  scan(s: string, i: number): number {
    const n = s.length
    while (i < n) {
      const c = s.charCodeAt(i)
      switch (this.state) {
        case S_START: {
          this.state = c === LT ? S_LT : S_TEXT
          if (c !== LT) continue
          break
        }
        case S_TEXT: {
          return s.indexOf("<", i)
        }
        case S_LT: {
          if (c === BANG) {
            this.state = S_BANG
          } else if (c === QUESTION) {
            this.reset(S_PI)
          } else {
            this.reset(S_TAG)
            continue
          }
          break
        }
        case S_BANG: {
          if (c === DASH) this.keyword = "--"
          else if (c === LBRACKET) this.keyword = "[CDATA["
          else if (c === 68) this.keyword = "DOCTYPE"
          else return i
          this.state = S_KEYWORD
          this.aux = 1
          break
        }
        case S_KEYWORD: {
          if (c !== this.keyword.charCodeAt(this.aux)) return i
          if (++this.aux === this.keyword.length) {
            this.reset(this.keyword === "--" ? S_COMMENT : this.keyword === "DOCTYPE" ? S_DOCTYPE : S_CDATA)
          }
          break
        }
        case S_COMMENT:
        case S_SUBSET_COMMENT: {
          if (c === DASH) {
            this.aux++
          } else if (c === GT && this.aux >= 2) {
            if (this.state === S_COMMENT) return i + 1
            this.reset(S_SUBSET)
          } else {
            this.aux = 0
          }
          break
        }
        case S_CDATA: {
          if (c === RBRACKET) this.aux++
          else if (c === GT && this.aux >= 2) return i + 1
          else this.aux = 0
          break
        }
        case S_PI:
        case S_SUBSET_PI: {
          if (c === GT && this.aux === 1) {
            if (this.state === S_PI) return i + 1
            this.reset(S_SUBSET)
          } else {
            this.aux = c === QUESTION ? 1 : 0
          }
          break
        }
        case S_TAG: {
          // Attribute values cannot contain "<"
          if (c === LT) return i
          if (this.aux === 0) {
            if (c === GT) return i + 1
            if (c === DQUOTE || c === SQUOTE) this.aux = c
          } else if (c === this.aux) {
            this.aux = 0
          }
          break
        }
        case S_DOCTYPE:
        case S_DECLARATION: {
          if (this.aux === 0) {
            if (c === LT) return i
            if (c === GT) {
              if (this.state === S_DOCTYPE) return i + 1
              this.reset(S_SUBSET)
            } else if (c === LBRACKET && this.state === S_DOCTYPE) {
              this.reset(S_SUBSET)
            } else if (c === DQUOTE || c === SQUOTE) {
              this.aux = c
            }
          } else if (c === this.aux) {
            this.aux = 0
          }
          break
        }
        case S_SUBSET: {
          if (c === RBRACKET) this.state = S_AFTER_SUBSET
          else if (c === LT) this.state = S_SUBSET_LT
          else if (c === DQUOTE || c === SQUOTE || c === GT) return i
          break
        }
        case S_SUBSET_LT: {
          if (c === BANG) this.state = S_SUBSET_BANG
          else if (c === QUESTION) this.reset(S_SUBSET_PI)
          else return i
          break
        }
        case S_SUBSET_BANG: {
          if (c === DASH) {
            this.state = S_SUBSET_BANG_DASH
          } else {
            this.reset(S_DECLARATION)
            continue
          }
          break
        }
        case S_SUBSET_BANG_DASH: {
          if (c !== DASH) return i
          this.reset(S_SUBSET_COMMENT)
          break
        }
        case S_AFTER_SUBSET: {
          if (c === GT) return i + 1
          if (!isSpace(c)) return i
          break
        }
      }
      i++
    }
    return -1
  }
}

const PROLOG = 0
const CONTENT = 1
const EPILOG = 2

const describeToken = (s: string, i: number): string =>
  s.startsWith("<!--", i) ?
    "comment" :
    s.startsWith("<![CDATA[", i) ?
    "CDATA section" :
    s.startsWith("<!DOCTYPE", i) ?
    "DOCTYPE" :
    s.startsWith("<?", i) ?
    "processing instruction" :
    s.startsWith("</", i) ?
    "end tag" :
    "start tag"

// Attribute maps inherit nothing, so "__proto__" is an ordinary key and no
// attribute is inherited. Instances of a constructor are fast-mode objects in
// V8, several times faster to fill and iterate than the dictionary-mode
// objects that `Object.create(null)` makes, but V8 makes a hidden class for
// every distinct key sequence, so `Parser.shapes` decides which tags get one.
const Attributes = function(this: Record<string, string>) {} as unknown as new() => Record<string, string>
Attributes.prototype = Object.freeze(Object.create(null))

const emptyAttributes: Readonly<Record<string, string>> = Object.freeze(new Attributes())

// The number of element names whose attribute order is tracked, and the
// number of attributes beyond which V8 would turn a fast-mode map into a
// dictionary anyway
const maxShapes = 256
const maxFastAttributes = 16

const pendingRun = 256

class Parser {
  out: Array<Event> = []

  // The text being parsed, which starts at document offset `base`
  private buf = ""
  private base = 0
  // Number of characters received, excluding a byte order mark
  received = 0
  private started = false

  // A token that continues in the next chunk
  private pending: Array<string> | undefined
  private pendingStart = 0
  private pendingLength = 0
  // Number of chunks added to `pending` since its last chunks were joined
  private pendingAdded = 0
  private readonly scanner = new Scanner()

  // Line and column of document offset `counted`
  private line = 1
  private lineStart = 0
  private counted = 0

  private state = PROLOG
  private readonly stack: Array<string> = []
  private openNameSize = 0
  // The attribute names of each element name, in the order they were first
  // seen. A tag whose attributes follow that order, or extend it, gets a
  // fast-mode map; one that diverges marks the element `null`, so that later
  // tags get dictionary-mode maps and V8 does not get a hidden class per tag.
  private readonly shapes = new Map<string, Array<string> | null>()
  private doctype = false
  private literalEnd = 0
  // Character data that has not been emitted yet, and its size in the input
  private text = ""
  private textSize = 0

  private readonly maxTokenSize: number
  private readonly maxDepth: number
  private readonly bytes: boolean
  private ascii = false

  constructor(maxTokenSize: number, maxDepth: number, bytes: boolean) {
    this.maxTokenSize = maxTokenSize
    this.maxDepth = maxDepth
    this.bytes = bytes
  }

  // `force` parses a pending token without waiting for its end, so that an
  // error found before invalid input is reported however the input is chunked
  feed(chunk: string, force = false): void {
    if (chunk.length === 0 && !force) return
    if (!this.started) {
      this.started = true
      if (chunk.charCodeAt(0) === 0xFEFF) chunk = chunk.slice(1)
    }
    if (this.bytes) {
      const nonAscii = chunk.search(/[\u0080-\uFFFF]/)
      if (nonAscii !== -1) {
        // The prefix may contain the declaration that selects US-ASCII.
        this.feed(chunk.slice(0, nonAscii), true)
        if (this.ascii) throw this.error("Syntax", "invalid US-ASCII byte", this.received)
        chunk = chunk.slice(nonAscii)
      }
    }
    const invalid = this.bytes ? chunk.search(invalidDecodedChar) : searchInvalid(chunk)
    if (invalid !== -1) {
      // Parse up to the invalid character first, so that earlier errors are
      // reported first however the input is chunked
      this.consume(chunk.slice(0, invalid), true)
      const code = chunk.codePointAt(invalid)!.toString(16).toUpperCase().padStart(4, "0")
      throw this.error("Syntax", `invalid character U+${code}`, this.received)
    }
    this.consume(chunk, force)
  }

  end(): void {
    if (this.pending !== undefined) {
      this.load(this.pending.join(""), this.pendingStart)
      this.pending = undefined
    }
    this.parse(true)
    if (this.state === PROLOG) throw this.error("Syntax", "no root element", this.received)
    if (this.state === CONTENT) {
      throw this.error("Syntax", `unclosed element <${this.stack[this.stack.length - 1]}>`, this.received)
    }
  }

  error(kind: XmlError["kind"], message: string, at: number): XmlError {
    if (at > this.counted) {
      if (this.pending !== undefined) this.count(this.pending.join(""), this.pendingStart, at - this.pendingStart)
      else this.count(this.buf, this.base, at - this.base)
    }
    const line = this.line
    const column = at - this.lineStart + 1
    return new XmlError({ kind, message: `${message} at line ${line}, column ${column}`, line, column })
  }

  // Advances the line count from `counted` to `to`, an index of `s`, which
  // starts at document offset `base`. Counting resumes only where parsing
  // stopped, which is never between a CR and an LF.
  private count(s: string, base: number, to: number): void {
    const i = this.counted - base
    if (i >= to) return
    let cr = s.indexOf("\r", i)
    let lf = s.indexOf("\n", i)
    while (true) {
      if (cr !== -1 && cr < to && (lf === -1 || cr < lf)) {
        this.line++
        this.lineStart = base + cr + 1
        cr = s.indexOf("\r", cr + 1)
      } else if (lf !== -1 && lf < to) {
        // The LF of a CRLF does not start a new line
        if (!(lf > 0 && s.charCodeAt(lf - 1) === CR)) this.line++
        this.lineStart = base + lf + 1
        lf = s.indexOf("\n", lf + 1)
      } else {
        break
      }
    }
    this.counted = base + to
  }

  private syntax(message: string, i: number): XmlError {
    return this.error("Syntax", message, this.base + i)
  }

  private tokenLimit(at: number): XmlError {
    return this.error("Limit", `token exceeds maxTokenSize of ${this.maxTokenSize}`, at)
  }

  private consume(chunk: string, force = false): void {
    this.received += chunk.length
    if (this.pending !== undefined) {
      if (!force && this.scanner.scan(chunk, 0) === -1) {
        this.pending.push(chunk)
        this.pendingLength += chunk.length
        // Joins runs of chunks, so that a token split into many tiny chunks
        // does not take an array slot for each
        if (++this.pendingAdded === pendingRun) {
          this.pending.push(this.pending.splice(-pendingRun).join(""))
          this.pendingAdded = 0
        }
        this.checkPending()
        return
      }
      // Joining makes a flat string, which V8 reads faster than the rope that
      // concatenation makes
      this.pending.push(chunk)
      this.load(this.pending.join(""), this.pendingStart)
      this.pending = undefined
    } else {
      this.load(chunk, this.received - chunk.length)
    }
    this.parse(false)
  }

  private load(buf: string, base: number): void {
    this.buf = buf
    this.base = base
  }

  // Fails an incomplete token over maxTokenSize, preferring an error in the
  // first maxTokenSize + 1 characters of markup, as `parse` does
  private checkPending(): void {
    const text = this.scanner.state === S_TEXT
    if (this.pendingLength + (text ? this.textSize : 0) <= this.maxTokenSize) return
    if (!text) {
      this.load(this.pending!.join("").slice(0, this.maxTokenSize + 1), this.pendingStart)
      this.markup(this.buf, 0)
    }
    throw this.tokenLimit(this.pendingStart)
  }

  private parse(final: boolean): void {
    const s = this.buf
    const n = s.length
    // Positions of the next "&", CR and "]]>", so that text runs are checked
    // without searching past them repeatedly
    let nextAmp = -1
    let nextCR = -1
    let nextCdataEnd = -1
    let i = 0
    while (i < n) {
      if (s.charCodeAt(i) !== LT) {
        let j = s.indexOf("<", i)
        if (j === -1) {
          if (!final) break
          j = n
        }
        if (this.state !== CONTENT) {
          this.checkSize(i, j)
          this.whitespace(s, i, j)
        } else {
          this.addText(i, j - i)
          if (nextCdataEnd < i) nextCdataEnd = indexOrEnd(s, "]]>", i)
          if (nextCdataEnd < j) throw this.syntax("\"]]>\" is not allowed in text", nextCdataEnd)
          if (nextAmp < i) nextAmp = indexOrEnd(s, "&", i)
          if (nextCR < i) nextCR = indexOrEnd(s, "\r", i)
          const raw = s.slice(i, j)
          this.text += nextAmp >= j
            ? (nextCR >= j ? raw : normalizeLines(raw))
            : this.decodeText(raw, i, false, nextCR < j)
        }
        i = j
        continue
      }
      // Markup is parsed from at most maxTokenSize + 1 characters, so that its
      // errors do not depend on how the input is chunked
      const long = n - i > this.maxTokenSize
      const end = this.markup(long ? s.slice(0, i + this.maxTokenSize + 1) : s, i)
      if (end === -1) {
        if (long) throw this.tokenLimit(this.base + i)
        if (final) throw this.syntax(`unterminated ${describeToken(s, i)}`, i)
        break
      }
      i = end
    }
    this.count(s, this.base, i)
    this.buf = ""
    if (i < n) {
      const rest = i === 0 ? s : s.slice(i)
      this.pending = [rest]
      this.pendingStart = this.base + i
      this.pendingLength = rest.length
      this.pendingAdded = 0
      // Brings the scanner to the end of the incomplete token
      this.scanner.reset(S_START)
      this.scanner.scan(rest, 0)
      this.checkPending()
    }
  }

  private flushText(): void {
    if (this.text.length > 0) {
      this.out.push({ _tag: "Text", text: this.text })
      this.text = ""
    }
    this.textSize = 0
  }

  // Adds the size of the text run or CDATA section at `i`. Exceeding the limit
  // is reported there, rather than at the start of the text.
  private addText(i: number, size: number): void {
    this.textSize += size
    if (this.textSize > this.maxTokenSize) {
      throw this.tokenLimit(this.base + i)
    }
  }

  // Checks that the text run `s[i, j)` outside the root element is whitespace
  private whitespace(s: string, i: number, j: number): void {
    for (let k = i; k < j; k++) {
      if (!isSpace(s.charCodeAt(k))) {
        throw this.syntax(this.state === PROLOG ? "text before the root element" : "text after the root element", k)
      }
    }
  }

  // Replaces references and normalizes line endings, or attribute whitespace.
  // `whitespace` is false when `raw` has nothing to normalize.
  private decodeText(raw: string, offset: number, attribute: boolean, whitespace: boolean): string {
    let out = ""
    let k = 0
    while (true) {
      const amp = raw.indexOf("&", k)
      const literal = raw.slice(k, amp === -1 ? raw.length : amp)
      out += !whitespace ? literal : attribute ? normalizeAttribute(literal) : normalizeLines(literal)
      if (amp === -1) return out
      const semicolon = raw.indexOf(";", amp + 1)
      if (semicolon === -1) throw this.syntax("unterminated reference", offset + amp)
      out += this.reference(raw, amp, semicolon, offset)
      k = semicolon + 1
    }
  }

  // Decodes the reference `raw[amp, semicolon]`
  private reference(raw: string, amp: number, semicolon: number, offset: number): string {
    const c = raw.charCodeAt(amp + 1)
    // The predefined entities, without slicing their names
    if (c === 97) {
      if (raw.startsWith("amp;", amp + 1)) return "&"
      if (raw.startsWith("apos;", amp + 1)) return "'"
    } else if (c === 108) {
      if (raw.startsWith("lt;", amp + 1)) return "<"
    } else if (c === 103) {
      if (raw.startsWith("gt;", amp + 1)) return ">"
    } else if (c === 113) {
      if (raw.startsWith("quot;", amp + 1)) return "\""
    }
    if (c === HASH) {
      const hex = raw.charCodeAt(amp + 2) === LOWER_X
      const digits = raw.slice(amp + (hex ? 3 : 2), semicolon)
      const code = (hex ? hexDigits : decimalDigits).test(digits) ? parseInt(digits, hex ? 16 : 10) : -1
      if (!isChar(code)) throw this.syntax("invalid character reference", offset + amp)
      return String.fromCodePoint(code)
    }
    const name = raw.slice(amp + 1, semicolon)
    if (!isName(name)) throw this.syntax("invalid reference", offset + amp)
    if (this.doctype) {
      throw this.error(
        "Unsupported",
        `entity references other than the predefined entities are not supported: &${name};`,
        this.base + offset + amp
      )
    }
    throw this.syntax(`undefined entity &${name};`, offset + amp)
  }

  // Parses the markup at `i`, and returns its end or -1 when it is incomplete
  private markup(s: string, i: number): number {
    const n = s.length
    if (i + 1 >= n) return -1
    const c = s.charCodeAt(i + 1)
    if (c === SLASH) return this.endTag(s, i)
    if (c === QUESTION) return this.processingInstruction(s, i)
    if (c !== BANG) return this.startTag(s, i)
    if (i + 2 >= n) return -1
    const keyword = s.charCodeAt(i + 2) === DASH ? "<!--" : s.charCodeAt(i + 2) === LBRACKET ? "<![CDATA[" : "<!DOCTYPE"
    if (!s.startsWith(keyword, i)) {
      if (n - i < keyword.length && keyword.startsWith(s.slice(i))) return -1
      throw this.syntax("invalid markup", i)
    }
    return keyword === "<!--"
      ? this.comment(s, i)
      : keyword === "<!DOCTYPE"
      ? this.doctypeDeclaration(s, i)
      : this.cdata(s, i)
  }

  private checkSize(i: number, end: number): void {
    if (end - i > this.maxTokenSize) {
      throw this.tokenLimit(this.base + i)
    }
  }

  private startTag(s: string, i: number): number {
    const n = s.length
    if (this.state === EPILOG) throw this.syntax("content after the root element", i)
    let j = scanName(s, i + 1, n)
    if (j === i + 1) throw this.syntax("invalid element name", i + 1)
    if (j >= n) return -1
    // In V8, a slice of 13 or more characters keeps its whole input chunk
    // alive, and the name of an open element is held until its end tag, so
    // long names are copied
    const name = j - i - 1 < 13 ? s.slice(i + 1, j) : (" " + s.slice(i + 1, j)).slice(1)
    let attributes: Record<string, string> | undefined
    let shape: Array<string> | null | undefined
    let index = 0
    let selfClosing = false
    while (true) {
      let c = s.charCodeAt(j)
      const space = isSpace(c)
      if (space) {
        j = skipSpace(s, j, n)
        if (j >= n) return -1
        c = s.charCodeAt(j)
      }
      if (c === GT) {
        j++
        break
      }
      if (c === SLASH) {
        if (j + 1 >= n) return -1
        if (s.charCodeAt(j + 1) !== GT) throw this.syntax("expected \">\"", j + 1)
        j += 2
        selfClosing = true
        break
      }
      if (!space) throw this.syntax("expected whitespace, \">\" or \"/>\"", j)
      const nameStart = j
      j = scanName(s, j, n)
      if (j === nameStart) throw this.syntax("invalid attribute name", j)
      if (j >= n) return -1
      const attribute = s.slice(nameStart, j)
      j = skipSpace(s, j, n)
      if (j >= n) return -1
      if (s.charCodeAt(j) !== EQUALS) throw this.syntax("expected \"=\"", j)
      j = skipSpace(s, j + 1, n)
      if (j >= n) return -1
      const quote = s.charCodeAt(j)
      if (quote !== DQUOTE && quote !== SQUOTE) throw this.syntax("expected a quoted attribute value", j)
      const close = s.indexOf(quote === DQUOTE ? "\"" : "'", j + 1)
      if (close === -1) {
        const lt = s.indexOf("<", j + 1)
        if (lt !== -1) throw this.syntax("\"<\" is not allowed in attribute values", lt)
        return -1
      }
      const value = this.attributeValue(s, j + 1, close)
      if (attributes === undefined) {
        shape = this.shapes.get(name)
        if (shape === undefined && this.shapes.size < maxShapes) {
          shape = []
          this.shapes.set(name, shape)
        }
        attributes = shape === undefined || shape === null || shape.length > maxFastAttributes ?
          Object.create(null) as Record<string, string> :
          new Attributes()
      } else if (attributes[attribute] !== undefined) {
        throw this.syntax(`duplicate attribute ${attribute}`, nameStart)
      }
      if (shape !== undefined && shape !== null && shape.length <= maxFastAttributes) {
        // Stored names are copied, as they outlive the chunk
        if (index === shape.length) shape.push((" " + attribute).slice(1))
        else if (shape[index] !== attribute) {
          this.shapes.set(name, null)
          shape = null
        }
      }
      index++
      attributes[attribute] = value
      j = close + 1
      if (j >= n) return -1
    }
    this.checkSize(i, j)
    if (this.stack.length >= this.maxDepth) {
      throw this.error("Limit", `element nesting exceeds maxDepth of ${this.maxDepth}`, this.base + i)
    }
    if (!selfClosing && this.openNameSize + name.length > this.maxTokenSize) {
      throw this.error("Limit", `open element names exceed maxTokenSize of ${this.maxTokenSize}`, this.base + i)
    }
    this.flushText()
    this.out.push({ _tag: "StartElement", name, attributes: attributes ?? emptyAttributes })
    if (selfClosing) {
      this.out.push({ _tag: "EndElement", name })
      if (this.stack.length === 0) this.state = EPILOG
    } else {
      this.stack.push(name)
      this.openNameSize += name.length
      this.state = CONTENT
    }
    return j
  }

  private attributeValue(s: string, i: number, j: number): string {
    let reference = false
    let whitespace = false
    if (j - i < shortValue) {
      for (let k = i; k < j; k++) {
        const c = s.charCodeAt(k)
        if (c === LT) throw this.syntax("\"<\" is not allowed in attribute values", k)
        if (c === AMPERSAND) reference = true
        else if (c === TAB || c === LF || c === CR) whitespace = true
      }
      if (!reference && !whitespace) return s.slice(i, j)
    } else {
      // A regex search beats the loop above on long values
      const value = s.slice(i, j)
      const special = value.search(attributeSpecial)
      if (special === -1) return value
      const lt = value.indexOf("<", special)
      if (lt !== -1) throw this.syntax("\"<\" is not allowed in attribute values", i + lt)
      reference = value.indexOf("&", special) !== -1
      whitespace = !reference || attributeWhitespaceChar.test(value)
    }
    const raw = s.slice(i, j)
    return reference ? this.decodeText(raw, i, true, whitespace) : normalizeAttribute(raw)
  }

  private endTag(s: string, i: number): number {
    const n = s.length
    const j = scanName(s, i + 2, n)
    if (j === i + 2) {
      if (j >= n) return -1
      throw this.syntax("invalid element name", j)
    }
    const k = skipSpace(s, j, n)
    if (k >= n) return -1
    if (s.charCodeAt(k) !== GT) throw this.syntax("expected \">\"", k)
    const open = this.stack.length > 0 ? this.stack[this.stack.length - 1] : undefined
    if (open === undefined) throw this.syntax("end tag without a start tag", i)
    if (j - i - 2 !== open.length || !s.startsWith(open, i + 2)) {
      throw this.syntax(`end tag </${s.slice(i + 2, j)}> does not match <${open}>`, i)
    }
    this.checkSize(i, k + 1)
    this.flushText()
    this.stack.pop()
    this.openNameSize -= open.length
    this.out.push({ _tag: "EndElement", name: open })
    if (this.stack.length === 0) this.state = EPILOG
    return k + 1
  }

  private comment(s: string, i: number): number {
    const end = s.indexOf("-->", i + 4)
    if (end === -1) return -1
    const dashes = s.indexOf("--", i + 4)
    if (dashes < end) throw this.syntax("\"--\" is not allowed in comments", dashes)
    this.checkSize(i, end + 3)
    this.flushText()
    this.out.push({ _tag: "Comment", text: normalizeLines(s.slice(i + 4, end)) })
    return end + 3
  }

  private processingInstruction(s: string, i: number): number {
    const end = s.indexOf("?>", i + 2)
    if (end === -1) return -1
    const t = scanName(s, i + 2, end)
    if (t === i + 2) throw this.syntax("invalid processing instruction target", i + 2)
    const target = s.slice(i + 2, t)
    if (isReservedTarget(target)) {
      if (target === "xml" && this.base + i === 0) return this.declaration(s, i, t, end)
      throw this.syntax(
        target === "xml" ?
          "the XML declaration is only allowed at the start of the document" :
          `processing instruction target ${target} is reserved`,
        i
      )
    }
    let data = ""
    if (t < end) {
      if (!isSpace(s.charCodeAt(t))) throw this.syntax("expected whitespace after the target", t)
      data = normalizeLines(s.slice(skipSpace(s, t, end), end))
    }
    this.checkSize(i, end + 2)
    this.flushText()
    this.out.push({ _tag: "ProcessingInstruction", target, data })
    return end + 2
  }

  private declaration(s: string, i: number, t: number, end: number): number {
    this.checkSize(i, end + 2)
    const match = declarationPattern.exec(s.slice(t, end))
    if (match === null) throw this.syntax("invalid XML declaration", i)
    const encoding = match[3] ?? match[4]
    const standalone = match[5] ?? match[6]
    if (this.bytes && encoding !== undefined && !isUtf8(encoding)) {
      throw this.error(
        "Unsupported",
        `encoding ${encoding} is not supported for byte input, decode the bytes to text first`,
        this.base + i
      )
    }
    this.ascii = this.bytes && encoding?.toLowerCase() === "us-ascii"
    const event: { -readonly [K in keyof Declaration]: Declaration[K] } = {
      _tag: "Declaration",
      version: match[1] ?? match[2]
    }
    if (encoding !== undefined) event.encoding = encoding
    if (standalone !== undefined) event.standalone = standalone === "yes"
    this.out.push(event)
    return end + 2
  }

  private cdata(s: string, i: number): number {
    const end = s.indexOf("]]>", i + 9)
    if (end === -1) return -1
    if (this.state !== CONTENT) throw this.syntax("CDATA sections are only allowed inside the root element", i)
    this.addText(i, end + 3 - i)
    this.text += normalizeLines(s.slice(i + 9, end))
    return end + 3
  }

  private doctypeDeclaration(s: string, i: number): number {
    if (this.state !== PROLOG || this.doctype) {
      throw this.syntax("a DOCTYPE is only allowed once, before the root element", i)
    }
    const scanner = new Scanner()
    scanner.reset(S_DOCTYPE)
    const end = scanner.scan(s, i + 9)
    if (end === -1) return -1
    this.checkSize(i, end)
    this.doctype = true
    let j = this.space(s, i + 9, end)
    const nameEnd = this.name(s, j, end)
    const event: { -readonly [K in keyof Doctype]: Doctype[K] } = { _tag: "Doctype", name: s.slice(j, nameEnd) }
    j = skipSpace(s, nameEnd, end)
    if (j > nameEnd && (s.startsWith("PUBLIC", j) || s.startsWith("SYSTEM", j))) {
      if (s.charCodeAt(j) === 80) {
        // Whitespace in public identifiers is normalized for matching
        event.publicId = this.publicLiteral(s, this.space(s, j + 6, end), end).replace(publicIdWhitespace, " ").trim()
        j = this.literalEnd
      }
      event.systemId = normalizeLines(
        this.literal(s, this.space(s, j + (event.publicId === undefined ? 6 : 0), end), end)
      )
      j = skipSpace(s, this.literalEnd, end)
    }
    if (s.charCodeAt(j) === LBRACKET) {
      // The scanner skips the internal subset, whose declarations are not
      // checked, and ends the token early only at malformed markup
      if (scanner.state !== S_AFTER_SUBSET) throw this.syntax("invalid markup in the internal subset", end)
      j = skipSpace(s, s.lastIndexOf("]", end - 1) + 1, end)
    }
    if (j !== end - 1 || s.charCodeAt(j) !== GT) throw this.syntax("invalid DOCTYPE", j)
    this.out.push(event)
    return end
  }

  // Skips the whitespace that is required at `i`
  private space(s: string, i: number, end: number): number {
    if (i >= end || !isSpace(s.charCodeAt(i))) throw this.syntax("expected whitespace", i)
    return skipSpace(s, i, end)
  }

  // Returns the end of the name that is required at `i`
  private name(s: string, i: number, end: number): number {
    const nameEnd = scanName(s, i, end)
    if (nameEnd === i) throw this.syntax("expected a name", i)
    return nameEnd
  }

  // Reads the quoted literal at `i`, and sets `literalEnd` to the index after it
  private literal(s: string, i: number, end: number): string {
    const quote = s.charCodeAt(i)
    if (quote !== DQUOTE && quote !== SQUOTE) throw this.syntax("expected a quoted literal", i)
    const close = s.indexOf(quote === DQUOTE ? "\"" : "'", i + 1)
    // Unreachable while the scanner ends a DOCTYPE only after its literals close
    if (close === -1 || close >= end) throw this.syntax("unterminated literal", i)
    this.literalEnd = close + 1
    return s.slice(i + 1, close)
  }

  private publicLiteral(s: string, i: number, end: number): string {
    const literal = this.literal(s, i, end)
    if (!pubidPattern.test(literal)) throw this.syntax("invalid public identifier", i)
    return literal
  }
}

const indexOrEnd = (s: string, search: string, from: number): number => {
  const i = s.indexOf(search, from)
  return i === -1 ? s.length : i
}

class TextInput implements Machine<string, Event> {
  private readonly parser: Parser
  // A high surrogate at the end of a chunk, which pairs with the next chunk
  private surrogate = ""

  constructor(parser: Parser) {
    this.parser = parser
  }

  get out(): Array<Event> {
    return this.parser.out
  }
  set out(out: Array<Event>) {
    this.parser.out = out
  }

  push(chunk: string): void {
    if (this.surrogate !== "") {
      chunk = this.surrogate + chunk
      this.surrogate = ""
    }
    const last = chunk.charCodeAt(chunk.length - 1)
    if (last >= 0xD800 && last <= 0xDBFF) {
      this.surrogate = chunk.slice(-1)
      chunk = chunk.slice(0, -1)
    }
    this.parser.feed(chunk)
  }

  end(): void {
    // An unpaired high surrogate fails as an invalid character
    this.parser.feed(this.surrogate)
    this.parser.end()
  }
}

const utf8Length = (lead: number): number => lead >= 0xF0 ? 4 : lead >= 0xE0 ? 3 : lead >= 0xC0 ? 2 : 1

// Returns the length of the valid UTF-8 prefix of `bytes`
const validUtf8 = (bytes: Uint8Array): number => {
  let i = 0
  while (i < bytes.length) {
    const lead = bytes[i]
    if (lead < 0x80) {
      i++
      continue
    }
    const length = lead >= 0xC2 && lead <= 0xF4 ? utf8Length(lead) : 0
    if (length === 0 || i + length > bytes.length) return i
    let code = lead & (0xFF >> (length + 1))
    for (let k = 1; k < length; k++) {
      const c = bytes[i + k]
      if ((c & 0xC0) !== 0x80) return i
      code = (code << 6) | (c & 0x3F)
    }
    const min = length === 2 ? 0x80 : length === 3 ? 0x800 : 0x10000
    if (code < min || code > 0x10FFFF || (code >= 0xD800 && code <= 0xDFFF)) return i
    i += length
  }
  return i
}

const utf8Decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true })

// Decodes UTF-8 without streaming state, so that the position of invalid bytes
// is known: an incomplete sequence at the end of a chunk is carried over.
class Utf8Input implements Machine<Uint8Array, Event> {
  private readonly parser: Parser
  private carry: Uint8Array | undefined
  private started = false

  constructor(parser: Parser) {
    this.parser = parser
  }

  get out(): Array<Event> {
    return this.parser.out
  }
  set out(out: Array<Event>) {
    this.parser.out = out
  }

  push(chunk: Uint8Array): void {
    if (!this.started && chunk.length > 0) {
      const first = this.carry === undefined ? chunk[0] : this.carry[0]
      const second = this.carry === undefined ? chunk[1] : chunk[0]
      if ((first === 0xFE && second === 0xFF) || (first === 0xFF && second === 0xFE)) {
        throw this.parser.error(
          "Unsupported",
          "UTF-16 is not supported for byte input, decode the bytes to text first",
          0
        )
      }
      // Keep a lone BOM prefix pending in the UTF-8 carry below
      this.started = second !== undefined || (first !== 0xFE && first !== 0xFF)
    }
    let start = 0
    if (this.carry !== undefined) {
      const need = utf8Length(this.carry[0]) - this.carry.length
      const head = new Uint8Array(this.carry.length + Math.min(need, chunk.length))
      head.set(this.carry)
      head.set(chunk.subarray(0, need), this.carry.length)
      if (chunk.length < need) {
        this.carry = head
        return
      }
      this.carry = undefined
      this.decode(head)
      start = need
    }
    const n = chunk.length
    let end = n
    for (let k = 1; k <= 3 && n - k >= start; k++) {
      const b = chunk[n - k]
      if ((b & 0xC0) === 0x80) continue
      if (b >= 0xC0 && k < utf8Length(b)) end = n - k
      break
    }
    if (end < n) this.carry = chunk.slice(end)
    if (end > start) this.decode(start === 0 && end === n ? chunk : chunk.subarray(start, end))
  }

  end(): void {
    // The carried bytes may also be an invalid sequence, such as a single 0xFF
    if (this.carry !== undefined) {
      this.parser.feed("", true)
      throw this.parser.error("Syntax", "invalid UTF-8", this.parser.received)
    }
    this.parser.end()
  }

  private decode(bytes: Uint8Array): void {
    let text: string
    try {
      text = utf8Decoder.decode(bytes)
    } catch {
      this.parser.feed(utf8Decoder.decode(bytes.subarray(0, validUtf8(bytes))), true)
      throw this.parser.error("Syntax", "invalid UTF-8", this.parser.received)
    }
    this.parser.feed(text)
  }
}

interface MutableElement {
  readonly name: string
  readonly attributes: Readonly<Record<string, string>>
  readonly children: Array<MutableElement | string>
}

class Collector implements Machine<Event, Element> {
  out: Array<Element> = []
  private depth = 0
  // Number of open elements, from the root, that match the path
  private matched = 0
  // The element being collected and its open descendants
  private readonly stack: Array<MutableElement> = []
  private size = 0
  private readonly path: ReadonlyArray<string>
  private readonly maxElementSize: number

  constructor(path: ReadonlyArray<string>, maxElementSize: number) {
    this.path = path
    this.maxElementSize = maxElementSize
  }

  push(event: Event): void {
    switch (event._tag) {
      case "StartElement": {
        const depth = this.depth++
        if (this.stack.length === 0) {
          const segment = this.path[depth]
          if (this.matched !== depth || (segment !== "*" && segment !== event.name)) return
          if (++this.matched < this.path.length) return
          this.size = 0
        }
        const element: MutableElement = { name: event.name, attributes: event.attributes, children: [] }
        if (this.stack.length > 0) this.stack[this.stack.length - 1].children.push(element)
        this.stack.push(element)
        let size = event.name.length
        for (const key in event.attributes) size += key.length + event.attributes[key].length
        this.grow(size)
        return
      }
      case "EndElement": {
        if (this.depth === 0) throw invalidEvent(`end tag </${event.name}> without a start tag`)
        if (this.stack.length > 0) {
          const element = this.stack.pop()!
          if (this.stack.length === 0) this.out.push(element)
        }
        if (this.matched === this.depth) this.matched--
        this.depth--
        return
      }
      case "Text": {
        if (this.stack.length === 0 || event.text.length === 0) return
        this.grow(event.text.length)
        const children = this.stack[this.stack.length - 1].children
        const last = children.length - 1
        if (last >= 0 && typeof children[last] === "string") children[last] += event.text
        else children.push(event.text)
        return
      }
    }
  }

  end(): void {
    if (this.depth > 0) throw invalidEvent("events ended inside an element")
  }

  private grow(size: number): void {
    this.size += size
    if (this.size > this.maxElementSize) {
      throw positionless("Limit", `element <${this.stack[0].name}> exceeds maxElementSize of ${this.maxElementSize}`)
    }
  }
}

// JavaScriptCore gives every Error its own source `line` and `column`, which
// would pass for an XML position, so errors without one set both to undefined
const positionless = (kind: XmlError["kind"], message: string) =>
  new XmlError({ kind, message, line: undefined, column: undefined })

const invalidEvent = (message: string) => positionless("InvalidEvent", message)

const textSpecial = /[&<>\r]/
const attributeSpecials = /[&<"\t\n\r]/

// The regex finds the first special character, which is fast when there is
// none; the rest is copied in runs between escapes. Invalid characters are
// kept, so that the writer can check them in the output.
const escapeText = (s: string): string => {
  const first = s.search(textSpecial)
  if (first === -1) return s
  let out = ""
  let last = 0
  for (let i = first; i < s.length; i++) {
    const c = s.charCodeAt(i)
    const escaped = c === AMPERSAND ? "&amp;" : c === LT ? "&lt;" : c === GT ? "&gt;" : c === CR ? "&#13;" : undefined
    if (escaped !== undefined) {
      out += s.slice(last, i) + escaped
      last = i + 1
    }
  }
  return out + s.slice(last)
}

const escapeAttribute = (s: string): string => {
  const first = s.search(attributeSpecials)
  if (first === -1) return s
  let out = ""
  let last = 0
  for (let i = first; i < s.length; i++) {
    const c = s.charCodeAt(i)
    const escaped = c === AMPERSAND ?
      "&amp;" :
      c === LT ?
      "&lt;" :
      c === DQUOTE ?
      "&quot;" :
      c === TAB ?
      "&#9;" :
      c === LF ?
      "&#10;" :
      c === CR ?
      "&#13;" :
      undefined
    if (escaped !== undefined) {
      out += s.slice(last, i) + escaped
      last = i + 1
    }
  }
  return out + s.slice(last)
}

const checkChars = (what: string, s: string): void => {
  const invalid = searchInvalid(s)
  if (invalid !== -1) {
    const code = s.codePointAt(invalid)!.toString(16).toUpperCase().padStart(4, "0")
    throw invalidEvent(`${what} contains the invalid character U+${code}`)
  }
}

const checkName = (what: string, name: string): void => {
  if (typeof name !== "string" || !isName(name)) throw invalidEvent(`invalid ${what} ${JSON.stringify(name)}`)
}

const isWhitespace = (s: string): boolean => {
  for (let i = 0; i < s.length; i++) {
    if (!isSpace(s.charCodeAt(i))) return false
  }
  return true
}

const NOTHING_WRITTEN = 3

class Writer implements Machine<Event, string> {
  out: Array<string> = []
  private readonly stack: Array<string> = []
  private state = NOTHING_WRITTEN
  private doctype = false
  private readonly bytes: boolean
  // Element and attribute names already checked, which repeat in most
  // documents. Cleared when full, so that it stays small.
  private readonly names = new Set<string>()

  constructor(bytes: boolean) {
    this.bytes = bytes
  }

  private checkName(what: string, name: string): void {
    if (!this.isName(name)) checkName(what, name)
  }

  private isName(name: string): boolean {
    if (this.names.has(name)) return true
    if (typeof name !== "string" || !isName(name)) return false
    if (this.names.size >= 1024) this.names.clear()
    this.names.add(name)
    return true
  }

  // Checks attributes one by one, in order, after a batched check has failed
  private checkAttributes(attributes: Readonly<Record<string, string>>): void {
    for (const name in attributes) {
      if (!Object.hasOwn(attributes, name)) continue
      const value = attributes[name]
      this.checkName("attribute name", name)
      if (typeof value !== "string") throw invalidEvent(`attribute ${name} must be a string`)
      checkChars(`attribute ${name}`, value)
    }
  }

  push(event: Event): void {
    const text = this.write(event)
    if (text.length > 0) {
      const out = this.out
      if (out.length > 0) out[0] += text
      else out.push(text)
    }
  }

  end(): void {
    if (this.stack.length > 0) throw invalidEvent(`unclosed element <${this.stack[this.stack.length - 1]}>`)
    if (this.state !== EPILOG) throw invalidEvent("no root element")
  }

  private write(event: Event): string {
    if (event._tag === "EndElement") {
      const open = this.stack.length > 0 ? this.stack[this.stack.length - 1] : undefined
      if (open === undefined || event.name !== open) {
        // Only valid names are written into messages
        checkName("element name", event.name)
        throw invalidEvent(
          open === undefined
            ? `end tag </${event.name}> without a start tag`
            : `end tag </${event.name}> does not match <${open}>`
        )
      }
      this.stack.pop()
      if (this.stack.length === 0) this.state = EPILOG
      return `</${open}>`
    }
    switch (event._tag) {
      case "StartElement": {
        this.checkName("element name", event.name)
        if (this.state === EPILOG) throw invalidEvent(`second root element <${event.name}>`)
        let tag = "<" + event.name
        let valid = true
        for (const name in event.attributes) {
          if (!Object.hasOwn(event.attributes, name)) continue
          const value = event.attributes[name]
          if (typeof value !== "string" || !this.isName(name)) {
            valid = false
            break
          }
          tag += ` ${name}="${escapeAttribute(value)}"`
        }
        // Escaping keeps invalid characters, so one search of the tag checks
        // every value; the first error is then found in attribute order
        if (!valid || (tag.length > event.name.length + 1 && searchInvalid(tag) !== -1)) {
          this.checkAttributes(event.attributes)
        }
        this.stack.push(event.name)
        this.state = CONTENT
        return tag + ">"
      }
      case "Text": {
        if (this.state !== CONTENT) {
          checkChars("text", event.text)
          if (!isWhitespace(event.text)) throw invalidEvent("text outside the root element must be whitespace")
          if (this.state === NOTHING_WRITTEN && event.text.length > 0) this.state = PROLOG
          return event.text
        }
        checkChars("text", event.text)
        return escapeText(event.text)
      }
      case "Comment": {
        checkChars("comment", event.text)
        if (event.text.includes("--") || event.text.endsWith("-")) {
          throw invalidEvent("comments cannot contain \"--\" or end with \"-\"")
        }
        if (this.state === NOTHING_WRITTEN) this.state = PROLOG
        return `<!--${event.text}-->`
      }
      case "ProcessingInstruction": {
        checkName("processing instruction target", event.target)
        if (isReservedTarget(event.target)) {
          throw invalidEvent(`processing instruction target ${event.target} is reserved`)
        }
        checkChars("processing instruction", event.data)
        if (event.data.includes("?>")) throw invalidEvent("processing instruction data cannot contain \"?>\"")
        if (this.state === NOTHING_WRITTEN) this.state = PROLOG
        return `<?${event.target}${event.data === "" ? "" : " " + event.data}?>`
      }
      case "Declaration": {
        if (this.state !== NOTHING_WRITTEN) throw invalidEvent("the XML declaration must be the first event")
        if (!versionPattern.test(event.version)) {
          throw invalidEvent(`invalid XML version ${JSON.stringify(event.version)}`)
        }
        let declaration = `<?xml version="${event.version}"`
        if (event.encoding !== undefined) {
          if (!encodingPattern.test(event.encoding)) {
            throw invalidEvent(`invalid encoding name ${JSON.stringify(event.encoding)}`)
          }
          if (this.bytes && event.encoding.toLowerCase() !== "utf-8") {
            throw invalidEvent(`encoding ${event.encoding} cannot be declared for UTF-8 output`)
          }
          declaration += ` encoding="${event.encoding}"`
        }
        if (event.standalone !== undefined) declaration += ` standalone="${event.standalone ? "yes" : "no"}"`
        this.state = PROLOG
        return declaration + "?>"
      }
      case "Doctype": {
        if (this.state === CONTENT || this.state === EPILOG || this.doctype) {
          throw invalidEvent("a DOCTYPE must appear once, before the root element")
        }
        checkName("DOCTYPE name", event.name)
        let doctype = `<!DOCTYPE ${event.name}`
        if (event.publicId !== undefined) {
          if (event.systemId === undefined) {
            throw invalidEvent("a DOCTYPE with a public identifier needs a system identifier")
          }
          if (!pubidPattern.test(event.publicId)) {
            throw invalidEvent(`invalid public identifier ${JSON.stringify(event.publicId)}`)
          }
          doctype += ` PUBLIC "${event.publicId}"`
        }
        if (event.systemId !== undefined) {
          checkChars("system identifier", event.systemId)
          const hasDouble = event.systemId.includes("\"")
          if (hasDouble && event.systemId.includes("'")) {
            throw invalidEvent("a system identifier cannot contain both quote characters")
          }
          if (event.publicId === undefined) doctype += " SYSTEM"
          doctype += hasDouble ? ` '${event.systemId}'` : ` "${event.systemId}"`
        }
        this.doctype = true
        this.state = PROLOG
        return doctype + ">"
      }
    }
  }
}
