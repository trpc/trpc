import type * as Schema from "../../Schema.ts"
import * as Model from "./model.ts"

type Pattern = Schema.Annotations.ToArbitrary.Pattern

type Node = Literal | Character | Concatenation | Alternation | Repetition

interface Literal {
  readonly _tag: "Literal"
  readonly value: string
}

interface Character {
  readonly _tag: "Character"
  readonly intervals: ReadonlyArray<Interval>
  readonly preferred: readonly [ReadonlyArray<number>, ReadonlyArray<number>]
  readonly counts: readonly [number, number]
}

interface Concatenation {
  readonly _tag: "Concatenation"
  readonly nodes: ReadonlyArray<Node>
}

interface Alternation {
  readonly _tag: "Alternation"
  readonly nodes: ReadonlyArray<Node>
}

interface Repetition {
  readonly _tag: "Repetition"
  readonly node: Node
  readonly minimum: number
  readonly maximum: number | undefined
}

interface Interval {
  readonly minimum: number
  readonly maximum: number
}

/** @internal */
export interface Compiled {
  readonly minimumLength: number
  readonly generate: (
    state: Model.GenerationState,
    minimumLength: number,
    maximumLength: number
  ) => string | undefined
  readonly shrink: (value: string, minimumLength: number) => ReadonlyArray<string>
}

const empty: Literal = { _tag: "Literal", value: "" }
const maximumCodePoint = 0x10ffff
const highSurrogateMinimum = 0xd800
const lowSurrogateMaximum = 0xdfff
const digitIntervals: ReadonlyArray<Interval> = [{ minimum: 48, maximum: 57 }]
const wordIntervals: ReadonlyArray<Interval> = [
  { minimum: 48, maximum: 57 },
  { minimum: 65, maximum: 90 },
  { minimum: 95, maximum: 95 },
  { minimum: 97, maximum: 122 }
]
const whitespaceIntervals: ReadonlyArray<Interval> = [
  { minimum: 9, maximum: 13 },
  { minimum: 32, maximum: 32 },
  { minimum: 160, maximum: 160 },
  { minimum: 0x1680, maximum: 0x1680 },
  { minimum: 0x2000, maximum: 0x200a },
  { minimum: 0x2028, maximum: 0x2029 },
  { minimum: 0x202f, maximum: 0x202f },
  { minimum: 0x205f, maximum: 0x205f },
  { minimum: 0x3000, maximum: 0x3000 },
  { minimum: 0xfeff, maximum: 0xfeff }
]
const lineTerminatorIntervals: ReadonlyArray<Interval> = [
  { minimum: 10, maximum: 10 },
  { minimum: 13, maximum: 13 },
  { minimum: 0x2028, maximum: 0x2029 }
]
const codePointIntervals: ReadonlyArray<Interval> = [{ minimum: 0, maximum: maximumCodePoint }]
const printableAsciiIntervals: ReadonlyArray<Interval> = [{ minimum: 32, maximum: 126 }]
const preferredCodePoints = [
  ...globalThis.Array.from({ length: 95 }, (_, index) => index + 32),
  9,
  10,
  11,
  12,
  13,
  0,
  0x80,
  0xe9,
  0x3a9,
  0x1f600
]

function characterMetadata(intervals: ReadonlyArray<Interval>, length: number) {
  return {
    preferred: preferredCodePoints.filter((codePoint) =>
      codePointLength(codePoint) === length && codePointInIntervals(codePoint, intervals)
    ),
    count: intervals.reduce((count, interval) => count + countCodePointsInInterval(interval, length), 0)
  }
}

function character(intervals: ReadonlyArray<Interval>): Character {
  const normalized = normalizeIntervals(intervals)
  const one = characterMetadata(normalized, 1)
  const two = characterMetadata(normalized, 2)
  return {
    _tag: "Character",
    intervals: normalized,
    preferred: [one.preferred, two.preferred],
    counts: [one.count, two.count]
  }
}

function literal(value: string): Literal {
  return value.length === 0 ? empty : { _tag: "Literal", value }
}

