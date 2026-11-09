// Raw deflate (RFC 1951) decoder for `effect/encoding/Zip`. It reads one
// stream from a `ByteQueue` without taking a byte past the stream's end, so the
// container decoder can find what follows.

/** @internal */
export class ByteQueue {
  private chunks: Array<Uint8Array | undefined> = []
  private head = 0
  private offset = 0
  length = 0
  consumed = 0

  push(chunk: Uint8Array): void {
    if (chunk.length === 0) return
    // Compacting once half the slots are free keeps copying linear
    if (this.head >= 1024 && this.head * 2 >= this.chunks.length) {
      this.chunks = this.chunks.slice(this.head)
      this.head = 0
    }
    this.chunks.push(chunk)
    this.length += chunk.length
  }

  // Frees the slot of the first chunk, so that `unread` can fill it
  private advance(): void {
    this.chunks[this.head++] = undefined
    this.offset = 0
    if (this.head === this.chunks.length) {
      this.chunks = []
      this.head = 0
    }
  }

  takeSome(max: number): Uint8Array {
    const chunk = this.chunks[this.head]!
    const available = chunk.length - this.offset
    if (max < available) {
      const out = chunk.subarray(this.offset, this.offset + max)
      this.offset += max
      this.length -= max
      this.consumed += max
      return out
    }
    const out = this.offset === 0 ? chunk : chunk.subarray(this.offset)
    this.length -= available
    this.consumed += available
    this.advance()
    return out
  }

  // Takes exactly `n` bytes; the queue must hold at least `n`
  take(n: number): Uint8Array {
    if (n === 0) return emptyBody
    const first = this.takeSome(n)
    if (first.length === n) return first
    const out = new Uint8Array(n)
    out.set(first)
    let filled = first.length
    while (filled < n) {
      const part = this.takeSome(n - filled)
      out.set(part, filled)
      filled += part.length
    }
    return out
  }

  // Copies the first `n` bytes without consuming them; the queue must hold at least `n`
  peek(n: number): Uint8Array {
    const out = new Uint8Array(n)
    let filled = 0
    let index = this.head
    let offset = this.offset
    while (filled < n) {
      const chunk = this.chunks[index++]!
      const part = chunk.subarray(offset, offset + n - filled)
      out.set(part, filled)
      filled += part.length
      offset = 0
    }
    return out
  }

  skip(n: number): void {
    while (n > 0) n -= this.takeSome(n).length
  }

  // Puts back the tail of the chunk that the last `takeSome` returned whole
  unread(bytes: Uint8Array): void {
    if (bytes.length === 0) return
    if (this.head > 0) this.chunks[--this.head] = bytes
    else this.chunks.unshift(bytes)
    this.length += bytes.length
    this.consumed -= bytes.length
  }

  clear(): void {
    this.chunks = []
    this.head = 0
    this.offset = 0
    this.length = 0
  }
}

/**
 * Returned when the buffered input is not enough to continue.
 *
 * @internal
 */
export const NeedInput: unique symbol = Symbol("effect/encoding/Zip/NeedInput")

const emptyBody = new Uint8Array(0)

/**
 * Thrown by `Inflater` on corrupt deflate data; the caller maps it to its own
 * error type.
 *
 * @internal
 */
export class InflateError extends Error {
  readonly _tag = "InflateError"
}

const inflateError = (message: string) => new InflateError(message)

const OUTPUT_SIZE = 64 * 1024
const WINDOW_SIZE = 32 * 1024
const INFLATE_BUFFER_SIZE = WINDOW_SIZE + OUTPUT_SIZE

// Shorter matches are copied faster by a loop than by `copyWithin`
const COPY_WITHIN_LENGTH = 32

// The fast path needs room for the longest match, and leaves the buffer short
// of full
const FAST_OUTPUT_END = INFLATE_BUFFER_SIZE - 258

// Extra bits of the length codes 257 to 285 and of the distance codes, and the
// base values that they are added to (RFC 1951, section 3.2.5)
const LENGTH_EXTRA = Array.from({ length: 29 }, (_, i) => i < 8 || i === 28 ? 0 : (i >> 2) - 1)
const DISTANCE_EXTRA = Array.from({ length: 30 }, (_, i) => i < 2 ? 0 : (i >> 1) - 1)

