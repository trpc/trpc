const hex = Array.from({ length: 256 }, (_, byte) => byte.toString(16).padStart(2, "0"))

/** @internal */
export const stringify = (bytes: Uint8Array): string => {
  if (bytes.length < 16) {
    return [
      bytes.subarray(0, 4),
      bytes.subarray(4, 6),
      bytes.subarray(6, 8),
      bytes.subarray(8, 10),
      bytes.subarray(10, 16)
    ].map((segment) => Array.from(segment, (byte) => hex[byte]).join("")).join("-")
  }
  return hex[bytes[0]] + hex[bytes[1]] + hex[bytes[2]] + hex[bytes[3]] + "-" +
    hex[bytes[4]] + hex[bytes[5]] + "-" +
    hex[bytes[6]] + hex[bytes[7]] + "-" +
    hex[bytes[8]] + hex[bytes[9]] + "-" +
    hex[bytes[10]] + hex[bytes[11]] + hex[bytes[12]] + hex[bytes[13]] + hex[bytes[14]] + hex[bytes[15]]
}

/** @internal */
export const v4Bytes = <A extends ArrayBufferLike>(bytes: Uint8Array<A>): Uint8Array<A> => {
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  return bytes
}

/** @internal */
export const v4String = (bytes: Uint8Array): string => stringify(v4Bytes(bytes))

const maxV7Timestamp = 2 ** 48 - 1

/** @internal */
export const v7Bytes = <A extends ArrayBufferLike>(timestampMillis: number, bytes: Uint8Array<A>): Uint8Array<A> => {
  const timestamp = Math.min(Math.max(0, Math.trunc(timestampMillis)), maxV7Timestamp)

  bytes[0] = Math.floor(timestamp / 2 ** 40)
  bytes[1] = Math.floor(timestamp / 2 ** 32) & 0xff
  bytes[2] = Math.floor(timestamp / 2 ** 24) & 0xff
  bytes[3] = Math.floor(timestamp / 2 ** 16) & 0xff
  bytes[4] = Math.floor(timestamp / 2 ** 8) & 0xff
  bytes[5] = timestamp & 0xff
  bytes[6] = (bytes[6] & 0x0f) | 0x70
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  return bytes
}

const clampV7Timestamp = (timestampMillis: number): number =>
  timestampMillis >= 0 ? Math.min(Math.trunc(timestampMillis), maxV7Timestamp) : 0

const maxV7Counter = 2 ** 42 - 1

/**
 * Makes a UUIDv7 generator that orders the UUIDs it returns, following RFC
 * 9562 §6.2 Method 1. A 42-bit counter fills the 12 bits of `rand_a` and the
 * top 30 bits of `rand_b`; the last 32 bits stay random. The ordering ends at
 * the maximum timestamp, 2^48 − 1 ms, which counter overflow cannot advance.
 *
 * @internal
 */
export const makeV7Monotonic = () => {
  let lastTimestamp = -1
  let counter = 0
  return <A extends ArrayBufferLike>(timestampMillis: number, bytes: Uint8Array<A>): Uint8Array<A> => {
    const timestamp = clampV7Timestamp(timestampMillis)
    if (timestamp > lastTimestamp) {
      lastTimestamp = timestamp
      counter = seedV7Counter(bytes)
    } else if (counter < maxV7Counter) {
      // The clock stalled or moved back, so keep the last timestamp.
      counter++
    } else {
      lastTimestamp = Math.min(lastTimestamp + 1, maxV7Timestamp)
      counter = seedV7Counter(bytes)
    }
    v7Bytes(lastTimestamp, bytes)
    const high = Math.floor(counter / 2 ** 30)
    const low = counter - high * 2 ** 30
    bytes[6] = 0x70 | (high >>> 8)
    bytes[7] = high & 0xff
    bytes[8] = 0x80 | (low >>> 24)
    bytes[9] = (low >>> 16) & 0xff
    bytes[10] = (low >>> 8) & 0xff
    bytes[11] = low & 0xff
    return bytes
  }
}

// Clears the counter's top bit, so a millisecond has at least 2^41 increments
// before it overflows.
const seedV7Counter = (bytes: Uint8Array): number =>
  (((bytes[6] & 0x07) << 8) | bytes[7]) * 2 ** 30 +
  (((bytes[8] & 0x3f) << 24) | (bytes[9] << 16) | (bytes[10] << 8) | bytes[11])

/**
 * The UUIDv7 ordering state shared by every `Date.now()` or `Clock` caller in
 * the realm that has no `SecureRandom` instance of its own.
 *
 * @internal
 */
export const v7Monotonic = makeV7Monotonic()
