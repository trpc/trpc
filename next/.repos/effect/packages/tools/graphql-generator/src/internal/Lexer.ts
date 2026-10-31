/*
 * Adapted from graphql-js v16.14.2 (https://github.com/graphql/graphql-js,
 * `src/language/lexer.ts`), distributed under the MIT License:
 *
 * Copyright (c) GraphQL Contributors
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
/**
 * GraphQL lexer for the current spec edition (September 2025).
 *
 * Produces one token at a time over a {@link Source}. Ignored tokens (BOM,
 * whitespace, line terminators, commas and comments) are skipped. String and
 * block string tokens carry their decoded value; numbers carry their source
 * text. Every character, comments included, must be a Unicode scalar value;
 * an unpaired surrogate is an error. Errors are thrown as {@link Diagnostic}
 * and caught by the parser.
 *
 * The structure and messages follow graphql-js so disputes can be settled
 * against the reference implementation.
 *
 * @internal
 */
import { make, type Source } from "./Diagnostic.ts"

const punctuatorKinds = ["!", "$", "&", "(", ")", "...", ":", "=", "@", "[", "]", "{", "|", "}"] as const

type PunctuatorKind = (typeof punctuatorKinds)[number]

export type TokenKind = "<SOF>" | "<EOF>" | PunctuatorKind | "Name" | "Int" | "Float" | "String" | "BlockString"

export interface Token {
  readonly kind: TokenKind
  /** Code-unit offset of the first character. */
  readonly start: number
  /** Code-unit offset one past the last character. */
  readonly end: number
  /** Decoded value for `Name`, `Int`, `Float`, `String` and `BlockString`. */
  readonly value: string | undefined
}

const punctuators: ReadonlySet<string> = new Set(punctuatorKinds)

export const isPunctuatorKind = (kind: TokenKind): kind is PunctuatorKind => punctuators.has(kind)

export class Lexer {
  readonly source: Source
  /** The most recently read token. Starts as `<SOF>`. */
  token: Token
  /** The token before `token`. */
  lastToken: Token
  private next: Token | undefined = undefined

  constructor(source: Source) {
    this.source = source
    this.token = { kind: "<SOF>", start: 0, end: 0, value: undefined }
    this.lastToken = this.token
  }

  /** Advances to the next token and returns it. */
  advance(): Token {
    this.lastToken = this.token
    this.token = this.lookahead()
    this.next = undefined
    return this.token
  }

  /** Returns the token after the current one without consuming it. */
  lookahead(): Token {
    if (this.next === undefined) {
      this.next = this.token.kind === "<EOF>" ? this.token : readToken(this.source, this.token.end)
    }
    return this.next
  }
}

const token = (kind: TokenKind, start: number, end: number, value?: string): Token => ({ kind, start, end, value })

const isDigit = (code: number): boolean => code >= 0x30 && code <= 0x39

const isNameStart = (code: number): boolean =>
  (code >= 0x61 && code <= 0x7a) || (code >= 0x41 && code <= 0x5a) || code === 0x5f

const isNameContinue = (code: number): boolean => isNameStart(code) || isDigit(code)

const isUnicodeScalarValue = (code: number): boolean =>
  (code >= 0x0000 && code <= 0xd7ff) || (code >= 0xe000 && code <= 0x10ffff)

const isLeadingSurrogate = (code: number): boolean => code >= 0xd800 && code <= 0xdbff

const isTrailingSurrogate = (code: number): boolean => code >= 0xdc00 && code <= 0xdfff

/**
 * The code-unit length of the `SourceCharacter` at `position`: 1, 2 for a
 * surrogate pair, or 0 when it is an unpaired surrogate.
 */
const sourceCharacterSize = (body: string, position: number): number =>
  isUnicodeScalarValue(body.charCodeAt(position))
    ? 1
    : isLeadingSurrogate(body.charCodeAt(position)) && isTrailingSurrogate(body.charCodeAt(position + 1))
    ? 2
    : 0

/** Describes the code point at `location` for messages: `"?"`, `U+00E9`, or `<EOF>`. */
const printCodePointAt = (body: string, location: number): string => {
  const code = body.codePointAt(location)
  if (code === undefined) return "<EOF>"
  if (code >= 0x0020 && code <= 0x007e) {
    return code === 0x0022 ? "'\"'" : `"${String.fromCodePoint(code)}"`
  }
  return `U+${code.toString(16).toUpperCase().padStart(4, "0")}`
}