function concatenation(nodes: ReadonlyArray<Node>): Node {
  const flattened: Array<Node> = []
  let pending = ""
  const flush = () => {
    if (pending.length === 0) return
    flattened.push(literal(pending))
    pending = ""
  }
  for (const node of nodes) {
    if (node._tag === "Literal") {
      pending += node.value
    } else if (node._tag === "Concatenation") {
      flush()
      flattened.push(...node.nodes)
    } else {
      flush()
      flattened.push(node)
    }
  }
  flush()
  return flattened.length === 0 ? empty : flattened.length === 1 ? flattened[0] : {
    _tag: "Concatenation",
    nodes: flattened
  }
}

function alternation(nodes: ReadonlyArray<Node>): Node {
  const flattened: Array<Node> = []
  for (const node of nodes) {
    if (node._tag === "Alternation") flattened.push(...node.nodes)
    else flattened.push(node)
  }
  return flattened.length === 1 ? flattened[0] : { _tag: "Alternation", nodes: flattened }
}

function normalizeIntervals(intervals: ReadonlyArray<Interval>): ReadonlyArray<Interval> {
  if (intervals.length <= 1) return intervals
  const sorted = intervals.slice().sort((a, b) => a.minimum - b.minimum || a.maximum - b.maximum)
  const out: Array<Interval> = []
  for (const interval of sorted) {
    const previous = out[out.length - 1]
    if (previous === undefined || interval.minimum > previous.maximum + 1) {
      out.push(interval)
    } else if (interval.maximum > previous.maximum) {
      out[out.length - 1] = { minimum: previous.minimum, maximum: interval.maximum }
    }
  }
  return out
}

function restrictIntervals(intervals: ReadonlyArray<Interval>, maximum: number): ReadonlyArray<Interval> {
  return intervals.flatMap((interval) =>
    interval.minimum > maximum ? [] : [{ minimum: interval.minimum, maximum: Math.min(interval.maximum, maximum) }]
  )
}

function restrictCharacterCodePoints(node: Node, maximum: number): Node {
  switch (node._tag) {
    case "Character":
      return character(restrictIntervals(node.intervals, maximum))
    case "Concatenation":
      return concatenation(node.nodes.map((child) => restrictCharacterCodePoints(child, maximum)))
    case "Alternation":
      return alternation(node.nodes.map((child) => restrictCharacterCodePoints(child, maximum)))
    case "Repetition":
      return { ...node, node: restrictCharacterCodePoints(node.node, maximum) }
    case "Literal":
      return node
  }
}

function complementIntervals(intervals: ReadonlyArray<Interval>): ReadonlyArray<Interval> {
  const normalized = normalizeIntervals(intervals)
  const out: Array<Interval> = []
  let minimum = 0
  for (const interval of normalized) {
    if (minimum < interval.minimum) out.push({ minimum, maximum: interval.minimum - 1 })
    minimum = Math.max(minimum, interval.maximum + 1)
  }
  if (minimum <= maximumCodePoint) out.push({ minimum, maximum: maximumCodePoint })
  return out
}

function codePointInIntervals(codePoint: number, intervals: ReadonlyArray<Interval>): boolean {
  for (const interval of intervals) {
    if (codePoint < interval.minimum) return false
    if (codePoint <= interval.maximum) return true
  }
  return false
}

function isSurrogate(codePoint: number): boolean {
  return codePoint >= highSurrogateMinimum && codePoint <= lowSurrogateMaximum
}

function codePointLength(codePoint: number): number {
  return codePoint > 0xffff ? 2 : 1
}

function countCodePointsInInterval(interval: Interval, length: number): number {
  const minimum = length === 1 ? interval.minimum : Math.max(interval.minimum, 0x10000)
  const maximum = length === 1 ? Math.min(interval.maximum, 0xffff) : interval.maximum
  if (minimum > maximum) return 0
  if (length === 1 && minimum <= lowSurrogateMaximum && maximum >= highSurrogateMinimum) {
    return maximum - minimum + 1 -
      (Math.min(maximum, lowSurrogateMaximum) - Math.max(minimum, highSurrogateMinimum) + 1)
  }
  return maximum - minimum + 1
}

