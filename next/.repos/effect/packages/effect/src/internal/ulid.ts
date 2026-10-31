const maxTimestamp = 2 ** 48 - 1
const base32Chars = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

/** @internal */
export const ulidString = (timestampMillis: number, bytes: Uint8Array): string => {
  if (bytes.length !== 10) {
    throw new Error(`ULID randomness must be exactly 10 bytes, received ${bytes.length}`)
  }

  const timestamp = Math.min(Math.max(0, Math.trunc(timestampMillis)), maxTimestamp)
  let out = ""
  for (let shift = 45; shift >= 0; shift -= 5) {
    // Take the low 5 bits and map NaN to zero, matching UUIDv7's byte encoding.
    out += base32Chars[Math.floor(timestamp / 2 ** shift) & 0x1f]
  }

  let accumulator = 0
  let bits = 0
  for (const byte of bytes) {
    accumulator = (accumulator << 8) | byte
    bits += 8
    while (bits >= 5) {
      bits -= 5
      out += base32Chars[(accumulator >>> bits) & 0x1f]
    }
    accumulator &= (1 << bits) - 1
  }

  return out
}

/**
 * Makes a ULID generator in the ULID spec's monotonic mode: within a
 * millisecond, or when the clock moves back, the 80-bit random part of the last
 * ULID is incremented. The ordering ends at the maximum timestamp, 2^48 − 1 ms,
 * which overflow cannot advance. `randomBytes` is only called for fresh
 * randomness.
 *
 * @internal
 */
export const makeMonotonic = () => {
  let lastTimestamp = -1
  const random = new Uint8Array(10)
  return (timestampMillis: number, randomBytes: () => Uint8Array): string => {
    const timestamp = timestampMillis >= 0 ? Math.min(Math.trunc(timestampMillis), maxTimestamp) : 0
    if (timestamp > lastTimestamp) {
      lastTimestamp = timestamp
      random.set(randomBytes())
    } else if (!increment(random)) {
      lastTimestamp = Math.min(lastTimestamp + 1, maxTimestamp)
      random.set(randomBytes())
    }
    return ulidString(lastTimestamp, random)
  }
}

// Returns false when the bytes overflow, leaving them all zero.
const increment = (bytes: Uint8Array): boolean => {
  for (let i = bytes.length - 1; i >= 0; i--) {
    if (bytes[i] !== 0xff) {
      bytes[i]++
      return true
    }
    bytes[i] = 0
  }
  return false
}

/**
 * The ULID ordering state shared by every `Date.now()` caller in the realm.
 *
 * @internal
 */
export const monotonic = makeMonotonic()
