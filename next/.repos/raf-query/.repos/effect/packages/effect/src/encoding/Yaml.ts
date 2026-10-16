/**
 * Parses YAML configuration files.
 *
 * Supports YAML 1.2 block and flow collections, indentless sequence values,
 * multiline plain and quoted scalars, block scalars, anchors, and aliases.
 *
 * Unsupported: compact nested block sequences (`- - value` on one line),
 * multiline flow collections, explicit complex keys, tag/directive processing,
 * recursive aliases, and document streams. Mapping keys are JavaScript strings.
 *
 * @stability unstable
 * @since 4.0.0
 */

/*
 * The behavior is based on `yaml` 2.9.0.
 *
 * Copyright Eemeli Aro <eemeli@gmail.com>
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY
 * SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION
 * OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN
 * CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 */

type YamlRecord = Record<string, unknown>

type Line = {
  readonly raw: string
  readonly text: string
  readonly indent: number
  readonly number: number
}

const hasOwn = Object.prototype.hasOwnProperty

const setProperty = (record: YamlRecord, key: string, value: unknown): void => {
  Object.defineProperty(record, key, {
    configurable: true,
    enumerable: true,
    writable: true,
    value
  })
}

const closingQuote = (input: string, quote: string, start: number): number => {
  for (let index = start; index < input.length; index++) {
    const character = input[index]
    if (quote === "\"" && character === "\\") {
      index++
    } else if (character === quote) {
      if (quote === "'" && input[index + 1] === quote) index++
      else return index
    }
  }
  return -1
}

const findIndicator = (input: string, indicator: ":" | "#"): number => {
  let depth = 0
  let tokenStart = true
  for (let index = 0; index < input.length; index++) {
    const character = input[index]
    if (tokenStart && (character === "'" || character === "\"")) {
      index = closingQuote(input, character, index + 1)
      if (index === -1) return -1
      tokenStart = false
    } else if (tokenStart && character === "&") {
      while (index + 1 < input.length && !/[\s,[\]{}]/.test(input[index + 1])) index++
    } else if (character === "#" && (index === 0 || /\s/.test(input[index - 1]))) {
      return indicator === "#" ? index : -1
    } else if (tokenStart && (character === "[" || character === "{")) {
      depth++
    } else if (depth > 0 && (character === "]" || character === "}")) {
      depth--
      tokenStart = false
    } else if (depth > 0 && character === ",") {
      tokenStart = true
    } else if (character === ":" && (depth > 0 || input[index + 1] === undefined || /\s/.test(input[index + 1]))) {
      if (depth === 0 && indicator === ":") return index
      tokenStart = true
    } else if (tokenStart && character === "-" && /\s/.test(input[index + 1] ?? "")) {
      continue
    } else if (!/\s/.test(character)) {
      tokenStart = false
    }
  }
  return -1
}

const stripComment = (input: string): string => {
  const index = findIndicator(input, "#")
  return index === -1 ? input : input.slice(0, index).trimEnd()
}

const mappingSeparator = (input: string): number => findIndicator(input, ":")

const isSequenceEntry = (text: string): boolean => text === "-" || text.startsWith("- ")

const foldLineBreak = (blankLines: number): string => blankLines === 0 ? " " : "\n".repeat(blankLines)

const endsWithEscape = (text: string): boolean => /\\*$/.exec(text)![0].length % 2 === 1

// Escaped trailing spaces are content, not folding whitespace.
const trimFoldedEnd = (line: string, quote: string): string => {
  const trailing = /[ \t]+$/.exec(line)
  if (trailing === null) return line
  const escaped = quote === "\"" && endsWithEscape(line.slice(0, trailing.index))
  return line.slice(0, trailing.index + (escaped ? 1 : 0))
}