function codePointAtOffset(interval: Interval, length: number, offset: number): number {
  let codePoint = (length === 1 ? interval.minimum : Math.max(interval.minimum, 0x10000)) + offset
  if (length === 1 && codePoint >= highSurrogateMinimum) codePoint += lowSurrogateMaximum - highSurrogateMinimum + 1
  return codePoint
}

function generateCharacter(node: Character, length: number, state: Model.GenerationState): string | undefined {
  const preferred = node.preferred[length - 1]
  if (preferred.length > 0 && Model.randomInt(state, 1, state.biasFactor) === 1) {
    return globalThis.String.fromCodePoint(preferred[Model.randomIndex(state, preferred.length)])
  }
  const count = node.counts[length - 1]
  if (count === 0) return undefined
  let offset = Model.randomInt(state, 0, count - 1)
  for (const interval of node.intervals) {
    const size = countCodePointsInInterval(interval, length)
    if (offset < size) return globalThis.String.fromCodePoint(codePointAtOffset(interval, length, offset))
    offset -= size
  }
  return undefined
}

function canonicalCharacter(node: Character, length: number): string | undefined {
  const preferred = node.preferred[length - 1][0]
  if (preferred !== undefined) return globalThis.String.fromCodePoint(preferred)
  for (const interval of node.intervals) {
    if (countCodePointsInInterval(interval, length) > 0) {
      return globalThis.String.fromCodePoint(codePointAtOffset(interval, length, 0))
    }
  }
  return undefined
}

function isDecimal(value: string | undefined): boolean {
  return value !== undefined && value >= "0" && value <= "9"
}

function isHexadecimal(value: string | undefined): boolean {
  return value !== undefined &&
    (value >= "0" && value <= "9" || value >= "a" && value <= "f" || value >= "A" && value <= "F")
}

class Parser {
  private index = 0
  private supported = true
  private readonly source: string
  private readonly dotAll: boolean

  constructor(source: string, dotAll: boolean) {
    this.source = source
    this.dotAll = dotAll
  }

  parse(): Node | undefined {
    const node = this.parseAlternation()
    return this.supported && this.index === this.source.length ? node : undefined
  }

  private parseAlternation(): Node {
    const nodes = [this.parseConcatenation()]
    while (this.peek() === "|") {
      this.index++
      nodes.push(this.parseConcatenation())
    }
    return alternation(nodes)
  }

  private parseConcatenation(): Node {
    const nodes: Array<Node> = []
    while (this.index < this.source.length && this.peek() !== ")" && this.peek() !== "|") {
      const atom = this.parseAtom()
      if (atom === undefined) {
        this.supported = false
        break
      }
      nodes.push(this.parseQuantifier(atom))
    }
    return concatenation(nodes)
  }

  private parseAtom(): Node | undefined {
    const token = this.source[this.index++]
    switch (token) {
      case "^":
      case "$":
        return empty
      case ".":
        return character(this.dotAll ? codePointIntervals : complementIntervals(lineTerminatorIntervals))
      case "[":
        return this.parseCharacterClass()
      case "(":
        return this.parseGroup()
      case "\\":
        return this.parseEscape(false)
      case "*":
      case "+":
      case "?":
      case "{":
      case ")":
        return undefined
      default:
        return literal(token)
    }
  }

  private parseGroup(): Node | undefined {
    if (this.peek() === "?") {
      this.index++
      if (this.peek() === ":") {
        this.index++
      } else if (this.peek() === "<") {
        const next = this.source[this.index + 1]
        if (next === "=" || next === "!") return undefined
        this.index++
        while (this.index < this.source.length && this.peek() !== ">") this.index++
        if (this.peek() !== ">") return undefined
        this.index++
      } else {
        return undefined
      }
    }
    const node = this.parseAlternation()
    if (this.peek() !== ")") return undefined
    this.index++
    return node
  }

  private parseQuantifier(node: Node): Node {
    const start = this.index
    let minimum: number | undefined
    let maximum: number | undefined
    switch (this.peek()) {
      case "*":
        minimum = 0
        this.index++
        break
      case "+":
        minimum = 1
        this.index++
        break
      case "?":
        minimum = 0
        maximum = 1
        this.index++
        break
      case "{": {
        this.index++
        const from = this.parseNatural()
        if (from === undefined) {
          this.index = start
          return node
        }
        minimum = from
        if (this.peek() === "}") {
          maximum = from
          this.index++
        } else if (this.peek() === ",") {
          this.index++
          maximum = this.parseNatural()
          if (this.peek() !== "}") {
            this.index = start
            return node
          }
          this.index++
        } else {
          this.index = start
          return node
        }
        break
      }
      default:
        return node
    }
    if (this.peek() === "?") this.index++
    return { _tag: "Repetition", node, minimum, maximum }
  }