const bases = (first: number, extra: ReadonlyArray<number>): Array<number> => {
  let base = first
  return extra.map((bits) => {
    const value = base
    base += 1 << bits
    return value
  })
}

// The last length code is 258, not the 259 that its predecessor would give
const LENGTH_BASE = [...bases(3, LENGTH_EXTRA.slice(0, 28)), 258]
const DISTANCE_BASE = bases(1, DISTANCE_EXTRA)

const CODE_LENGTH_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]

// `table` decodes codes of up to `bits` bits in one lookup on the next input
// bits. Entries hold `symbol << 4 | length`, zero for unused codes, or LONG for
// prefixes of longer codes, which `decodeLong` reads bit by bit from `counts`
// and `symbols`. This caps a table at 2^PRIMARY_BITS entries.
interface Huffman {
  readonly table: Int32Array
  bits: number
  mask: number
  readonly counts: Uint16Array
  readonly symbols: Uint16Array
}

const PRIMARY_BITS = 10
const LONG = -1

const makeHuffman = (): Huffman => ({
  table: new Int32Array(1 << PRIMARY_BITS),
  bits: 0,
  mask: 0,
  counts: new Uint16Array(16),
  symbols: new Uint16Array(288)
})

// Each byte with its bits in reverse order, as deflate stores codes
const REVERSED_BYTES = (() => {
  const table = new Uint8Array(256)
  for (let i = 0; i < 256; i++) {
    let reversed = 0
    for (let bit = 0; bit < 8; bit++) reversed |= ((i >>> bit) & 1) << (7 - bit)
    table[i] = reversed
  }
  return table
})()

// Scratch space of `huffman`, which returns before any other call can use it
const nextCodes = new Uint16Array(16)
const offsets = new Uint16Array(16)

// Builds the code of the symbols with lengths `lengths[start..end)` into the
// arrays of `codes`. As in zlib, code length codes must be complete, and other
// codes may only be incomplete when they have a single code of one bit or no
// codes at all.
const huffman = (codes: Huffman, lengths: Uint8Array, start: number, end: number, complete: boolean): Huffman => {
  const { counts, symbols, table } = codes
  counts.fill(0)
  let maxLength = 0
  for (let i = start; i < end; i++) {
    counts[lengths[i]]++
    if (lengths[i] > maxLength) maxLength = lengths[i]
  }
  counts[0] = 0
  let left = 1
  for (let length = 1; length <= 15; length++) {
    left = (left << 1) - counts[length]
    if (left < 0) throw inflateError("over-subscribed Huffman code")
  }
  if (left > 0 && maxLength > 0 && (complete || maxLength !== 1)) throw inflateError("incomplete Huffman code")
  offsets[1] = 0
  for (let length = 1, code = 0; length <= 15; length++) {
    code = (code + counts[length - 1]) << 1
    nextCodes[length] = code
    if (length < 15) offsets[length + 1] = offsets[length] + counts[length]
  }
  const bits = Math.min(Math.max(maxLength, 1), PRIMARY_BITS)
  const size = 1 << bits
  // Unused codes read as zero
  table.fill(0, 0, size)
  for (let symbol = 0; symbol < end - start; symbol++) {
    const length = lengths[start + symbol]
    if (length === 0) continue
    symbols[offsets[length]++] = symbol
    const code = nextCodes[length]++
    const reversed = ((REVERSED_BYTES[code & 0xff] << 8) | REVERSED_BYTES[code >>> 8]) >>> (16 - length)
    if (length > bits) {
      table[reversed & (size - 1)] = LONG
      continue
    }
    const entry = (symbol << 4) | length
    for (let i = reversed; i < size; i += 1 << length) table[i] = entry
  }
  codes.bits = bits
  codes.mask = size - 1
  return codes
}

