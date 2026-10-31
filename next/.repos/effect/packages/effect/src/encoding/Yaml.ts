/**
 * Parses YAML configuration files.
 *
 * Supports YAML 1.2 block and flow collections, indentless sequence values,
 * multiline plain and quoted scalars, block scalars, anchors, aliases, and
 * YAML 1.1 merge keys (`<<`).
 *
 * Unlike YAML 1.2, the closing bracket of a multiline flow collection may sit
 * at its parent's indentation.
 *
 * Unsupported: compact nested block sequences (`- - value` on one line),
 * multiline quoted scalars in flow collections, explicit complex keys,
 * tag/directive processing, recursive aliases, and document streams. Mapping
 * keys are JavaScript strings.
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
  readonly tabIndent: boolean
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

const isMapping = (value: unknown): value is YamlRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value)

// Explicit keys take precedence over merged keys, and earlier merge sources over later ones.
class MappingBuilder {
  readonly output: YamlRecord = {}
  // Keys added by the merge key, which an explicit key may still override.
  private merged: Set<string> | undefined

  set(key: string, value: unknown, fail: (message: string) => never): void {
    if (hasOwn.call(this.output, key) && !this.merged?.delete(key)) fail(`Duplicate key '${key}'`)
    setProperty(this.output, key, value)
  }

  merge(value: unknown, fail: (message: string) => never): void {
    if (this.merged !== undefined) fail("Duplicate key '<<'")
    this.merged = new Set()
    for (const source of Array.isArray(value) ? value : [value]) {
      if (!isMapping(source)) fail("Merge key values must be mappings")
      for (const key of Object.keys(source)) {
        if (hasOwn.call(this.output, key)) continue
        setProperty(this.output, key, source[key])
        this.merged.add(key)
      }
    }
  }
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

// `depth` is the number of flow collections already open before `input`.
const findIndicator = (input: string, indicator: ":" | "#", depth = 0): number => {
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

const stripComment = (input: string, depth = 0): string => {
  const index = findIndicator(input, "#", depth)
  return index === -1 ? input : input.slice(0, index).trimEnd()
}

const mappingSeparator = (input: string): number => findIndicator(input, ":")

const isSequenceEntry = (text: string): boolean => text === "-" || text.startsWith("- ")

const foldLineBreak = (blankLines: number): string => blankLines === 0 ? " " : "\n".repeat(blankLines)

// Folds the line breaks of a multiline plain flow scalar.
const foldFlowLines = (input: string): string =>
  input.replace(
    /[ \t]*\n((?:[ \t]*\n)*)[ \t]*/g,
    (_, blankLines: string) => foldLineBreak(blankLines.split("\n").length - 1)
  )

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
  private input: string
  private readonly anchors: Map<string, unknown>
  private readonly nextLine: (depth: number) => string | undefined
  private index = 0
  private depth = 0

  constructor(input: string, anchors: Map<string, unknown>, nextLine: (depth: number) => string | undefined) {
    this.input = input
    this.anchors = anchors
    this.nextLine = nextLine
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
    if (character === "[" || character === "{") {
      this.depth++
      const collection = character === "[" ? this.parseSequence() : this.parseMapping()
      this.depth--
      return collection
    }
    if (character === "\"" || character === "'") return parseScalar(this.readQuoted(character))
    if (character === "*") {
      this.index++
      const name = this.readUntil(/[,\]}\s]/)
      if (!this.anchors.has(name)) this.fail(`Unknown alias '*${name}'`)
      return this.anchors.get(name)
    }
    if (character === "&") {
      this.index++
      const name = this.readUntil(/[\s,[\]{}]/)
      if (name === "" || /[[{]/.test(this.peek())) this.fail("Invalid anchor")
      this.skipWhitespace()
      if (this.peek() === "&") this.fail("Multiple anchors on one node")
      const value = this.parseValue()
      this.anchors.set(name, value)
      return value
    }
    return parseScalar(foldFlowLines(this.readUntil(/[,\]}]/)).trim())
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
    const mapping = new MappingBuilder()
    const fail = (message: string) => this.fail(message)
    this.skipWhitespace()
    if (this.peek() === "}") {
      this.index++
      return mapping.output
    }
    while (true) {
      this.skipWhitespace()
      const quoted = this.peek() === "\"" || this.peek() === "'"
      const key = this.parseKey()
      this.skipWhitespace()
      this.expect(":")
      if (!quoted && key === "<<") mapping.merge(this.parseValue(), fail)
      else mapping.set(key, this.parseValue(), fail)
      this.skipWhitespace()
      if (this.peek() === "}") {
        this.index++
        return mapping.output
      }
      this.expect(",")
      this.skipWhitespace()
      if (this.peek() === "}") {
        this.index++
        return mapping.output
      }
    }
  }

  private parseKey(): string {
    this.skipWhitespace()
    const character = this.peek()
    if (character === "\"" || character === "'") {
      return parseKey(this.readQuoted(character))
    }
    return foldFlowLines(this.readUntil(/:/)).trim()
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
    while (!stop.test(this.peek()) && this.index < this.input.length) this.index++
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
    // Inside a collection, the end of the line continues on the next line.
    if (this.index === this.input.length && this.depth > 0) {
      const line = this.nextLine(this.depth)
      if (line !== undefined) this.input += `\n${line}`
    }
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

  private parseMapping(indent: number, mapping = new MappingBuilder()): YamlRecord {
    while (true) {
      this.skipIgnored()
      const line = this.lines[this.index]
      if (line === undefined || line.indent < indent) return mapping.output
      if (line.indent > indent) this.fail(line, `Unexpected indentation of ${line.indent} spaces`)
      const separator = mappingSeparator(line.text)
      if (separator === -1) return mapping.output
      this.index++
      this.parseMappingEntry(mapping, line.text, separator, indent, line)
    }
  }

  private parseMappingEntry(
    mapping: MappingBuilder,
    text: string,
    separator: number,
    indent: number,
    line: Line
  ): void {
    const rawKey = text.slice(0, separator).trim()
    const rawValue = text.slice(separator + 1).trimStart()
    const value = this.parseNodeValue(rawValue, indent, true)
    const fail = (message: string) => this.fail(line, message)
    if (rawKey === "<<") mapping.merge(value, fail)
    else mapping.set(parseKey(rawKey), value, fail)
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
        // The mapping is indented to its first key, which may sit more than one space after the dash.
        const keyOffset = line.text.length - item.length
        if (line.text.slice(1, keyOffset).includes("\t")) this.fail(line, "Tabs cannot be used for YAML indentation")
        const mappingIndent = indent + keyOffset
        const mapping = new MappingBuilder()
        this.parseMappingEntry(mapping, item, separator, mappingIndent, line)
        output.push(this.parseMapping(mappingIndent, mapping))
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
    if (text.startsWith("[") || text.startsWith("{")) return this.parseFlowValue(text, parentIndent)
    return this.parsePlainValue(text, parentIndent)
  }

  private parseFlowValue(text: string, parentIndent: number): unknown {
    return new FlowParser(text, this.anchors, (depth) => {
      const next = this.lines[this.index]
      if (next === undefined || (next.indent === 0 && /^(?:---|\.\.\.)(?:\s|$)/.test(next.text))) return undefined
      // Continuation lines are more indented than the parent; a closing bracket may sit at its indentation.
      const content = next.text.trim().length > 0
      if (content && next.indent < parentIndent) return undefined
      if (content && next.indent === parentIndent && !/^[\]}]/.test(next.text)) return undefined
      this.index++
      // Strip comments again knowing the open collections, so quoted `#` after a comma is kept.
      return stripComment(next.raw.slice(next.indent), depth)
    }).parse()
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
      this.rejectTabIndent(next)
      // Quotes in plain continuations are literal.
      const content = next.raw.slice(next.indent)
      const comment = content.search(/(?:^|[ \t])#/)
      const text = (comment === -1 ? content : content.slice(0, comment)).trimEnd()
      if (text.length === 0 || (next.indent === 0 && /^(?:---|\.\.\.)(?:\s|$)/.test(text))) break
      if (/:(?:\s|$)/.test(text)) this.fail(next, "Invalid colon in plain scalar")
      this.rejectTabIndentedBlankLines(blankLines, parentIndent)
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
        const blankLines = this.skipBlankLines()
        this.rejectTabIndentedBlankLines(blankLines, parentIndent)
        output += trimFoldedEnd(line, quote) + foldLineBreak(blankLines)
      }
      const next = this.lines[this.index++]
      if (next === undefined) throw new SyntaxError("Unterminated quoted YAML scalar")
      this.rejectTabIndent(next)
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
    let contentIndent = Number.isNaN(explicitIndent) ? undefined : parentIndent + explicitIndent
    let hasContent = false

    while (end < this.lines.length) {
      const line = this.lines[end]
      // Only spaces make a line empty; a tab after the indentation is content.
      if (/[^ ]/.test(line.raw)) {
        if (contentIndent === undefined && line.indent > parentIndent) {
          // The first non-empty line sets the indentation, which no leading empty line may exceed.
          const deeper = this.lines.slice(start, end).find((empty) => empty.indent > line.indent)
          if (deeper !== undefined) {
            this.fail(deeper, "Leading empty lines cannot be more indented than the block scalar content")
          }
          contentIndent = line.indent
        }
        if (contentIndent !== undefined && line.indent >= contentIndent) {
          hasContent = true
        } else {
          this.rejectTabIndent(line)
          // A less indented line or comment ends the scalar.
          if (line.indent <= parentIndent || line.text.length === 0) break
          this.fail(line, `Expected block scalar indentation of ${contentIndent} spaces`)
        }
      }
      end++
    }

    // Whitespace past the indentation is content only once the scalar has a content line.
    const content = this.lines.slice(start, end).map((line) => hasContent ? line.raw.slice(contentIndent) : "")
    this.index = end

    let contentEnd = content.length
    while (contentEnd > 0 && content[contentEnd - 1].length === 0) contentEnd--
    const trailingBreaks = Math.max(0, content.length - contentEnd - (end === this.lines.length ? 1 : 0)) +
      (contentEnd > 0 && start + contentEnd < this.lines.length ? 1 : 0)
    content.length = contentEnd

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
          const moreIndented = line.startsWith(" ") || line.startsWith("\t")
          const hardBreak = moreIndented || previousMoreIndented === true
          if (previousMoreIndented === undefined) output += "\n".repeat(blankLines)
          else if (blankLines === 0) output += hardBreak ? "\n" : " "
          else output += "\n".repeat(blankLines + (hardBreak ? 1 : 0))
          output += line
          blankLines = 0
          previousMoreIndented = moreIndented
        }
      }
    }
    if (chomp === "keep") return output + "\n".repeat(trailingBreaks)
    return chomp === "clip" && contentEnd > 0 && trailingBreaks > 0 ? `${output}\n` : output
  }

  private rejectTabIndent(line: Line): void {
    if (line.tabIndent) this.fail(line, "Tabs cannot be used for YAML indentation")
  }

  private rejectTabIndentedBlankLines(count: number, parentIndent: number): void {
    for (let index = this.index - count; index < this.index; index++) {
      const line = this.lines[index]
      if (line.indent <= parentIndent) this.rejectTabIndent(line)
    }
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
        this.rejectTabIndent(line)
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
 * YAML 1.1 merge keys are always enabled. An unquoted `<<` key merges a
 * mapping, or a sequence of mappings, into the enclosing mapping. Explicit
 * keys take precedence over merged keys, earlier merge sources over later
 * ones, and a mapping may contain only one merge key. Quote the key (`"<<"`)
 * to keep it as an ordinary key.
 *
 * @stability unstable
 * @category decoding
 * @since 4.0.0
 */
export const parse = (input: string): unknown => {
  const source = input.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n")
  const lines = source.split("\n").map((raw, index): Line => {
    const indentation = /^( *)/.exec(raw)![1].length
    return {
      raw,
      text: stripComment(raw.slice(indentation)),
      indent: indentation,
      number: index + 1,
      // Rejected where the line is read as structure; block scalar content may hold tabs.
      tabIndent: raw[indentation] === "\t"
    }
  })
  return new YamlParser(lines).parse()
}