const parseDoubleQuoted = (input: string): string => {
  if (!input.endsWith("\"") || input.length < 2) {
    throw new SyntaxError("Unterminated double-quoted YAML string")
  }
  let output = ""
  for (let index = 1; index < input.length - 1; index++) {
    const character = input[index]
    if (character !== "\\") {
      output += character
      continue
    }
    const escape = input[++index]
    const escapes: Record<string, string> = {
      "0": "\0",
      a: "\x07",
      b: "\b",
      t: "\t",
      n: "\n",
      v: "\v",
      f: "\f",
      r: "\r",
      e: "\x1b",
      " ": " ",
      "\"": "\"",
      "/": "/",
      "\\": "\\",
      N: "\u0085",
      _: "\u00a0",
      L: "\u2028",
      P: "\u2029"
    }
    if (hasOwn.call(escapes, escape)) {
      output += escapes[escape]
      continue
    }
    if (escape === "x" || escape === "u" || escape === "U") {
      const length = escape === "x" ? 2 : escape === "u" ? 4 : 8
      const hex = input.slice(index + 1, index + 1 + length)
      if (!new RegExp(`^[0-9A-Fa-f]{${length}}$`).test(hex)) {
        throw new SyntaxError("Invalid unicode escape in YAML string")
      }
      output += String.fromCodePoint(Number.parseInt(hex, 16))
      index += length
      continue
    }
    throw new SyntaxError(`Invalid YAML escape '\\${escape}'`)
  }
  return output
}

const parseScalar = (input: string): unknown => {
  const value = input.trim()
  if (value.length === 0) return null
  if (value.startsWith("\"") && value.endsWith("\"")) {
    return parseDoubleQuoted(value)
  }
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replace(/''/g, "'")
  }
  if (/^(?:null|~)$/i.test(value)) return null
  if (/^true$/i.test(value)) return true
  if (/^false$/i.test(value)) return false
  if (/^[+-]?\.inf$/i.test(value)) return value[0] === "-" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY
  if (/^\.nan$/i.test(value)) return Number.NaN

  const normalized = value.replace(/_/g, "")
  if (/^[+-]?0x[0-9a-f]+$/i.test(normalized)) {
    const sign = normalized[0] === "-" ? -1 : 1
    return sign * Number.parseInt(normalized.replace(/^[+-]?0x/i, ""), 16)
  }
  if (/^[+-]?0o[0-7]+$/i.test(normalized)) {
    const sign = normalized[0] === "-" ? -1 : 1
    return sign * Number.parseInt(normalized.replace(/^[+-]?0o/i, ""), 8)
  }
  if (
    /^[+-]?(?:0|[1-9]\d*)$/.test(normalized) ||
    /^[+-]?(?:(?:0|[1-9]\d*)?\.\d+|(?:0|[1-9]\d*)\.?\d*[eE][+-]?\d+)$/.test(normalized)
  ) {
    return Number(normalized)
  }
  return value
}

const parseKey = (input: string): string => {
  const value = parseScalar(input)
  return value === null || value === undefined ? "" : String(value)
}

class FlowParser {
  private readonly input: string
  private readonly anchors: ReadonlyMap<string, unknown>
  private index = 0

  constructor(input: string, anchors: ReadonlyMap<string, unknown>) {
    this.input = input
    this.anchors = anchors
  }

  parse(): unknown {
    const value = this.parseValue()
    this.skipWhitespace()
    if (this.index !== this.input.length) {
      this.fail("Unexpected flow collection content")
    }
    return value
  }