  private parseNatural(): number | undefined {
    const start = this.index
    while (isDecimal(this.peek())) this.index++
    if (start === this.index) return undefined
    const value = globalThis.Number(this.source.slice(start, this.index))
    return Number.isSafeInteger(value) ? value : undefined
  }

  private parseCharacterClass(): Node | undefined {
    const negative = this.peek() === "^"
    if (negative) this.index++
    const intervals: Array<Interval> = []
    let first = true
    while (this.index < this.source.length && (this.peek() !== "]" || first)) {
      first = false
      const left = this.parseClassAtom()
      if (left === undefined) return undefined
      if (this.peek() === "-" && this.source[this.index + 1] !== "]") {
        this.index++
        const right = this.parseClassAtom()
        if (
          right === undefined || left.length !== 1 || right.length !== 1 ||
          left[0].minimum !== left[0].maximum || right[0].minimum !== right[0].maximum ||
          left[0].minimum > right[0].minimum
        ) return undefined
        intervals.push({ minimum: left[0].minimum, maximum: right[0].minimum })
      } else {
        intervals.push(...left)
      }
    }
    if (this.peek() !== "]") return undefined
    this.index++
    const normalized = normalizeIntervals(intervals)
    return character(negative ? complementIntervals(normalized) : normalized)
  }

  private parseClassAtom(): ReadonlyArray<Interval> | undefined {
    const token = this.source[this.index++]
    if (token === "\\") {
      const escaped = this.parseEscape(true)
      return escaped?._tag === "Character"
        ? escaped.intervals
        : escaped?._tag === "Literal"
        ? this.literalIntervals(escaped.value)
        : undefined
    }
    if (token === undefined) return undefined
    const codePoint = token.codePointAt(0)!
    return [{ minimum: codePoint, maximum: codePoint }]
  }

  private parseEscape(inClass: boolean): Node | undefined {
    const token = this.source[this.index++]
    switch (token) {
      case "d":
        return character(digitIntervals)
      case "D":
        return character(complementIntervals(digitIntervals))
      case "w":
        return character(wordIntervals)
      case "W":
        return character(complementIntervals(wordIntervals))
      case "s":
        return character(whitespaceIntervals)
      case "S":
        return character(complementIntervals(whitespaceIntervals))
      case "b":
        return inClass ? literal("\b") : undefined
      case "B":
        return undefined
      case "n":
        return literal("\n")
      case "r":
        return literal("\r")
      case "t":
        return literal("\t")
      case "v":
        return literal("\v")
      case "f":
        return literal("\f")
      case "0":
        return isDecimal(this.peek()) ? undefined : literal("\0")
      case "c": {
        const control = this.source[this.index++]
        if (control === undefined || !/[A-Za-z]/.test(control)) return undefined
        return literal(globalThis.String.fromCharCode(control.toUpperCase().charCodeAt(0) % 32))
      }
      case "x":
        return this.parseCodePoint(2)
      case "u":
        if (this.peek() === "{") {
          this.index++
          const start = this.index
          while (isHexadecimal(this.peek())) this.index++
          if (start === this.index || this.peek() !== "}") return undefined
          const value = Number.parseInt(this.source.slice(start, this.index), 16)
          this.index++
          return value <= maximumCodePoint && !isSurrogate(value)
            ? literal(globalThis.String.fromCodePoint(value))
            : undefined
        }
        return this.parseCodePoint(4)
      case "p":
      case "P":
      case "k":
        return undefined
      case undefined:
        return undefined
      default:
        return isDecimal(token) ? undefined : literal(token)
    }
  }

