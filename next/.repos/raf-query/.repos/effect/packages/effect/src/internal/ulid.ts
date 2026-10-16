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