// Returns the table entry of the code in the low `bitCount` bits of
// `bitBuffer`, LONG when the code needs more bits, or zero when no code matches
const decodeLong = (codes: Huffman, bitBuffer: number, bitCount: number): number => {
  let code = 0
  let first = 0
  let index = 0
  for (let length = 1; length <= 15; length++) {
    if (length > bitCount) return LONG
    code |= (bitBuffer >>> (length - 1)) & 1
    const count = codes.counts[length]
    if (code - count < first) return (codes.symbols[index + code - first] << 4) | length
    index += count
    first = (first + count) << 1
    code <<= 1
  }
  return 0
}

const FIXED_LITERALS = (() => {
  const lengths = new Uint8Array(288)
  lengths.fill(8, 0, 144)
  lengths.fill(9, 144, 256)
  lengths.fill(7, 256, 280)
  lengths.fill(8, 280, 288)
  return huffman(makeHuffman(), lengths, 0, 288, false)
})()

// Distance codes 30 and 31 complete the fixed code but are invalid
const FIXED_DISTANCES = huffman(makeHuffman(), new Uint8Array(32).fill(5), 0, 32, false)

/**
 * Inflater arrays, reused across a decoder's entries as only one inflates at a time.
 *
 * @internal
 */
export class InflateMemory {
  // The window of earlier output, followed by up to OUTPUT_SIZE bytes of new output
  readonly buffer = new Uint8Array(INFLATE_BUFFER_SIZE)
  readonly codeLengths = new Uint8Array(19)
  readonly lengthCodes = makeHuffman()
  readonly lengths = new Uint8Array(286 + 30)
  readonly literals = makeHuffman()
  readonly distances = makeHuffman()
}

/**
 * Decompresses one deflate (RFC 1951) stream from the queue, reading no byte
 * past its end.
 *
 * @internal
 */
export class Inflater {
  private readonly memory: InflateMemory
  // Start of the output not handed out yet
  private start = WINDOW_SIZE
  private readonly generator: Generator<number, number, void>

  constructor(queue: ByteQueue, memory: InflateMemory) {
    this.memory = memory
    this.generator = this.run(queue)
  }

  // Returns decompressed bytes, `NeedInput`, or `undefined` once the stream has ended
  pull(): Uint8Array | undefined | typeof NeedInput {
    const start = this.start
    // A finished generator returns `undefined` from later calls
    const { done, value: end = start } = this.generator.next()
    if (end === start) return done ? undefined : NeedInput
    const { buffer } = this.memory
    const out = buffer.slice(start, end)
    if (end === INFLATE_BUFFER_SIZE) {
      // Keep the last output as the window
      buffer.copyWithin(0, OUTPUT_SIZE)
      this.start = WINDOW_SIZE
    } else {
      this.start = end
    }
    return out
  }