  private parseCodePoint(length: number): Node | undefined {
    const encoded = this.source.slice(this.index, this.index + length)
    if (encoded.length !== length || ![...encoded].every(isHexadecimal)) return undefined
    this.index += length
    return literal(globalThis.String.fromCharCode(Number.parseInt(encoded, 16)))
  }

  private literalIntervals(value: string): ReadonlyArray<Interval> | undefined {
    const codePoints = [...value]
    if (codePoints.length !== 1) return undefined
    const codePoint = codePoints[0].codePointAt(0)!
    return [{ minimum: codePoint, maximum: codePoint }]
  }

  private peek(): string | undefined {
    return this.source[this.index]
  }
}

type Lengths = ReadonlyArray<boolean>
type LengthCache = Map<Node, Lengths>

function emptyLengths(limit: number): Array<boolean> {
  return globalThis.Array(limit + 1).fill(false)
}

function concatenateLengths(left: Lengths, right: Lengths, limit: number): Array<boolean> {
  const out = emptyLengths(limit)
  for (let leftLength = 0; leftLength <= limit && leftLength < left.length; leftLength++) {
    if (!left[leftLength]) continue
    for (let rightLength = 0; rightLength + leftLength <= limit && rightLength < right.length; rightLength++) {
      if (right[rightLength]) out[leftLength + rightLength] = true
    }
  }
  return out
}

function repetitionLengths(node: Repetition, child: Lengths, limit: number): Array<boolean> {
  const out = emptyLengths(limit)
  const nullable = child[0] === true
  let smallestPositive = 1
  while (smallestPositive <= limit && child[smallestPositive] !== true) smallestPositive++
  const relevant = smallestPositive > limit ? 0 : Math.floor(limit / smallestPositive)
  const minimum = nullable ? 0 : node.minimum
  const maximum = Math.min(node.maximum ?? relevant, relevant)
  if (minimum > maximum) return out
  let current = emptyLengths(limit)
  current[0] = true
  for (let count = 0; count <= maximum; count++) {
    if (count >= minimum) {
      for (let length = 0; length <= limit; length++) if (current[length]) out[length] = true
    }
    if (count < maximum) current = concatenateLengths(current, child, limit)
  }
  return out
}

function possibleLengths(node: Node, limit: number, cache: LengthCache): Lengths {
  const cached = cache.get(node)
  if (cached !== undefined && cached.length > limit) return cached
  let out: Array<boolean>
  switch (node._tag) {
    case "Literal": {
      out = emptyLengths(limit)
      if (node.value.length <= limit) out[node.value.length] = true
      break
    }
    case "Character": {
      out = emptyLengths(limit)
      if (node.intervals.some((interval) => countCodePointsInInterval(interval, 1) > 0) && limit >= 1) out[1] = true
      if (node.intervals.some((interval) => countCodePointsInInterval(interval, 2) > 0) && limit >= 2) out[2] = true
      break
    }
    case "Alternation": {
      out = emptyLengths(limit)
      for (const child of node.nodes) {
        const lengths = possibleLengths(child, limit, cache)
        for (let length = 0; length <= limit; length++) if (lengths[length]) out[length] = true
      }
      break
    }
    case "Concatenation": {
      let current = emptyLengths(limit)
      current[0] = true
      for (const child of node.nodes) {
        current = concatenateLengths(current, possibleLengths(child, limit, cache), limit)
      }
      out = current
      break
    }
    case "Repetition":
      out = repetitionLengths(node, possibleLengths(node.node, limit, cache), limit)
      break
  }
  cache.set(node, out)
  return out
}

function sequenceSuffixLengths(
  nodes: ReadonlyArray<Node>,
  length: number,
  cache: LengthCache
): ReadonlyArray<Lengths> {
  const out = new Array<Lengths>(nodes.length + 1)
  const terminal = emptyLengths(length)
  terminal[0] = true
  out[nodes.length] = terminal
  for (let index = nodes.length - 1; index >= 0; index--) {
    out[index] = concatenateLengths(
      possibleLengths(nodes[index], length, cache),
      out[index + 1],
      length
    )
  }
  return out
}