const readToken = (source: Source, start: number): Token => {
  const body = source.body
  const bodyLength = body.length
  let position = start
  while (position < bodyLength) {
    const code = body.charCodeAt(position)
    switch (code) {
      // Ignored: BOM, tab, space, comma, line feed
      case 0xfeff:
      case 0x0009:
      case 0x0020:
      case 0x002c:
      case 0x000a:
        position++
        continue
      // Carriage return, optionally followed by a line feed
      case 0x000d:
        position += body.charCodeAt(position + 1) === 0x000a ? 2 : 1
        continue
      // Comment
      case 0x0023:
        position = readComment(body, position)
        continue
      case 0x002e:
        if (body.charCodeAt(position + 1) === 0x002e && body.charCodeAt(position + 2) === 0x002e) {
          return token("...", position, position + 3)
        }
        break
      case 0x0022:
        if (body.charCodeAt(position + 1) === 0x0022 && body.charCodeAt(position + 2) === 0x0022) {
          return readBlockString(source, position)
        }
        return readString(source, position)
    }
    const char = body[position]!
    if (punctuators.has(char)) {
      return token(char as PunctuatorKind, position, position + 1)
    }
    if (isDigit(code) || code === 0x002d) {
      return readNumber(source, position, code)
    }
    if (isNameStart(code)) {
      return readName(body, position)
    }
    throw make(
      source,
      position,
      code === 0x0027
        ? "Unexpected single quote character ('), did you mean to use a double quote (\")?"
        : sourceCharacterSize(body, position) > 0
        ? `Unexpected character: ${printCodePointAt(body, position)}.`
        : `Invalid character: ${printCodePointAt(body, position)}.`
    )
  }
  return token("<EOF>", bodyLength, bodyLength)
}

const readComment = (body: string, start: number): number => {
  let position = start + 1
  while (position < body.length) {
    const code = body.charCodeAt(position)
    if (code === 0x000a || code === 0x000d) break
    // Not a SourceCharacter; stop here so the main loop reports it.
    const size = sourceCharacterSize(body, position)
    if (size === 0) break
    position += size
  }
  return position
}

const readName = (body: string, start: number): Token => {
  let position = start + 1
  while (position < body.length && isNameContinue(body.charCodeAt(position))) {
    position++
  }
  return token("Name", start, position, body.slice(start, position))
}

const readNumber = (source: Source, start: number, firstCode: number): Token => {
  const body = source.body
  let position = start
  let code = firstCode
  let isFloat = false
  if (code === 0x002d) {
    code = body.charCodeAt(++position)
  }
  if (code === 0x0030) {
    code = body.charCodeAt(++position)
    if (isDigit(code)) {
      throw make(source, position, `Invalid number, unexpected digit after 0: ${printCodePointAt(body, position)}.`)
    }
  } else {
    position = readDigits(source, position, code)
    code = body.charCodeAt(position)
  }
  if (code === 0x002e) {
    isFloat = true
    code = body.charCodeAt(++position)
    position = readDigits(source, position, code)
    code = body.charCodeAt(position)
  }
  if (code === 0x0045 || code === 0x0065) {
    isFloat = true
    code = body.charCodeAt(++position)
    if (code === 0x002b || code === 0x002d) {
      code = body.charCodeAt(++position)
    }
    position = readDigits(source, position, code)
    code = body.charCodeAt(position)
  }
  if (code === 0x002e || isNameStart(code)) {
    throw make(source, position, `Invalid number, expected digit but got: ${printCodePointAt(body, position)}.`)
  }
  return token(isFloat ? "Float" : "Int", start, position, body.slice(start, position))
}

const readDigits = (source: Source, start: number, firstCode: number): number => {
  if (!isDigit(firstCode)) {
    throw make(source, start, `Invalid number, expected digit but got: ${printCodePointAt(source.body, start)}.`)
  }
  const body = source.body
  let position = start + 1
  while (isDigit(body.charCodeAt(position))) {
    position++
  }
  return position
}

const readString = (source: Source, start: number): Token => {
  const body = source.body
  const bodyLength = body.length
  let position = start + 1
  let chunkStart = position
  let value = ""
  while (position < bodyLength) {
    const code = body.charCodeAt(position)
    if (code === 0x0022) {
      value += body.slice(chunkStart, position)
      return token("String", start, position + 1, value)
    }
    if (code === 0x005c) {
      value += body.slice(chunkStart, position)
      const escape = body.charCodeAt(position + 1) === 0x0075
        ? body.charCodeAt(position + 2) === 0x007b
          ? readEscapedUnicodeVariableWidth(source, position)
          : readEscapedUnicodeFixedWidth(source, position)
        : readEscapedCharacter(source, position)
      value += escape.value
      position += escape.size
      chunkStart = position
      continue
    }
    if (code === 0x000a || code === 0x000d) break
    const size = sourceCharacterSize(body, position)
    if (size === 0) {
      throw make(source, position, `Invalid character within String: ${printCodePointAt(body, position)}.`)
    }
    position += size
  }
  throw make(source, position, "Unterminated string.")
}

interface EscapeSequence {
  readonly value: string
  readonly size: number
}

const readEscapedUnicodeVariableWidth = (source: Source, position: number): EscapeSequence => {
  const body = source.body
  let point = 0
  let size = 3
  // Cannot be larger than 12 chars (\u{00000000}).
  while (size < 12) {
    const code = body.charCodeAt(position + size++)
    if (code === 0x007d) {
      // Must be at least 5 chars (\u{0}) and encode a Unicode scalar value.
      if (size < 5 || !isUnicodeScalarValue(point)) break
      return { value: String.fromCodePoint(point), size }
    }
    point = (point << 4) | readHexDigit(code)
    if (point < 0) break
  }
  throw make(source, position, `Invalid Unicode escape sequence: "${body.slice(position, position + size)}".`)
}