  private parseValue(): unknown {
    this.skipWhitespace()
    const character = this.peek()
    if (character === "[") return this.parseSequence()
    if (character === "{") return this.parseMapping()
    if (character === "\"" || character === "'") return parseScalar(this.readQuoted(character))
    if (character === "*") {
      this.index++
      const name = this.readUntil(/[,\]}\s]/)
      if (!this.anchors.has(name)) this.fail(`Unknown alias '*${name}'`)
      return this.anchors.get(name)
    }
    return parseScalar(this.readUntil(/[,\]}]/).trim())
  }

  private parseSequence(): Array<unknown> {
    this.expect("[")
    const output: Array<unknown> = []
    this.skipWhitespace()
    if (this.peek() === "]") {
      this.index++
      return output
    }
    while (true) {
      output.push(this.parseValue())
      this.skipWhitespace()
      if (this.peek() === "]") {
        this.index++
        return output
      }
      this.expect(",")
      this.skipWhitespace()
      if (this.peek() === "]") {
        this.index++
        return output
      }
    }
  }

  private parseMapping(): YamlRecord {
    this.expect("{")
    const output: YamlRecord = {}
    this.skipWhitespace()
    if (this.peek() === "}") {
      this.index++
      return output
    }
    while (true) {
      const key = this.parseKey()
      this.skipWhitespace()
      this.expect(":")
      if (hasOwn.call(output, key)) this.fail(`Duplicate key '${key}'`)
      setProperty(output, key, this.parseValue())
      this.skipWhitespace()
      if (this.peek() === "}") {
        this.index++
        return output
      }
      this.expect(",")
      this.skipWhitespace()
      if (this.peek() === "}") {
        this.index++
        return output
      }
    }
  }

  private parseKey(): string {
    this.skipWhitespace()
    const character = this.peek()
    if (character === "\"" || character === "'") {
      return parseKey(this.readQuoted(character))
    }
    return this.readUntil(/:/).trim()
  }

  private readQuoted(quote: string): string {
    const start = this.index
    const end = closingQuote(this.input, quote, start + 1)
    if (end === -1) this.fail("Unterminated quoted scalar")
    this.index = end + 1
    return this.input.slice(start, this.index)
  }

  private readUntil(stop: RegExp): string {
    const start = this.index
    while (this.index < this.input.length && !stop.test(this.peek())) this.index++
    return this.input.slice(start, this.index)
  }

  private skipWhitespace(): void {
    while (/\s/.test(this.peek())) this.index++
  }

  private expect(character: string): void {
    if (this.peek() !== character) this.fail(`Expected '${character}'`)
    this.index++
  }

  private peek(): string {
    return this.input[this.index] ?? ""
  }

  private fail(message: string): never {
    throw new SyntaxError(`${message} at flow offset ${this.index}`)
  }
}

class YamlParser {
  private readonly lines: ReadonlyArray<Line>
  private index = 0
  private documentStarted = false
  private readonly anchors = new Map<string, unknown>()

  constructor(lines: ReadonlyArray<Line>) {
    this.lines = lines
  }

  parse(): unknown {
    this.skipIgnored()
    if (this.index >= this.lines.length) return null
    this.documentStarted = true
    const value = this.parseNode(this.lines[this.index].indent)
    this.skipIgnored()
    if (this.index < this.lines.length) {
      this.fail(this.lines[this.index], "Unexpected content")
    }
    return value
  }

  private parseNode(indent: number, parentIndent = indent - 1): unknown {
    this.skipIgnored()
    const line = this.lines[this.index]
    if (line === undefined) return null
    if (line.indent !== indent) this.fail(line, `Expected indentation of ${indent} spaces`)
    if (isSequenceEntry(line.text)) return this.parseSequence(indent)
    if (mappingSeparator(line.text) !== -1) return this.parseMapping(indent)
    this.index++
    return this.parseNodeValue(line.text, parentIndent)
  }

  private parseMapping(indent: number, output: YamlRecord = {}): YamlRecord {
    while (true) {
      this.skipIgnored()
      const line = this.lines[this.index]
      if (line === undefined || line.indent < indent) return output
      if (line.indent > indent) this.fail(line, `Unexpected indentation of ${line.indent} spaces`)
      const separator = mappingSeparator(line.text)
      if (separator === -1) return output
      this.index++
      this.parseMappingEntry(output, line.text, separator, indent, line)
    }
  }

  private parseMappingEntry(
    output: YamlRecord,
    text: string,
    separator: number,
    indent: number,
    line: Line
  ): void {
    const key = parseKey(text.slice(0, separator).trim())
    const rawValue = text.slice(separator + 1).trimStart()
    const value = this.parseNodeValue(rawValue, indent, true)
    if (hasOwn.call(output, key)) this.fail(line, `Duplicate key '${key}'`)
    setProperty(output, key, value)
  }