function generateSequence(
  nodes: ReadonlyArray<Node>,
  length: number,
  state: Model.GenerationState,
  cache: LengthCache
): string | undefined {
  const suffixLengths = sequenceSuffixLengths(nodes, length, cache)
  let remaining = length
  let out = ""
  for (let index = 0; index < nodes.length; index++) {
    const node = nodes[index]
    const nodeLengths = possibleLengths(node, remaining, cache)
    const tailLengths = suffixLengths[index + 1]
    const candidates: Array<number> = []
    for (let nodeLength = 0; nodeLength <= remaining; nodeLength++) {
      if (nodeLengths[nodeLength] && tailLengths[remaining - nodeLength]) candidates.push(nodeLength)
    }
    if (candidates.length === 0) return undefined
    const nodeLength = candidates[Model.randomIndex(state, candidates.length)]
    const value = generateExact(node, nodeLength, state, cache)
    if (value === undefined) return undefined
    out += value
    remaining -= nodeLength
  }
  return remaining === 0 ? out : undefined
}

function repetitionCounts(node: Repetition, length: number, cache: LengthCache): ReadonlyArray<number> {
  const child = possibleLengths(node.node, length, cache)
  const nullable = child[0] === true
  let smallestPositive = 1
  while (smallestPositive <= length && child[smallestPositive] !== true) smallestPositive++
  const relevant = smallestPositive > length ? 0 : Math.floor(length / smallestPositive)
  const minimum = nullable ? 0 : node.minimum
  const maximum = Math.min(node.maximum ?? relevant, relevant)
  if (minimum > maximum) return []
  const counts: Array<number> = []
  let current = emptyLengths(length)
  current[0] = true
  for (let count = 0; count <= maximum; count++) {
    if (count >= minimum && current[length]) counts.push(count)
    if (count < maximum) current = concatenateLengths(current, child, length)
  }
  return counts
}

function generateExact(
  node: Node,
  length: number,
  state: Model.GenerationState,
  cache: LengthCache
): string | undefined {
  switch (node._tag) {
    case "Literal":
      return node.value.length === length ? node.value : undefined
    case "Character":
      return generateCharacter(node, length, state)
    case "Alternation": {
      const candidates = node.nodes.filter((child) => possibleLengths(child, length, cache)[length])
      return candidates.length === 0
        ? undefined
        : generateExact(candidates[Model.randomIndex(state, candidates.length)], length, state, cache)
    }
    case "Concatenation":
      return generateSequence(node.nodes, length, state, cache)
    case "Repetition": {
      const counts = repetitionCounts(node, length, cache)
      if (counts.length === 0) return undefined
      const count = counts[Model.randomIndex(state, counts.length)]
      return generateSequence(globalThis.Array(count).fill(node.node), length, state, cache)
    }
  }
}

function canonicalSequence(nodes: ReadonlyArray<Node>, length: number, cache: LengthCache): string | undefined {
  const suffixLengths = sequenceSuffixLengths(nodes, length, cache)
  let remaining = length
  let out = ""
  for (let index = 0; index < nodes.length; index++) {
    const node = nodes[index]
    const nodeLengths = possibleLengths(node, remaining, cache)
    const tailLengths = suffixLengths[index + 1]
    let nodeLength = 0
    while (nodeLength <= remaining && !(nodeLengths[nodeLength] && tailLengths[remaining - nodeLength])) nodeLength++
    if (nodeLength > remaining) return undefined
    const value = canonicalExact(node, nodeLength, cache)
    if (value === undefined) return undefined
    out += value
    remaining -= nodeLength
  }
  return remaining === 0 ? out : undefined
}

function canonicalExact(node: Node, length: number, cache: LengthCache): string | undefined {
  switch (node._tag) {
    case "Literal":
      return node.value.length === length ? node.value : undefined
    case "Character":
      return canonicalCharacter(node, length)
    case "Alternation": {
      const child = node.nodes.find((child) => possibleLengths(child, length, cache)[length])
      return child === undefined ? undefined : canonicalExact(child, length, cache)
    }
    case "Concatenation":
      return canonicalSequence(node.nodes, length, cache)
    case "Repetition": {
      const count = repetitionCounts(node, length, cache)[0]
      return count === undefined
        ? undefined
        : canonicalSequence(globalThis.Array(count).fill(node.node), length, cache)
    }
  }
}