const readEscapedUnicodeFixedWidth = (source: Source, position: number): EscapeSequence => {
  const body = source.body
  const code = read16BitHexCode(body, position + 2)
  if (isUnicodeScalarValue(code)) {
    return { value: String.fromCodePoint(code), size: 6 }
  }
  // JSON-style surrogate pair escapes are allowed only when they form a pair.
  if (isLeadingSurrogate(code)) {
    if (body.charCodeAt(position + 6) === 0x005c && body.charCodeAt(position + 7) === 0x0075) {
      const trailingCode = read16BitHexCode(body, position + 8)
      if (isTrailingSurrogate(trailingCode)) {
        return { value: String.fromCodePoint(code, trailingCode), size: 12 }
      }
    }
  }
  throw make(source, position, `Invalid Unicode escape sequence: "${body.slice(position, position + 6)}".`)
}

const read16BitHexCode = (body: string, position: number): number =>
  (readHexDigit(body.charCodeAt(position)) << 12) |
  (readHexDigit(body.charCodeAt(position + 1)) << 8) |
  (readHexDigit(body.charCodeAt(position + 2)) << 4) |
  readHexDigit(body.charCodeAt(position + 3))

/** The value of a hex digit, or -1 for anything else. */
const readHexDigit = (code: number): number =>
  code >= 0x0030 && code <= 0x0039
    ? code - 0x0030
    : code >= 0x0041 && code <= 0x0046
    ? code - 0x0037
    : code >= 0x0061 && code <= 0x0066
    ? code - 0x0057
    : -1

const escapedCharacters: ReadonlyMap<string | undefined, string> = new Map([
  ["\"", "\""],
  ["\\", "\\"],
  ["/", "/"],
  ["b", "\b"],
  ["f", "\f"],
  ["n", "\n"],
  ["r", "\r"],
  ["t", "\t"]
])

const readEscapedCharacter = (source: Source, position: number): EscapeSequence => {
  const body = source.body
  const value = escapedCharacters.get(body[position + 1])
  if (value !== undefined) return { value, size: 2 }
  throw make(source, position, `Invalid character escape sequence: "${body.slice(position, position + 2)}".`)
}

const readBlockString = (source: Source, start: number): Token => {
  const body = source.body
  const bodyLength = body.length
  let position = start + 3
  let chunkStart = position
  let currentLine = ""
  const blockLines: Array<string> = []
  while (position < bodyLength) {
    const code = body.charCodeAt(position)
    if (code === 0x0022 && body.charCodeAt(position + 1) === 0x0022 && body.charCodeAt(position + 2) === 0x0022) {
      currentLine += body.slice(chunkStart, position)
      blockLines.push(currentLine)
      return token("BlockString", start, position + 3, dedentBlockStringLines(blockLines).join("\n"))
    }
    if (
      code === 0x005c &&
      body.charCodeAt(position + 1) === 0x0022 &&
      body.charCodeAt(position + 2) === 0x0022 &&
      body.charCodeAt(position + 3) === 0x0022
    ) {
      currentLine += body.slice(chunkStart, position)
      chunkStart = position + 1
      position += 4
      continue
    }
    if (code === 0x000a || code === 0x000d) {
      currentLine += body.slice(chunkStart, position)
      blockLines.push(currentLine)
      position += code === 0x000d && body.charCodeAt(position + 1) === 0x000a ? 2 : 1
      currentLine = ""
      chunkStart = position
      continue
    }
    const size = sourceCharacterSize(body, position)
    if (size === 0) {
      throw make(source, position, `Invalid character within String: ${printCodePointAt(body, position)}.`)
    }
    position += size
  }
  throw make(source, position, "Unterminated string.")
}

/** The spec's `BlockStringValue` algorithm over already split lines. */
const dedentBlockStringLines = (lines: ReadonlyArray<string>): ReadonlyArray<string> => {
  let commonIndent = Number.MAX_SAFE_INTEGER
  let firstNonEmptyLine: number | undefined = undefined
  let lastNonEmptyLine = -1
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    const indent = leadingWhitespace(line)
    if (indent === line.length) continue
    firstNonEmptyLine ??= i
    lastNonEmptyLine = i
    if (i !== 0 && indent < commonIndent) {
      commonIndent = indent
    }
  }
  return lines
    .map((line, i) => (i === 0 ? line : line.slice(commonIndent)))
    .slice(firstNonEmptyLine ?? 0, lastNonEmptyLine + 1)
}

const leadingWhitespace = (line: string): number => {
  let i = 0
  while (i < line.length && (line[i] === " " || line[i] === "\t")) {
    i++
  }
  return i
}