  // Yields the output position when the queue is empty or the buffer is full,
  // and returns it at the end. Output follows the window, so matches copy
  // within the buffer. A new chunk is only taken when every held bit is
  // needed, so held whole bytes always belong to the current chunk and can be
  // given back before stored blocks and at the end.
  private *run(queue: ByteQueue): Generator<number, number, void> {
    const { buffer } = this.memory
    let position = WINDOW_SIZE
    // Matches cannot reach before this index: until the buffer is first full,
    // the window holds no output of this stream
    let floor = WINDOW_SIZE
    // The chunk being read; what is left of it goes back to the queue at the end
    let input: Uint8Array = emptyBody
    let inputPosition = 0
    let bitBuffer = 0
    let bitCount = 0
    let final = 0
    do {
      while (bitCount < 3) {
        if (inputPosition === input.length) {
          if (queue.length === 0) {
            yield position
            continue
          }
          input = queue.takeSome(queue.length)
          inputPosition = 0
        }
        bitBuffer |= input[inputPosition++] << bitCount
        bitCount += 8
      }
      final = bitBuffer & 1
      const type = (bitBuffer >>> 1) & 3
      bitBuffer >>>= 3
      bitCount -= 3
      if (type === 0) {
        // Stored block: drop the bits up to the byte boundary, then read the
        // length and its complement
        inputPosition -= bitCount >>> 3
        bitBuffer = 0
        bitCount = 0
        while (bitCount < 32) {
          if (inputPosition === input.length) {
            if (queue.length === 0) {
              yield position
              continue
            }
            input = queue.takeSome(queue.length)
            inputPosition = 0
          }
          bitBuffer |= input[inputPosition++] << bitCount
          bitCount += 8
        }
        const length = bitBuffer & 0xffff
        if (length !== (~bitBuffer >>> 16)) throw inflateError("stored block length is corrupt")
        bitBuffer = 0
        bitCount = 0
        let left = length
        while (left > 0) {
          if (inputPosition === input.length) {
            if (queue.length === 0) {
              yield position
              continue
            }
            input = queue.takeSome(queue.length)
            inputPosition = 0
          }
          const n = Math.min(left, input.length - inputPosition, INFLATE_BUFFER_SIZE - position)
          buffer.set(input.subarray(inputPosition, inputPosition + n), position)
          inputPosition += n
          position += n
          left -= n
          if (position === INFLATE_BUFFER_SIZE) {
            yield position
            position = WINDOW_SIZE
            floor = 0
          }
        }
        continue
      }
      let literals: Huffman
      let distances: Huffman
      if (type === 1) {
        literals = FIXED_LITERALS
        distances = FIXED_DISTANCES
      } else if (type === 2) {
        while (bitCount < 14) {
          if (inputPosition === input.length) {
            if (queue.length === 0) {
              yield position
              continue
            }
            input = queue.takeSome(queue.length)
            inputPosition = 0
          }
          bitBuffer |= input[inputPosition++] << bitCount
          bitCount += 8
        }
        const literalCount = (bitBuffer & 31) + 257
        const distanceCount = ((bitBuffer >>> 5) & 31) + 1
        const codeLengthCount = ((bitBuffer >>> 10) & 15) + 4
        bitBuffer >>>= 14
        bitCount -= 14
        if (literalCount > 286 || distanceCount > 30) throw inflateError("too many length or distance codes")
        const codeLengths = this.memory.codeLengths.fill(0)
        for (let i = 0; i < codeLengthCount; i++) {
          while (bitCount < 3) {
            if (inputPosition === input.length) {
              if (queue.length === 0) {
                yield position
                continue
              }
              input = queue.takeSome(queue.length)
              inputPosition = 0
            }
            bitBuffer |= input[inputPosition++] << bitCount
            bitCount += 8
          }
          codeLengths[CODE_LENGTH_ORDER[i]] = bitBuffer & 7
          bitBuffer >>>= 3
          bitCount -= 3
        }
        const lengthCodes = huffman(this.memory.lengthCodes, codeLengths, 0, 19, true)
        const lengths = this.memory.lengths
        const count = literalCount + distanceCount
        let i = 0
        while (i < count) {
          let entry = 0
          while (true) {
            entry = lengthCodes.table[bitBuffer & lengthCodes.mask]
            const length = entry & 15
            if (length !== 0 && length <= bitCount) break
            if (bitCount >= lengthCodes.bits) throw inflateError("invalid code length code")
            if (inputPosition === input.length) {
              if (queue.length === 0) {
                yield position
                continue
              }
              input = queue.takeSome(queue.length)
              inputPosition = 0
            }
            bitBuffer |= input[inputPosition++] << bitCount
            bitCount += 8
          }
          bitBuffer >>>= entry & 15
          bitCount -= entry & 15
          const symbol = entry >>> 4
          if (symbol < 16) {
            lengths[i++] = symbol
            continue
          }
          const extra = symbol === 16 ? 2 : symbol === 17 ? 3 : 7
          while (bitCount < extra) {
            if (inputPosition === input.length) {
              if (queue.length === 0) {
                yield position
                continue
              }
              input = queue.takeSome(queue.length)
              inputPosition = 0
            }
            bitBuffer |= input[inputPosition++] << bitCount
            bitCount += 8
          }
          const repeat = (symbol === 18 ? 11 : 3) + (bitBuffer & ((1 << extra) - 1))
          bitBuffer >>>= extra
          bitCount -= extra
          if (symbol === 16 && i === 0) throw inflateError("repeated code length without a previous length")
          if (i + repeat > count) throw inflateError("too many code lengths")
          lengths.fill(symbol === 16 ? lengths[i - 1] : 0, i, i + repeat)
          i += repeat
        }
        if (lengths[256] === 0) throw inflateError("missing end-of-block code")
        literals = huffman(this.memory.literals, lengths, 0, literalCount, false)
        distances = huffman(this.memory.distances, lengths, literalCount, count, false)
      } else {
        throw inflateError("invalid block type")
      }
      const literalTable = literals.table
      const literalMask = literals.mask
      const literalBits = literals.bits
      const distanceTable = distances.table
      const distanceMask = distances.mask
      const distanceBits = distances.bits
      symbols: while (true) {
        // Fast path: a symbol with its extra bits and distance takes at most 8
        // input bytes and writes at most 258, so no bounds checks are needed.
        // It reads only from the current chunk, and stops before the buffer
        // fills, which the slow path handles.
        const fastInputEnd = input.length - 8
        while (inputPosition <= fastInputEnd && position < FAST_OUTPUT_END) {
          if (bitCount < 15) {
            bitBuffer |= (input[inputPosition] | (input[inputPosition + 1] << 8)) << bitCount
            inputPosition += 2
            bitCount += 16
          }
          let entry = literalTable[bitBuffer & literalMask]
          // With 15 bits held, a long code is complete or invalid
          if (entry === LONG) entry = decodeLong(literals, bitBuffer, bitCount)
          if (entry === 0) throw inflateError("invalid literal or length code")
          bitBuffer >>>= entry & 15
          bitCount -= entry & 15
          const symbol = entry >>> 4
          if (symbol < 256) {
            buffer[position++] = symbol
            continue
          }
          if (symbol === 256) break symbols
          const lengthIndex = symbol - 257
          if (lengthIndex >= 29) throw inflateError("invalid length code")
          if (bitCount < 15) {
            bitBuffer |= (input[inputPosition] | (input[inputPosition + 1] << 8)) << bitCount
            inputPosition += 2
            bitCount += 16
          }
          const lengthExtra = LENGTH_EXTRA[lengthIndex]
          const length = LENGTH_BASE[lengthIndex] + (bitBuffer & ((1 << lengthExtra) - 1))
          bitBuffer >>>= lengthExtra
          bitCount -= lengthExtra
          if (bitCount < 15) {
            bitBuffer |= (input[inputPosition] | (input[inputPosition + 1] << 8)) << bitCount
            inputPosition += 2
            bitCount += 16
          }
          entry = distanceTable[bitBuffer & distanceMask]
          if (entry === LONG) entry = decodeLong(distances, bitBuffer, bitCount)
          if (entry === 0) throw inflateError("invalid distance code")
          bitBuffer >>>= entry & 15
          bitCount -= entry & 15
          const distanceIndex = entry >>> 4
          if (distanceIndex >= 30) throw inflateError("invalid distance code")
          if (bitCount < 13) {
            bitBuffer |= (input[inputPosition] | (input[inputPosition + 1] << 8)) << bitCount
            inputPosition += 2
            bitCount += 16
          }
          const distanceExtra = DISTANCE_EXTRA[distanceIndex]
          const distance = DISTANCE_BASE[distanceIndex] + (bitBuffer & ((1 << distanceExtra) - 1))
          bitBuffer >>>= distanceExtra
          bitCount -= distanceExtra
          if (distance > position - floor) throw inflateError("distance is beyond the start of the data")
          let from = position - distance
          const end = position + length
          if (length < COPY_WITHIN_LENGTH) {
            // Every match has at least three bytes
            buffer[position] = buffer[from]
            buffer[position + 1] = buffer[from + 1]
            buffer[position + 2] = buffer[from + 2]
            position += 3
            from += 3
            while (position < end) buffer[position++] = buffer[from++]
          } else if (distance === 1) {
            buffer.fill(buffer[from], position, end)
            position = end
          } else {
            // A match can repeat the bytes it writes, so copy at most what is
            // already written, which doubles each time
            while (position < end) {
              const n = Math.min(position - from, end - position)
              buffer.copyWithin(position, from, from + n)
              position += n
            }
          }
        }
        let entry = 0
        while (true) {
          entry = literalTable[bitBuffer & literalMask]
          if (entry > 0 && (entry & 15) <= bitCount) break
          if (bitCount >= literalBits) {
            if (entry === LONG) entry = decodeLong(literals, bitBuffer, bitCount)
            if (entry !== LONG) break
          }
          // A longer code means fewer than 15 bits are held, so two bytes fit
          if (inputPosition === input.length) {
            if (queue.length === 0) {
              yield position
              continue
            }
            input = queue.takeSome(queue.length)
            inputPosition = 0
          } else if (inputPosition + 1 < input.length) {
            bitBuffer |= (input[inputPosition] | (input[inputPosition + 1] << 8)) << bitCount
            inputPosition += 2
            bitCount += 16
            continue
          }
          bitBuffer |= input[inputPosition++] << bitCount
          bitCount += 8
        }
        if (entry === 0) throw inflateError("invalid literal or length code")
        bitBuffer >>>= entry & 15
        bitCount -= entry & 15
        const symbol = entry >>> 4
        if (symbol < 256) {
          buffer[position++] = symbol
          if (position === INFLATE_BUFFER_SIZE) {
            yield position
            position = WINDOW_SIZE
            floor = 0
          }
          continue
        }
        if (symbol === 256) break
        const lengthIndex = symbol - 257
        if (lengthIndex >= 29) throw inflateError("invalid length code")
        let length = LENGTH_BASE[lengthIndex]
        const lengthExtra = LENGTH_EXTRA[lengthIndex]
        if (lengthExtra > 0) {
          while (bitCount < lengthExtra) {
            if (inputPosition === input.length) {
              if (queue.length === 0) {
                yield position
                continue
              }
              input = queue.takeSome(queue.length)
              inputPosition = 0
            }
            bitBuffer |= input[inputPosition++] << bitCount
            bitCount += 8
          }
          length += bitBuffer & ((1 << lengthExtra) - 1)
          bitBuffer >>>= lengthExtra
          bitCount -= lengthExtra
        }
        while (true) {
          entry = distanceTable[bitBuffer & distanceMask]
          if (entry > 0 && (entry & 15) <= bitCount) break
          if (bitCount >= distanceBits) {
            if (entry === LONG) entry = decodeLong(distances, bitBuffer, bitCount)
            if (entry !== LONG) break
          }
          // A longer code means fewer than 15 bits are held, so two bytes fit
          if (inputPosition === input.length) {
            if (queue.length === 0) {
              yield position
              continue
            }
            input = queue.takeSome(queue.length)
            inputPosition = 0
          } else if (inputPosition + 1 < input.length) {
            bitBuffer |= (input[inputPosition] | (input[inputPosition + 1] << 8)) << bitCount
            inputPosition += 2
            bitCount += 16
            continue
          }
          bitBuffer |= input[inputPosition++] << bitCount
          bitCount += 8
        }
        if (entry === 0) throw inflateError("invalid distance code")
        bitBuffer >>>= entry & 15
        bitCount -= entry & 15
        const distanceIndex = entry >>> 4
        if (distanceIndex >= 30) throw inflateError("invalid distance code")
        let distance = DISTANCE_BASE[distanceIndex]
        const distanceExtra = DISTANCE_EXTRA[distanceIndex]
        if (distanceExtra > 0) {
          while (bitCount < distanceExtra) {
            if (inputPosition === input.length) {
              if (queue.length === 0) {
                yield position
                continue
              }
              input = queue.takeSome(queue.length)
              inputPosition = 0
            }
            bitBuffer |= input[inputPosition++] << bitCount
            bitCount += 8
          }
          distance += bitBuffer & ((1 << distanceExtra) - 1)
          bitBuffer >>>= distanceExtra
          bitCount -= distanceExtra
        }
        if (distance > position - floor) throw inflateError("distance is beyond the start of the data")
        while (length > 0) {
          const end = Math.min(position + length, INFLATE_BUFFER_SIZE)
          length -= end - position
          // One byte at a time, as a match can repeat the bytes it writes
          let from = position - distance
          while (position < end) buffer[position++] = buffer[from++]
          if (position === INFLATE_BUFFER_SIZE) {
            yield position
            position = WINDOW_SIZE
            floor = 0
          }
        }
      }
    } while (final === 0)
    queue.unread(input.subarray(inputPosition - (bitCount >>> 3)))
    return position
  }
}
