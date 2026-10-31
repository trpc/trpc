/**
 * Parses TOML configuration files.
 *
 * The implementation covers the TOML values and table forms used by Effect's
 * configuration-file CLI primitive while avoiding a generated parser runtime.
 *
 * @stability unstable
 * @since 4.0.0
 */

/*
 * The behavior is based on `toml` 4.1.2.
 *
 * Copyright (c) 2012 Michelle Tilley
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

import * as Result from "../Result.ts"
import { EncodingError } from "./EncodingError.ts"

type Table = Record<string, unknown>

const hasOwn = Object.prototype.hasOwnProperty
const makeTable = (): Table => Object.create(null)
const isTable = (value: unknown): value is Table =>
  typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof Date)
const localDatePattern = /^(\d{4})-(\d{2})-(\d{2})$/
const localTimePattern = /^(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?$/
const numericOffsetPattern = /^[+-](\d{2}):(\d{2})$/
const dateTimePattern = /^(\d{4}-\d{2}-\d{2})[Tt](\d{2}:\d{2}:\d{2}(?:\.\d+)?)([Zz]|[+-]\d{2}:\d{2})?$/
const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
const isValidDate = (date: string): boolean => {
  const [, year, month, day] = localDatePattern.exec(date)!.map(Number)
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const days = month === 2 && leap ? 29 : daysInMonth[month - 1]
  return month >= 1 && month <= 12 && day >= 1 && day <= days
}
const isValidTime = (time: string): boolean => {
  const [, hour, minute, second] = localTimePattern.exec(time)!.map(Number)
  return hour <= 23 && minute <= 59 && second <= 60
}
const isValidOffset = (offset: string): boolean => {
  const numeric = numericOffsetPattern.exec(offset)
  return numeric === null || (Number(numeric[1]) <= 23 && Number(numeric[2]) <= 59)
}

class TomlParser {
  readonly root = makeTable()
  private readonly input: string
  private current = this.root
  private index = 0
  private line = 1
  private column = 1
  private readonly explicitTables = new Set<Table>()
  // Tables defined by dotted keys; a header cannot define them again.
  private readonly dottedTables = new Set<Table>()
  // Values parsed from `[...]` or `{...}` are complete; headers and dotted keys cannot extend them.
  private readonly inlineValues = new Set<unknown>()

  constructor(input: string) {
    this.input = input
  }

  parse(): Table {
    while (true) {
      this.skipDocumentWhitespace()
      if (this.done) {
        return this.root
      }
      if (this.peek() === "[") {
        this.parseHeader()
      } else {
        const keys = this.parseKeyPath("=")
        this.skipInlineWhitespace()
        this.expect("=")
        this.skipInlineWhitespace()
        this.assign(this.current, keys, this.parseValue())
        this.finishStatement()
      }
    }
  }

  private parseHeader(): void {
    this.expect("[")
    const array = this.peek() === "["
    if (array) {
      this.advance()
    }
    this.skipInlineWhitespace()
    const path = this.parseKeyPath("]")
    this.skipInlineWhitespace()
    this.expect("]")
    if (array) {
      this.expect("]")
    }
    this.finishStatement()

    const table = this.resolveTable(path, array)
    if (!array && (this.explicitTables.has(table) || this.dottedTables.has(table))) {
      this.fail(`Cannot redefine table '${path.join(".")}'`)
    }
    if (!array) {
      this.explicitTables.add(table)
    }
    this.current = table
  }

  private resolveTable(path: ReadonlyArray<string>, array: boolean): Table {
    let table = this.root
    for (let index = 0; index < path.length; index++) {
      const key = path[index]
      const last = index === path.length - 1
      let value = table[key]
      if (this.inlineValues.has(value)) {
        this.fail(`Cannot redefine existing key '${path.slice(0, index + 1).join(".")}'`)
      }

      if (last && array) {
        if (value === undefined) {
          value = []
          table[key] = value
        }
        if (!Array.isArray(value)) {
          this.fail(`Cannot redefine existing key '${path.slice(0, index + 1).join(".")}'`)
        }
        const next = makeTable()
        value.push(next)
        return next
      }

      if (value === undefined) {
        value = makeTable()
        table[key] = value
      }
      if (Array.isArray(value) && !last) {
        value = value[value.length - 1]
      }
      if (!isTable(value)) {
        this.fail(`Cannot redefine existing key '${path.slice(0, index + 1).join(".")}'`)
      }
      table = value
    }
    return table
  }

  private assign(target: Table, keys: ReadonlyArray<string>, value: unknown): void {
    let table = target
    for (let index = 0; index < keys.length - 1; index++) {
      const key = keys[index]
      const existing = table[key]
      if (existing === undefined) {
        const child = makeTable()
        table[key] = child
        table = child
      } else if (isTable(existing) && !this.explicitTables.has(existing) && !this.inlineValues.has(existing)) {
        table = existing
      } else {
        this.fail(`Cannot redefine existing key '${keys.slice(0, index + 1).join(".")}'`)
      }
      this.dottedTables.add(table)
    }
    const key = keys[keys.length - 1]
    if (hasOwn.call(table, key)) {
      this.fail(`Cannot redefine existing key '${keys.join(".")}'`)
    }
    table[key] = value
  }

  private parseKeyPath(stop: "=" | "]"): Array<string> {
    const keys: Array<string> = []
    while (true) {
      this.skipInlineWhitespace()
      const character = this.peek()
      let key: string
      if (character === "\"") {
        key = this.parseBasicString(false)
      } else if (character === "'") {
        key = this.parseLiteralString(false)
      } else {
        const start = this.index
        while (/[A-Za-z0-9_-]/.test(this.peek())) {
          this.advance()
        }
        key = this.input.slice(start, this.index)
        if (key.length === 0) {
          this.fail("Expected a key")
        }
      }
      keys.push(key)
      this.skipInlineWhitespace()
      if (this.peek() === ".") {
        this.advance()
        continue
      }
      if (this.peek() !== stop) {
        this.fail(`Expected '${stop}'`)
      }
      return keys
    }
  }

  private parseValue(): unknown {
    const character = this.peek()
    if (character === "\"") {
      return this.parseBasicString(this.input.startsWith("\"\"\"", this.index))
    }
    if (character === "'") {
      return this.parseLiteralString(this.input.startsWith("'''", this.index))
    }
    if (character === "[") {
      const array = this.parseArray()
      this.inlineValues.add(array)
      return array
    }
    if (character === "{") {
      const table = this.parseInlineTable()
      this.inlineValues.add(table)
      return table
    }

    const spaceSeparatedDateTime = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[Zz]|[+-]\d{2}:\d{2})?)/
      .exec(this.input.slice(this.index))
    if (spaceSeparatedDateTime !== null) {
      this.advance(spaceSeparatedDateTime[0].length)
      return this.parseDate(`${spaceSeparatedDateTime[1]}T${spaceSeparatedDateTime[2]}`)!
    }

    const start = this.index
    while (!this.done && !/[\s,#\]}]/.test(this.peek())) {
      this.advance()
    }
    const token = this.input.slice(start, this.index)
    if (token === "true") return true
    if (token === "false") return false
    if (token.length === 0) this.fail("Expected a value")

    const date = this.parseDate(token)
    if (date !== undefined) {
      return date
    }

    const number = this.parseNumber(token)
    if (number !== undefined) {
      return number
    }
    this.fail(`Invalid value '${token}'`)
  }

  private parseDate(token: string): Date | string | undefined {
    const dateTime = dateTimePattern.exec(token)
    if (dateTime !== null) {
      const [, date, time, offset] = dateTime
      // `Date` cannot represent a leap second, so offset date-times reject `:60`
      const offsetValid = offset === undefined || (isValidOffset(offset) && time.slice(6, 8) !== "60")
      if (!isValidDate(date) || !isValidTime(time) || !offsetValid) {
        this.fail(`Invalid date-time '${token}'`)
      }
      return offset === undefined ? `${date}T${time}` : new Date(`${date}T${time}${offset.toUpperCase()}`)
    }
    if (localDatePattern.test(token)) {
      return isValidDate(token) ? token : this.fail(`Invalid date-time '${token}'`)
    }
    if (localTimePattern.test(token)) {
      return isValidTime(token) ? token : this.fail(`Invalid date-time '${token}'`)
    }
    return undefined
  }

  private parseNumber(token: string): number | undefined {
    const normalized = token.replace(/_/g, "")
    if (/^[+-]?(?:inf|nan)$/.test(token)) {
      if (normalized.endsWith("nan")) return Number.NaN
      return normalized[0] === "-" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY
    }
    if (
      /^0x[0-9A-Fa-f](?:_?[0-9A-Fa-f])*$/.test(token) ||
      /^0o[0-7](?:_?[0-7])*$/.test(token) ||
      /^0b[01](?:_?[01])*$/.test(token) ||
      /^[+-]?(?:0|[1-9](?:_?\d)*)$/.test(token)
    ) {
      const value = Number(normalized)
      if (!Number.isSafeInteger(value)) {
        this.fail(`Integer out of range '${token}'`)
      }
      return value
    }
    if (
      /^[+-]?(?:(?:0|[1-9](?:_?\d)*)\.\d(?:_?\d)*(?:[eE][+-]?\d(?:_?\d)*)?|(?:0|[1-9](?:_?\d)*)[eE][+-]?\d(?:_?\d)*)$/
        .test(
          token
        )
    ) {
      return Number(normalized)
    }
    return undefined
  }

  private parseBasicString(multiline: boolean): string {
    this.expect("\"")
    if (multiline) {
      this.expect("\"")
      this.expect("\"")
      this.advance(this.input.startsWith("\r\n", this.index) ? 2 : this.peek() === "\n" ? 1 : 0)
    }
    let output = ""
    while (!this.done) {
      if (multiline && this.input.startsWith("\"\"\"", this.index)) {
        this.advance(3)
        return output + this.closingQuotes("\"")
      }
      const character = this.peek()
      if (!multiline && character === "\"") {
        this.advance()
        return output
      }
      if (!multiline && (character === "\n" || character === "\r")) {
        this.fail("Basic strings cannot contain newlines")
      }
      if (character !== "\\") {
        output += character
        this.advance()
        continue
      }

      this.advance()
      if (multiline && /[ \t\r\n]/.test(this.peek())) {
        while (/[ \t]/.test(this.peek())) this.advance()
        if (this.peek() !== "\n" && this.peek() !== "\r") {
          this.fail("Invalid multiline string continuation")
        }
        while (/[ \t\r\n]/.test(this.peek())) this.advance()
        continue
      }
      const escape = this.peek()
      this.advance()
      const escapes: Record<string, string> = {
        b: "\b",
        t: "\t",
        n: "\n",
        f: "\f",
        r: "\r",
        "\"": "\"",
        "\\": "\\"
      }
      if (hasOwn.call(escapes, escape)) {
        output += escapes[escape]
      } else if (escape === "u" || escape === "U") {
        const length = escape === "u" ? 4 : 8
        const hex = this.input.slice(this.index, this.index + length)
        const codePoint = Number.parseInt(hex, 16)
        if (
          !new RegExp(`^[0-9A-Fa-f]{${length}}$`).test(hex) ||
          (codePoint >= 0xD800 && codePoint <= 0xDFFF) ||
          codePoint > 0x10FFFF
        ) {
          this.fail("Invalid unicode escape")
        }
        output += String.fromCodePoint(codePoint)
        this.advance(length)
      } else {
        this.fail(`Invalid escape '\\${escape}'`)
      }
    }
    this.fail("Unterminated basic string")
  }

  private parseLiteralString(multiline: boolean): string {
    this.expect("'")
    if (multiline) {
      this.expect("'")
      this.expect("'")
      this.advance(this.input.startsWith("\r\n", this.index) ? 2 : this.peek() === "\n" ? 1 : 0)
    }
    const start = this.index
    while (!this.done) {
      if (multiline && this.input.startsWith("'''", this.index)) {
        const output = this.input.slice(start, this.index)
        this.advance(3)
        return output + this.closingQuotes("'")
      }
      if (!multiline && this.peek() === "'") {
        const output = this.input.slice(start, this.index)
        this.advance()
        return output
      }
      if (!multiline && (this.peek() === "\n" || this.peek() === "\r")) {
        this.fail("Literal strings cannot contain newlines")
      }
      this.advance()
    }
    this.fail("Unterminated literal string")
  }

  private closingQuotes(quote: string): string {
    let quotes = ""
    while (quotes.length < 2 && this.peek() === quote) {
      quotes += quote
      this.advance()
    }
    return quotes
  }

  private parseArray(): Array<unknown> {
    this.expect("[")
    const output: Array<unknown> = []
    while (true) {
      this.skipArrayWhitespace()
      if (this.peek() === "]") {
        this.advance()
        return output
      }
      output.push(this.parseValue())
      this.skipArrayWhitespace()
      if (this.peek() === "]") {
        this.advance()
        return output
      }
      this.expect(",")
    }
  }

  private parseInlineTable(): Table {
    this.expect("{")
    const output = makeTable()
    this.skipInlineWhitespace()
    if (this.peek() === "}") {
      this.advance()
      return output
    }
    while (true) {
      const keys = this.parseKeyPath("=")
      this.skipInlineWhitespace()
      this.expect("=")
      this.skipInlineWhitespace()
      this.assign(output, keys, this.parseValue())
      this.skipInlineWhitespace()
      if (this.peek() === "}") {
        this.advance()
        return output
      }
      this.expect(",")
      this.skipInlineWhitespace()
      if (this.peek() === "}") {
        this.fail("Inline tables cannot end with a trailing comma")
      }
    }
  }

  private skipDocumentWhitespace(): void {
    while (!this.done) {
      if (/[ \t\r\n]/.test(this.peek())) {
        this.advance()
      } else if (this.peek() === "#") {
        this.skipComment()
      } else {
        return
      }
    }
  }

  private skipInlineWhitespace(): void {
    while (this.peek() === " " || this.peek() === "\t") {
      this.advance()
    }
  }

  private skipArrayWhitespace(): void {
    while (!this.done) {
      if (/[ \t\r\n]/.test(this.peek())) {
        this.advance()
      } else if (this.peek() === "#") {
        this.skipComment()
      } else {
        return
      }
    }
  }

  private finishStatement(): void {
    this.skipInlineWhitespace()
    if (this.peek() === "#") {
      this.skipComment()
    }
    if (!this.done && this.peek() !== "\n" && this.peek() !== "\r") {
      this.fail("Expected the end of the line")
    }
  }

  private skipComment(): void {
    while (!this.done && this.peek() !== "\n") {
      this.advance()
    }
  }

  private expect(character: string): void {
    if (this.peek() !== character) {
      this.fail(`Expected '${character}'`)
    }
    this.advance()
  }

  private advance(count = 1): void {
    for (let offset = 0; offset < count; offset++) {
      const code = this.input.charCodeAt(this.index)
      if (
        (code < 0x20 && code !== 0x09 && code !== 0x0A && !(code === 0x0D && this.input[this.index + 1] === "\n")) ||
        code === 0x7F
      ) {
        this.fail("Invalid control character")
      }
      if (this.input[this.index] === "\n") {
        this.line++
        this.column = 1
      } else if (this.input[this.index] === "\r" && this.input[this.index + 1] !== "\n") {
        this.fail("Bare carriage return")
      } else {
        this.column++
      }
      this.index++
    }
  }

  private peek(): string {
    return this.input[this.index] ?? ""
  }

  private get done(): boolean {
    return this.index >= this.input.length
  }

  private fail(message: string): never {
    throw new SyntaxError(`${message} at line ${this.line}, column ${this.column}`)
  }
}

/**
 * Parses a TOML document into a null-prototype record.
 *
 * **Details**
 *
 * Returns `Result.succeed` with the parsed record, or `Result.fail` with an
 * `EncodingError` when the input is not valid TOML. Offset date-times are
 * represented by `Date`, matching the package this parser replaces. Local
 * dates and times remain strings.
 *
 * **Example** (Parsing a TOML document)
 *
 * ```ts import.meta.vitest
 * import { Result } from "effect"
 * import { Toml } from "effect/encoding"
 *
 * Toml.parse("port = 8080") // => Result.succeed({ port: 8080 })
 * Result.isFailure(Toml.parse("port = ")) // => true
 * ```
 *
 * @stability unstable
 * @category decoding
 * @since 4.0.0
 */
export const parse = (input: string): Result.Result<Record<string, unknown>, EncodingError> => {
  try {
    return Result.succeed(new TomlParser(input.replace(/^\uFEFF/, "")).parse())
  } catch (e) {
    return Result.fail(
      new EncodingError({
        module: "Toml",
        kind: "Decode",
        input,
        message: e instanceof Error ? e.message : "Invalid input"
      })
    )
  }
}