  private parseSequence(indent: number): Array<unknown> {
    const output: Array<unknown> = []
    while (true) {
      this.skipIgnored()
      const line = this.lines[this.index]
      if (line === undefined || line.indent < indent) return output
      if (line.indent > indent) this.fail(line, `Unexpected indentation of ${line.indent} spaces`)
      if (!isSequenceEntry(line.text)) return output
      this.index++
      const item = line.text.slice(1).trimStart()
      if (isSequenceEntry(item)) this.fail(line, "Compact nested block sequences are not supported")
      const separator = mappingSeparator(item)
      if (separator === -1) {
        output.push(this.parseNodeValue(item, indent))
      } else {
        const mapping: YamlRecord = {}
        this.parseMappingEntry(mapping, item, separator, indent + 2, line)
        output.push(this.parseMapping(indent + 2, mapping))
      }
    }
  }

  private parseNodeValue(rawValue: string, parentIndent: number, allowIndentless = false): unknown {
    const anchor = /^&([^\s,[\]{}]+)(?:\s+(.*))?$/.exec(rawValue)
    if (anchor === null) return this.parseValue(rawValue, parentIndent, allowIndentless)
    const value = this.parseValue(anchor[2] ?? "", parentIndent, allowIndentless)
    this.anchors.set(anchor[1], value)
    return value
  }

  private parseValue(value: string, parentIndent: number, allowIndentless: boolean): unknown {
    const text = value.trimEnd()
    if (text.length === 0) {
      this.skipIgnored()
      const next = this.lines[this.index]
      if (next === undefined) return null
      if (next.indent > parentIndent) return this.parseNode(next.indent, parentIndent)
      if (allowIndentless && next.indent === parentIndent && isSequenceEntry(next.text)) {
        return this.parseSequence(parentIndent)
      }
      return null
    }
    if (/^[|>](?:[1-9]?[+-]?|[+-]?[1-9]?)$/.test(text)) return this.parseBlockScalar(text, parentIndent)
    // Keep escaped trailing whitespace in quoted values.
    if (value.startsWith("\"") || value.startsWith("'")) return this.parseQuotedValue(value, parentIndent)
    if (text.startsWith("*")) {
      const name = text.slice(1).trim()
      if (!this.anchors.has(name)) throw new SyntaxError(`Unknown YAML alias '*${name}'`)
      return this.anchors.get(name)
    }
    if (text.startsWith("[") || text.startsWith("{")) return new FlowParser(text, this.anchors).parse()
    return this.parsePlainValue(text, parentIndent)
  }

