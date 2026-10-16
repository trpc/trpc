/*
 * MIT License
 *
 * Copyright (c) 2017-2019 Tomas Della Vedova
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
 * @since 1.0.0
 */
// Taken from https://github.com/anonrig/fast-querystring under MIT License
const plusRegex = /\+/g
const Empty: new() => Record<string, any> = function() {} as any
Empty.prototype = Object.create(null)

/**
 * @category parsing
 * @since 1.0.0
 */
export function parse(input: string) {
  // Optimization: Use new Empty() instead of Object.create(null) for performance
  // v8 has a better optimization for initializing functions compared to Object
  const result = new Empty()

  if (typeof input !== "string") {
    return result
  }

  const inputLength = input.length
  let key = ""
  let value = ""
  let startingIndex = -1
  let equalityIndex = -1
  let shouldDecodeKey = false
  let shouldDecodeValue = false
  let keyHasPlus = false
  let valueHasPlus = false
  let hasBothKeyValuePair = false
  let c = 0

  // Have a boundary of input.length + 1 to access last pair inside the loop.
  for (let i = 0; i < inputLength + 1; i++) {
    c = i !== inputLength ? input.charCodeAt(i) : 38

    // Handle '&' and end of line to pass the current values to result
    if (c === 38) {
      hasBothKeyValuePair = equalityIndex > startingIndex

      // Optimization: Reuse equality index to store the end of key
      if (!hasBothKeyValuePair) {
        equalityIndex = i
      }

      key = input.slice(startingIndex + 1, equalityIndex)

      // Add key/value pair only if the range size is greater than 1; a.k.a. contains at least "="
      if (hasBothKeyValuePair || key.length > 0) {
        // Optimization: Replace '+' with space
        if (keyHasPlus) {
          key = key.replace(plusRegex, " ")
        }

        // Optimization: Do not decode if it's not necessary.
        if (shouldDecodeKey) {
          try {
            key = decodeURIComponent(key) || key
          } catch {}
        }

        if (hasBothKeyValuePair) {
          value = input.slice(equalityIndex + 1, i)

          if (valueHasPlus) {
            value = value.replace(plusRegex, " ")
          }

          if (shouldDecodeValue) {
            try {
              value = decodeURIComponent(value) || value
            } catch {}
          }
        }
        const currentValue = result[key]

        if (currentValue === undefined) {
          result[key] = value
        } else {
          // Optimization: value.pop is faster than Array.isArray(value)
          if (currentValue.pop) {
            currentValue.push(value)
          } else {
            result[key] = [currentValue, value]
          }
        }
      }

      // Reset reading key value pairs
      value = ""
      startingIndex = i
      equalityIndex = i
      shouldDecodeKey = false
      shouldDecodeValue = false
      keyHasPlus = false
      valueHasPlus = false
    } // Check '='
    else if (c === 61) {
      if (equalityIndex <= startingIndex) {
        equalityIndex = i
      } // If '=' character occurs again, we should decode the input.
      else {
        shouldDecodeValue = true
      }
    } // Check '+', and remember to replace it with empty space.
    else if (c === 43) {
      if (equalityIndex > startingIndex) {
        valueHasPlus = true
      } else {
        keyHasPlus = true
      }
    } // Check '%' character for encoding
    else if (c === 37) {
      if (equalityIndex > startingIndex) {
        shouldDecodeValue = true
      } else {
        shouldDecodeKey = true
      }
    }
  }

  return result
}

function getAsPrimitive(value: any) {
  const type = typeof value

  if (type === "string") {
    // Length check is handled inside encodeString function
    return encodeString(value)
  } else if (type === "bigint" || type === "boolean") {
    return "" + value
  } else if (type === "number" && Number.isFinite(value)) {
    return value < 1e21 ? "" + value : encodeString("" + value)
  }

  return ""
}

/**
 * @category encoding
 * @since 1.0.0
 */