function structuralShrinks(
  node: Node,
  regExp: globalThis.RegExp,
  value: string,
  minimumLength: number,
  cache: LengthCache
): ReadonlyArray<string> {
  const lengths = possibleLengths(node, value.length, cache)
  const smaller: Array<number> = []
  for (let length = minimumLength; length < value.length; length++) {
    if (lengths[length]) smaller.push(length)
  }
  const candidates: Array<number> = []
  if (smaller.length > 0) {
    candidates.push(smaller[0], smaller[Math.floor((smaller.length - 1) / 2)], smaller[smaller.length - 1])
  }
  candidates.push(value.length)
  const out: Array<string> = []
  for (const length of candidates) {
    const candidate = canonicalExact(node, length, cache)
    if (candidate !== undefined && candidate !== value && !out.includes(candidate) && test(regExp, candidate)) {
      out.push(candidate)
    }
  }
  return out
}

function minimumLength(node: Node): number {
  switch (node._tag) {
    case "Literal":
      return node.value.length
    case "Character":
      return node.intervals.length === 0 ? Number.POSITIVE_INFINITY : node.intervals[0].minimum > 0xffff ? 2 : 1
    case "Alternation":
      return Math.min(...node.nodes.map(minimumLength))
    case "Concatenation":
      return node.nodes.reduce((sum, child) => sum + minimumLength(child), 0)
    case "Repetition":
      return minimumLength(node.node) * node.minimum
  }
}

function test(regExp: RegExp, value: string): boolean {
  regExp.lastIndex = 0
  return regExp.test(value)
}

function hasTrailingAnchor(source: string): boolean {
  if (!source.endsWith("$")) return false
  let backslashes = 0
  for (let index = source.length - 2; index >= 0 && source[index] === "\\"; index--) backslashes++
  return backslashes % 2 === 0
}

function addUnanchoredSurroundings(node: Node, source: string, flags: string): Node {
  const nodes: Array<Node> = []
  const anyCharacters: Repetition = {
    _tag: "Repetition",
    node: character(printableAsciiIntervals),
    minimum: 0,
    maximum: undefined
  }
  if (!flags.includes("y") && !source.startsWith("^")) nodes.push(anyCharacters)
  nodes.push(node)
  if (!hasTrailingAnchor(source)) nodes.push(anyCharacters)
  return concatenation(nodes)
}

/**
 * The private regular-expression AST and its structural translation into generators follow the broad strategy used by
 * fast-check v4.9.0's `stringMatching` arbitrary (MIT). This implementation uses Effect's generation state and an
 * exact UTF-16 length analysis; no fast-check parser or arbitrary is included.
 * https://github.com/dubzzz/fast-check/blob/v4.9.0/packages/fast-check/src/arbitrary/stringMatching.ts
 */
/** @internal */
export function compile(pattern: Pattern): Compiled | undefined {
  const { flags, source } = pattern
  // Case folding, multiline assertions, and Unicode sets require dedicated AST semantics. Falling back preserves the
  // contract that a constructively supported pattern never silently ignores one of its flags.
  if (flags.includes("i") || flags.includes("m") || flags.includes("v")) return undefined
  const parsed = new Parser(source, flags.includes("s")).parse()
  if (parsed === undefined) return undefined
  const restricted = flags.includes("u") ? parsed : restrictCharacterCodePoints(parsed, 0xffff)
  const node = addUnanchoredSurroundings(restricted, source, flags)
  const regExp = new globalThis.RegExp(source, flags)
  const minimum = minimumLength(node)
  const cache: LengthCache = new Map()
  return {
    minimumLength: minimum,
    generate: (state, minimumLength, maximumLength) => {
      const lengths = possibleLengths(node, maximumLength, cache)
      const candidates: Array<number> = []
      for (let length = minimumLength; length <= maximumLength; length++) {
        if (lengths[length]) candidates.push(length)
      }
      if (candidates.length === 0) return undefined
      const offset = Model.randomLength(state, 0, candidates.length - 1)
      const value = generateExact(node, candidates[offset], state, cache)
      return value !== undefined && test(regExp, value) ? value : undefined
    },
    shrink: (value, minimumLength) => structuralShrinks(node, regExp, value, minimumLength, cache)
  }
}