  private parsePlainValue(value: string, parentIndent: number): unknown {
    const first = this.lines[this.index - 1]
    if (/:(?:\s|$)/.test(value)) this.fail(first, "Invalid colon in plain scalar")
    let output = value
    let terminated = findIndicator(first.raw, "#") !== -1
    while (!terminated) {
      const blankLines = this.skipBlankLines()
      const next = this.lines[this.index]
      if (next === undefined || next.indent <= parentIndent) break
      // Quotes in plain continuations are literal.
      const content = next.raw.slice(next.indent)
      const comment = content.search(/(?:^|[ \t])#/)
      const text = (comment === -1 ? content : content.slice(0, comment)).trimEnd()
      if (text.length === 0 || (next.indent === 0 && /^(?:---|\.\.\.)(?:\s|$)/.test(text))) break
      if (/:(?:\s|$)/.test(text)) this.fail(next, "Invalid colon in plain scalar")
      output += foldLineBreak(blankLines) + text
      this.index++
      terminated = comment !== -1
    }
    return parseScalar(output)
  }

  private parseQuotedValue(value: string, parentIndent: number): unknown {
    const quote = value[0]
    let output = quote
    let line = value.slice(1)
    while (true) {
      const end = closingQuote(line, quote, 0)
      if (end !== -1) {
        const rest = line.slice(end + 1)
        if (rest.trim().length > 0 && !/^[ \t]+#/.test(rest)) {
          throw new SyntaxError("Unexpected content after quoted YAML scalar")
        }
        return parseScalar(output + line.slice(0, end + 1))
      }
      if (quote === "\"" && endsWithEscape(line)) {
        output += line.slice(0, -1)
      } else {
        output += trimFoldedEnd(line, quote) + foldLineBreak(this.skipBlankLines())
      }
      const next = this.lines[this.index++]
      if (next === undefined) throw new SyntaxError("Unterminated quoted YAML scalar")
      if (next.raw.trim().length > 0 && next.indent <= parentIndent) {
        this.fail(next, "Invalid quoted scalar indentation")
      }
      line = next.raw.trimStart()
    }
  }

  private parseBlockScalar(indicator: string, parentIndent: number): string {
    const style = indicator[0]
    const chomp = indicator.includes("-") ? "strip" : indicator.includes("+") ? "keep" : "clip"
    const explicitIndent = Number.parseInt(indicator.replace(/[^1-9]/g, ""), 10)
    const start = this.index
    let end = start
    let contentIndent = Number.isNaN(explicitIndent) ? Number.POSITIVE_INFINITY : parentIndent + explicitIndent

    while (end < this.lines.length) {
      const line = this.lines[end]
      if (line.raw.trim().length !== 0 && line.indent <= parentIndent) break
      if (line.raw.trim().length !== 0) contentIndent = Math.min(contentIndent, line.indent)
      end++
    }
    if (contentIndent === Number.POSITIVE_INFINITY) contentIndent = parentIndent + 1

    const content: Array<string> = []
    for (let index = start; index < end; index++) {
      const line = this.lines[index]
      if (line.raw.trim().length === 0) {
        content.push("")
      } else if (line.indent < contentIndent) {
        this.fail(line, `Expected block scalar indentation of ${contentIndent} spaces`)
      } else {
        content.push(line.raw.slice(contentIndent))
      }
    }
    this.index = end

    let output = ""
    if (style === "|") {
      output = content.join("\n")
    } else {
      let blankLines = 0
      let previousMoreIndented: boolean | undefined
      for (const line of content) {
        if (line.length === 0) {
          blankLines++
        } else {
          const moreIndented = line.startsWith(" ")
          const hardBreak = moreIndented || previousMoreIndented === true
          if (previousMoreIndented === undefined) output += "\n".repeat(blankLines)
          else if (blankLines === 0) output += hardBreak ? "\n" : " "
          else output += "\n".repeat(blankLines + (hardBreak ? 1 : 0))
          output += line
          blankLines = 0
          previousMoreIndented = moreIndented
        }
      }
      output += "\n".repeat(blankLines)
    }
    if (chomp === "keep") return output.endsWith("\n") ? output : `${output}\n`
    output = output.replace(/\n+$/, "")
    return chomp === "strip" ? output : `${output}\n`
  }

  private skipBlankLines(): number {
    const start = this.index
    while (this.index < this.lines.length && this.lines[this.index].raw.trim().length === 0) this.index++
    return this.index - start
  }

  private skipIgnored(): void {
    while (this.index < this.lines.length) {
      const line = this.lines[this.index]
      const text = line.text.trimEnd()
      if (text.length === 0 || text.startsWith("%")) {
        this.index++
      } else if (line.indent === 0 && text === "---") {
        if (this.documentStarted) this.fail(line, "Multiple YAML documents are not supported")
        this.documentStarted = true
        this.index++
      } else if (line.indent === 0 && text === "...") {
        this.index++
        while (this.index < this.lines.length && this.lines[this.index].text.trimEnd().length === 0) this.index++
        if (this.index < this.lines.length) {
          this.fail(this.lines[this.index], "Multiple YAML documents are not supported")
        }
      } else {
        return
      }
    }
  }

  private fail(line: Line, message: string): never {
    throw new SyntaxError(`${message} at line ${line.number}`)
  }
}

/**
 * Parses one YAML document into JavaScript values.
 *
 * **Details**
 *
 * The core YAML 1.2 scalar schema is used, so booleans, nulls, and numbers are
 * decoded while date-like values remain strings.
 *
 * @stability unstable
 * @category decoding
 * @since 4.0.0
 */
export const parse = (input: string): unknown => {
  const source = input.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n")
  const lines = source.split("\n").map((raw, index): Line => {
    const indentation = /^( *)/.exec(raw)![1].length
    if (raw.slice(0, indentation + 1).includes("\t")) {
      throw new SyntaxError(`Tabs cannot be used for YAML indentation at line ${index + 1}`)
    }
    return {
      raw,
      text: stripComment(raw.slice(indentation)),
      indent: indentation,
      number: index + 1
    }
  })
  return new YamlParser(lines).parse()
}