export function stringify(input: Record<string, any>): string {
  let result = ""

  if (input === null || typeof input !== "object") {
    return result
  }

  const separator = "&"
  const keys = Object.keys(input)
  const keyLength = keys.length
  let valueLength = 0

  for (let i = 0; i < keyLength; i++) {
    const key = keys[i]
    const value = input[key]
    const encodedKey = encodeString(key) + "="

    if (i) {
      result += separator
    }

    if (Array.isArray(value)) {
      valueLength = value.length
      for (let j = 0; j < valueLength; j++) {
        if (j) {
          result += separator
        }

        // Optimization: Dividing into multiple lines improves the performance.
        // Since v8 does not need to care about the '+' character if it was one-liner.
        result += encodedKey
        result += getAsPrimitive(value[j])
      }
    } else {
      result += encodedKey
      result += getAsPrimitive(value)
    }
  }

  return result
}

// -----------------------------------------------------------------------------

// This has been taken from Node.js project.
// Full implementation can be found from https://github.com/nodejs/node/blob/main/lib/internal/querystring.js

const hexTable = Array.from(
  { length: 256 },
  (_, i) => "%" + ((i < 16 ? "0" : "") + i.toString(16)).toUpperCase()
)

// These characters do not need escaping when generating query strings:
// ! - . _ ~
// ' ( ) *
// digits
// alpha (uppercase)
// alpha (lowercase)
// biome-ignore format: the array should not be formatted
const noEscape = new Int8Array([
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0, // 0 - 15
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0, // 16 - 31
  0,
  1,
  0,
  0,
  0,
  0,
  0,
  1,
  1,
  1,
  1,
  0,
  0,
  1,
  1,
  0, // 32 - 47
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  0,
  0,
  0,
  0,
  0,
  0, // 48 - 63
  0,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1, // 64 - 79
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  0,
  0,
  0,
  0,
  1, // 80 - 95
  0,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1, // 96 - 111
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  1,
  0,
  0,
  0,
  1,
  0 // 112 - 127
])

function encodeString(str: string) {
  const len = str.length
  if (len === 0) return ""

  let out = ""
  let lastPos = 0
  let i = 0

  outer: for (; i < len; i++) {
    let c = str.charCodeAt(i)

    // ASCII
    while (c < 0x80) {
      if (noEscape[c] !== 1) {
        if (lastPos < i) out += str.slice(lastPos, i)
        lastPos = i + 1
        out += hexTable[c]
      }

      if (++i === len) break outer

      c = str.charCodeAt(i)
    }

    if (lastPos < i) out += str.slice(lastPos, i)

    // Multi-byte characters ...
    if (c < 0x800) {
      lastPos = i + 1
      out += hexTable[0xc0 | (c >> 6)] + hexTable[0x80 | (c & 0x3f)]
      continue
    }
    if (c < 0xd800 || c >= 0xe000) {
      lastPos = i + 1
      out += hexTable[0xe0 | (c >> 12)] +
        hexTable[0x80 | ((c >> 6) & 0x3f)] +
        hexTable[0x80 | (c & 0x3f)]
      continue
    }
    // Surrogate pair
    ++i

    // This branch should never happen because all URLSearchParams entries
    // should already be converted to USVString. But, included for
    // completion's sake anyway.
    if (i >= len) {
      throw new Error("URI malformed")
    }

    const c2 = str.charCodeAt(i) & 0x3ff

    lastPos = i + 1
    c = 0x10000 + (((c & 0x3ff) << 10) | c2)
    out += hexTable[0xf0 | (c >> 18)] +
      hexTable[0x80 | ((c >> 12) & 0x3f)] +
      hexTable[0x80 | ((c >> 6) & 0x3f)] +
      hexTable[0x80 | (c & 0x3f)]
  }
  if (lastPos === 0) return str
  if (lastPos < len) return out + str.slice(lastPos)
  return out
}
